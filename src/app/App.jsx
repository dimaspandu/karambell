import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { competitionRepository } from "./createAppDependencies.js";
import { historyRouter } from "../router/historyRouter.js";
import { SessionList } from "../features/competitions/SessionList.jsx";
import { CreateCompetitionDialog } from "../features/competitions/Dialogs.jsx";
import { Leaderboard } from "../features/leaderboard/Leaderboard.jsx";
import { useLeaderboardViewModel } from "../features/leaderboard/useLeaderboardViewModel.js";
import { useCompetitionListViewModel } from "../features/competitions/useCompetitionListViewModel.js";
import { useCompetitionDetailViewModel } from "../features/competitions/useCompetitionDetailViewModel.js";
import { useCreateCompetitionViewModel } from "../features/competitions/useCreateCompetitionViewModel.js";
import { CompetitionWorkspace } from "../features/competitions/CompetitionWorkspace.jsx";
import { clearTeamPairingDraft, readLastSessionId, rememberTeamSession, saveLastSessionId } from "../shared/persistence/appStorage.js";

const routesWithSession = ["participants", "bracket", "matches"];

export default function App() {
  const route = useSyncExternalStore(historyRouter.subscribe, historyRouter.getSnapshot, historyRouter.getSnapshot);
  const leaderboardPage = route.name.startsWith("leaderboard");
  const leaderboardViewModel = useLeaderboardViewModel({ repository: competitionRepository, route, enabled: leaderboardPage });
  const competitionList = useCompetitionListViewModel({ repository: competitionRepository });
  const sessions = competitionList.competitions;
  const competitionDetail = useCompetitionDetailViewModel({ repository: competitionRepository, route, listStatus: competitionList.status, competitions: sessions, upsertCompetition: competitionList.upsertCompetition });
  const [createOpen, setCreateOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimer = useRef(null);
  const hideTimer = useRef(null);

  useEffect(() => { historyRouter.start(); }, []);

  useEffect(() => {
    if (route.error) showToast(route.error);
    if (route.sessionId && competitionDetail.status === "success" && competitionDetail.competition?.id === route.sessionId) {
      saveLastSessionId(route.sessionId);
    }
  }, [route.error, route.sessionId, competitionDetail.status, competitionDetail.competition?.id]);

  useEffect(() => {
    if (competitionList.status === "error") {
      console.error("Gagal memuat kompetisi", competitionList.error);
      showToast("Gagal memuat data kompetisi. Silakan coba lagi.");
    }
  }, [competitionList.status, competitionList.error]);

  useEffect(() => {
    if (!route.sessionId && routesWithSession.includes(route.name) && competitionList.status === "success") {
      const lastId = readLastSessionId();
      const target = sessions.find(item => item.id === lastId) || sessions[0];
      if (target) historyRouter.navigate(route.name, { sessionId: target.id }, { replace: true });
    }
  }, [route.name, route.sessionId, competitionList.status, sessions]);

  useEffect(() => {
    if (competitionDetail.status !== "error") return;
    console.error("Gagal memuat detail kompetisi", competitionDetail.error);
    showToast("Gagal memuat data kompetisi. Silakan coba lagi.");
    historyRouter.navigate("competitions", {}, { replace: true });
  }, [competitionDetail.status, competitionDetail.error]);

  useEffect(() => () => { clearTimeout(toastTimer.current); clearTimeout(hideTimer.current); }, []);

  function showToast(message) {
    setToast(message);
    setToastVisible(true);
    clearTimeout(toastTimer.current);
    clearTimeout(hideTimer.current);
    toastTimer.current = setTimeout(() => setToastVisible(false), 2600);
  }

  function navigate(name, params = {}, options) { historyRouter.navigate(name, params, options); }

  const activeSession = competitionDetail.competition;
  const handleCompetitionCreated = useCallback(competition => {
    competitionList.upsertCompetition(competition);
    if (competition.isTeamCompetition) rememberTeamSession(competition.id);
    clearTeamPairingDraft();
    setCreateOpen(false);
    try {
      navigate("bracket", { sessionId: competition.id });
      showToast("Sesi tersimpan dan bagan dibuat.");
    } catch (error) {
      console.error("Kompetisi tersimpan tetapi halaman kompetisi tidak dapat dibuka.", error);
      showToast("Sesi tersimpan, tetapi halaman kompetisi gagal dibuka. Pilih sesi dari daftar.");
    }
  }, [competitionList.upsertCompetition]);
  const handleCreatePostFailure = useCallback(() => {
    competitionList.retry();
    showToast("Kompetisi tersimpan, tetapi tampilan belum diperbarui. Daftar sedang dimuat ulang.");
  }, [competitionList.retry]);
  const createCompetitionViewModel = useCreateCompetitionViewModel({ repository: competitionRepository, onSuccess: handleCompetitionCreated, onPostCreateError: handleCreatePostFailure });
  const activeTab = route.name === "competition-detail" ? "bracket" : route.tab || "bracket";
  const listRoute = activeSession ? null : route.name;
  const pageTitle = leaderboardPage ? route.name === "leaderboard" ? "Global Leaderboard" : route.name === "leaderboard-team" ? "Team Detail" : "Tournament History" : activeSession ? activeTab === "participants" ? "Peserta Kompetisi" : activeTab === "matches" ? "Daftar Pertandingan" : "Bagan Pertandingan" : routesWithSession.includes(listRoute) ? "Pilih Kompetisi" : "Sesi Kompetisi";
  const activeNav = leaderboardPage ? "leaderboard" : activeSession ? activeTab === "matches" ? "bracket" : activeTab : routesWithSession.includes(listRoute) ? listRoute === "matches" ? "bracket" : listRoute : "competitions";

  return <div className="app-shell">
    <aside className="sidebar" aria-label="Navigasi utama">
      <a className="brand" href="/" onClick={event => { event.preventDefault(); navigate("home"); }} aria-label="Karambol Gamebell beranda"><span className="brand__icon" aria-hidden="true">●</span><span className="brand__text">Gamebell<span>Karambol Club</span></span></a>
      <nav className="nav">
        <a className={`nav__item ${activeNav === "competitions" ? "nav__item--active" : ""}`} href="/competitions" onClick={event => { event.preventDefault(); navigate("competitions"); }}><span aria-hidden="true">▦</span> Sesi Kompetisi</a>
        <a className={`nav__item ${activeNav === "participants" ? "nav__item--active" : ""}`} href={activeSession ? `/participants/${encodeURIComponent(activeSession.id)}` : "/participants"} onClick={event => { event.preventDefault(); navigate("participants", activeSession ? { sessionId: activeSession.id } : {}); }}><span aria-hidden="true">♟</span> Peserta</a>
        <a className={`nav__item ${activeNav === "bracket" ? "nav__item--active" : ""}`} href={activeSession ? `/bracket/${encodeURIComponent(activeSession.id)}` : "/bracket"} onClick={event => { event.preventDefault(); navigate("bracket", activeSession ? { sessionId: activeSession.id } : {}); }}><span aria-hidden="true">⌘</span> Bagan Pertandingan</a>
        <a className={`nav__item ${activeNav === "leaderboard" ? "nav__item--active" : ""}`} href="/leaderboard" onClick={event => { event.preventDefault(); navigate("leaderboard"); }}><span aria-hidden="true">🏆</span> Leaderboard</a>
      </nav>
      <div className="sidebar__bottom"><div className="connection"><span className="connection__dot"/><span>Data kompetisi</span></div><p>Gamebell · 2026</p></div>
    </aside>
    <main className="main">
      <header className="topbar"><div><p className="eyebrow">KARAMBOL CLUB / 2026</p><h1>{pageTitle}</h1></div><button className="button button--primary" onClick={() => setCreateOpen(true)}>＋ Buat Sesi</button></header>
      <section className={`view ${!leaderboardPage && !activeSession ? "view--active" : ""}`} aria-labelledby="sessions-heading">
        <SessionList sessions={sessions} loading={competitionList.loading} error={competitionList.status === "error"} onOpen={id => navigate("competition-detail", { sessionId: id })} onCreate={() => setCreateOpen(true)} onRetry={competitionList.retry}/>
      </section>
      <section className={`view ${!leaderboardPage && activeSession ? "view--active" : ""}`} aria-label="Detail kompetisi">
        <CompetitionWorkspace competition={activeSession} activeTab={activeTab} presentation={route.presentation} onPresentationChange={historyRouter.setPresentation} loading={competitionDetail.status === "loading"} repository={competitionRepository} upsertCompetition={competitionList.upsertCompetition} retry={competitionList.retry} navigate={navigate} showToast={showToast}/>
      </section>
      <section className={`view ${leaderboardPage ? "view--active" : ""}`} aria-label="Global leaderboard"><Leaderboard viewModel={leaderboardViewModel} onNavigate={navigate}/></section>
    </main>
    <CreateCompetitionDialog open={createOpen} onOpenChange={open => { if (open) createCompetitionViewModel.clearError(); setCreateOpen(open); }} onSubmit={createCompetitionViewModel.submit} saving={createCompetitionViewModel.saving} error={createCompetitionViewModel.error} onErrorClear={createCompetitionViewModel.clearError}/>
    <div className={`toast ${toastVisible ? "toast--visible" : ""}`} role="status" aria-live="polite">{toast}</div>
  </div>;
}
