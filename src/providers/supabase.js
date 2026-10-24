import { getCompetitionProgress } from "../domain/competitionProgress.js";
import { getDownstreamMatchPath, validateMatchScore, validateMatchWinner } from "../domain/matchRules.js";
import { validateParticipantAddition } from "../domain/participantValidation.js";

export function createSupabaseProvider({ url, key }) {
  const base = url ? `${url.replace(/\/$/, "")}/rest/v1` : null;

  async function query(table, params = {}, { method = "GET", body, prefer = "return=representation", range } = {}) {
    if (!base || !key) throw new Error("Supabase belum dikonfigurasi. Atur supabaseUrl dan supabaseAnonKey di src/config/data.js.");
    const target = new URL(`${base}/${table}`);
    for (const [name, value] of Object.entries(params)) target.searchParams.set(name, String(value));
    let response;
    try {
      response = await fetch(target, {
        method,
        headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json", "Content-Type": "application/json", Prefer: prefer, ...(range ? { Range: `${range[0]}-${range[1]}`, "Range-Unit": "items" } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
    } catch (cause) {
      const error = new Error(`Unable to reach Supabase while requesting ${table}. Check the project URL, network access, and browser console for CORS details.`, { cause });
      error.code = "SUPABASE_NETWORK_ERROR";
      throw error;
    }
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(data?.message || data?.details || `Supabase ${table}: HTTP ${response.status}`);
      error.code = data?.code;
      error.constraint = data?.constraint;
      error.status = response.status;
      throw error;
    }
    return data || [];
  }

  const byId = id => `eq.${id}`;

  async function listLeaderboardCompetitions() {
    const sessions = [];
    for (let offset = 0; ; offset += 1000) {
      const page = await query("sessions", { select: "id", order: "created_at.desc" }, { range: [offset, offset + 999] });
      sessions.push(...page);
      if (page.length < 1000) break;
    }
    return Promise.all(sessions.map(session => getCompetition(session.id)));
  }

  async function getCompetition(id) {
    const [sessions, players, teams, matches] = await Promise.all([
      query("sessions", { select: "*", id: byId(id) }),
      query("players", { select: "*", session_id: byId(id), order: "created_at.asc" }),
      query("teams", { select: "*", session_id: byId(id), order: "created_at.asc" }),
      query("matches", { select: "*", session_id: byId(id), order: "round.asc,match_number.asc" })
    ]);
    const session = sessions[0];
    if (!session) throw new Error("Kompetisi tidak ditemukan.");
    const teamMode = teams.length > 0 || String(session.format || "").includes("team");
    const members = teams.length ? await query("team_members", { select: "*", session_id: byId(id), team_id: `in.(${teams.map(team => team.id).join(",")})` }) : [];
    const participants = teamMode ? teams.map(team => {
      const names = members.filter(member => String(member.team_id) === String(team.id))
        .map(member => players.find(player => String(player.id) === String(member.player_id))?.name).filter(Boolean);
      return { participant_id: team.id, name: names.join(" & ") || team.name || "Tim", seed: team.seed || 0 };
    }) : players.map(player => ({ participant_id: player.id, name: player.name, seed: player.seed || 0 }));
    const teamId = value => value == null ? null : String(value);
    return {
      session: { ...session, session_id: session.id, format: teamMode ? "team_single_elimination" : session.format },
      participants,
      matches: matches.map(match => ({
        match_id: match.id,
        round: match.round,
        match_number: match.match_number,
        participant1_id: teamId(match.team1_id || match.participant1_id),
        participant2_id: teamId(match.team2_id || match.participant2_id),
        winner_id: teamId(match.winner_team_id),
        score1: match.score1 ?? "",
        score2: match.score2 ?? "",
        status: match.winner_team_id && Boolean(match.team1_id) !== Boolean(match.team2_id) ? "bye" : match.status,
        next_match_id: match.next_match_id,
        next_slot: match.next_slot
      }))
    };
  }

  async function persistBracket(sessionId, teams) {
    const size = 2 ** Math.ceil(Math.log2(Math.max(2, teams.length)));
    const rounds = Math.log2(size);
    const rows = [];
    const counts = [];
    const byeCount = size - teams.length;
    const opening = Array.from({ length: size / 2 }, (_, index) => index < byeCount
      ? { first: teams[index]?.id || null, second: null, winner: teams[index]?.id || null, status: "bye" }
      : {
        first: teams[byeCount + (index - byeCount) * 2]?.id || null,
        second: teams[byeCount + (index - byeCount) * 2 + 1]?.id || null,
        winner: null,
        status: "pending"
      });
    for (let round = 1; round <= rounds; round++) {
      counts[round] = size / 2 ** round;
      for (let index = 0; index < counts[round]; index++) rows.push({
        session_id: sessionId,
        round,
        match_number: index + 1,
        team1_id: round === 1 ? opening[index].first : round === 2 ? opening[index * 2]?.winner || null : null,
        team2_id: round === 1 ? opening[index].second : round === 2 ? opening[index * 2 + 1]?.winner || null : null,
        winner_team_id: round === 1 ? opening[index].winner : null,
        status: round === 1 && opening[index].status === "bye" ? "completed" : "pending",
        next_match_id: null,
        next_slot: null
      });
    }
    const inserted = await query("matches", {}, { method: "POST", body: rows });
    const matchId = (round, index) => inserted.find(row => Number(row.round) === round && Number(row.match_number) === index + 1)?.id;
    for (let round = 1; round < rounds; round++) for (let index = 0; index < counts[round]; index++) {
      const id = matchId(round, index);
      const next = matchId(round + 1, Math.floor(index / 2));
      if (id && next) await query("matches", { id: byId(id) }, { method: "PATCH", body: { next_match_id: next, next_slot: index % 2 === 0 ? 1 : 2 } });
    }
  }

  async function cleanupCompetition(sessionId) {
    const failures = [];
    for (const [table, column] of [["matches", "session_id"], ["team_members", "session_id"], ["teams", "session_id"], ["players", "session_id"], ["sessions", "id"]]) {
      try { await query(table, { [column]: byId(sessionId) }, { method: "DELETE", prefer: "return=minimal" }); }
      catch (error) { failures.push(error); }
    }
    return failures;
  }

  async function applyMatchResult({ session_id, match_id, winner_team_id, score1, score2 }) {
    const all = await query("matches", { select: "*", session_id: byId(session_id), order: "round.asc,match_number.asc" });
    const current = all.find(item => String(item.id) === String(match_id));
    if (!current) throw new Error("Pertandingan tidak ditemukan.");
    if (current.status === "bye") throw new Error("Pertandingan bye tidak dapat diubah.");
    const participant1Id = current.team1_id || current.participant1_id;
    const participant2Id = current.team2_id || current.participant2_id;
    if (!participant1Id || !participant2Id) throw new Error("Kedua peserta harus ditetapkan sebelum hasil dicatat.");

    let winner = winner_team_id;
    const includesScore = score1 !== undefined || score2 !== undefined;
    if (includesScore) {
      const validation = validateMatchScore({
        competition: { id: session_id, matches: [{ ...current, id: current.id, participant1Id, participant2Id }] },
        matchId: current.id,
        score1: Number(score1),
        score2: Number(score2)
      });
      if (!validation.valid) {
        const error = new Error(validation.error);
        error.code = "MATCH_VALIDATION";
        throw error;
      }
      winner = validation.winnerId;
    } else {
      const validation = validateMatchWinner({
        competition: { id: session_id, matches: [{ ...current, id: current.id, participant1Id, participant2Id }] },
        matchId: current.id,
        winnerId: winner_team_id
      });
      if (!validation.valid) {
        const error = new Error(validation.error);
        error.code = "MATCH_VALIDATION";
        throw error;
      }
      winner = validation.winnerId;
    }

    const downstream = getDownstreamMatchPath({ matches: all }, match_id);
    const patchMatch = async (id, patch) => {
      try {
        await query("matches", { id: byId(id) }, { method: "PATCH", body: patch });
      } catch (cause) {
        const error = new Error("Match mutation may have been only partially saved.", { cause });
        error.code = "PARTIAL_MATCH_MUTATION";
        throw error;
      }
    };

    // Invalidate dependent results before recording the replacement result.
    for (const step of downstream) {
      const slotColumn = step.slot === "participant1" ? "team1_id" : "team2_id";
      await patchMatch(step.matchId, {
        [slotColumn]: null,
        winner_team_id: null,
        score1: null,
        score2: null,
        status: "pending"
      });
    }

    const currentPatch = { winner_team_id: winner, status: "completed" };
    if (includesScore) {
      currentPatch.score1 = Number(score1);
      currentPatch.score2 = Number(score2);
    }
    await patchMatch(match_id, currentPatch);

    if (downstream.length) {
      const slotColumn = downstream[0].slot === "participant1" ? "team1_id" : "team2_id";
      await patchMatch(downstream[0].matchId, { [slotColumn]: winner });
    }

    let competition;
    try {
      competition = await getCompetition(session_id);
    } catch (cause) {
      const error = new Error("Match result was saved but competition refresh failed.", { cause });
      error.code = "MATCH_REFRESH_FAILED";
      throw error;
    }
    const { status } = getCompetitionProgress(competition.matches);
    let savedSessions;
    try {
      savedSessions = await query("sessions", { id: byId(session_id) }, { method: "PATCH", body: { status } });
    } catch (cause) {
      const error = new Error("Match mutation was saved but session status may be inconsistent.", { cause });
      error.code = "PARTIAL_MATCH_MUTATION";
      throw error;
    }
    if (!savedSessions.some(session => String(session.id) === String(session_id) && session.status === status)) {
      const error = new Error("Session status was not confirmed after match mutation.");
      error.code = "PARTIAL_MATCH_MUTATION";
      throw error;
    }
    try {
      return await getCompetition(session_id);
    } catch (cause) {
      const error = new Error("Match result was saved but competition refresh failed.", { cause });
      error.code = "MATCH_REFRESH_FAILED";
      throw error;
    }
  }

  async function updateWinner({ session_id, match_id, winner_team_id, score1, score2 }) {
    return applyMatchResult({ session_id, match_id, winner_team_id, score1, score2 });
  }

  async function recordMatchScore({ sessionId, matchId, score1, score2 }) {
    return applyMatchResult({ session_id: sessionId, match_id: matchId, score1, score2 });
  }

  async function recordMatchWinner({ sessionId, matchId, winnerId }) {
    return applyMatchResult({ session_id: sessionId, match_id: matchId, winner_team_id: winnerId });
  }

  return {
    listLeaderboardCompetitions,
    async listCompetitions() {
      return listLeaderboardCompetitions();
    },
    getCompetition,
    recordMatchScore,
    recordMatchWinner,
    async createCompetition(input) {
      if (input.format !== "single_elimination") {
        const error = new Error("Format kompetisi tidak valid. Format yang didukung adalah single_elimination.");
        error.code = "COMPETITION_VALIDATION";
        throw error;
      }
      const names = input.participants || [];
      const playerNames = names.flatMap(name => String(name).split(" & ").map(member => member.trim()));
      const normalizedNames = playerNames.map(name => name.toLocaleLowerCase("id-ID"));
      if (!names.length || names.some(name => String(name).split(" & ").length !== 2) || playerNames.some(name => !name) || new Set(normalizedNames).size !== normalizedNames.length) {
        throw new Error("Setiap tim harus memiliki dua pemain yang berbeda dan setiap pemain hanya dapat terdaftar satu kali.");
      }
      let inserted;
      try {
        inserted = (await query("sessions", {}, { method: "POST", body: { name: input.name, event_date: input.event_date || null, location: input.location || "", format: input.format, status: "in_progress" } }))[0];
        if (!inserted?.id) throw new Error("Kompetisi tidak mengembalikan ID sesi.");
        const people = playerNames.map(name => ({ session_id: inserted.id, name }));
        const playerRows = people.length ? await query("players", {}, { method: "POST", body: people }) : [];
        if (playerRows.length !== people.length || playerRows.some(player => String(player.session_id) !== String(inserted.id) || !player.id)) throw new Error("Data pemain yang tersimpan tidak cocok dengan sesi kompetisi.");
        const teamRows = names.length ? await query("teams", {}, { method: "POST", body: names.map((name, index) => ({ session_id: inserted.id, name, seed: index + 1 })) }) : [];
        if (teamRows.length !== names.length || teamRows.some(team => String(team.session_id) !== String(inserted.id) || !team.id)) throw new Error("Data tim yang tersimpan tidak cocok dengan sesi kompetisi.");
        const membershipRows = teamRows.flatMap((team, index) => [1, 2].map(position => ({ session_id: inserted.id, team_id: team.id, player_id: playerRows[index * 2 + position - 1].id, position })));
        if (new Set(membershipRows.map(row => `${row.team_id}:${row.position}`)).size !== membershipRows.length || new Set(membershipRows.map(row => String(row.player_id))).size !== membershipRows.length) throw new Error("Keanggotaan tim memiliki pemain atau posisi duplikat.");
        const savedMemberships = await query("team_members", {}, { method: "POST", body: membershipRows });
        const savedMembershipKeys = new Set(savedMemberships.map(row => `${row.team_id}:${row.player_id}:${row.position}`));
        if (savedMemberships.length !== membershipRows.length || savedMemberships.some(row => String(row.session_id) !== String(inserted.id)) || membershipRows.some(row => !savedMembershipKeys.has(`${row.team_id}:${row.player_id}:${row.position}`))) throw new Error("Keanggotaan tim tidak tersimpan lengkap pada sesi kompetisi.");
        await persistBracket(inserted.id, teamRows);
        return await getCompetition(inserted.id);
      } catch (error) {
        if (error.code === "23514" && (error.constraint === "sessions_format_check" || error.message.includes("sessions_format_check"))) {
          const validationError = new Error("Format kompetisi ditolak database. Format yang didukung adalah single_elimination.", { cause: error });
          validationError.code = "COMPETITION_VALIDATION";
          throw validationError;
        }
        if (inserted?.id) {
          const cleanupFailures = await cleanupCompetition(inserted.id);
          if (cleanupFailures.length) {
            error.code = "COMPETITION_CLEANUP_FAILED";
            error.cleanupFailures = cleanupFailures.map(failure => ({ message: failure.message, code: failure.code }));
            console.error("Pembersihan kompetisi yang gagal sebagian juga gagal.", cleanupFailures);
          }
        }
        console.error("Gagal membuat kompetisi melalui Supabase.", error);
        throw error;
      }
    },
    async addPlayer({ session_id, name }) {
      const current = await getCompetition(session_id);
      const validation = validateParticipantAddition({ competition: current, name });
      if (!validation.valid) {
        const error = new Error(validation.error);
        error.code = "PARTICIPANT_VALIDATION";
        throw error;
      }
      await query("players", {}, { method: "POST", body: { session_id, name: validation.name } });
      try {
        return await getCompetition(session_id);
      } catch (cause) {
        const error = new Error("Peserta tersimpan, tetapi data kompetisi gagal dimuat ulang.", { cause });
        error.code = "PARTICIPANT_REFRESH_FAILED";
        throw error;
      }
    },
    recordWinner: updateWinner,
    recordScore: updateWinner
  };
}
