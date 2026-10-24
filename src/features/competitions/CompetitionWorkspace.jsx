import { useCallback, useState } from "react";
import { CompetitionDetail } from "./CompetitionDetail.jsx";
import { ParticipantDialog, ScoreDialog, TeamWinnerDialog } from "./Dialogs.jsx";
import { printPlaybook } from "./playbookExport.js";
import { useParticipantViewModel } from "../participants/useParticipantViewModel.js";
import { useMatchViewModel } from "../matches/useMatchViewModel.js";

export function CompetitionWorkspace({ competition, activeTab, presentation, onPresentationChange, loading, repository, upsertCompetition, retry, navigate, showToast }) {
  const [participantOpen, setParticipantOpen] = useState(false);
  const [scoreMatchId, setScoreMatchId] = useState(null);
  const [winnerMatchId, setWinnerMatchId] = useState(null);

  const handleParticipantAdded = useCallback(updated => {
    upsertCompetition(updated);
    setParticipantOpen(false);
    showToast("Peserta tersimpan dan data kompetisi diperbarui.");
  }, [upsertCompetition, showToast]);
  const handleParticipantRefreshFailure = useCallback(() => {
    setParticipantOpen(false);
    retry();
    showToast("Peserta tersimpan. Memuat ulang data kompetisi.");
  }, [retry, showToast]);
  const participantViewModel = useParticipantViewModel({ repository, competition, onSuccess: handleParticipantAdded, onRefreshFailure: handleParticipantRefreshFailure });

  const handleMatchSuccess = useCallback((updated, { operation, unchanged }) => {
    if (!unchanged) upsertCompetition(updated);
    setScoreMatchId(null);
    setWinnerMatchId(null);
    if (!unchanged) showToast(operation === "score" ? "Skor tersimpan dan bagan diperbarui." : "Hasil Menang/Kalah tersimpan dan bagan diperbarui.");
  }, [upsertCompetition, showToast]);
  const handleMatchError = useCallback((error, message) => {
    if (["PARTIAL_MATCH_MUTATION", "MATCH_REFRESH_FAILED", "MATCH_MUTATION_UNCERTAIN"].includes(error.code)) {
      retry();
      setScoreMatchId(null);
      setWinnerMatchId(null);
    }
    showToast(message);
  }, [retry, showToast]);
  const matchViewModel = useMatchViewModel({ repository, competition, onSuccess: handleMatchSuccess, onError: handleMatchError });

  function exportPlaybook() {
    if (competition && !printPlaybook(competition)) showToast("Izinkan pop-up untuk membuat Playbook PDF.");
  }

  return <>
    {loading ? <div className="empty-state"><h3>Memuat data kompetisi…</h3></div> : competition && <CompetitionDetail
      competition={competition}
      activeTab={activeTab}
      presentation={presentation}
      onPresentationChange={onPresentationChange}
      onNavigate={navigate}
      onAddParticipant={() => setParticipantOpen(true)}
      onEditScore={setScoreMatchId}
      onChooseWinner={setWinnerMatchId}
      onExport={exportPlaybook}
    />}
    <ScoreDialog open={Boolean(scoreMatchId)} onOpenChange={open => { if (!open) setScoreMatchId(null); }} competition={competition} match={competition?.matches.find(match => match.id === scoreMatchId) || null} onSubmit={matchViewModel.recordScore} saving={matchViewModel.saving === "score"}/>
    <TeamWinnerDialog open={Boolean(winnerMatchId)} onOpenChange={open => { if (!open) setWinnerMatchId(null); }} competition={competition} match={competition?.matches.find(match => match.id === winnerMatchId) || null} onSubmit={matchViewModel.recordWinner} saving={matchViewModel.saving === "winner"}/>
    <ParticipantDialog open={participantOpen} onOpenChange={open => { if (open) participantViewModel.clearError(); setParticipantOpen(open); }} onSubmit={participantViewModel.submit} saving={participantViewModel.saving} error={participantViewModel.error} onErrorClear={participantViewModel.clearError}/>
  </>;
}
