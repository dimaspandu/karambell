export const initialCompetitionListState = { status: "loading", competitions: [], error: null, requestId: 0 };

export async function loadCompetitionList({ repository, dispatch, requestId, isActive = () => true }) {
  try {
    const competitions = await repository.listCompetitions();
    if (isActive()) dispatch({ type: "load-success", requestId, competitions });
  } catch (error) {
    if (isActive()) dispatch({ type: "load-error", requestId, error });
  }
}

export function competitionListStateReducer(state, action) {
  if (action.type === "load-start") return { ...state, status: "loading", error: null, requestId: action.requestId };
  if (action.requestId !== state.requestId) return state;
  if (action.type === "load-success") return { ...state, status: "success", competitions: action.competitions, error: null };
  if (action.type === "load-error") return { ...state, status: "error", error: action.error };
  if (action.type === "upsert") {
    const index = state.competitions.findIndex(item => item.id === action.competition.id);
    const competitions = index < 0 ? [action.competition, ...state.competitions] : state.competitions.map(item => item.id === action.competition.id ? action.competition : item);
    return { ...state, competitions };
  }
  return state;
}
