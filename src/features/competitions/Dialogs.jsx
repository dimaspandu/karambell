import { useEffect, useRef, useState } from "react";
import { elapsedMilliseconds, formatElapsedTime, remainingMilliseconds } from "../matches/matchTimer.js";
import { getParticipant } from "../../domain/competitionModel.js";
import { createRandomTeamPairing, parseParticipantNames } from "../../domain/teamPairing.js";
import { TOURNAMENT_FORMAT_OPTIONS, TOURNAMENT_FORMATS } from "../../domain/tournamentFormats.js";
import { initials, matchRoundName } from "../../shared/presentation/competitionFormatters.js";
import { clearTeamPairingDraft, readTeamPairingDraft, saveTeamPairingDraft } from "../../shared/persistence/appStorage.js";


function Modal({ open, onOpenChange, className = "", children, id }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);
  return <dialog id={id} ref={ref} className={`modal ${className}`} onClose={() => onOpenChange(false)}>{children}</dialog>;
}

function MatchTimer({ open, matchId }) {
  const [timer, setTimer] = useState({ elapsedMs: 0, startedAt: null });
  const [durationMinutes, setDurationMinutes] = useState(10);
  const [, refreshTimer] = useState(0);
  useEffect(() => {
    if (!open || timer.startedAt === null) return undefined;
    const interval = window.setInterval(() => {
      const now = Date.now();
      if (remainingMilliseconds(timer, durationMinutes, now) === 0) {
        setTimer({ elapsedMs: durationMinutes * 60_000, startedAt: null });
      } else refreshTimer(now);
    }, 250);
    return () => window.clearInterval(interval);
  }, [open, timer.startedAt, timer.elapsedMs, durationMinutes]);
  useEffect(() => { setTimer({ elapsedMs: 0, startedAt: null }); }, [open, matchId]);
  const remaining = remainingMilliseconds(timer, durationMinutes);
  const elapsed = elapsedMilliseconds(timer);
  const toggleTimer = () => setTimer(current => current.startedAt === null
    ? { elapsedMs: current.elapsedMs, startedAt: Date.now() }
    : { elapsedMs: elapsedMilliseconds(current), startedAt: null });
  return <section className="match-timer" aria-label="Timer pertandingan"><div><label className="match-timer__duration">Durasi<select aria-label="Durasi timer" value={durationMinutes} disabled={timer.startedAt !== null} onChange={event => setDurationMinutes(Number(event.target.value))}>{[5, 10, 15, 20, 30].map(minutes => <option value={minutes} key={minutes}>{minutes} menit</option>)}</select></label><strong role="timer" aria-live="off">{formatElapsedTime(remaining)}</strong><small>{remaining === 0 ? "Waktu habis." : "Hanya tersimpan di sesi browser ini."}</small></div><div><button type="button" className="button button--outline button--small" onClick={toggleTimer} disabled={remaining === 0}>{timer.startedAt === null ? timer.elapsedMs ? "Lanjutkan" : "Mulai" : "Jeda"}</button><button type="button" className="button button--outline button--small" onClick={() => setTimer({ elapsedMs: 0, startedAt: null })} disabled={!elapsed}>Reset</button></div></section>;
}

