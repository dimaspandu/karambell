import { getCompetitionProgress } from "../../domain/competitionProgress.js";
import { getParticipant } from "../../domain/competitionModel.js";
import { formatDate } from "../../shared/presentation/competitionFormatters.js";

export function SessionList({ sessions, loading, error = false, onOpen, onCreate }) {
  return <>
    <section className="welcome-panel">
      <div className="welcome-panel__copy">
        <span className="tag tag--gold">SEASON 2026</span>
        <h2>Siap mulai pertandingan?</h2>
        <p>Buat sesi, susun bagan, lalu catat skor sampai juara ditemukan.</p>
        <button className="button button--cream" onClick={onCreate}>＋ Buat sesi kompetisi</button>
      </div>
      <div className="coin-art" aria-hidden="true"><span className="coin coin--black"/><span className="coin coin--cream"/><span className="coin coin--red"/><span className="striker"/></div>
      <div className="welcome-panel__pattern" aria-hidden="true">✳</div>
    </section>
    <div className="section-heading">
      <div><h2 id="sessions-heading">Kompetisi kamu</h2><p>Pilih sesi untuk melihat dan memperbarui progres.</p></div>
      <span className="count-pill">{sessions.length} sesi</span>
    </div>
    {!sessions.length ? <div className="empty-state">
      <h3>{loading ? "Menghubungkan ke layanan data…" : error ? "Gagal memuat sesi kompetisi" : "Belum ada sesi kompetisi"}</h3>
      <p>{loading ? "Mengambil data sesi yang tersimpan." : error ? "Data sesi tidak tersedia saat ini. Coba muat ulang." : "Buat sesi pertamamu untuk mulai menyusun bagan."}</p>
      {!loading && !error && <button className="button button--primary" onClick={onCreate}>＋ Buat Sesi</button>}
    </div> : <div className="session-grid">{sessions.map(session => {
      const progress = getCompetitionProgress(session.matches);
      const champion = progress.championId ? getParticipant(session, progress.championId)?.name : null;
      const count = session.isTeamCompetition ? `${session.participants.length} tim` : `${session.participants.length} peserta`;
      return <button className="session-card" key={session.id} onClick={() => onOpen(session.id)}>
        <div className="session-card__top"><span className="session-card__emblem">✦</span><span className="session-card__arrow">↗</span></div>
        <h3>{session.name}</h3>
        <p className="session-card__meta">{formatDate(session.date)}{session.location ? ` · ${session.location}` : ""}</p>
        <div className="session-card__bottom"><span>{count}</span><span>{progress.isComplete ? "Selesai" : "Berlangsung"}</span></div>
        <div className="progress" aria-label={`Progres ${progress.progress}%`}><span style={{ width: `${progress.progress}%` }}/></div>
        <div className="session-card__bottom"><span>{progress.completedMatches} dari {progress.totalMatches} pertandingan selesai</span><span>{champion ? `Juara: ${champion}` : `${progress.progress}%`}</span></div>
      </button>;
    })}</div>}
  </>;
}
