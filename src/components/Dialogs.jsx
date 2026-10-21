import { useEffect, useRef, useState } from "react";
import { getParticipant, initials, matchRoundName } from "../domain/competitionModel.js";

const PAIRING_DRAFT_KEY = "karambell:team-pairing-draft";

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

function parseNames(value) {
  const names = String(value || "").split(/[\n,;]+/).map(name => name.trim()).filter(Boolean);
  const seen = new Set();
  const duplicates = [];
  names.forEach(name => {
    const key = name.toLocaleLowerCase("id-ID");
    if (seen.has(key)) duplicates.push(name);
    else seen.add(key);
  });
  return { names, duplicates };
}

export function CreateCompetitionDialog({ open, onOpenChange, onSubmit, saving }) {
  const [name, setName] = useState("");
  const [date, setDate] = useState("2026-10-19");
  const [location, setLocation] = useState("");
  const [participantsInput, setParticipantsInput] = useState("Rahman, Prastio, Athaya, Dimas, Dedi, Azhar, Rizky, Bastian, Bagas, Faisal, Raihan, Pandu");
  const [teams, setTeams] = useState(null);

  useEffect(() => {
    try {
      const draft = JSON.parse(window.localStorage.getItem(PAIRING_DRAFT_KEY) || "null");
      if (!draft || !Array.isArray(draft.participants) || !Array.isArray(draft.teams)) return;
      const members = draft.teams.flatMap(team => Array.isArray(team.members) ? team.members : []);
      const expected = draft.participants.map(value => String(value).toLocaleLowerCase("id-ID")).sort();
      const actual = members.map(value => String(value).toLocaleLowerCase("id-ID")).sort();
      if (draft.teams.some(team => !Array.isArray(team.members) || team.members.length !== 2) || expected.length < 4 || expected.length % 2 || new Set(expected).size !== expected.length || expected.join("\0") !== actual.join("\0")) return;
      setParticipantsInput(draft.participants.join(", "));
      setTeams(draft.teams.map(team => ({ members: team.members.map(String) })));
    } catch { /* The draft is optional. */ }
  }, []);

  const { names, duplicates } = parseNames(participantsInput);
  const validCount = names.length >= 4 && names.length % 2 === 0;
  const previewNames = teams?.flatMap(team => team.members).map(value => value.toLocaleLowerCase("id-ID")).sort() || [];
  const inputNames = names.map(value => value.toLocaleLowerCase("id-ID")).sort();
  const previewMatches = teams && previewNames.length === names.length && previewNames.join("\0") === inputNames.join("\0");
  const updateParticipants = value => {
    setParticipantsInput(value);
    setTeams(null);
    try { window.localStorage.removeItem(PAIRING_DRAFT_KEY); } catch { /* Ignore unavailable storage. */ }
  };
  const generateTeams = () => {
    if (!validCount || duplicates.length) return;
    const shuffled = [...names];
    for (let index = shuffled.length - 1; index > 0; index--) {
      const target = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
    }
    const next = Array.from({ length: shuffled.length / 2 }, (_, index) => ({ members: shuffled.slice(index * 2, index * 2 + 2) }));
    setTeams(next);
    try { window.localStorage.setItem(PAIRING_DRAFT_KEY, JSON.stringify({ participants: names, teams: next })); } catch { /* Pairing still works for this session. */ }
  };
  const submit = async event => {
    event.preventDefault();
    if (!previewMatches || duplicates.length) return;
    const form = new FormData(event.currentTarget);
    const success = await onSubmit({ name: String(form.get("name") || "").trim(), event_date: String(form.get("date") || ""), location: String(form.get("location") || "").trim(), format: String(form.get("format") || "single_elimination"), isTeamCompetition: true, participants: teams.map(team => team.members.join(" & ")) });
    if (success) {
      setTeams(null);
      try { window.localStorage.removeItem(PAIRING_DRAFT_KEY); } catch { /* Ignore unavailable storage. */ }
    }
  };

  let pairingMessage = `${names.length} pemain · ${names.length / 2} tim${teams ? " · pasangan siap disimpan" : " · acak pasangan untuk melanjutkan"}`;
  if (duplicates.length) pairingMessage = `Nama duplikat: ${[...new Set(duplicates)].join(", ")}. Hapus duplikat sebelum mengacak tim.`;
  else if (names.length % 2) pairingMessage = `${names.length} pemain — jumlah ganjil. Tambah atau hapus satu pemain sebelum mengacak tim.`;
  else if (names.length < 4) pairingMessage = `${names.length} pemain — minimal 4 pemain diperlukan untuk membuat dua tim.`;

  return <Modal id="create-session-modal" open={open} onOpenChange={onOpenChange}>
    <form className="modal__form" onSubmit={submit}>
      <div className="modal__heading"><div><span className="eyebrow">SESI BARU</span><h2>Buat kompetisi</h2></div><button type="button" className="icon-button" onClick={() => onOpenChange(false)} aria-label="Tutup">×</button></div>
      <label>Nama kompetisi<input name="name" required maxLength="80" value={name} onChange={event => setName(event.target.value)} placeholder="Contoh: Karambol Gamebell 2026"/></label>
      <div className="form-row"><label>Tanggal<input name="date" type="date" value={date} onChange={event => setDate(event.target.value)} required/></label><label>Format<select name="format" defaultValue="single_elimination"><option value="single_elimination">Tim · Single elimination</option></select></label></div>
      <label>Lokasi <span className="optional">(opsional)</span><input name="location" maxLength="80" value={location} onChange={event => setLocation(event.target.value)} placeholder="Contoh: Gamebell Community"/></label>
      <label>Pemain <span className="optional">(pisahkan dengan koma atau baris baru; setiap pemain hanya sekali)</span><textarea name="participants" rows="5" value={participantsInput} onChange={event => updateParticipants(event.target.value)} required/></label>
      <div className="team-pairing"><div className="team-pairing__header"><p className="form-note" aria-live="polite">{pairingMessage}</p><button type="button" className="button button--outline button--small" disabled={!validCount || duplicates.length > 0} onClick={generateTeams}>Acak Pasangan</button></div>
        <div className="team-pairing__preview" aria-live="polite">{teams?.map((team, index) => <div className="team-preview__item" key={index}><span>Tim {String(index + 1).padStart(2, "0")}</span><strong>{team.members[0]} &amp; {team.members[1]}</strong></div>)}</div>
      </div>
      <p className="form-note">Jumlah pemain harus genap dan minimal 4. Tim diacak sekali sebelum sesi dibuat; jumlah tim ganjil tetap bisa memakai bye di bagan.</p>
      <div className="modal__actions"><button type="button" className="button button--outline" onClick={() => onOpenChange(false)}>Batal</button><button type="submit" className="button button--primary" disabled={!previewMatches || duplicates.length > 0 || saving}>{saving ? "Menyimpan…" : "Buat Sesi"}</button></div>
    </form>
  </Modal>;
}

