import { TOURNAMENT_FORMATS } from "./tournamentFormats.js";

const nextPowerOfTwo = value => 2 ** Math.ceil(Math.log2(Math.max(2, value)));

function circleSchedule(items) {
  const rotating = [...items, ...(items.length % 2 ? [null] : [])];
  const rounds = [];
  for (let round = 0; round < rotating.length - 1; round++) {
    const fixtures = [];
    for (let index = 0; index < rotating.length / 2; index++) {
      const first = rotating[index];
      const second = rotating[rotating.length - 1 - index];
      if (first && second) fixtures.push([first, second]);
    }
    rounds.push(fixtures);
    rotating.splice(1, 0, rotating.pop());
  }
  return rounds;
}

export function buildTournamentPlan({ format, teams, participants, groupCount = 2 }) {
  if (!Array.isArray(teams) || !Array.isArray(participants) || teams.length !== participants.length || teams.some(team => !team?.id)) {
    throw new Error("Data tim tidak lengkap untuk membuat bagan kompetisi.");
  }
  if (format === TOURNAMENT_FORMATS.DOUBLE_ELIMINATION
    && (teams.length < 4 || (teams.length & (teams.length - 1)) !== 0)) {
    throw new Error("Double elimination memerlukan jumlah tim 4, 8, 16, 32, atau 64.");
  }
  const participantByTeam = new Map(participants.map(participant => [String(participant.team_id), participant]));
  const matches = [];
  const progressions = [];
  const groups = [];
  const groupMembers = [];
  let matchNumber = 1;
  const addMatch = (stage, round, firstTeamId = null, secondTeamId = null, winnerTeamId = null, groupId = null) => {
    const firstParticipant = firstTeamId == null ? null : participantByTeam.get(String(firstTeamId));
    const secondParticipant = secondTeamId == null ? null : participantByTeam.get(String(secondTeamId));
    const winnerParticipant = winnerTeamId == null ? null : participantByTeam.get(String(winnerTeamId));
    const match = {
      key: `match-${matches.length + 1}`,
      session_id: null,
      round,
      match_number: matchNumber++,
      stage,
      group_id: groupId,
      team1_id: firstTeamId,
      team2_id: secondTeamId,
      winner_team_id: winnerTeamId,
      participant1_participant_id: firstParticipant?.id || null,
      participant2_participant_id: secondParticipant?.id || null,
      winner_participant_id: winnerParticipant?.id || null,
      status: winnerTeamId == null ? "pending" : "completed",
      score1: null,
      score2: null
    };
    matches.push(match);
    return match;
  };
  const addEdge = (source, outcome, target, slot) => progressions.push({ sourceKey: source.key, source_outcome: outcome, targetKey: target.key, target_slot: slot });

  if (format === TOURNAMENT_FORMATS.ROUND_ROBIN) {
    circleSchedule(teams).forEach((fixtures, index) => fixtures.forEach(([first, second]) => addMatch("main", index + 1, first.id, second.id)));
    return { matches, progressions, groups, groupMembers };
  }

  if (format === TOURNAMENT_FORMATS.GROUP_KNOCKOUT) {
    const arranged = Array.from({ length: Number(groupCount) }, () => []);
    teams.forEach((team, index) => {
      const cycle = Math.floor(index / arranged.length);
      const offset = index % arranged.length;
      const groupIndex = cycle % 2 ? arranged.length - 1 - offset : offset;
      arranged[groupIndex].push(team);
    });
    arranged.forEach((groupTeams, index) => {
      const group = { key: `group-${index + 1}`, session_id: null, group_number: index + 1, name: `Grup ${String.fromCharCode(65 + index)}`, qualifying_places: 2 };
      groups.push(group);
      groupTeams.forEach(team => groupMembers.push({ groupKey: group.key, team_id: team.id }));
      circleSchedule(groupTeams).forEach((fixtures, roundIndex) => fixtures.forEach(([first, second]) => addMatch("group", roundIndex + 1, first.id, second.id, null, group.key)));
    });
    const qualifierCount = Number(groupCount) * 2;
    const rounds = Math.log2(qualifierCount);
    const knockoutByRound = [];
    for (let round = 1; round <= rounds; round++) {
      const count = qualifierCount / 2 ** round;
      knockoutByRound[round] = Array.from({ length: count }, () => addMatch("main", round));
    }
    for (let round = 1; round < rounds; round++) knockoutByRound[round].forEach((match, index) => addEdge(match, "winner", knockoutByRound[round + 1][Math.floor(index / 2)], index % 2 + 1));
    return { matches, progressions, groups, groupMembers };
  }

  if (format === TOURNAMENT_FORMATS.DOUBLE_ELIMINATION) {
    const size = teams.length;
    const rounds = Math.log2(size);
    const winnersByRound = [];
    for (let round = 1; round <= rounds; round++) {
      const count = size / 2 ** round;
      winnersByRound[round] = Array.from({ length: count }, (_, index) => addMatch("winners", round,
        round === 1 ? teams[index * 2].id : null,
        round === 1 ? teams[index * 2 + 1].id : null));
    }
    const losersByRound = [];
    for (let round = 1; round <= (rounds - 1) * 2; round++) {
      const count = round % 2 ? size / 2 ** (Math.ceil(round / 2) + 1) : size / 2 ** (round / 2 + 1);
      losersByRound[round] = Array.from({ length: count }, (_, index) => addMatch("losers", round));
    }
    for (let round = 1; round <= rounds; round++) {
      if (round < rounds) {
        winnersByRound[round].forEach((match, index) => addEdge(match, "winner", winnersByRound[round + 1][Math.floor(index / 2)], index % 2 + 1));
      }
      if (round === 1) {
        winnersByRound[round].forEach((match, index) => addEdge(match, "loser", losersByRound[1][Math.floor(index / 2)], index % 2 + 1));
      } else {
        winnersByRound[round].forEach((match, index) => addEdge(match, "loser", losersByRound[round * 2 - 2][index], 2));
      }
    }
    // The last losers-bracket round feeds the grand final below; there is no
    // subsequent losers round to advance into.
    for (let round = 1; round < losersByRound.length - 1; round++) {
      const current = losersByRound[round];
      const next = losersByRound[round + 1];
      if (round % 2) current.forEach((match, index) => addEdge(match, "winner", next[index], 1));
      else current.forEach((match, index) => addEdge(match, "winner", next[Math.floor(index / 2)], index % 2 + 1));
    }
    const grandFinal = addMatch("grand_final", rounds + 1);
    winnersByRound[rounds].forEach(match => addEdge(match, "winner", grandFinal, 1));
    losersByRound[losersByRound.length - 1].forEach(match => addEdge(match, "winner", grandFinal, 2));
    return { matches, progressions, groups, groupMembers };
  }

  const size = nextPowerOfTwo(teams.length);
  const byeCount = size - teams.length;
  const opening = Array.from({ length: size / 2 }, (_, index) => index < byeCount
    ? { first: teams[index]?.id || null, second: null, winner: teams[index]?.id || null }
    : { first: teams[byeCount + (index - byeCount) * 2]?.id || null, second: teams[byeCount + (index - byeCount) * 2 + 1]?.id || null, winner: null });
  const rounds = Math.log2(size);
  const matchesByRound = [];
  for (let round = 1; round <= rounds; round++) {
    const count = size / 2 ** round;
    matchesByRound[round] = Array.from({ length: count }, (_, index) => addMatch("main", round,
      round === 1 ? opening[index].first : round === 2 ? opening[index * 2]?.winner || null : null,
      round === 1 ? opening[index].second : round === 2 ? opening[index * 2 + 1]?.winner || null : null,
      round === 1 ? opening[index].winner : null));
  }
  for (let round = 1; round < rounds; round++) matchesByRound[round].forEach((match, index) => addEdge(match, "winner", matchesByRound[round + 1][Math.floor(index / 2)], index % 2 + 1));
  return { matches, progressions, groups, groupMembers };
}

export function resolveMatchParticipant(match, outcome) {
  if (outcome === "winner") return match.winner_participant_id;
  if (!match.winner_participant_id) return null;
  return String(match.winner_participant_id) === String(match.participant1_participant_id)
    ? match.participant2_participant_id
    : match.participant1_participant_id;
}
