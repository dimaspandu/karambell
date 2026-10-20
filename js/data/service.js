import { dataConfig } from "./config.js";

async function request(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) } });
  let payload;
  try { payload = await response.json(); } catch { throw new Error(`Respons server tidak valid (HTTP ${response.status}).`); }
  if (!response.ok || payload.ok === false) throw new Error(payload.error || `Request gagal (HTTP ${response.status}).`);
  return payload.data;
}

function googleSheetsProvider() {
  return {
    async listCompetitions() {
      const result = await request("/api/sessions");
      const rows = Array.isArray(result.sessions) ? result.sessions : [];
      return Promise.all(rows.map(row => this.getCompetition(row.session_id).catch(() => ({ session: row, participants: [], matches: [] }))));
    },
    getCompetition: id => request(`/api/session?session_id=${encodeURIComponent(id)}`),
    createCompetition: input => request("/api/sessions", { method: "POST", body: JSON.stringify(input) }),
    addPlayer: input => request("/api/participants", { method: "POST", body: JSON.stringify(input) }),
    recordWinner: input => request("/api/matches/score", { method: "POST", body: JSON.stringify(input) }),
    recordScore: input => request("/api/matches/score", { method: "POST", body: JSON.stringify(input) })
  };
}

function supabaseProvider(url, key) {
  if (!url || !key) throw new Error("Provider Supabase dipilih, tetapi supabaseUrl atau supabaseAnonKey belum diatur di js/data/config.js.");
  const base = `${url.replace(/\/$/, "")}/rest/v1`;
  async function query(table, params = {}, { method = "GET", body, prefer = "return=representation" } = {}) {
    const target = new URL(`${base}/${table}`);
    for (const [name, value] of Object.entries(params)) target.searchParams.set(name, String(value));
    const response = await fetch(target, { method, headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json", "Content-Type": "application/json", Prefer: prefer }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.message || data?.details || `Supabase ${table}: HTTP ${response.status}`);
    return data || [];
  }
  const byId = id => `eq.${id}`;
  async function getCompetition(id) {
    const [sessions, players, teams, matches] = await Promise.all([
      query("sessions", { select: "*", id: byId(id) }), query("players", { select: "*", session_id: byId(id), order: "created_at.asc" }),
      query("teams", { select: "*", session_id: byId(id), order: "created_at.asc" }), query("matches", { select: "*", session_id: byId(id), order: "round.asc,match_number.asc" })
    ]);
    const session = sessions[0]; if (!session) throw new Error("Kompetisi tidak ditemukan.");
    const teamMode = String(session.format || "").includes("team");
    const members = teams.length ? await query("team_members", { select: "*", team_id: `in.(${teams.map(team => team.id).join(",")})` }) : [];
    const participants = teamMode ? teams.map(team => {
      const names = members.filter(member => String(member.team_id) === String(team.id)).map(member => players.find(player => String(player.id) === String(member.player_id))?.name).filter(Boolean);
      return { participant_id: team.id, name: names.join(" & ") || team.name || "Tim", seed: team.seed || 0 };
    }) : players.map(player => ({ participant_id: player.id, name: player.name, seed: player.seed || 0 }));
    const teamId = value => value == null ? null : String(value);
    return { session: { ...session, session_id: session.id }, participants, matches: matches.map(match => ({ match_id: match.id, round: match.round, match_number: match.match_number, participant1_id: teamId(match.team1_id || match.participant1_id), participant2_id: teamId(match.team2_id || match.participant2_id), winner_id: teamId(match.winner_team_id), score1: match.score1 ?? "", score2: match.score2 ?? "", status: match.winner_team_id && Boolean(match.team1_id) !== Boolean(match.team2_id) ? "bye" : match.status, next_match_id: match.next_match_id, next_slot: match.next_slot })) };
  }
  async function persistBracket(sessionId, teams) {
    const size = 2 ** Math.ceil(Math.log2(Math.max(2, teams.length))), rounds = Math.log2(size), rows = [], counts = [];
    const byeCount = size - teams.length;
    const opening = Array.from({ length: size / 2 }, (_, index) => index < byeCount
      ? { first: teams[index]?.id || null, second: null, winner: teams[index]?.id || null, status: "bye" }
      : { first: teams[byeCount + (index - byeCount) * 2]?.id || null, second: teams[byeCount + (index - byeCount) * 2 + 1]?.id || null, winner: null, status: "pending" });
    for (let round = 1; round <= rounds; round++) {
      counts[round] = size / 2 ** round;
      for (let index = 0; index < counts[round]; index++) rows.push({
        session_id: sessionId, round, match_number: index + 1,
        team1_id: round === 1 ? opening[index].first : round === 2 ? opening[index * 2]?.winner || null : null,
        team2_id: round === 1 ? opening[index].second : round === 2 ? opening[index * 2 + 1]?.winner || null : null,
        winner_team_id: round === 1 ? opening[index].winner : null,
        status: round === 1 && opening[index].status === "bye" ? "completed" : "pending", next_match_id: null, next_slot: null
      });
    }
    const inserted = await query("matches", {}, { method: "POST", body: rows });
    const matchId = (round, index) => inserted.find(row => Number(row.round) === round && Number(row.match_number) === index + 1)?.id;
    for (let round = 1; round < rounds; round++) for (let index = 0; index < counts[round]; index++) {
      const id = matchId(round, index), next = matchId(round + 1, Math.floor(index / 2));
      if (id && next) await query("matches", { id: byId(id) }, { method: "PATCH", body: { next_match_id: next, next_slot: index % 2 === 0 ? 1 : 2 } });
    }
  }
  async function updateWinner({ session_id, match_id, winner_team_id, score1, score2 }) {
    const all = await query("matches", { select: "*", session_id: byId(session_id), order: "round.asc,match_number.asc" });
    const current = all.find(item => String(item.id) === String(match_id)); if (!current) throw new Error("Pertandingan tidak ditemukan.");
    const winner = winner_team_id || (Number(score1) > Number(score2) ? current.team1_id : current.team2_id);
    if (![current.team1_id, current.team2_id].some(id => String(id) === String(winner))) throw new Error("Tim pemenang tidak bertanding pada pertandingan ini.");
    await query("matches", { id: byId(match_id) }, { method: "PATCH", body: { winner_team_id: winner, status: "completed" } });
    let source = current, advancing = winner;
    while (source.next_match_id) {
      const target = all.find(item => String(item.id) === String(source.next_match_id));
      if (!target) break;
      const slot = Number(source.next_slot) === 1 ? "team1_id" : "team2_id";
      const patch = { [slot]: advancing };
      if (target.winner_team_id && ![target.team1_id, target.team2_id].some(id => String(id) === String(target.winner_team_id))) { patch.winner_team_id = null; patch.status = "pending"; }
      await query("matches", { id: byId(target.id) }, { method: "PATCH", body: patch });
      source = (await query("matches", { id: byId(target.id), select: "*" }))[0];
      if (source.winner_team_id && [source.team1_id, source.team2_id].some(id => String(id) === String(source.winner_team_id))) advancing = source.winner_team_id;
      else break;
    }
    return getCompetition(session_id);
  }
  return {
    listCompetitions: async () => Promise.all((await query("sessions", { select: "id", order: "created_at.desc" })).map(session => getCompetition(session.id))),
    getCompetition,
    async createCompetition(input) {
      const inserted = (await query("sessions", {}, { method: "POST", body: { name: input.name, event_date: input.event_date || null, location: input.location || "", format: input.format || "team_single_elimination", status: "in_progress" } }))[0];
      const names = input.participants || [], people = names.flatMap(name => String(name).split(" & ").map(member => ({ session_id: inserted.id, name: member.trim() })));
      const playerRows = people.length ? await query("players", {}, { method: "POST", body: people }) : [];
      const teams = [];
      for (let i = 0; i < names.length; i++) {
        const team = (await query("teams", {}, { method: "POST", body: { session_id: inserted.id, name: names[i], seed: i + 1 } }))[0]; teams.push(team);
        const pair = playerRows.slice(i * 2, i * 2 + 2);
        if (pair.length) await query("team_members", {}, { method: "POST", body: pair.map((player, position) => ({ team_id: team.id, player_id: player.id, position: position + 1 })) });
      }
      await persistBracket(inserted.id, teams);
      return getCompetition(inserted.id);
    },
    async addPlayer({ session_id, name }) { await query("players", {}, { method: "POST", body: { session_id, name } }); return getCompetition(session_id); },
    recordWinner: input => updateWinner(input), recordScore: input => updateWinner(input)
  };
}

export const dataService = (() => {
  const provider = dataConfig.dataProvider === "google-sheets" ? googleSheetsProvider() : dataConfig.dataProvider === "supabase" ? supabaseProvider(dataConfig.supabaseUrl, dataConfig.supabaseAnonKey) : null;
  if (!provider) throw new Error(`Provider data tidak didukung: ${dataConfig.dataProvider}`);
  return provider;
})();