export function ScoreDialog({ open, onOpenChange, competition, match, onSubmit, saving }) {
  const first = match && getParticipant(competition, match.participant1Id);
  const second = match && getParticipant(competition, match.participant2Id);
  return <Modal id="score-modal" className="modal--compact" open={open} onOpenChange={onOpenChange}>
    {match && first && second && <form key={match.id} className="modal__form" onSubmit={event => { event.preventDefault(); const values = new FormData(event.currentTarget); onSubmit({ session_id: competition.id, match_id: match.id, score1: Number(values.get("score1")), score2: Number(values.get("score2")) }); }}>
      <div className="modal__heading"><div><span className="eyebrow">PERTANDINGAN {match.id}</span><h2>Update skor</h2></div><button type="button" className="icon-button" onClick={() => onOpenChange(false)} aria-label="Tutup">×</button></div>
      <p className="score-intro">{matchRoundName(match.round, competition.totalRounds)} · Masukkan skor akhir pemain.</p><input type="hidden" name="matchId" value={match.id} readOnly/>
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
    {match && first && second && <form className="modal__form" onSubmit={event => { event.preventDefault(); onSubmit(match.id, winnerId); }}>
      <div className="modal__heading"><div><span className="eyebrow">{match.id} · {matchRoundName(match.round, competition.totalRounds)}</span><h2>Tentukan pemenang</h2></div><button type="button" className="icon-button" onClick={() => onOpenChange(false)} aria-label="Tutup">×</button></div>
      <p className="score-intro">Pilih tim yang menang pada pertandingan ini.</p>
      <div className="team-winner-options">{[first, second].map(team => <label className={`team-winner-option ${winnerId === team.id ? "team-winner-option--selected" : ""}`} key={team.id}>
        <input type="radio" name="winnerId" value={team.id} checked={winnerId === team.id} onChange={() => setWinnerId(team.id)} required/>
        <span><strong>{team.name}</strong><small>{winnerId === team.id ? "Pemenang saat ini" : "Pilih sebagai pemenang"}</small></span>
      </label>)}</div>
      <div className="modal__actions"><button type="button" className="button button--outline" onClick={() => onOpenChange(false)}>Batal</button><button type="submit" className="button button--primary" disabled={!winnerId || saving}>{saving ? "Menyimpan…" : "Simpan pemenang"}</button></div>
    </form>}
  </Modal>;
}

export function ParticipantDialog({ open, onOpenChange, onSubmit, saving }) {
  const [name, setName] = useState("");
  return <Modal id="participant-modal" className="modal--compact" open={open} onOpenChange={onOpenChange}>
    <form className="modal__form" onSubmit={async event => { event.preventDefault(); const success = await onSubmit(name.trim()); if (success) setName(""); }}>
      <div className="modal__heading"><div><span className="eyebrow">PESERTA</span><h2>Tambah peserta</h2></div><button type="button" className="icon-button" onClick={() => onOpenChange(false)} aria-label="Tutup">×</button></div>
      <label>Nama peserta<input value={name} onChange={event => setName(event.target.value)} required maxLength="60" placeholder="Nama peserta"/></label>
      <p className="form-note">Peserta hanya bisa ditambahkan sebelum pertandingan dimulai. Bagan akan dibuat ulang otomatis.</p>
      <div className="modal__actions"><button type="button" className="button button--outline" onClick={() => onOpenChange(false)}>Batal</button><button type="submit" className="button button--primary" disabled={saving}>{saving ? "Menyimpan…" : "Tambah"}</button></div>
    </form>
  </Modal>;
}
