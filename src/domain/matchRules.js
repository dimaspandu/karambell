function invalid(error) {
  return { valid: false, error };
}

function findMatch(competition, matchId) {
  return competition?.matches?.find(match => String(match.id ?? match.match_id) === String(matchId)) || null;
}

function matchParticipantIds(match) {
  return [
    match?.participant1Id ?? match?.participant1_id ?? match?.team1_id,
    match?.participant2Id ?? match?.participant2_id ?? match?.team2_id
  ].map(value => value == null || value === "" ? null : String(value));
}

function requirePlayableMatch(competition, matchId) {
  if (!competition?.id && !competition?.session?.session_id) return { error: "Kompetisi tidak ditemukan." };
  const match = findMatch(competition, matchId);
  if (!match) return { error: "Pertandingan tidak ditemukan dalam kompetisi ini." };
  if (String(match.status || "").toLowerCase() === "bye") return { error: "Pertandingan bye tidak dapat diubah." };
  const [participant1Id, participant2Id] = matchParticipantIds(match);
  if (!participant1Id || !participant2Id) return { error: "Kedua peserta harus ditetapkan sebelum hasil dicatat." };
  return { match, participant1Id, participant2Id };
}

export function validateMatchScore({ competition, matchId, score1, score2 }) {
  const playable = requirePlayableMatch(competition, matchId);
  if (playable.error) return invalid(playable.error);
  if (![score1, score2].every(score => Number.isInteger(score) && score >= 0 && score <= 999)) {
    return invalid("Skor harus berupa angka bulat dari 0 sampai 999.");
  }
  if (score1 === score2) return invalid("Skor seri belum bisa menentukan pemenang.");
  return {
    valid: true,
    match: playable.match,
    score1,
    score2,
    winnerId: score1 > score2 ? playable.participant1Id : playable.participant2Id
  };
}

export function validateMatchWinner({ competition, matchId, winnerId }) {
  const playable = requirePlayableMatch(competition, matchId);
  if (playable.error) return invalid(playable.error);
  const selected = winnerId == null ? "" : String(winnerId);
  if (![playable.participant1Id, playable.participant2Id].includes(selected)) {
    return invalid("Pemenang harus merupakan peserta dalam pertandingan ini.");
  }
  return { valid: true, match: playable.match, winnerId: selected };
}

function normalizedSlot(value) {
  if (value === "participant1" || Number(value) === 1) return "participant1";
  if (value === "participant2" || Number(value) === 2) return "participant2";
  return null;
}

/** Return downstream matches in order, validating every configured edge before writes. */
export function getDownstreamMatchPath(competition, matchId) {
  const matches = competition?.matches || [];
  const byId = new Map(matches.map(match => [String(match.id ?? match.match_id), match]));
  let source = byId.get(String(matchId));
  if (!source) throw new Error("Match not found in this competition.");

  const visited = new Set([String(matchId)]);
  const path = [];
  while (source.nextMatchId || source.next_match_id) {
    const nextMatchId = String(source.nextMatchId ?? source.next_match_id);
    if (visited.has(nextMatchId)) throw new Error("Bracket contains a cycle in next-match references.");
    const next = byId.get(nextMatchId);
    if (!next) throw new Error("Next match not found in this competition.");
    const slot = normalizedSlot(source.nextSlot ?? source.next_slot);
    if (!slot) throw new Error("Next-match slot must identify participant1 or participant2.");
    path.push({ matchId: nextMatchId, slot });
    visited.add(nextMatchId);
    source = next;
  }
  return path;
}
