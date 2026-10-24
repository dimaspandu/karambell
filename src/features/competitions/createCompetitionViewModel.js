export const initialCreateCompetitionState = { status: "idle", error: null };

export function createCompetitionStateReducer(state, action) {
  if (action.type === "submit-start") return { status: "saving", error: null };
  if (action.type === "submit-success") return { status: "success", error: null };
  if (action.type === "submit-error") return { status: "error", error: action.error };
  if (action.type === "clear-error") return { ...state, error: null };
  return state;
}

export function createCompetitionSubmissionGate() {
  let inFlight = false;
  return async operation => {
    if (inFlight) return false;
    inFlight = true;
    try { return await operation(); }
    finally { inFlight = false; }
  };
}

export function deliverCreatedCompetition(competition, onSuccess, onPostCreateError) {
  try {
    onSuccess(competition);
  } catch (error) {
    onPostCreateError?.(error, competition);
  }
  return true;
}
