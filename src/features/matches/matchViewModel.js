export const initialMatchState = { status: "idle", operation: null, error: null };

export function matchStateReducer(state, action) {
  if (action.type === "save-start") return { status: "saving", operation: action.operation, error: null };
  if (action.type === "save-success") return { status: "success", operation: action.operation, error: null };
  if (action.type === "save-error") return { status: "error", operation: action.operation, error: action.error };
  return state;
}

export function createMatchSubmissionGate() {
  let inFlight = false;
  return async operation => {
    if (inFlight) return false;
    inFlight = true;
    try { return await operation(); }
    finally { inFlight = false; }
  };
}
