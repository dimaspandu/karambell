import { getCompetitionProgress } from "../domain/competitionProgress.js";

export function createSupabaseProvider({ url, key }) {
  if (!url || !key) throw new Error("Provider Supabase dipilih, tetapi supabaseUrl atau supabaseAnonKey belum diatur di src/config/data.js.");
  const base = `${url.replace(/\/$/, "")}/rest/v1`;

  async function query(table, params = {}, { method = "GET", body, prefer = "return=representation" } = {}) {
    const target = new URL(`${base}/${table}`);
    for (const [name, value] of Object.entries(params)) target.searchParams.set(name, String(value));
    const response = await fetch(target, {
      method,
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json", "Content-Type": "application/json", Prefer: prefer },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(data?.message || data?.details || `Supabase ${table}: HTTP ${response.status}`);
      error.code = data?.code;
      error.constraint = data?.constraint;
      throw error;
    }
    return data || [];
  }

  const byId = id => `eq.${id}`;

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

  async function updateWinner({ session_id, match_id, winner_team_id, score1, score2 }) {
    const all = await query("matches", { select: "*", session_id: byId(session_id), order: "round.asc,match_number.asc" });
    const current = all.find(item => String(item.id) === String(match_id));
    if (!current) throw new Error("Pertandingan tidak ditemukan.");
    const winner = winner_team_id || (Number(score1) > Number(score2) ? current.team1_id : current.team2_id);
    if (![current.team1_id, current.team2_id].some(id => String(id) === String(winner))) throw new Error("Tim pemenang tidak bertanding pada pertandingan ini.");
    await query("matches", { id: byId(match_id) }, { method: "PATCH", body: { winner_team_id: winner, status: "completed" } });
    let source = current;
    let advancing = winner;
    while (source.next_match_id) {
      const target = all.find(item => String(item.id) === String(source.next_match_id));
      if (!target) break;
      const slot = Number(source.next_slot) === 1 ? "team1_id" : "team2_id";
      const patch = { [slot]: advancing };
      if (target.winner_team_id && ![target.team1_id, target.team2_id].some(id => String(id) === String(target.winner_team_id))) {
        patch.winner_team_id = null;
        patch.status = "pending";
      }
      await query("matches", { id: byId(target.id) }, { method: "PATCH", body: patch });
      source = (await query("matches", { id: byId(target.id), select: "*" }))[0];
      if (source.winner_team_id && [source.team1_id, source.team2_id].some(id => String(id) === String(source.winner_team_id))) advancing = source.winner_team_id;
      else break;
    }
    const competition = await getCompetition(session_id);
    const { status } = getCompetitionProgress(competition.matches);
    const savedSessions = await query("sessions", { id: byId(session_id) }, { method: "PATCH", body: { status } });
    if (!savedSessions.some(session => String(session.id) === String(session_id) && session.status === status)) throw new Error("Status kompetisi belum tersimpan.");
    return getCompetition(session_id);
  }

  return {
    async listCompetitions() {
      const sessions = await query("sessions", { select: "id", order: "created_at.desc" });
      return Promise.all(sessions.map(session => getCompetition(session.id)));
    },
    getCompetition,
    async createCompetition(input) {
      if (input.format !== "single_elimination") throw new Error("Format kompetisi tidak valid. Format yang didukung adalah single_elimination.");
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
        if (error.code === "23514" && (error.constraint === "sessions_format_check" || error.message.includes("sessions_format_check"))) throw new Error("Format kompetisi ditolak database. Format yang didukung adalah single_elimination.");
        if (inserted?.id) {
          const cleanupFailures = await cleanupCompetition(inserted.id);
          if (cleanupFailures.length) console.error("Pembersihan kompetisi yang gagal sebagian juga gagal.", cleanupFailures);
        }
        console.error("Gagal membuat kompetisi melalui Supabase.", error);
        throw error;
      }
    },
    async addPlayer({ session_id, name }) {
      await query("players", {}, { method: "POST", body: { session_id, name } });
      return getCompetition(session_id);
    },
    recordWinner: updateWinner,
    recordScore: updateWinner
  };
}
