import { getTournamentStandings } from "./tournamentStandings.js";
import { TOURNAMENT_FORMATS } from "./tournamentFormats.js";

export function getCompetitionProgress(matches = [], { format = TOURNAMENT_FORMATS.SINGLE_ELIMINATION, participants = [], groups = [] } = {}) {
  const totalMatches = matches.length;
  const completedMatches = matches.filter(match => ["completed", "bye"].includes(String(match.status || "").toLowerCase())).length;
  const isAllDecided = totalMatches > 0 && completedMatches === totalMatches;
  const finalStage = format === TOURNAMENT_FORMATS.DOUBLE_ELIMINATION
    ? "grand_final"
    : format === TOURNAMENT_FORMATS.GROUP_KNOCKOUT
      ? "main"
      : "main";
  const candidates = matches.filter(match => (match.stage || "main") === finalStage);
  const finalRound = candidates.reduce((highest, match) => Math.max(highest, Number(match.round) || 0), 0);
  const finalMatch = candidates.filter(match => Number(match.round) === finalRound).at(-1) || null;
  let finalWinnerId = finalMatch?.winnerId ?? finalMatch?.winner_id;
  if (format === TOURNAMENT_FORMATS.ROUND_ROBIN && isAllDecided) {
    finalWinnerId = getTournamentStandings({ matches, participants, groups, stage: "main" })[0]?.id || null;
  }
  const isComplete = isAllDecided && Boolean(finalWinnerId)
    && (format === TOURNAMENT_FORMATS.ROUND_ROBIN
      || ["completed", "bye"].includes(String(finalMatch?.status || "").toLowerCase()));
  return {
    completedMatches,
    totalMatches,
    progress: isComplete ? 100 : totalMatches ? Math.round(completedMatches / totalMatches * 100) : 0,
    status: isComplete ? "completed" : "in_progress",
    isComplete,
    championId: isComplete ? finalWinnerId : null
  };
}
