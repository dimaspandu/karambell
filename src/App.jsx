import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { dataService } from "./services/dataService.js";
import { historyRouter } from "./router/historyRouter.js";
import { normalizeCompetition, formatDate, getParticipant, initials, matchRoundName, rememberTeamSession } from "./domain/competitionModel.js";
import { CompetitionDetail } from "./components/CompetitionDetail.jsx";
import { SessionList } from "./components/SessionList.jsx";
import { CreateCompetitionDialog, ParticipantDialog, ScoreDialog, TeamWinnerDialog } from "./components/Dialogs.jsx";

const LAST_SESSION_KEY = "karambell:last-session-id";
const TEAM_PAIRING_DRAFT_KEY = "karambell:team-pairing-draft";
const routesWithSession = ["participants", "bracket", "matches"];
const escapeHTML = value => String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));

function saveCompetition(list, competition) {
  const index = list.findIndex(item => item.id === competition.id);
  if (index < 0) return [competition, ...list];
  return list.map(item => item.id === competition.id ? competition : item);
}

export default function App() {
  const route = useSyncExternalStore(historyRouter.subscribe, historyRouter.getSnapshot, historyRouter.getSnapshot);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadCount, setReloadCount] = useState(0);
  const [detailLoading, setDetailLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [participantOpen, setParticipantOpen] = useState(false);
  const [scoreMatchId, setScoreMatchId] = useState(null);
  const [winnerMatchId, setWinnerMatchId] = useState(null);
  const [saving, setSaving] = useState(null);
  const [toast, setToast] = useState("");
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimer = useRef(null);
  const hideTimer = useRef(null);
  const requestId = useRef(0);
  const loadedSessionIds = useRef(new Set());

  useEffect(() => { historyRouter.start(); }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    dataService.listCompetitions().then(payloads => {
      if (!active) return;
      const normalized = payloads.map(normalizeCompetition);
      normalized.forEach(item => loadedSessionIds.current.add(item.id));
      setSessions(normalized);
      setLoadError(false);
    }).catch(error => {
      if (!active) return;
      console.error("Gagal memuat kompetisi", error);
      setLoadError(true);
      showToast("Gagal memuat data kompetisi. Silakan coba lagi.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reloadCount]);

  useEffect(() => {
    if (route.error) showToast(route.error);
    if (!route.sessionId) {
      if (routesWithSession.includes(route.name)) {
        let lastId = null;
        try { lastId = window.localStorage.getItem(LAST_SESSION_KEY); } catch { /* Storage is optional. */ }
        const target = sessions.find(item => item.id === lastId) || sessions[0];
        if (target) { historyRouter.navigate(route.name, { sessionId: target.id }, { replace: true }); return; }
      }
      return;
    }
    const currentRequest = ++requestId.current;
    const existing = sessions.find(item => item.id === route.sessionId);
    if (existing && loadedSessionIds.current.has(route.sessionId)) {
      try { window.localStorage.setItem(LAST_SESSION_KEY, route.sessionId); } catch { /* Storage is optional. */ }
      return;
    }
    let active = true;
    setDetailLoading(true);
    dataService.getCompetition(route.sessionId).then(payload => {
      if (!active || currentRequest !== requestId.current) return;
      const competition = normalizeCompetition(payload);
      loadedSessionIds.current.add(competition.id);
      setSessions(previous => saveCompetition(previous, competition));
      try { window.localStorage.setItem(LAST_SESSION_KEY, competition.id); } catch { /* Storage is optional. */ }
    }).catch(error => {
      if (!active || currentRequest !== requestId.current) return;
      console.error("Gagal memuat detail kompetisi", error);
      showToast("Gagal memuat data kompetisi. Silakan coba lagi.");
      historyRouter.navigate("competitions", {}, { replace: true });
    }).finally(() => { if (active && currentRequest === requestId.current) setDetailLoading(false); });
    return () => { active = false; };
  }, [route, sessions]);

  useEffect(() => () => { clearTimeout(toastTimer.current); clearTimeout(hideTimer.current); }, []);

  function showToast(message) {
    setToast(message);
    setToastVisible(true);
    clearTimeout(toastTimer.current);
    clearTimeout(hideTimer.current);
    toastTimer.current = setTimeout(() => setToastVisible(false), 2600);
  }

  function navigate(name, params = {}, options) { historyRouter.navigate(name, params, options); }

  const activeSession = sessions.find(item => item.id === route.sessionId) || null;
  const activeTab = route.name === "competition-detail" ? "bracket" : route.tab || "bracket";
  const scoreMatch = activeSession?.matches.find(match => match.id === scoreMatchId) || null;
  const winnerMatch = activeSession?.matches.find(match => match.id === winnerMatchId) || null;
  const listRoute = activeSession ? null : route.name;
  const pageTitle = activeSession ? activeTab === "participants" ? "Peserta Kompetisi" : activeTab === "matches" ? "Daftar Pertandingan" : "Bagan Pertandingan" : routesWithSession.includes(listRoute) ? "Pilih Kompetisi" : "Sesi Kompetisi";
  const activeNav = activeSession ? activeTab === "matches" ? "bracket" : activeTab : routesWithSession.includes(listRoute) ? listRoute === "matches" ? "bracket" : listRoute : "competitions";

  async function createCompetition(input) {
    setSaving("create");
    try {
      const result = await dataService.createCompetition(input);
      const competition = normalizeCompetition(result);
      competition.isTeamCompetition = true;
      competition.format = "team_single_elimination";
      rememberTeamSession(competition.id);
      loadedSessionIds.current.add(competition.id);
      setSessions(previous => saveCompetition(previous, competition));
      try { window.localStorage.removeItem(TEAM_PAIRING_DRAFT_KEY); } catch { /* Ignore unavailable storage. */ }
      setCreateOpen(false);
      navigate("bracket", { sessionId: competition.id });
      showToast("Sesi tersimpan dan bagan dibuat.");
      return true;
    } catch (error) {
      console.error("Gagal membuat sesi", error);
      showToast("Gagal membuat kompetisi. Silakan coba lagi.");
      return false;
    } finally { setSaving(null); }
  }

  async function saveScore(input) {
    const match = activeSession?.matches.find(item => item.id === input.match_id);
    if (!match) return;
    if (!Number.isFinite(input.score1) || !Number.isFinite(input.score2) || input.score1 < 0 || input.score2 < 0) return showToast("Skor harus berupa angka nol atau lebih.");
    if (input.score1 === input.score2) return showToast("Skor seri belum bisa menentukan pemenang.");
    setSaving("score");
    try {
      const competition = normalizeCompetition(await dataService.recordScore(input));
      loadedSessionIds.current.add(competition.id);
      setSessions(previous => saveCompetition(previous, competition));
      setScoreMatchId(null);
      showToast("Skor tersimpan dan bagan diperbarui.");
      return true;
    } catch (error) {
      console.error("Gagal menyimpan skor", error);
      showToast("Gagal menyimpan perubahan. Silakan coba lagi.");
      return false;
    } finally { setSaving(null); }
  }

  async function saveWinner(matchId, winnerId) {
    const match = activeSession?.matches.find(item => item.id === matchId);
    if (!activeSession?.isTeamCompetition || !match || ![match.participant1Id, match.participant2Id].includes(winnerId)) return false;
    if (match.winnerId === winnerId) { setWinnerMatchId(null); return true; }
    if (match.winnerId) {
      const previousWinner = getParticipant(activeSession, match.winnerId)?.name || "tim sebelumnya";
      const nextWinner = getParticipant(activeSession, winnerId)?.name || "tim yang dipilih";
      if (!window.confirm(`Hasil sudah tercatat: ${previousWinner} menang. Ganti hasil menjadi ${nextWinner} menang? Hasil babak berikutnya yang bergantung pada pertandingan ini juga dapat berubah.`)) return false;
    }
    setSaving("winner");
    try {
      const input = { session_id: activeSession.id, match_id: match.id, score1: winnerId === match.participant1Id ? 1 : 0, score2: winnerId === match.participant2Id ? 1 : 0 };
      const competition = normalizeCompetition(await dataService.recordWinner(input));
      competition.isTeamCompetition = true;
      competition.format = activeSession.format;
      loadedSessionIds.current.add(competition.id);
      setSessions(previous => saveCompetition(previous, competition));
      setWinnerMatchId(null);
      showToast("Hasil Menang/Kalah tersimpan dan bagan diperbarui.");
      return true;
    } catch (error) {
      console.error("Gagal menyimpan hasil", error);
      showToast("Gagal menyimpan perubahan. Silakan coba lagi.");
      return false;
    } finally { setSaving(null); }
  }

  async function addParticipant(name) {
    if (!activeSession || !name) return false;
    if (activeSession.participants.some(item => item.name.toLocaleLowerCase("id-ID") === name.toLocaleLowerCase("id-ID"))) {
      showToast("Nama peserta sudah ada.");
      return false;
    }
    setSaving("participant");
    try {
      const competition = normalizeCompetition(await dataService.addPlayer({ session_id: activeSession.id, name }));
      setSessions(previous => saveCompetition(previous, competition));
      setParticipantOpen(false);
      showToast("Peserta tersimpan dan bagan diperbarui.");
      return true;
    } catch (error) {
      console.error("Gagal menambahkan peserta", error);
      showToast("Gagal menyimpan perubahan. Silakan coba lagi.");
      return false;
    } finally { setSaving(null); }
  }

  function exportPlaybook() {
    if (!activeSession) return;
    const printWindow = window.open("", "_blank", "noopener,noreferrer");
    if (!printWindow) return showToast("Izinkan pop-up untuk membuat Playbook PDF.");
    const rows = activeSession.matches.map(match => {
      const first = getParticipant(activeSession, match.participant1Id);
      const second = getParticipant(activeSession, match.participant2Id);
      const winner = getParticipant(activeSession, match.winnerId);
      const result = activeSession.isTeamCompetition ? winner ? `${escapeHTML(winner.name)} menang` : match.status === "bye" ? "Bye" : "Belum dimainkan" : `${match.score1 ?? "–"} — ${match.score2 ?? "–"}`;
      return `<tr><td>${escapeHTML(match.id)}</td><td>${escapeHTML(matchRoundName(match.round, activeSession.totalRounds))}</td><td>${escapeHTML(first?.name || "Bye")} vs ${escapeHTML(second?.name || "Bye")}</td><td>${result}</td><td>${escapeHTML(winner?.name || "Belum selesai")}</td></tr>`;
    }).join("");
    printWindow.document.write(`<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Playbook - ${escapeHTML(activeSession.name)}</title><style>body{font:14px Arial,sans-serif;color:#25352b;margin:32px}h1{font-size:26px}h2{font-size:18px;margin-top:28px;border-bottom:2px solid #d9e5d4;padding-bottom:8px}.meta{color:#637367}ul{columns:2;line-height:1.8}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #dce3d8;padding:9px;text-align:left}th{background:#edf2e9}.note{padding:12px;background:#f2f5ed;border-radius:8px;line-height:1.6}@media print{body{margin:16mm}}</style></head><body><h1>${escapeHTML(activeSession.name)}</h1><p class="meta">${escapeHTML(formatDate(activeSession.date))}${activeSession.location ? ` · ${escapeHTML(activeSession.location)}` : ""}</p><h2>${activeSession.isTeamCompetition ? "Daftar Tim" : "Daftar Peserta"} (${activeSession.participants.length})</h2><ul>${activeSession.participants.map(item => `<li>${escapeHTML(item.name)}</li>`).join("")}</ul><h2>Bagan dan Hasil Pertandingan</h2><table><thead><tr><th>ID</th><th>Babak</th><th>Pertandingan</th><th>${activeSession.isTeamCompetition ? "Hasil" : "Skor"}</th><th>Pemenang</th></tr></thead><tbody>${rows}</tbody></table><h2>Aturan Singkat</h2><p class="note">Pemenang maju ke babak berikutnya. Playbook ini dibuat dari data sesi saat tombol ditekan.</p><script>window.onload=()=>window.print()<\/script></body></html>`);
    printWindow.document.close();
  }

  return <div className="app-shell">
    <aside className="sidebar" aria-label="Navigasi utama">
      <a className="brand" href="/" onClick={event => { event.preventDefault(); navigate("home"); }} aria-label="Karambol Gamebell beranda"><span className="brand__icon" aria-hidden="true">●</span><span className="brand__text">Gamebell<span>Karambol Club</span></span></a>
      <nav className="nav">
        <a className={`nav__item ${activeNav === "competitions" ? "nav__item--active" : ""}`} href="/competitions" onClick={event => { event.preventDefault(); navigate("competitions"); }}>▦ Sesi Kompetisi</a>
        <a className={`nav__item ${activeNav === "participants" ? "nav__item--active" : ""}`} href={activeSession ? `/participants/${encodeURIComponent(activeSession.id)}` : "/participants"} onClick={event => { event.preventDefault(); navigate("participants", activeSession ? { sessionId: activeSession.id } : {}); }}>♟ Peserta</a>
        <a className={`nav__item ${activeNav === "bracket" ? "nav__item--active" : ""}`} href={activeSession ? `/bracket/${encodeURIComponent(activeSession.id)}` : "/bracket"} onClick={event => { event.preventDefault(); navigate("bracket", activeSession ? { sessionId: activeSession.id } : {}); }}>⌘ Bagan Pertandingan</a>
      </nav>
      <div className="sidebar__bottom"><div className="connection"><span className="connection__dot"/><span>Data kompetisi</span></div><p>Gamebell · 2026</p></div>
    </aside>
    <main className="main">
      <header className="topbar"><div><p className="eyebrow">KARAMBOL CLUB / 2026</p><h1>{pageTitle}</h1></div><button className="button button--primary" onClick={() => setCreateOpen(true)}>＋ Buat Sesi</button></header>
      <section className={`view ${!activeSession ? "view--active" : ""}`} aria-labelledby="sessions-heading">
        <SessionList sessions={sessions} loading={loading} onOpen={id => navigate("competition-detail", { sessionId: id })} onCreate={() => setCreateOpen(true)}/>
        {loadError && <button className="button button--outline" onClick={() => setReloadCount(value => value + 1)}>Coba muat ulang</button>}
      </section>
      <section className={`view ${activeSession ? "view--active" : ""}`} aria-label="Detail kompetisi">
        {detailLoading ? <div className="empty-state"><h3>Memuat data kompetisi…</h3></div> : activeSession && <CompetitionDetail competition={activeSession} activeTab={activeTab} onNavigate={navigate} onAddParticipant={() => setParticipantOpen(true)} onEditScore={setScoreMatchId} onChooseWinner={setWinnerMatchId} onExport={exportPlaybook}/>}
      </section>
    </main>
    <CreateCompetitionDialog open={createOpen} onOpenChange={setCreateOpen} onSubmit={createCompetition} saving={saving === "create"}/>
    <ScoreDialog open={Boolean(scoreMatchId)} onOpenChange={open => { if (!open) setScoreMatchId(null); }} competition={activeSession} match={scoreMatch} onSubmit={saveScore} saving={saving === "score"}/>
    <TeamWinnerDialog open={Boolean(winnerMatchId)} onOpenChange={open => { if (!open) setWinnerMatchId(null); }} competition={activeSession} match={winnerMatch} onSubmit={saveWinner} saving={saving === "winner"}/>
    <ParticipantDialog open={participantOpen} onOpenChange={setParticipantOpen} onSubmit={addParticipant} saving={saving === "participant"}/>
    <div className={`toast ${toastVisible ? "toast--visible" : ""}`} role="status" aria-live="polite">{toast}</div>
  </div>;
}
