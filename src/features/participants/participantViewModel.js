export const initialParticipantState = { status: "idle", error: null };

export function createParticipantSubmissionGate() {
  let inFlight = false;
  return async operation => {
    if (inFlight) return false;
    inFlight = true;
    try { return await operation(); }
    finally { inFlight = false; }
  };
}

export function participantStateReducer(state, action) {
  if (action.type === "submit-start") return { status: "saving", error: null };
  if (action.type === "submit-success") return { status: "success", error: null };
  if (action.type === "submit-error") return { status: "error", error: action.error };
  if (action.type === "clear-error") return state.error ? { ...state, error: null, status: "idle" } : state;
  return state;
}
