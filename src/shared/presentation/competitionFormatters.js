export const initials = name => String(name || "").trim().split(/\s+/).slice(0, 2).map(part => part[0] || "").join("").toUpperCase();

export const formatDate = date => {
  if (!date) return "Tanggal belum ditentukan";
  const parsed = new Date(`${date}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? date : new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" }).format(parsed);
};

export const matchRoundName = (round, totalRounds, stage = "main", format = "single_elimination") => {
  if (stage === "group") return `Grup · Ronde ${round}`;
  if (stage === "winners") return `Winners · Ronde ${round}`;
  if (stage === "losers") return `Losers · Ronde ${round}`;
  if (stage === "grand_final") return "Grand final";
  if (format === "round_robin") return `Ronde ${round}`;
  return round === totalRounds ? "Final" : round === totalRounds - 1 ? "Semifinal" : round === totalRounds - 2 ? "Perempat final" : `Babak ${round}`;
};
