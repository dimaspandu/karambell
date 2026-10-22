import { useCallback, useReducer, useRef } from "react";
import { createParticipantSubmissionGate, initialParticipantState, participantStateReducer } from "./participantViewModel.js";

export function useParticipantViewModel({ repository, competition, onSuccess, onRefreshFailure }) {
  const [state, dispatch] = useReducer(participantStateReducer, initialParticipantState);
  const submissionGate = useRef(null);
  if (!submissionGate.current) submissionGate.current = createParticipantSubmissionGate();

  const submit = useCallback(name => submissionGate.current(async () => {
    dispatch({ type: "submit-start" });
    try {
      const updatedCompetition = await repository.addParticipant({ competition, name });
      dispatch({ type: "submit-success" });
      onSuccess(updatedCompetition);
      return true;
    } catch (error) {
      if (error.code === "PARTICIPANT_REFRESH_FAILED") onRefreshFailure?.();
      if (error.code !== "PARTICIPANT_VALIDATION") console.error("Gagal menambahkan peserta", error);
      const message = error.code === "PARTICIPANT_VALIDATION" || error.code === "PARTICIPANT_REFRESH_FAILED"
        ? error.message
        : "Gagal menyimpan perubahan. Silakan coba lagi.";
      dispatch({ type: "submit-error", error: message });
      return false;
    }
  }), [repository, competition, onSuccess]);

  const clearError = useCallback(() => dispatch({ type: "clear-error" }), []);
  return { saving: state.status === "saving", error: state.error, submit, clearError };
}