export function CreateCompetitionDialog({ open, onOpenChange, onSubmit, saving, error, onErrorClear }) {
  const [name, setName] = useState("");
  const [date, setDate] = useState("2026-10-19");
  const [location, setLocation] = useState("");
  const [format, setFormat] = useState(TOURNAMENT_FORMATS.SINGLE_ELIMINATION);
  const [groupCount, setGroupCount] = useState(2);
  const [participantsInput, setParticipantsInput] = useState("Rahman, Prastio, Athaya, Dimas, Dedi, Azhar, Rizky, Bastian, Bagas, Faisal, Raihan, Pandu");
  const [teams, setTeams] = useState(null);

  useEffect(() => {
    try {
      const draft = readTeamPairingDraft();
      if (!draft || !Array.isArray(draft.participants) || !Array.isArray(draft.teams)) return;
      const members = draft.teams.flatMap(team => Array.isArray(team.members) ? team.members : []);
      const expected = draft.participants.map(value => String(value).toLocaleLowerCase("id-ID")).sort();
      const actual = members.map(value => String(value).toLocaleLowerCase("id-ID")).sort();
      if (draft.teams.some(team => !Array.isArray(team.members) || team.members.length !== 2) || expected.length < 4 || expected.length % 2 || new Set(expected).size !== expected.length || expected.join("\0") !== actual.join("\0")) return;
      setParticipantsInput(draft.participants.join(", "));
      setTeams(draft.teams.map(team => ({ members: team.members.map(String) })));
    } catch { /* The draft is optional. */ }
  }, []);

  const { names, duplicates } = parseParticipantNames(participantsInput);
  const validCount = names.length >= 4 && names.length % 2 === 0;
  const teamCount = names.length / 2;
  const availableGroupCounts = [2, 4, 8].filter(count => count * 2 <= teamCount);
  const selectedGroupCount = availableGroupCounts.includes(Number(groupCount)) ? Number(groupCount) : availableGroupCounts[0] || "";
  const doubleEliminationValid = teamCount >= 4 && (teamCount & (teamCount - 1)) === 0;
  const formatValid = format === TOURNAMENT_FORMATS.DOUBLE_ELIMINATION
    ? doubleEliminationValid
    : format !== TOURNAMENT_FORMATS.GROUP_KNOCKOUT || Boolean(selectedGroupCount);
  const previewNames = teams?.flatMap(team => team.members).map(value => value.toLocaleLowerCase("id-ID")).sort() || [];
  const inputNames = names.map(value => value.toLocaleLowerCase("id-ID")).sort();
  const previewMatches = teams && previewNames.length === names.length && previewNames.join("\0") === inputNames.join("\0");
  const updateParticipants = value => {
    setParticipantsInput(value);
    setTeams(null);
    onErrorClear?.();
    clearTeamPairingDraft();
  };
  const generateTeams = () => {
    if (!validCount || duplicates.length) return;
    onErrorClear?.();
    const next = createRandomTeamPairing(names);
    setTeams(next);
    saveTeamPairingDraft({ participants: names, teams: next });
  };
  const submit = async event => {
    event.preventDefault();
    if (!previewMatches || duplicates.length || !formatValid) return;
    const form = new FormData(event.currentTarget);
    const success = await onSubmit({ name: String(form.get("name") || "").trim(), event_date: String(form.get("date") || ""), location: String(form.get("location") || "").trim(), format, group_count: Number(form.get("group_count") || selectedGroupCount || 2), isTeamCompetition: true, participants: teams.map(team => team.members.join(" & ")) });
    if (success) {
      setTeams(null);
      clearTeamPairingDraft();
    }
  };

  let pairingMessage = `${names.length} pemain · ${names.length / 2} tim${teams ? " · pasangan siap disimpan" : " · acak pasangan untuk melanjutkan"}`;
  if (duplicates.length) pairingMessage = `Nama duplikat: ${[...new Set(duplicates)].join(", ")}. Hapus duplikat sebelum mengacak tim.`;
  else if (names.length % 2) pairingMessage = `${names.length} pemain — jumlah ganjil. Tambah atau hapus satu pemain sebelum mengacak tim.`;
  else if (names.length < 4) pairingMessage = `${names.length} pemain — minimal 4 pemain diperlukan untuk membuat dua tim.`;

  return <Modal id="create-session-modal" open={open} onOpenChange={onOpenChange}>
    <form className="modal__form" onSubmit={submit}>
      <div className="modal__heading"><div><span className="eyebrow">SESI BARU</span><h2>Buat kompetisi</h2></div><button type="button" className="icon-button" onClick={() => onOpenChange(false)} aria-label="Tutup">×</button></div>
      <label>Nama kompetisi<input name="name" required maxLength="80" value={name} onChange={event => { setName(event.target.value); onErrorClear?.(); }} placeholder="Contoh: Karambol Gamebell 2026"/></label>
      <div className="form-row"><label>Tanggal<input name="date" type="date" value={date} onChange={event => { setDate(event.target.value); onErrorClear?.(); }} required/></label><label>Format<select name="format" value={format} onChange={event => { setFormat(event.target.value); onErrorClear?.(); }}>{TOURNAMENT_FORMAT_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label></div>
      {format === TOURNAMENT_FORMATS.GROUP_KNOCKOUT && <label>Jumlah grup<select name="group_count" value={selectedGroupCount} onChange={event => { setGroupCount(Number(event.target.value)); onErrorClear?.(); }}>{availableGroupCounts.map(count => <option key={count} value={count}>{count} grup · 2 tim teratas lolos</option>)}</select></label>}
      <label>Lokasi <span className="optional">(opsional)</span><input name="location" maxLength="80" value={location} onChange={event => { setLocation(event.target.value); onErrorClear?.(); }} placeholder="Contoh: Gamebell Community"/></label>
      <label>Pemain <span className="optional">(pisahkan dengan koma atau baris baru; setiap pemain hanya sekali)</span><textarea name="participants" rows="5" value={participantsInput} onChange={event => updateParticipants(event.target.value)} required/></label>
      <div className="team-pairing"><div className="team-pairing__header"><p className="form-note" aria-live="polite">{pairingMessage}</p><button type="button" className="button button--outline button--small" disabled={!validCount || duplicates.length > 0} onClick={generateTeams}>Acak Pasangan</button></div>
        <div className="team-pairing__preview" aria-live="polite">{teams?.map((team, index) => <div className="team-preview__item" key={index}><span>Tim {String(index + 1).padStart(2, "0")}</span><strong>{team.members[0]} &amp; {team.members[1]}</strong></div>)}</div>
      </div>
      <p className="form-note">Jumlah pemain harus genap dan minimal 4. Tim diacak sekali sebelum sesi dibuat. {format === TOURNAMENT_FORMATS.DOUBLE_ELIMINATION ? "Double elimination membutuhkan jumlah tim 4, 8, 16, 32, atau 64." : format === TOURNAMENT_FORMATS.ROUND_ROBIN ? "Round robin memakai satu pertemuan tiap pasangan tim; hasil seri tidak tersedia." : format === TOURNAMENT_FORMATS.GROUP_KNOCKOUT ? "Tim dibagi merata ke grup; dua teratas tiap grup masuk knockout." : "Single elimination memakai bye otomatis jika jumlah tim bukan pangkat dua."}</p>
      {!formatValid && format === TOURNAMENT_FORMATS.DOUBLE_ELIMINATION && <p className="form-note form-note--error">Double elimination membutuhkan 4, 8, 16, 32, atau 64 tim.</p>}
      {!formatValid && format === TOURNAMENT_FORMATS.GROUP_KNOCKOUT && <p className="form-note form-note--error">Group + knockout membutuhkan minimal 4 tim. Tambahkan tim atau pilih format lain.</p>}
      {error && <p className="form-note form-note--error" role="alert">{error}</p>}
      <div className="modal__actions"><button type="button" className="button button--outline" onClick={() => onOpenChange(false)}>Batal</button><button type="submit" className="button button--primary" disabled={!previewMatches || duplicates.length > 0 || !formatValid || saving}>{saving ? "Menyimpan…" : "Buat Sesi"}</button></div>
    </form>
  </Modal>;
}

export function ScoreDialog({ open, onOpenChange, competition, match, onSubmit, saving }) {
  const first = match && getParticipant(competition, match.participant1Id);
  const second = match && getParticipant(competition, match.participant2Id);
  return <Modal id="score-modal" className="modal--compact" open={open} onOpenChange={onOpenChange}>
    {match && first && second && <form key={match.id} className="modal__form" onSubmit={event => { event.preventDefault(); const values = new FormData(event.currentTarget); onSubmit({ session_id: competition.id, match_id: match.id, score1: Number(values.get("score1")), score2: Number(values.get("score2")) }); }}>
      <div className="modal__heading"><div><span className="eyebrow">PERTANDINGAN {match.id}</span><h2>Update skor</h2></div><button type="button" className="icon-button" onClick={() => onOpenChange(false)} aria-label="Tutup">×</button></div>
      <p className="score-intro">{matchRoundName(match.round, competition.totalRounds, match.stage, competition.format)} · Masukkan skor akhir pemain.</p><input type="hidden" name="matchId" value={match.id} readOnly/>
      <MatchTimer open={open} matchId={match?.id}/>
      <div className="score-players">
        <label className="score-player"><span className="score-player__avatar">{initials(first.name)}</span><strong>{first.name}</strong><span>Skor</span><input type="number" name="score1" min="0" max="999" required defaultValue={match.score1 ?? 0}/></label>
        <span className="score-versus">VS</span>
        <label className="score-player"><span className="score-player__avatar">{initials(second.name)}</span><strong>{second.name}</strong><span>Skor</span><input type="number" name="score2" min="0" max="999" required defaultValue={match.score2 ?? 0}/></label>
      </div>
      <p className="form-note">Untuk menyelesaikan pertandingan, skor harus berbeda. Simpan akan memperbarui bagan.</p>
      <div className="modal__actions"><button type="button" className="button button--outline" onClick={() => onOpenChange(false)}>Batal</button><button type="submit" className="button button--primary" disabled={saving}>{saving ? "Menyimpan…" : "Simpan Skor"}</button></div>
    </form>}
  </Modal>;
}

export function TeamWinnerDialog({ open, onOpenChange, competition, match, onSubmit, saving }) {
  const [winnerId, setWinnerId] = useState("");
  const first = match && getParticipant(competition, match.participant1Id);
  const second = match && getParticipant(competition, match.participant2Id);
  useEffect(() => setWinnerId(match?.winnerId || ""), [match?.id, match?.winnerId]);
  return <Modal id="team-winner-modal" className="modal--compact" open={open} onOpenChange={onOpenChange}>
    {match && first && second && <form className="modal__form" onSubmit={event => {
      event.preventDefault();
      if (match.winnerId && winnerId !== match.winnerId) {
        const previousWinner = getParticipant(competition, match.winnerId)?.name || "tim sebelumnya";
        const nextWinner = getParticipant(competition, winnerId)?.name || "tim yang dipilih";
        if (!window.confirm(`Hasil sudah tercatat: ${previousWinner} menang. Ganti hasil menjadi ${nextWinner} menang? Hasil babak berikutnya yang bergantung pada pertandingan ini juga dapat berubah.`)) return;
      }
      onSubmit(match.id, winnerId);
    }}>
      <div className="modal__heading"><div><span className="eyebrow">{match.id} · {matchRoundName(match.round, competition.totalRounds, match.stage, competition.format)}</span><h2>Tentukan pemenang</h2></div><button type="button" className="icon-button" onClick={() => onOpenChange(false)} aria-label="Tutup">×</button></div>
      <p className="score-intro">Pilih tim yang menang pada pertandingan ini.</p>
      <MatchTimer open={open} matchId={match?.id}/>
      <div className="team-winner-options">{[first, second].map(team => <label className={`team-winner-option ${winnerId === team.id ? "team-winner-option--selected" : ""}`} key={team.id}>
        <input type="radio" name="winnerId" value={team.id} checked={winnerId === team.id} onChange={() => setWinnerId(team.id)} required/>
        <span><strong>{team.name}</strong><small>{winnerId === team.id ? "Pemenang saat ini" : "Pilih sebagai pemenang"}</small></span>
      </label>)}</div>
      <div className="modal__actions"><button type="button" className="button button--outline" onClick={() => onOpenChange(false)}>Batal</button><button type="submit" className="button button--primary" disabled={!winnerId || saving}>{saving ? "Menyimpan…" : "Simpan pemenang"}</button></div>
    </form>}
  </Modal>;
}

export function ParticipantDialog({ open, onOpenChange, onSubmit, saving, error, onErrorClear }) {
  const [name, setName] = useState("");
  return <Modal id="participant-modal" className="modal--compact" open={open} onOpenChange={onOpenChange}>
    <form className="modal__form" onSubmit={async event => { event.preventDefault(); const success = await onSubmit(name.trim()); if (success) setName(""); }}>
      <div className="modal__heading"><div><span className="eyebrow">PESERTA</span><h2>Tambah peserta</h2></div><button type="button" className="icon-button" onClick={() => onOpenChange(false)} aria-label="Tutup">×</button></div>
      <label>Nama peserta<input value={name} onChange={event => { setName(event.target.value); onErrorClear?.(); }} required maxLength="60" placeholder="Nama peserta"/></label>
      <p className="form-note">Peserta hanya bisa ditambahkan sebelum pertandingan dimulai.</p>
      {error && <p className="form-note form-note--error" role="alert">{error}</p>}
      <div className="modal__actions"><button type="button" className="button button--outline" onClick={() => onOpenChange(false)}>Batal</button><button type="submit" className="button button--primary" disabled={saving}>{saving ? "Menyimpan…" : "Tambah"}</button></div>
    </form>
  </Modal>;
}
