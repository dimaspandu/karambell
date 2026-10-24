export function shouldShowWinnerAction({ isTournamentCompleted, canEditMatch }) {
  return Boolean(canEditMatch && !isTournamentCompleted);
}
