const TEAM_SESSION_IDS_KEY = "karambell:team-session-ids";

function isLocallyKnownTeamSession(sessionId) {
  try {
    const ids = JSON.parse(window.localStorage.getItem(TEAM_SESSION_IDS_KEY) || "[]");
    return Array.isArray(ids) && ids.includes(String(sessionId));
  } catch { return false; }
}

export function rememberTeamSession(sessionId) {
  try {
    const stored = JSON.parse(window.localStorage.getItem(TEAM_SESSION_IDS_KEY) || "[]");
    const ids = Array.isArray(stored) ? stored.map(String) : [];
    if (!ids.includes(String(sessionId))) ids.push(String(sessionId));
    window.localStorage.setItem(TEAM_SESSION_IDS_KEY, JSON.stringify(ids));
  } catch { /* The provider remains the cross-device source of truth. */ }
}

export function normalizeCompetition(payload) {
  const raw = payload.session || {};
  const participants = (payload.participants || []).map(participant => ({
    id: String(participant.participant_id),
    name: String(participant.name || ""),
    seed: Number(participant.seed || 0)
  }));
  const matches = (payload.matches || []).map(match => ({
    id: String(match.match_id),
    round: Number(match.round),
    index: Number(match.match_number) - 1,
    participant1Id: match.participant1_id ? String(match.participant1_id) : null,
    participant2Id: match.participant2_id ? String(match.participant2_id) : null,
    score1: match.score1 === "" || match.score1 === null || match.score1 === undefined ? null : Number(match.score1),
    score2: match.score2 === "" || match.score2 === null || match.score2 === undefined ? null : Number(match.score2),
    winnerId: match.winner_id ? String(match.winner_id) : null,
    status: String(match.status || "pending"),
    nextMatchId: match.next_match_id ? String(match.next_match_id) : null,
    nextSlot: match.next_slot || null
  }));
  return {
    id: String(raw.session_id),
    name: String(raw.name || "Kompetisi tanpa nama"),
    date: raw.event_date ? String(raw.event_date).slice(0, 10) : "",
    location: String(raw.location || ""),
    format: raw.format === "single_elimination" ? "single" : String(raw.format || "single"),
    isTeamCompetition: ["team_single_elimination", "team"].includes(String(raw.format || "").toLowerCase()) || isLocallyKnownTeamSession(raw.session_id),
    status: String(raw.status || "draft"),
    participants,
    matches,
    totalRounds: matches.reduce((max, match) => Math.max(max, match.round), 0),
    createdAt: raw.created_at || "",
    updatedAt: raw.updated_at || ""
  };
}

export const initials = name => String(name || "").trim().split(/\s+/).slice(0, 2).map(part => part[0] || "").join("").toUpperCase();
export const formatDate = date => {
  if (!date) return "Tanggal belum ditentukan";
  const parsed = new Date(`${date}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? date : new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" }).format(parsed);
};
export const matchRoundName = (round, totalRounds) => round === totalRounds ? "Final" : round === totalRounds - 1 ? "Semifinal" : round === totalRounds - 2 ? "Perempat final" : `Babak ${round}`;
export const getParticipant = (competition, id) => competition?.participants.find(participant => participant.id === id) || null;
