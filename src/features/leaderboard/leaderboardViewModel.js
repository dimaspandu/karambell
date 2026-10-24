export const initialLeaderboardState = {
  status: "idle",
  data: null,
  error: null,
  requestId: 0
};

export function leaderboardStateReducer(state, action) {
  if (action.type === "load-start") {
    return { ...state, status: "loading", error: null, requestId: action.requestId };
  }
  if (action.requestId !== state.requestId) return state;
  if (action.type === "load-success") {
    return { ...state, status: "success", data: action.data, error: null };
  }
  if (action.type === "load-error") {
    return { ...state, status: "error", data: null, error: action.error };
  }
  return state;
}

export function selectLeaderboardPage(state, route) {
  if (state.status === "idle" || state.status === "loading") return { type: "loading" };
  if (state.status === "error") return { type: "error", message: state.error?.message || "Could not load leaderboard." };

  const data = state.data;
  if (route.name === "leaderboard") return { type: "leaderboard", teams: data.leaderboard };

  const team = data.getTeam(route.teamKey);
  if (!team) return { type: "not-found", message: "Team not found.", backRoute: { name: "leaderboard" } };
  if (route.name === "leaderboard-team") return { type: "team", team };

  const tournament = team.tournaments.find(item => item.sessionId === route.sessionId);
  if (!tournament) return { type: "not-found", message: "Tournament not found.", backRoute: { name: "leaderboard-team", params: { teamKey: team.teamKey } } };
  return { type: "tournament", team, tournament };
}
