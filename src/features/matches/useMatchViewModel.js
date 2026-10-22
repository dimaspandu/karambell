import { useCallback, useReducer, useRef } from "react";
import { validateMatchScore, validateMatchWinner } from "../../domain/matchRules.js";
import { createMatchSubmissionGate, initialMatchState, matchStateReducer } from "./matchViewModel.js";

function errorMessage(error) {
  if (error.code === "MATCH_VALIDATION") return error.message;
  if (error.code === "PARTIAL_MATCH_MUTATION") return "Penyimpanan pertandingan mungkin baru sebagian. Kompetisi sedang dimuat ulang.";
  if (error.code === "MATCH_REFRESH_FAILED") return "Hasil pertandingan tersimpan, tetapi data terbaru gagal dimuat. Kompetisi sedang dimuat ulang.";
  if (error.code === "MATCH_MUTATION_UNCERTAIN") return "Hasil pertandingan belum dapat dikonfirmasi. Kompetisi sedang dimuat ulang.";
  return "Gagal menyimpan perubahan. Silakan coba lagi.";
}

export function useMatchViewModel({ repository, competition, onSuccess, onError }) {
  const [state, dispatch] = useReducer(matchStateReducer, initialMatchState);
  const submissionGate = useRef(null);
  if (!submissionGate.current) submissionGate.current = createMatchSubmissionGate();

  const submit = useCallback((operation, persist) => submissionGate.current(async () => {
    dispatch({ type: "save-start", operation });
    try {
      const result = await persist();
      dispatch({ type: "save-success", operation });
      onSuccess(result, { operation });
      return true;
    } catch (error) {
      if (!error.code || !["MATCH_VALIDATION", "PARTIAL_MATCH_MUTATION", "MATCH_REFRESH_FAILED", "MATCH_MUTATION_UNCERTAIN"].includes(error.code)) {
        console.error("Gagal menyimpan hasil pertandingan", error);
      }
      const message = errorMessage(error);
      dispatch({ type: "save-error", operation, error });
      onError(error, message);
      return false;
    }
  }), [onSuccess, onError]);

  const recordScore = useCallback(input => {
    const matchId = input?.match_id;
    const outcome = validateMatchScore({ competition, matchId, score1: input?.score1, score2: input?.score2 });
    if (!outcome.valid) {
      const error = new Error(outcome.error);
      error.code = "MATCH_VALIDATION";
      return submit("score", async () => { throw error; });
    }
    return submit("score", () => repository.recordMatchScore({ competition, matchId, score1: outcome.score1, score2: outcome.score2 }));
  }, [competition, repository, submit]);

  const recordWinner = useCallback((matchId, winnerId) => {
    const outcome = validateMatchWinner({ competition, matchId, winnerId });
    if (!outcome.valid) {
      const error = new Error(outcome.error);
      error.code = "MATCH_VALIDATION";
      return submit("winner", async () => { throw error; });
    }
    if (outcome.match.winnerId === outcome.winnerId) {
      onSuccess(competition, { operation: "winner", unchanged: true });
      return Promise.resolve(true);
    }
    return submit("winner", () => repository.recordMatchWinner({ competition, matchId, winnerId: outcome.winnerId }));
  }, [competition, onSuccess, repository, submit]);

  return { saving: state.status === "saving" ? state.operation : null, error: state.error, recordScore, recordWinner };
}
