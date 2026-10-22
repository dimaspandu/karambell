/** Parse the comma, semicolon, and newline separated names accepted by the creation form. */
export function parseParticipantNames(value) {
  const names = String(value || "").split(/[\n,;]+/).map(name => name.trim()).filter(Boolean);
  const seen = new Set();
  const duplicates = [];
  for (const name of names) {
    const key = name.toLocaleLowerCase("id-ID");
    if (seen.has(key)) duplicates.push(name);
    else seen.add(key);
  }
  return { names, duplicates };
}

/** Fisher-Yates pairing, with injectable randomness for deterministic tests. */
export function createRandomTeamPairing(participants, random = Math.random) {
  const shuffled = [...participants];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const target = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  return Array.from({ length: shuffled.length / 2 }, (_, index) => ({
    members: shuffled.slice(index * 2, index * 2 + 2)
  }));
}

export function validateCompetitionCreation(input) {
  const name = String(input?.name ?? "").trim();
  const date = String(input?.event_date ?? "").trim();
  const location = String(input?.location ?? "").trim();
  const participants = Array.isArray(input?.participants) ? input.participants.map(value => String(value ?? "").trim()) : [];
  const fail = error => ({ valid: false, error });

  if (!name) return fail("Nama kompetisi wajib diisi.");
  if (name.length > 80) return fail("Nama kompetisi maksimal 80 karakter.");
  if (!date) return fail("Tanggal kompetisi wajib diisi.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) return fail("Tanggal kompetisi tidak valid.");
  if (location.length > 80) return fail("Lokasi maksimal 80 karakter.");
  if (input?.format !== "single_elimination") return fail("Format kompetisi tidak didukung.");
  if (participants.length < 2) return fail("Minimal dua tim diperlukan untuk membuat kompetisi.");

  const members = [];
  for (const team of participants) {
    const pair = team.split(" & ").map(member => member.trim());
    if (pair.length !== 2 || pair.some(member => !member)) {
      return fail("Setiap tim harus terdiri dari dua pemain.");
    }
    members.push(...pair);
  }
  const normalized = members.map(member => member.toLocaleLowerCase("id-ID"));
  if (new Set(normalized).size !== normalized.length) {
    return fail("Setiap pemain hanya dapat terdaftar satu kali.");
  }

  return { valid: true, value: { name, event_date: date, location, format: input.format, isTeamCompetition: true, participants } };
}
