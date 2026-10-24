export const initialCompetitionDetailState = { status: "idle", sessionId: null, competition: null, error: null, requestId: 0 };

export function competitionDetailStateReducer(state, action) {
  if (action.type === "load-start") return { status: "loading", sessionId: action.sessionId, competition: null, error: null, requestId: action.requestId };
  if (action.requestId !== state.requestId) return state;
  if (action.type === "load-success") return { ...state, status: "success", competition: action.competition, error: null };
  if (action.type === "load-error") return { ...state, status: "error", competition: null, error: action.error };
  if (action.type === "clear") return { ...initialCompetitionDetailState, requestId: action.requestId };
  return state;
}

export function selectCompetitionDetail(state, sessionId, competitions) {
  if (!sessionId) return { status: "idle", competition: null, error: null };
  const listed = competitions.find(competition => competition.id === String(sessionId));
  if (listed) return { status: "success", competition: listed, error: null };
  if (state.sessionId !== String(sessionId)) return { status: "loading", competition: null, error: null };
  return { status: state.status, competition: state.competition, error: state.error };
}
