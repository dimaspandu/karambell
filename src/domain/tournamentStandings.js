function compareHeadToHead(first, second, matches) {
  const result = matches.find(match => match.status === "completed"
    && [String(match.participant1Id), String(match.participant2Id)].includes(first.id)
    && [String(match.participant1Id), String(match.participant2Id)].includes(second.id));
  if (!result) return 0;
  return String(result.winnerId) === first.id ? -1 : String(result.winnerId) === second.id ? 1 : 0;
}

export function getTournamentStandings({ matches = [], participants = [], groups = [], groupId = null, stage = "group" } = {}) {
  const groupMatches = matches.filter(match => (match.stage === stage)
    && (groupId == null || String(match.groupId ?? match.group_id) === String(groupId)));
  const group = groupId == null ? null : groups.find(item => String(item.id) === String(groupId));
  const memberIds = groupId == null
    ? participants.map(item => String(item.id ?? item.participant_id))
    : (group?.participantIds || group?.participant_ids || []).map(String);
  const standings = memberIds.map(id => {
    const participant = participants.find(item => String(item.id ?? item.participant_id) === id);
    const participant1 = match => match.participant1Id ?? match.participant1_id;
    const participant2 = match => match.participant2Id ?? match.participant2_id;
    const winner = match => match.winnerId ?? match.winner_id;
    const played = groupMatches.filter(match => match.status === "completed" && (String(participant1(match)) === id || String(participant2(match)) === id));
    const wins = played.filter(match => String(winner(match)) === id).length;
    return { participant, id, name: participant?.name || "Peserta", seed: Number(participant?.seed) || Number.MAX_SAFE_INTEGER, played: played.length, wins, losses: played.length - wins, points: wins * 3 };
  });
  const headToHeadMatches = groupMatches.filter(match => match.status === "completed").map(match => ({
    ...match,
    participant1Id: match.participant1Id ?? match.participant1_id,
    participant2Id: match.participant2Id ?? match.participant2_id,
    winnerId: match.winnerId ?? match.winner_id
  }));
  standings.sort((a, b) => b.points - a.points);
  for (let start = 0; start < standings.length;) {
    let end = start + 1;
    while (end < standings.length && standings[end].points === standings[start].points) end++;
    const tied = standings.slice(start, end);
    tied.sort((a, b) => (tied.length === 2 ? compareHeadToHead(a, b, headToHeadMatches) : 0)
      || a.seed - b.seed
      || a.name.localeCompare(b.name, "id-ID"));
    standings.splice(start, tied.length, ...tied);
    start = end;
  }
  return standings;
}
