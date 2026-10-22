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

async function recordMatchScore({ sessionId, matchId, score1, score2 }) {
  try {
    return await updateScore({ session_id: sessionId, match_id: matchId, score1, score2 });
  } catch (error) {
    error.code = error.code || "MATCH_MUTATION_UNCERTAIN";
    throw error;
  }
}

async function recordMatchWinner({ sessionId, matchId, winnerId, participant1Id, participant2Id }) {
  if (winnerId !== participant1Id && winnerId !== participant2Id) throw new Error("Pemenang harus merupakan peserta dalam pertandingan ini.");
  return recordMatchScore({
    sessionId,
    matchId,
    score1: winnerId === participant1Id ? 1 : 0,
    score2: winnerId === participant2Id ? 1 : 0
  });
}

async function createCompetition(input) {
  if (input.participants.length > 64) {
    const error = new Error("Maksimal 64 tim dapat dibuat pada Google Sheets.");
    error.code = "COMPETITION_VALIDATION";
    throw error;
  }
  const { isTeamCompetition, ...payload } = input;
  try {
    return await request("/api/sessions", {
      method: "POST",
      body: JSON.stringify({ ...payload, format: isTeamCompetition ? "team_single_elimination" : payload.format })
    });
  } catch (error) {
    error.code = error.code || "COMPETITION_CREATE_UNCERTAIN";
    throw error;
  }
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
    return Promise.all(rows.map(row => getCompetition(row.session_id)));
  },
  getCompetition,
  createCompetition,
  addPlayer(input) { return request("/api/participants", { method: "POST", body: JSON.stringify(input) }); },
  recordMatchScore,
  recordMatchWinner,
  recordWinner: updateScore,
  recordScore: updateScore
}
