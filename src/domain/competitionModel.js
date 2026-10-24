export function normalizeCompetition(payload, { isTeamSessionKnown = false } = {}) {
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
    isTeamCompetition: ["team_single_elimination", "team"].includes(String(raw.format || "").toLowerCase()) || isTeamSessionKnown,
    status: String(raw.status || "draft"),
    participants,
    matches,
    totalRounds: matches.reduce((max, match) => Math.max(max, match.round), 0),
    createdAt: raw.created_at || "",
    updatedAt: raw.updated_at || ""
  };
}

export const getParticipant = (competition, id) => competition?.participants.find(participant => participant.id === id) || null;
