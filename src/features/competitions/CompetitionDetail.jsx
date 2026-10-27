import { useEffect, useRef, useState } from "react";
import { getCompetitionProgress } from "../../domain/competitionProgress.js";
import { getParticipant } from "../../domain/competitionModel.js";
import { tournamentFormatLabel } from "../../domain/tournamentFormats.js";
import { TOURNAMENT_FORMATS } from "../../domain/tournamentFormats.js";
import { getTournamentStandings } from "../../domain/tournamentStandings.js";
import { formatDate, initials, matchRoundName } from "../../shared/presentation/competitionFormatters.js";
import { Bracket } from "./Bracket.jsx";
import { generateTeamShuffleCandidates } from "../../domain/teamShuffle.js";
import { TeamPlayerShuffleDialog } from "./Dialogs.jsx";
import { whatsappCompetitionUrl } from "./whatsAppCompetitionMessage.js";

function competitorInitials(competition, participant) {
  return competition.isTeamCompetition ? participant.name.split(" & ").map(initials).join("&") : initials(participant.name);
}

function Participants({ competition }) {
  return <div className="participant-list">{competition.participants.map((participant, index) => <div className="participant-row" key={participant.id}>
    <span className="participant-row__number">{String(index + 1).padStart(2, "0")}</span>
    <span className="participant-row__avatar">{competitorInitials(competition, participant)}</span>
    <span className="participant-row__name">{participant.name}</span>
    <span className="participant-row__status">{competition.isTeamCompetition ? `Tim ${String(index + 1).padStart(2, "0")}` : "Terdaftar"}</span>
  </div>)}</div>;
}

function StandingsTable({ competition, group = null }) {
  const standings = getTournamentStandings({
    matches: competition.matches,
    participants: competition.participants,
    groups: competition.groups,
    groupId: group?.id,
    stage: competition.format === TOURNAMENT_FORMATS.ROUND_ROBIN ? "main" : "group"
  });
  return <div className="table-wrap standings-table"><table><thead><tr><th>#</th><th>{competition.isTeamCompetition ? "Tim" : "Peserta"}</th><th>Main</th><th>Menang</th><th>Kalah</th><th>Poin</th></tr></thead><tbody>
    {standings.map((row, index) => <tr key={row.id}><td>{index + 1}</td><td>{row.name}</td><td>{row.played}</td><td>{row.wins}</td><td>{row.losses}</td><td><strong>{row.points}</strong></td></tr>)}
  </tbody></table></div>;
}

function WhatsAppStandingsAction({ competition }) {
  const url = whatsappCompetitionUrl(competition);
  if (!url) return null;
  return <div className="standings-share"><a className="button button--outline button--small" href={url} target="_blank" rel="noopener noreferrer">Bagikan klasemen &amp; jadwal ke WhatsApp</a><span>Pesan berisi klasemen dan hingga 20 pertandingan pending berikutnya.</span></div>;
}

function StandingsPanel({ competition }) {
  if (competition.format === TOURNAMENT_FORMATS.ROUND_ROBIN) return <section className="standings-panel"><h3>Klasemen</h3><p>Urutan berdasarkan poin kemenangan, head-to-head untuk dua tim yang imbang, lalu seed.</p><StandingsTable competition={competition}/><WhatsAppStandingsAction competition={competition}/></section>;
  if (competition.format === TOURNAMENT_FORMATS.GROUP_KNOCKOUT) return <section className="standings-panel"><h3>Klasemen grup</h3><p>Dua tim teratas setiap grup lolos ke knockout. Peringkat seri memakai head-to-head lalu seed.</p><div className="standings-grid">{competition.groups.map(group => <div key={group.id}><h4>{group.name}</h4><StandingsTable competition={competition} group={group}/></div>)}</div><WhatsAppStandingsAction competition={competition}/></section>;
  return null;
}

