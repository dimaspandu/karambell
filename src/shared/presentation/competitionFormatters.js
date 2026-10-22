export const initials = name => String(name || "").trim().split(/\s+/).slice(0, 2).map(part => part[0] || "").join("").toUpperCase();

export const formatDate = date => {
  if (!date) return "Tanggal belum ditentukan";
  const parsed = new Date(`${date}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? date : new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" }).format(parsed);
};

export const matchRoundName = (round, totalRounds) => round === totalRounds ? "Final" : round === totalRounds - 1 ? "Semifinal" : round === totalRounds - 2 ? "Perempat final" : `Babak ${round}`;
