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
    const [sessions, players, teams, matches, competitionParticipants, progressions] = await Promise.all([
      query("sessions", { select: "*", id: byId(id) }),
      query("players", { select: "*", session_id: byId(id), order: "created_at.asc" }),
      query("teams", { select: "*", session_id: byId(id), order: "created_at.asc" }),
      query("matches", { select: "*", session_id: byId(id), order: "round.asc,match_number.asc" }),
      query("competition_participants", { select: "*", session_id: byId(id) }),
      query("match_progressions", { select: "*", session_id: byId(id), source_outcome: "eq.winner" })
    ]);
    const session = sessions[0];
    if (!session) throw new Error("Kompetisi tidak ditemukan.");
    const teamMode = session.participant_mode === "team" || teams.length > 0 || String(session.format || "").includes("team");
    const members = teams.length ? await query("team_members", { select: "*", session_id: byId(id), team_id: `in.(${teams.map(team => team.id).join(",")})` }) : [];
    const participantRows = competitionParticipants.length ? competitionParticipants : (teamMode
      ? teams.map(team => ({ id: team.id, team_id: team.id, participant_mode: "team" }))
      : players.map(player => ({ id: player.id, player_id: player.id, participant_mode: "individual" })));
    const participants = participantRows.map(participant => {
      if (participant.participant_mode === "team" || participant.team_id) {
        const team = teams.find(row => String(row.id) === String(participant.team_id));
        const names = members.filter(member => String(member.team_id) === String(participant.team_id))
          .map(member => players.find(player => String(player.id) === String(member.player_id))?.name).filter(Boolean);
        return { participant_id: participant.id, source_id: participant.team_id, source_type: "team", name: names.join(" & ") || team?.name || "Tim", seed: team?.seed || 0 };
      }
      const player = players.find(row => String(row.id) === String(participant.player_id));
      return { participant_id: participant.id, source_id: participant.player_id, source_type: "individual", name: player?.name || "Peserta", seed: player?.seed || 0 };
    });
    const progressionBySource = new Map(progressions.map(edge => [String(edge.source_match_id), edge]));
    return {
      session: { ...session, session_id: session.id, format: teamMode ? "team_single_elimination" : session.format },
      participants,
      matches: matches.map(match => ({
        match_id: match.id,
        round: match.round,
        match_number: match.match_number,
        participant1_id: match.participant1_participant_id == null ? null : String(match.participant1_participant_id),
        participant2_id: match.participant2_participant_id == null ? null : String(match.participant2_participant_id),
        winner_id: match.winner_participant_id == null ? null : String(match.winner_participant_id),
        score1: match.score1 ?? "",
        score2: match.score2 ?? "",
        status: match.winner_participant_id && Boolean(match.participant1_participant_id) !== Boolean(match.participant2_participant_id) ? "bye" : match.status,
        next_match_id: progressionBySource.get(String(match.id))?.target_match_id || null,
        next_slot: progressionBySource.get(String(match.id))?.target_slot || null
      }))
    };
  }

  async function persistBracket(sessionId, teams, participants) {
    const participantByTeam = new Map(participants.map(participant => [String(participant.team_id), participant]));
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
      for (let index = 0; index < counts[round]; index++) {
        const team1Id = round === 1 ? opening[index].first : round === 2 ? opening[index * 2]?.winner || null : null;
        const team2Id = round === 1 ? opening[index].second : round === 2 ? opening[index * 2 + 1]?.winner || null : null;
        const winnerTeamId = round === 1 ? opening[index].winner : null;
        rows.push({
          session_id: sessionId,
          round,
          match_number: index + 1,
          team1_id: team1Id,
          team2_id: team2Id,
          winner_team_id: winnerTeamId,
          participant1_participant_id: team1Id == null ? null : participantByTeam.get(String(team1Id))?.id || null,
          participant2_participant_id: team2Id == null ? null : participantByTeam.get(String(team2Id))?.id || null,
          winner_participant_id: winnerTeamId == null ? null : participantByTeam.get(String(winnerTeamId))?.id || null,
          status: round === 1 && opening[index].status === "bye" ? "completed" : "pending",
          next_match_id: null,
          next_slot: null
        });
      }
    }
    const inserted = await query("matches", {}, { method: "POST", body: rows });
    const matchId = (round, index) => inserted.find(row => Number(row.round) === round && Number(row.match_number) === index + 1)?.id;
    const progressionRows = [];
    for (let round = 1; round < rounds; round++) for (let index = 0; index < counts[round]; index++) {
      const id = matchId(round, index);
      const next = matchId(round + 1, Math.floor(index / 2));
      if (id && next) {
        const targetSlot = index % 2 === 0 ? 1 : 2;
        await query("matches", { id: byId(id) }, { method: "PATCH", body: { next_match_id: next, next_slot: targetSlot } });
        progressionRows.push({ session_id: sessionId, source_match_id: id, source_outcome: "winner", target_match_id: next, target_slot: targetSlot });
      }
    }
    if (progressionRows.length) await query("match_progressions", {}, { method: "POST", body: progressionRows });
  }

  async function cleanupCompetition(sessionId) {
    const failures = [];
    for (const [table, column] of [["match_progressions", "session_id"], ["tournament_group_members", "session_id"], ["matches", "session_id"], ["tournament_groups", "session_id"], ["competition_participants", "session_id"], ["team_members", "session_id"], ["teams", "session_id"], ["players", "session_id"], ["sessions", "id"]]) {
      try { await query(table, { [column]: byId(sessionId) }, { method: "DELETE", prefer: "return=minimal" }); }
      catch (error) { failures.push(error); }
    }
    return failures;
  }

  async function applyMatchResult({ session_id, match_id, winner_team_id, score1, score2 }) {
    const competition = await getCompetition(session_id);
    const current = competition.matches.find(item => String(item.match_id) === String(match_id));
    if (!current) throw new Error("Pertandingan tidak ditemukan.");
    if (current.status === "bye") throw new Error("Pertandingan bye tidak dapat diubah.");
    const participant1Id = current.participant1_id;
    const participant2Id = current.participant2_id;
    if (!participant1Id || !participant2Id) throw new Error("Kedua peserta harus ditetapkan sebelum hasil dicatat.");

    let winner = winner_team_id;
    const includesScore = score1 !== undefined || score2 !== undefined;
    if (includesScore) {
      const validation = validateMatchScore({
        competition: { id: session_id, matches: [{ ...current, id: current.match_id, participant1Id, participant2Id }] },
        matchId: current.match_id,
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
        competition: { id: session_id, matches: [{ ...current, id: current.match_id, participant1Id, participant2Id }] },
        matchId: current.match_id,
        winnerId: winner_team_id
      });
      if (!validation.valid) {
        const error = new Error(validation.error);
        error.code = "MATCH_VALIDATION";
        throw error;
      }
      winner = validation.winnerId;
    }

    const downstream = getDownstreamMatchPath({ matches: competition.matches.map(match => ({ ...match, id: match.match_id })) }, match_id);
    const participantById = new Map(competition.participants.map(participant => [String(participant.participant_id), participant]));
    const winnerParticipant = participantById.get(String(winner));
    if (!winnerParticipant) throw new Error("Peserta pemenang tidak ditemukan dalam kompetisi.");
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
      const participantColumn = step.slot === "participant1" ? "participant1_participant_id" : "participant2_participant_id";
      await patchMatch(step.matchId, {
        [slotColumn]: null,
        [participantColumn]: null,
        winner_team_id: null,
        winner_participant_id: null,
        score1: null,
        score2: null,
        status: "pending"
      });
    }

    const currentPatch = {
      winner_team_id: winnerParticipant.source_type === "team" ? winnerParticipant.source_id : null,
      winner_participant_id: winner,
      status: "completed"
    };
    if (includesScore) {
      currentPatch.score1 = Number(score1);
      currentPatch.score2 = Number(score2);
    }
    await patchMatch(match_id, currentPatch);

    if (downstream.length) {
      const slotColumn = downstream[0].slot === "participant1" ? "team1_id" : "team2_id";
      const participantColumn = downstream[0].slot === "participant1" ? "participant1_participant_id" : "participant2_participant_id";
      await patchMatch(downstream[0].matchId, {
        [slotColumn]: winnerParticipant.source_type === "team" ? winnerParticipant.source_id : null,
        [participantColumn]: winner
      });
    }

    let latestCompetition;
    try {
      latestCompetition = await getCompetition(session_id);
    } catch (cause) {
      const error = new Error("Match result was saved but competition refresh failed.", { cause });
      error.code = "MATCH_REFRESH_FAILED";
      throw error;
    }
    const { status } = getCompetitionProgress(latestCompetition.matches);
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
        inserted = (await query("sessions", {}, { method: "POST", body: { name: input.name, event_date: input.event_date || null, location: input.location || "", format: input.format, participant_mode: "team", status: "in_progress" } }))[0];
        if (!inserted?.id) throw new Error("Kompetisi tidak mengembalikan ID sesi.");
        const people = playerNames.map(name => ({ session_id: inserted.id, name }));
        const playerRows = people.length ? await query("players", {}, { method: "POST", body: people }) : [];
        if (playerRows.length !== people.length || playerRows.some(player => String(player.session_id) !== String(inserted.id) || !player.id)) throw new Error("Data pemain yang tersimpan tidak cocok dengan sesi kompetisi.");
        const teamRows = names.length ? await query("teams", {}, { method: "POST", body: names.map((name, index) => ({ session_id: inserted.id, name, seed: index + 1 })) }) : [];
        if (teamRows.length !== names.length || teamRows.some(team => String(team.session_id) !== String(inserted.id) || !team.id)) throw new Error("Data tim yang tersimpan tidak cocok dengan sesi kompetisi.");
        const competitionParticipantRows = teamRows.map(team => ({ session_id: inserted.id, participant_mode: "team", team_id: team.id }));
        const savedCompetitionParticipants = await query("competition_participants", {}, { method: "POST", body: competitionParticipantRows });
        if (savedCompetitionParticipants.length !== teamRows.length || savedCompetitionParticipants.some(participant => String(participant.session_id) !== String(inserted.id) || !participant.id || !participant.team_id)) throw new Error("Identitas peserta kompetisi tidak tersimpan lengkap.");
        const membershipRows = teamRows.flatMap((team, index) => [1, 2].map(position => ({ session_id: inserted.id, team_id: team.id, player_id: playerRows[index * 2 + position - 1].id, position })));
        if (new Set(membershipRows.map(row => `${row.team_id}:${row.position}`)).size !== membershipRows.length || new Set(membershipRows.map(row => String(row.player_id))).size !== membershipRows.length) throw new Error("Keanggotaan tim memiliki pemain atau posisi duplikat.");
        const savedMemberships = await query("team_members", {}, { method: "POST", body: membershipRows });
        const savedMembershipKeys = new Set(savedMemberships.map(row => `${row.team_id}:${row.player_id}:${row.position}`));
        if (savedMemberships.length !== membershipRows.length || savedMemberships.some(row => String(row.session_id) !== String(inserted.id)) || membershipRows.some(row => !savedMembershipKeys.has(`${row.team_id}:${row.player_id}:${row.position}`))) throw new Error("Keanggotaan tim tidak tersimpan lengkap pada sesi kompetisi.");
        await persistBracket(inserted.id, teamRows, savedCompetitionParticipants);
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
      const player = (await query("players", {}, { method: "POST", body: { session_id, name: validation.name } }))[0];
      if (!player?.id) throw new Error("Data peserta tersimpan tanpa ID yang dapat dipakai.");
      try {
        await query("competition_participants", {}, {
          method: "POST",
          body: { session_id, participant_mode: "individual", player_id: player.id }
        });
      } catch (cause) {
        const error = new Error("Peserta tersimpan, tetapi identitas kompetisinya gagal dibuat.", { cause });
        error.code = "PARTICIPANT_REFRESH_FAILED";
        throw error;
      }
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
