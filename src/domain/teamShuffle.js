import { TOURNAMENT_FORMATS } from "./tournamentFormats.js";

const id = value => value == null ? null : String(value);
const supportedFormats = new Set([
  TOURNAMENT_FORMATS.SINGLE_ELIMINATION,
  "single",
  TOURNAMENT_FORMATS.DOUBLE_ELIMINATION,
  TOURNAMENT_FORMATS.ROUND_ROBIN,
  TOURNAMENT_FORMATS.GROUP_KNOCKOUT
]);

function protectedTeamIds(competition) {
  const participantById = new Map((competition.participants || []).map(participant => [id(participant.id), participant]));
  const protectedIds = new Set();
  for (const match of competition.matches || []) {
    const hasResult = ["completed", "in_progress", "bye"].includes(String(match.status || "").toLowerCase())
      || match.winnerId != null || match.score1 != null || match.score2 != null;
    if (!hasResult) continue;
    for (const participantId of [match.participant1Id, match.participant2Id]) {
      const participant = participantById.get(id(participantId));
      if (participant?.sourceId != null) protectedIds.add(id(participant.sourceId));
    }
  }
  return protectedIds;
}

export function getEligibleShuffleTeams(competition) {
  if (!competition?.isTeamCompetition) return { valid: false, reason: "Acak pemain hanya tersedia untuk kompetisi tim." };
  if (!supportedFormats.has(competition.format)) return { valid: false, reason: "Format kompetisi ini belum mendukung pengacakan pemain." };
  if (String(competition.status || "").toLowerCase() === "completed") return { valid: false, reason: "Kompetisi yang sudah selesai tidak dapat mengacak pemain." };
  const protectedIds = protectedTeamIds(competition);
  const teams = (competition.participants || []).filter(participant => participant.sourceType === "team")
    .map(participant => ({
      teamId: id(participant.sourceId),
      participantId: id(participant.id),
      name: participant.name,
      members: Array.isArray(participant.members) ? participant.members.map(member => ({
        playerId: id(member.playerId ?? member.id),
        name: String(member.name || ""),
        position: member.position == null ? null : Number(member.position)
      })) : []
    }));
  if (teams.some(team => !team.teamId || team.members.length !== 2 || team.members.some(member => !member.playerId || !member.name)
    || new Set(team.members.map(member => member.playerId)).size !== 2)) {
    return { valid: false, reason: "Data anggota tim belum lengkap. Muat ulang kompetisi sebelum mengacak pemain." };
  }
  const allPlayerIds = teams.flatMap(team => team.members.map(member => member.playerId));
  if (new Set(allPlayerIds).size !== allPlayerIds.length) return { valid: false, reason: "Data pemain duplikat ditemukan pada lebih dari satu tim." };
  const eligible = teams.filter(team => !protectedIds.has(team.teamId));
  if (eligible.length < 2) return { valid: false, reason: "Sedikitnya dua tim yang belum memiliki hasil pertandingan diperlukan. Tim yang sudah bermain dilindungi." };
  return { valid: true, teams: eligible };
}

function makeCandidate(first, second, firstPair, secondPair) {
  const teamPairs = [[first, firstPair], [second, secondPair]];
  // Assign all four roster slots as player-to-team destinations.
  const originalPlayerTeam = new Map([
    ...first.members.map(member => [member.playerId, first.teamId]),
    ...second.members.map(member => [member.playerId, second.teamId])
  ]);
  const proposedPlayerTeam = new Map([
    ...firstPair.map(member => [member.playerId, first.teamId]),
    ...secondPair.map(member => [member.playerId, second.teamId])
  ]);
  const proposedByTeam = new Map(teamPairs.map(([team, members]) => [team.teamId, members]));
  const proposedMembersByTeam = new Map();
  for (const [team] of teamPairs) {
    const selected = proposedByTeam.get(team.teamId);
    const selectedIds = new Set(selected.map(member => member.playerId));
    const openPositions = team.members.filter(member => !selectedIds.has(member.playerId)).map(member => member.position);
    const assigned = selected.map(member => originalPlayerTeam.get(member.playerId) === team.teamId
      ? member
      : { ...member, position: openPositions.shift() ?? null });
    proposedMembersByTeam.set(team.teamId, assigned);
  }
  const changedAssignments = [...proposedPlayerTeam].map(([playerId, toTeamId]) => {
    const fromTeamId = originalPlayerTeam.get(playerId);
    const member = [...first.members, ...second.members].find(item => item.playerId === playerId);
    const proposedMember = proposedMembersByTeam.get(toTeamId).find(item => item.playerId === playerId);
    return { playerId, fromTeamId, toTeamId, fromPosition: member.position, toPosition: proposedMember.position };
  }).filter(assignment => assignment.fromTeamId !== assignment.toTeamId);
  return {
    assignments: changedAssignments,
    teams: teamPairs.map(([team, members]) => ({
      teamId: team.teamId,
      name: team.name,
      currentMembers: team.members,
      proposedMembers: proposedMembersByTeam.get(team.teamId)
    }))
  };
}

