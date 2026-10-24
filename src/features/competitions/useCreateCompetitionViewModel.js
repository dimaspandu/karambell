import { useCallback, useReducer, useRef } from "react";
import { createCompetitionSubmissionGate, createCompetitionStateReducer, deliverCreatedCompetition, initialCreateCompetitionState } from "./createCompetitionViewModel.js";

function errorMessage(error) {
  if (error.code === "COMPETITION_VALIDATION") return error.message;
  if (error.code === "COMPETITION_CLEANUP_FAILED") {
    const cleanup = (error.cleanupFailures || []).map(failure => `${failure.table}: ${failure.message}`).join("; ");
    return `Kompetisi gagal pada tahap ${error.creationStage || "tidak diketahui"}: ${error.message || "request Supabase gagal"}. Pembersihan juga gagal${cleanup ? ` (${cleanup})` : ""}. Jangan coba ulang sebelum data sisa diperiksa.`;
  }
  if (error.code === "COMPETITION_CREATE_UNCERTAIN") return "Status pembuatan belum dapat dipastikan. Muat ulang daftar kompetisi sebelum mencoba lagi.";
  if (error.code === "COMPETITION_REFRESH_FAILED" || error.code === "COMPETITION_CREATE_RESPONSE") return error.message;
  return "Gagal membuat kompetisi. Silakan periksa koneksi lalu coba lagi.";
}

export function useCreateCompetitionViewModel({ repository, onSuccess, onPostCreateError }) {
  const [state, dispatch] = useReducer(createCompetitionStateReducer, initialCreateCompetitionState);
  const gate = useRef(null);
  if (!gate.current) gate.current = createCompetitionSubmissionGate();

  const submit = useCallback(input => gate.current(async () => {
    dispatch({ type: "submit-start" });
    let competition;
    try {
      competition = await repository.createCompetition(input);
    } catch (error) {
      if (!error.code || !["COMPETITION_VALIDATION", "COMPETITION_CLEANUP_FAILED"].includes(error.code)) console.error("Gagal membuat kompetisi", error);
      dispatch({ type: "submit-error", error: errorMessage(error) });
      return false;
    }

    dispatch({ type: "submit-success" });
    return deliverCreatedCompetition(competition, onSuccess, (error, created) => {
      console.error("Kompetisi tersimpan, tetapi tindak lanjut navigasi gagal.", error);
      onPostCreateError?.(error, created);
    });
  }), [repository, onSuccess, onPostCreateError]);

  const clearError = useCallback(() => dispatch({ type: "clear-error" }), []);
  return { saving: state.status === "saving", error: state.error, submit, clearError };
}
