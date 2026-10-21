import { getCompetitionProgress } from "../domain/competitionProgress.js";
import { formatDate, getParticipant, initials, matchRoundName } from "../domain/competitionModel.js";
import { Bracket } from "./Bracket.jsx";

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

function MatchTable({ competition, onEditScore, onChooseWinner }) {
  return <div className="table-wrap"><table><thead><tr><th>Pertandingan</th><th>Babak</th><th>{competition.isTeamCompetition ? "Tim" : "Pemain"}</th><th>{competition.isTeamCompetition ? "Hasil" : "Skor"}</th><th>Status</th><th/></tr></thead><tbody>
    {competition.matches.map(match => {
      const first = getParticipant(competition, match.participant1Id);
      const second = getParticipant(competition, match.participant2Id);
      const winnerIsFirst = match.winnerId && match.winnerId === match.participant1Id;
      const result = competition.isTeamCompetition
        ? match.status === "bye" ? "Bye" : winnerIsFirst ? "Menang — Kalah" : match.winnerId ? "Kalah — Menang" : "Belum dimainkan"
        : match.score1 === null ? "–" : `${match.score1} — ${match.score2}`;
      const status = match.status === "completed" ? "Selesai" : match.status === "bye" ? "Bye" : first && second ? "Belum dimainkan" : "Menunggu";
      return <tr key={match.id}><td><strong>{match.id}</strong></td><td>{matchRoundName(match.round, competition.totalRounds)}</td>
        <td>{first?.name || "—"} vs {second?.name || "—"}</td><td>{result}</td>
        <td><span className={`status-pill ${match.status === "completed" ? "status-pill--done" : ""}`}>{status}</span></td>
        <td>{first && second && (competition.isTeamCompetition
          ? <button className="table-action" onClick={() => onChooseWinner(match.id)}>{match.winnerId ? "Ubah pemenang" : "Tentukan pemenang"}</button>
          : <button className="table-action" onClick={() => onEditScore(match.id)}>{match.status === "completed" ? "Ubah skor" : "Input skor"}</button>)}</td>
      </tr>;
    })}
  </tbody></table></div>;
}

export function CompetitionDetail({ competition, activeTab, onNavigate, onAddParticipant, onEditScore, onChooseWinner, onExport }) {
  const summary = getCompetitionProgress(competition.matches);
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
          <div className="inline-tags"><span className="tag tag--green">{summary.isComplete ? "Selesai" : "Berlangsung"}</span><span className="tag tag--muted">{competition.isTeamCompetition ? "Tim · Single elimination" : "Single elimination"}</span></div>
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
      <div className="bracket-toolbar"><div><h3>Bagan pertandingan</h3><p>{competition.isTeamCompetition ? "Pilih Menang pada tim pemenang; tim lainnya otomatis tercatat Kalah." : "Tekan kartu pertandingan untuk memasukkan atau memperbarui skor."}</p></div><span className="hint"><span className="hint__dot"/> Pemenang ditandai hijau</span></div>
      <div className="bracket-scroll"><Bracket competition={competition} onEditScore={onEditScore} onChooseWinner={onChooseWinner}/></div>
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
      <div className="panel-heading"><div><h3>Daftar pertandingan</h3><p>{competition.isTeamCompetition ? "Pilih tim yang menang. Hasil disimpan dan pemenang maju otomatis." : "Perbarui skor atau periksa status setiap pertandingan."}</p></div></div>
      <MatchTable competition={competition} onEditScore={onEditScore} onChooseWinner={onChooseWinner}/>
    </section>
  </>;
}
