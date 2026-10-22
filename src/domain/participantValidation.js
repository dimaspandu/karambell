function validationError(message) {
  return { valid: false, error: message };
}

/** Validate participant addition against the current individual competition. */
export function validateParticipantAddition({ competition, name }) {
  const cleanName = String(name ?? "").trim();
  const id = competition?.id ?? competition?.session?.session_id;
  const format = String(competition?.format ?? competition?.session?.format ?? "").toLowerCase();
  const isTeamCompetition = competition?.isTeamCompetition === true || format.includes("team");
  const participants = Array.isArray(competition?.participants) ? competition.participants : [];
  const matches = Array.isArray(competition?.matches) ? competition.matches : [];
  const status = String(competition?.status ?? competition?.session?.status ?? "").toLowerCase();

  if (!id) return validationError("Kompetisi tidak ditemukan.");
  if (!Array.isArray(competition?.participants) || !Array.isArray(competition?.matches)) return validationError("Data kompetisi belum lengkap. Muat ulang lalu coba lagi.");
  if (!cleanName) return validationError("Nama peserta wajib diisi.");
  if (cleanName.length > 60) return validationError("Nama peserta maksimal 60 karakter.");
  if (isTeamCompetition) return validationError("Peserta hanya dapat ditambahkan ke kompetisi individual.");
  if (format && !["single", "single_elimination"].includes(format)) return validationError("Format kompetisi tidak mendukung penambahan peserta.");
  if (status === "completed") return validationError("Kompetisi yang sudah selesai tidak dapat ditambahkan peserta.");
  if (participants.length >= 64) return validationError("Maksimal 64 peserta untuk setiap kompetisi.");

  const normalizedName = cleanName.toLocaleLowerCase("id-ID");
  if (participants.some(participant => String(participant?.name || "").toLocaleLowerCase("id-ID") === normalizedName)) {
    return validationError("Nama peserta sudah ada.");
  }

  const matchStarted = matches.some(match => (
    (match.score1 !== "" && match.score1 != null) ||
    (match.score2 !== "" && match.score2 != null) ||
    match.status === "in_progress" ||
    match.status === "completed"
  ));
  if (matchStarted) return validationError("Peserta hanya dapat ditambahkan sebelum pertandingan dimulai.");

  return { valid: true, name: cleanName };
}