function MatchTable({ competition, isTournamentCompleted, onEditScore, onChooseWinner }) {
  return <div className="table-wrap"><table><thead><tr><th>Pertandingan</th><th>Babak</th><th>{competition.isTeamCompetition ? "Tim" : "Pemain"}</th><th>{competition.isTeamCompetition ? "Hasil" : "Skor"}</th><th>Status</th><th/></tr></thead><tbody>
    {competition.matches.map(match => {
      const first = getParticipant(competition, match.participant1Id);
      const second = getParticipant(competition, match.participant2Id);
      const winnerIsFirst = match.winnerId && match.winnerId === match.participant1Id;
      const result = competition.isTeamCompetition
        ? match.status === "bye" ? "Bye" : winnerIsFirst ? "Menang — Kalah" : match.winnerId ? "Kalah — Menang" : "Belum dimainkan"
        : match.score1 === null ? "–" : `${match.score1} — ${match.score2}`;
      const status = match.status === "completed" ? "Selesai" : match.status === "bye" ? "Bye" : first && second ? "Belum dimainkan" : "Menunggu";
      return <tr key={match.id}><td><strong>{match.id}</strong></td><td>{matchRoundName(match.round, competition.totalRounds, match.stage, competition.format)}</td>
        <td>{first?.name || "—"} vs {second?.name || "—"}</td><td>{result}</td>
        <td><span className={`status-pill ${match.status === "completed" ? "status-pill--done" : ""}`}>{status}</span></td>
        <td>{first && second && (competition.isTeamCompetition
          ? !isTournamentCompleted && <button className="table-action" onClick={() => onChooseWinner(match.id)}>{match.winnerId ? "Ubah pemenang" : "Tentukan pemenang"}</button>
          : <button className="table-action" onClick={() => onEditScore(match.id)}>{match.status === "completed" ? "Ubah skor" : "Input skor"}</button>)}</td>
      </tr>;
    })}
  </tbody></table></div>;
}

