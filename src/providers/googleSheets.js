import { getCompetitionProgress } from "../domain/competitionProgress.js";

async function request(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) } });
  let payload;
  try { payload = await response.json(); } catch { throw new Error(`Respons server tidak valid (HTTP ${response.status}).`); }
  if (!response.ok || payload.ok === false) throw new Error(payload.error || `Request gagal (HTTP ${response.status}).`);
  return payload.data;
}

async function getCompetition(id) {
  return request(`/api/session?session_id=${encodeURIComponent(id)}`);
}

async function updateScore(input) {
  await request("/api/matches/score", { method: "POST", body: JSON.stringify(input) });
  const competition = await getCompetition(input.session_id);
  const { status } = getCompetitionProgress(competition.matches || []);
  await request("/api/sessions/status", { method: "POST", body: JSON.stringify({ session_id: input.session_id, status }) });
  const updated = await getCompetition(input.session_id);
  if (String(updated.session?.status) !== status) throw new Error("Status kompetisi belum tersimpan. Silakan coba lagi.");
  return updated;
}

export const googleSheetsProvider = {
  async listLeaderboardCompetitions() {
    const result = await request("/api/sessions");
    const rows = Array.isArray(result.sessions) ? result.sessions : [];
    return Promise.all(rows.map(row => getCompetition(row.session_id)));
  },
  async listCompetitions() {
    const result = await request("/api/sessions");
    const rows = Array.isArray(result.sessions) ? result.sessions : [];
    return Promise.all(rows.map(row => getCompetition(row.session_id).catch(() => ({ session: row, participants: [], matches: [] }))));
  },
  getCompetition,
  createCompetition(input) {
    const { isTeamCompetition, ...payload } = input;
    return request("/api/sessions", { method: "POST", body: JSON.stringify({ ...payload, format: isTeamCompetition ? "team_single_elimination" : payload.format }) });
  },
  addPlayer(input) { return request("/api/participants", { method: "POST", body: JSON.stringify(input) }); },
  recordWinner: updateScore,
  recordScore: updateScore
}
