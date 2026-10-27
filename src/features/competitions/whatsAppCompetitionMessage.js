import { TOURNAMENT_FORMATS } from "../../domain/tournamentFormats.js";
import { getTournamentStandings } from "../../domain/tournamentStandings.js";
import { matchRoundName } from "../../shared/presentation/competitionFormatters.js";

const MAX_SHARED_MATCHES = 20;

function standingsFor(competition) {
  if (competition.format === TOURNAMENT_FORMATS.ROUND_ROBIN) {
    return [{ label: "", rows: getTournamentStandings({ matches: competition.matches, participants: competition.participants, stage: "main" }) }];
  }
  if (competition.format === TOURNAMENT_FORMATS.GROUP_KNOCKOUT) {
    return competition.groups.map(group => ({
      label: group.name,
      rows: getTournamentStandings({ matches: competition.matches, participants: competition.participants, groups: competition.groups, groupId: group.id, stage: "group" })
    }));
  }
  return [];
}

function upcomingMatches(competition) {
  const stageOrder = competition.format === TOURNAMENT_FORMATS.GROUP_KNOCKOUT
    ? new Map([["group", 0], ["main", 1]])
    : new Map([["main", 0], ["winners", 1], ["losers", 2], ["grand_final", 3]]);
  return (competition.matches || []).filter(match => match.status === "pending"
    && !match.winnerId && match.score1 == null && match.score2 == null
    && match.participant1Id && match.participant2Id
    && competition.participants.some(participant => participant.id === match.participant1Id)
    && competition.participants.some(participant => participant.id === match.participant2Id))
    .sort((a, b) => (stageOrder.get(a.stage) ?? 9) - (stageOrder.get(b.stage) ?? 9)
      || Number(a.round) - Number(b.round)
      || Number(a.index) - Number(b.index));
}

export function buildWhatsAppCompetitionMessage(competition) {
  const standings = standingsFor(competition);
  if (!standings.length) return "";
  const lines = [`*${competition.name || "Kompetisi"}*`, ""];
  lines.push(competition.format === TOURNAMENT_FORMATS.GROUP_KNOCKOUT ? "*KLASEMEN GRUP*" : "*KLASEMEN*");
  for (const group of standings) {
    if (group.label) lines.push(`\n*${group.label}*`);
    if (!group.rows.length) {
      lines.push("Belum ada tim terdaftar.");
      continue;
    }
    group.rows.forEach((row, index) => {
      lines.push(`${index + 1}. ${row.name} - ${row.points} poin (${row.played} main, ${row.wins} menang, ${row.losses} kalah)`);
    });
  }

  const matches = upcomingMatches(competition);
  lines.push("", "*JADWAL PERTANDINGAN MENDATANG*");
  if (!matches.length) {
    lines.push("Belum ada pertandingan pending dengan kedua tim yang sudah diketahui.");
  } else {
    matches.slice(0, MAX_SHARED_MATCHES).forEach(match => {
      const first = competition.participants.find(participant => participant.id === match.participant1Id);
      const second = competition.participants.find(participant => participant.id === match.participant2Id);
      const group = match.stage === "group" ? competition.groups.find(item => item.id === match.groupId) : null;
      const round = group ? `${group.name} - Ronde ${match.round}` : matchRoundName(match.round, competition.totalRounds, match.stage, competition.format);
      lines.push(`- ${round}: ${first.name} vs ${second.name}`);
    });
    if (matches.length > MAX_SHARED_MATCHES) lines.push(`...dan ${matches.length - MAX_SHARED_MATCHES} pertandingan pending lainnya.`);
  }
  lines.push("", "Dibuat dari Gamebell.");
  return lines.join("\n");
}

export function whatsappCompetitionUrl(competition) {
  const message = buildWhatsAppCompetitionMessage(competition);
  return message ? `https://wa.me/?text=${encodeURIComponent(message)}` : "";
}
