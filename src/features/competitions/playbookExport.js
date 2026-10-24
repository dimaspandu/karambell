import { getParticipant } from "../../domain/competitionModel.js";
import { formatDate, matchRoundName } from "../../shared/presentation/competitionFormatters.js";

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
}

/** Build the existing printable HTML document from an explicit competition snapshot. */
export function buildPlaybookHtml(competition) {
  const rows = competition.matches.map(match => {
    const first = getParticipant(competition, match.participant1Id);
    const second = getParticipant(competition, match.participant2Id);
    const winner = getParticipant(competition, match.winnerId);
    const result = competition.isTeamCompetition
      ? winner ? `${escapeHTML(winner.name)} menang` : match.status === "bye" ? "Bye" : "Belum dimainkan"
      : `${match.score1 ?? "–"} — ${match.score2 ?? "–"}`;
    return `<tr><td>${escapeHTML(match.id)}</td><td>${escapeHTML(matchRoundName(match.round, competition.totalRounds))}</td><td>${escapeHTML(first?.name || "Bye")} vs ${escapeHTML(second?.name || "Bye")}</td><td>${result}</td><td>${escapeHTML(winner?.name || "Belum selesai")}</td></tr>`;
  }).join("");

  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Playbook - ${escapeHTML(competition.name)}</title><style>body{font:14px Arial,sans-serif;color:#25352b;margin:32px}h1{font-size:26px}h2{font-size:18px;margin-top:28px;border-bottom:2px solid #d9e5d4;padding-bottom:8px}.meta{color:#637367}ul{columns:2;line-height:1.8}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #dce3d8;padding:9px;text-align:left}th{background:#edf2e9}.note{padding:12px;background:#f2f5ed;border-radius:8px;line-height:1.6}@media print{body{margin:16mm}}</style></head><body><h1>${escapeHTML(competition.name)}</h1><p class="meta">${escapeHTML(formatDate(competition.date))}${competition.location ? ` · ${escapeHTML(competition.location)}` : ""}</p><h2>${competition.isTeamCompetition ? "Daftar Tim" : "Daftar Peserta"} (${competition.participants.length})</h2><ul>${competition.participants.map(item => `<li>${escapeHTML(item.name)}</li>`).join("")}</ul><h2>Bagan dan Hasil Pertandingan</h2><table><thead><tr><th>ID</th><th>Babak</th><th>Pertandingan</th><th>${competition.isTeamCompetition ? "Hasil" : "Skor"}</th><th>Pemenang</th></tr></thead><tbody>${rows}</tbody></table><h2>Aturan Singkat</h2><p class="note">Pemenang maju ke babak berikutnya. Playbook ini dibuat dari data sesi saat tombol ditekan.</p><script>window.onload=()=>window.print()<\/script></body></html>`;
}

export function printPlaybook(competition, openWindow = (...args) => window.open(...args)) {
  const printWindow = openWindow("", "_blank", "noopener,noreferrer");
  if (!printWindow) return false;
  printWindow.document.write(buildPlaybookHtml(competition));
  printWindow.document.close();
  return true;
}