export function CompetitionDetail({ competition, activeTab, presentation: routePresentation, onPresentationChange, onNavigate, onAddParticipant, onEditScore, onChooseWinner, onExport, onShufflePlayers }) {
  const [presentation, setPresentation] = useState(routePresentation || null);
  const [shareStatus, setShareStatus] = useState("");
  const [teamShuffle, setTeamShuffle] = useState(null);
  const [teamShuffleIndex, setTeamShuffleIndex] = useState(0);
  const [teamShuffleError, setTeamShuffleError] = useState("");
  const [teamShuffleSaving, setTeamShuffleSaving] = useState(false);
  const presentationRef = useRef(null);
  const scrollPosition = useRef(0);
  useEffect(() => {
    setPresentation(routePresentation || null);
  }, [routePresentation]);
  useEffect(() => {
    if (!presentation) return undefined;
    scrollPosition.current = window.scrollY;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = event => { if (event.key === "Escape") setPresentation(null); };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
      window.scrollTo(0, scrollPosition.current);
    };
  }, [presentation]);
  function openPresentation(view) {
    setShareStatus("");
    setPresentation(view);
    onPresentationChange?.(view);
  }
  function closePresentation() {
    setPresentation(null);
    onPresentationChange?.(null);
  }
  async function shareBracket() {
    const url = new URL(window.location.href);
    url.searchParams.set("presentation", "bracket");
    try {
      await navigator.clipboard.writeText(url.href);
      setShareStatus("Tautan bagan disalin.");
    } catch {
      setShareStatus("Gagal menyalin. Salin tautan dari bilah alamat.");
    }
  }
  function enterBrowserFullscreen() {
    const request = presentationRef.current?.requestFullscreen;
    if (request) request.call(presentationRef.current).catch(() => setShareStatus("Mode layar penuh browser tidak tersedia; tampilan tetap terbuka."));
    else setShareStatus("Mode layar penuh browser tidak tersedia; tampilan tetap terbuka.");
  }
  function beginPlayerShuffle() {
    setTeamShuffle(generateTeamShuffleCandidates(competition));
    setTeamShuffleIndex(0);
    setTeamShuffleError("");
  }
  function shufflePlayersAgain() {
    if (!teamShuffle?.candidates?.length) return;
    setTeamShuffleIndex(index => (index + 1) % teamShuffle.candidates.length);
    setTeamShuffleError("");
  }
  async function savePlayerShuffle() {
    const candidate = teamShuffle?.candidates?.[teamShuffleIndex];
    if (!candidate || teamShuffleSaving) return;
    setTeamShuffleSaving(true);
    try { await onShufflePlayers(candidate.assignments); setTeamShuffle(null); }
    catch (error) { setTeamShuffleError(error.message || "Gagal menyimpan susunan pemain."); }
    finally { setTeamShuffleSaving(false); }
  }
  const summary = getCompetitionProgress(competition.matches, competition);
  const champion = summary.championId ? getParticipant(competition, summary.championId) : null;
  const tabs = [
    { id: "bracket", label: "Bagan" },
    { id: "participants", label: competition.isTeamCompetition ? "Tim" : "Peserta", count: competition.participants.length },
    { id: "matches", label: "Daftar Pertandingan" }
  ];
  return <>
    <div className="detail-heading">
      <button className="back-link" onClick={() => onNavigate("competitions", {}, { replace: true })}>← Semua sesi</button>
      <div className="detail-heading__main">
        <div className="session-emblem" aria-hidden="true">✦</div>
        <div className="detail-heading__copy">
          <div className="inline-tags"><span className="tag tag--green">{summary.isComplete ? "Selesai" : "Berlangsung"}</span><span className="tag tag--muted">{tournamentFormatLabel(competition.format)}</span></div>
          <h2>{competition.name}</h2>
          <p>{competition.isTeamCompetition ? `${competition.participants.length * 2} pemain · ${competition.participants.length} tim` : `${competition.participants.length} peserta`} · {formatDate(competition.date)}{competition.location ? ` · ${competition.location}` : ""}</p>
        </div>
        <button className="button button--outline" onClick={onExport}>↓ Download Playbook</button>
      </div>
    </div>
    <div className="stats-grid">
      <article className="stat-card"><span className="stat-card__icon">♟</span><div><span>{competition.isTeamCompetition ? "Tim" : "Peserta"}</span><strong>{competition.participants.length}</strong></div></article>
      <article className="stat-card"><span className="stat-card__icon">⌘</span><div><span>Pertandingan</span><strong>{summary.totalMatches}</strong></div></article>
      <article className="stat-card"><span className="stat-card__icon">✓</span><div><span>Selesai</span><strong>{summary.completedMatches} / {summary.totalMatches}</strong></div></article>
      <article className="stat-card"><span className="stat-card__icon">♛</span><div><span>Juara</span><strong>{champion?.name || "Belum ada"}</strong></div></article>
    </div>
    <div className="tabs" role="tablist" aria-label="Detail kompetisi">{tabs.map(tab => <button key={tab.id} className={`tab ${activeTab === tab.id ? "tab--active" : ""}`} role="tab" aria-selected={activeTab === tab.id} onClick={() => onNavigate(tab.id, { sessionId: competition.id })}>
      {tab.label}{tab.count != null && <> <span>{tab.count}</span></>}
    </button>)}</div>
    <section className={`tab-panel ${activeTab === "bracket" ? "tab-panel--active" : ""}`}>
      <div className="bracket-toolbar"><div><h3>{competition.format === TOURNAMENT_FORMATS.ROUND_ROBIN ? "Jadwal pertandingan" : competition.format === TOURNAMENT_FORMATS.GROUP_KNOCKOUT ? "Grup dan knockout" : competition.format === TOURNAMENT_FORMATS.DOUBLE_ELIMINATION ? "Winners, losers, dan final" : "Bagan pertandingan"}</h3><p>{competition.isTeamCompetition ? "Pilih tim yang menang. Hasil pertandingan mengalir ke slot berikutnya." : "Tekan kartu pertandingan untuk memasukkan atau memperbarui skor."}</p></div><div className="bracket-toolbar__actions"><span className="hint"><span className="hint__dot"/> Pemenang ditandai hijau</span>{competition.isTeamCompetition && <button type="button" className="button button--outline button--small" onClick={beginPlayerShuffle}>Acak Pemain</button>}<button type="button" className="button button--outline button--small" onClick={() => openPresentation("bracket")}>Tampilan layar penuh</button></div></div>
      <StandingsPanel competition={competition}/>
      <div className="bracket-scroll"><Bracket competition={competition} isTournamentCompleted={summary.isComplete} onEditScore={onEditScore} onChooseWinner={onChooseWinner}/></div>
      <div className="bracket-footer"><span>✦</span><div><strong>Perjalanan menuju juara</strong><p>Skor disimpan per pertandingan. Pemenang otomatis maju ke babak berikutnya.</p></div></div>
    </section>
    <section className={`tab-panel ${activeTab === "participants" ? "tab-panel--active" : ""}`}>
      <div className="panel-heading"><div><h3>{competition.isTeamCompetition ? "Daftar tim" : "Daftar peserta"}</h3><p>{competition.isTeamCompetition ? "Setiap tim terdiri dari dua pemain. Komposisi tersimpan bersama kompetisi." : "Peserta yang terdaftar dalam sesi ini."}</p></div>
        {!competition.isTeamCompetition && <button className="button button--primary button--small" onClick={onAddParticipant}>＋ Tambah Peserta</button>}
      </div>
      {competition.isTeamCompetition && <p className="form-note">Komposisi tim dikunci setelah bagan dibuat agar hasil pertandingan tetap valid.</p>}
      <Participants competition={competition}/>
    </section>
    <section className={`tab-panel ${activeTab === "matches" ? "tab-panel--active" : ""}`}>
      <div className="panel-heading"><div><h3>Daftar pertandingan</h3><p>{competition.isTeamCompetition ? "Pilih tim yang menang. Hasil disimpan dan pemenang maju otomatis." : "Perbarui skor atau periksa status setiap pertandingan."}</p></div><button type="button" className="button button--outline button--small" onClick={() => openPresentation("table")}>Tabel layar penuh</button></div>
      <MatchTable competition={competition} isTournamentCompleted={summary.isComplete} onEditScore={onEditScore} onChooseWinner={onChooseWinner}/>
    </section>
    {presentation && <div className="tournament-presentation" ref={presentationRef} role="dialog" aria-modal="true" aria-label={presentation === "bracket" ? "Bagan kompetisi layar penuh" : "Tabel pertandingan layar penuh"}><header className="tournament-presentation__header"><div><span className="eyebrow">{competition.name}</span><h2>{presentation === "bracket" ? "Bagan dan klasemen" : "Daftar pertandingan"}</h2></div><div className="tournament-presentation__actions">{presentation === "bracket" && <><button type="button" className="button button--outline" onClick={shareBracket}>Salin tautan bagan</button><button type="button" className="button button--outline" onClick={enterBrowserFullscreen}>Mode layar penuh browser</button></>}<button type="button" className="button button--outline" onClick={closePresentation}>Tutup layar penuh <span aria-hidden="true">×</span></button></div></header>{shareStatus && <p className="tournament-presentation__status" role="status">{shareStatus}</p>}<main className="tournament-presentation__content">{presentation === "bracket" ? <><StandingsPanel competition={competition}/><div className="bracket-scroll"><Bracket competition={competition} isTournamentCompleted={summary.isComplete} onEditScore={onEditScore} onChooseWinner={onChooseWinner}/></div></> : <><StandingsPanel competition={competition}/><MatchTable competition={competition} isTournamentCompleted={summary.isComplete} onEditScore={onEditScore} onChooseWinner={onChooseWinner}/></>}</main></div>}
    <TeamPlayerShuffleDialog open={Boolean(teamShuffle)} onOpenChange={open => { if (!open && !teamShuffleSaving) setTeamShuffle(null); }} teams={competition.participants.filter(participant => participant.sourceType === "team").map(participant => ({ teamId: participant.sourceId, name: participant.name }))} candidate={teamShuffle?.candidates?.[teamShuffleIndex] || null} error={teamShuffle?.reason || teamShuffleError} saving={teamShuffleSaving} onShuffleAgain={shufflePlayersAgain} onSubmit={savePlayerShuffle}/>
  </>;
}
