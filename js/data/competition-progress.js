export function getCompetitionProgress(matches = []) {
  const totalMatches = matches.length;
  const completedMatches = matches.filter(match => ["completed", "bye"].includes(String(match.status || "").toLowerCase())).length;
  const finalRound = matches.reduce((highest, match) => Math.max(highest, Number(match.round) || 0), 0);
  const finalMatch = finalRound ? matches.find(match => Number(match.round) === finalRound) : null;
  const isComplete = totalMatches > 0
    && completedMatches === totalMatches
    && Boolean(finalMatch?.winnerId ?? finalMatch?.winner_id)
    && ["completed", "bye"].includes(String(finalMatch.status || "").toLowerCase());
  return {
    completedMatches,
    totalMatches,
    progress: isComplete ? 100 : totalMatches ? Math.round(completedMatches / totalMatches * 100) : 0,
    status: isComplete ? "completed" : "in_progress",
    isComplete,
    championId: isComplete ? (finalMatch.winnerId ?? finalMatch.winner_id) : null
  };
}