/** Generate every bounded alternative partition for each pair of eligible two-player teams. */
export function generateTeamShuffleCandidates(competition) {
  const eligibility = getEligibleShuffleTeams(competition);
  if (!eligibility.valid) return eligibility;
  const candidates = [];
  for (let i = 0; i < eligibility.teams.length - 1; i++) {
    for (let j = i + 1; j < eligibility.teams.length; j++) {
      const first = eligibility.teams[i];
      const second = eligibility.teams[j];
      const [a, b] = first.members;
      const [c, d] = second.members;
      candidates.push(makeCandidate(first, second, [a, c], [b, d]));
      candidates.push(makeCandidate(first, second, [a, d], [b, c]));
    }
  }
  if (!candidates.length) return { valid: false, reason: "Tidak ditemukan kombinasi alternatif yang valid." };
  return { valid: true, candidates };
}

/** Recheck a frontend candidate against this competition snapshot before submitting it. */
export function validateTeamShuffleCandidate(competition, assignments) {
  const eligibility = getEligibleShuffleTeams(competition);
  if (!eligibility.valid) return eligibility;
  if (!Array.isArray(assignments) || assignments.length < 2 || assignments.length > 4) return { valid: false, reason: "Pengacakan harus mengubah dua sampai empat pemain." };
  const eligibleByTeam = new Map(eligibility.teams.map(team => [team.teamId, team]));
  const currentTeamByPlayer = new Map(eligibility.teams.flatMap(team => team.members.map(member => [member.playerId, team.teamId])));
  const playerIds = assignments.map(item => id(item.playerId));
  if (new Set(playerIds).size !== playerIds.length) return { valid: false, reason: "Pemain tidak boleh ditetapkan lebih dari sekali." };
  const teamIds = new Set();
  const fromCounts = new Map();
  const targetCounts = new Map();
  for (const assignment of assignments) {
    const playerId = id(assignment.playerId);
    const fromTeamId = id(assignment.fromTeamId);
    const toTeamId = id(assignment.toTeamId);
    if (!currentTeamByPlayer.has(playerId) || currentTeamByPlayer.get(playerId) !== fromTeamId) {
      return { valid: false, reason: "Penempatan pemain berubah atau pemain bukan anggota sesi ini. Muat ulang lalu coba lagi." };
    }
    if (!eligibleByTeam.has(fromTeamId) || !eligibleByTeam.has(toTeamId)) return { valid: false, reason: "Tim yang sudah bermain tidak dapat diubah." };
    const currentMember = eligibleByTeam.get(fromTeamId).members.find(member => member.playerId === playerId);
    if ((currentMember.position == null ? null : Number(currentMember.position)) !== (assignment.fromPosition == null ? null : Number(assignment.fromPosition))) {
      return { valid: false, reason: "Posisi pemain berubah sejak pratinjau. Muat ulang lalu coba lagi." };
    }
    teamIds.add(fromTeamId);
    teamIds.add(toTeamId);
    fromCounts.set(fromTeamId, (fromCounts.get(fromTeamId) || 0) + 1);
    targetCounts.set(toTeamId, (targetCounts.get(toTeamId) || 0) + 1);
  }
  if (teamIds.size !== 2 || [...teamIds].some(teamId => (fromCounts.get(teamId) || 0) !== (targetCounts.get(teamId) || 0))) return { valid: false, reason: "Jumlah anggota setiap tim harus tetap dua pemain." };
  if (assignments.some(item => id(item.fromTeamId) === id(item.toTeamId))) return { valid: false, reason: "Kandidat tidak mengubah susunan pemain." };
  const projected = new Map([...teamIds].map(teamId => [teamId, eligibleByTeam.get(teamId).members.map(member => ({ playerId: member.playerId, position: member.position }))]));
  for (const assignment of assignments) {
    const source = projected.get(id(assignment.fromTeamId));
    const memberIndex = source.findIndex(member => member.playerId === id(assignment.playerId));
    source.splice(memberIndex, 1);
    projected.get(id(assignment.toTeamId)).push({ playerId: id(assignment.playerId), position: assignment.toPosition == null ? null : Number(assignment.toPosition) });
  }
  if ([...projected.values()].some(members => members.length !== 2 || members.some(member => member.position != null && members.some(other => other !== member && other.position != null && other.position === member.position)))) {
    return { valid: false, reason: "Susunan usulan melanggar kapasitas tim atau posisi anggota." };
  }
  return { valid: true };
}
