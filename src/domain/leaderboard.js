const clean = value => String(value ?? "").trim().replace(/\s+/g, " ");

export function normalizeTeamName(value) {
  const parts = clean(value).split("&").map(clean);
  if (parts.length !== 2 || parts.some(part => !part)) return null;
  const paired = parts.map(display => ({ display, normalized: display.toLocaleLowerCase() })).sort((a, b) => a.normalized.localeCompare(b.normalized) || a.display.localeCompare(b.display));
  const names = paired.map(item => item.normalized);
  const displayNames = paired.map(item => item.display);
  return { teamKey: names.join("|"), names, displayNames, player1Name: displayNames[0], player2Name: displayNames[1] };
}

const validSession = session => session?.status === "completed" && ["team_single_elimination", "team"].includes(String(session.format).toLowerCase());
const blankStats = () => ({ wins: 0, losses: 0, played: 0 });

function build(competitions) {
  const teams = new Map();
  const tournaments = [];
  const ensure = (key, names, display) => {
    if (!teams.has(key)) teams.set(key, { teamKey: key, teamName: display, player1Name: names[0], player2Name: names[1], ...blankStats(), tournaments: new Map() });
    const team = teams.get(key);
    if (display.localeCompare(team.teamName) < 0) {
      team.teamName = display;
      team.player1Name = names[0];
      team.player2Name = names[1];
    }
    return team;
  };
  for (const competition of competitions || []) {
    if (!validSession(competition.session)) continue;
    const people = new Map((competition.participants || []).map(person => [String(person.participant_id), person]));
    const parsed = new Map();
    for (const [id, person] of people) {
      const identity = normalizeTeamName(person.name);
      if (identity) parsed.set(id, { ...identity, display: identity.displayNames.join(" & ") });
      else console.warn("Leaderboard: ignoring malformed team name", { sessionId: competition.session.session_id, participantId: id });
    }
    const sessionId = String(competition.session.session_id || "");
    if (!sessionId) continue;
    const tournament = { sessionId, tournamentName: String(competition.session.name || "Tournament"), eventDate: String(competition.session.event_date || "").slice(0, 10), location: String(competition.session.location || ""), matches: [] };
    const tournamentTeams = new Set();
    const seenMatches = new Set();
    for (const match of competition.matches || []) {
      const first = parsed.get(String(match.participant1_id));
      const second = parsed.get(String(match.participant2_id));
      if (first) tournamentTeams.add(first.teamKey);
      if (second) tournamentTeams.add(second.teamKey);
      if (match.status === "bye") {
        for (const identity of [first, second].filter(Boolean)) tournament.matches.push({ teamKey: identity.teamKey, matchId: String(match.match_id || ""), sessionId, round: Number(match.round), matchNumber: Number(match.match_number), status: "bye", isBye: true, result: null, opponentTeamKey: null, opponentTeamName: "Bye", score1: null, score2: null });
        continue;
      }
      if (String(match.status).toLowerCase() !== "completed" || !first || !second || first.teamKey === second.teamKey) continue;
      const winner = parsed.get(String(match.winner_id));
      if (!winner || ![first.teamKey, second.teamKey].includes(winner.teamKey)) continue;
      const signature = Number.isFinite(Number(match.round)) && Number.isFinite(Number(match.match_number))
        ? `${match.round}:${match.match_number}`
        : String(match.match_id || "");
      if (seenMatches.has(signature)) continue;
      seenMatches.add(signature);
      const result = winner.teamKey === first.teamKey ? "win" : "loss";
      for (const [identity, opponent, ownResult] of [[first, second, result], [second, first, result === "win" ? "loss" : "win"]]) tournament.matches.push({ teamKey: identity.teamKey, matchId: String(match.match_id || ""), sessionId, round: Number(match.round), matchNumber: Number(match.match_number), status: "completed", isBye: false, result: ownResult, opponentTeamKey: opponent.teamKey, opponentTeamName: opponent.display, score1: null, score2: null });
      for (const identity of [first, second]) {
        const team = ensure(identity.teamKey, identity.names, identity.display);
        const stats = team.tournaments.get(sessionId) || { ...blankStats() };
        if (identity.teamKey === winner.teamKey) stats.wins++; else stats.losses++;
        stats.played++;
        if (identity.teamKey === winner.teamKey) team.wins++; else team.losses++;
        team.tournaments.set(sessionId, stats);
      }
    }
    for (const key of tournamentTeams) {
      const identity = [...parsed.values()].find(item => item.teamKey === key);
      const team = ensure(key, identity.names, identity.display);
      if (!team.tournaments.has(sessionId)) team.tournaments.set(sessionId, { ...blankStats() });
    }
    tournaments.push({ ...tournament, _teams: tournamentTeams });
  }
  const ranked = [...teams.values()].map(team => {
    const played = team.wins + team.losses;
    return { ...team, played, winRate: played ? team.wins / played * 100 : 0, tournamentsPlayed: team.tournaments.size };
  }).sort((a, b) => b.winRate - a.winRate || b.wins - a.wins || b.tournamentsPlayed - a.tournamentsPlayed || a.teamKey.localeCompare(b.teamKey));
  ranked.forEach((team, index) => { team.rank = index + 1; });
  const output = ranked.map(({ tournaments: internal, ...team }) => team);
  return { leaderboard: output, getTeam: key => {
    const team = ranked.find(row => row.teamKey === key);
    if (!team) return null;
    const history = tournaments.filter(item => item._teams.has(key)).map(item => {
      const stats = team.tournaments.get(item.sessionId) || blankStats();
      const ownMatches = item.matches.filter(match => match.teamKey === key).map(({ teamKey, opponentTeamKey, ...match }) => match).sort((a, b) => a.round - b.round || a.matchNumber - b.matchNumber);
      const played = stats.wins + stats.losses;
      return { sessionId: item.sessionId, tournamentName: item.tournamentName, eventDate: item.eventDate, location: item.location, wins: stats.wins, losses: stats.losses, played, winRate: played ? stats.wins / played * 100 : 0, matches: ownMatches };
    }).sort((a, b) => b.eventDate.localeCompare(a.eventDate) || a.tournamentName.localeCompare(b.tournamentName) || a.sessionId.localeCompare(b.sessionId));
    return { ...output[team.rank - 1], tournaments: history };
  } };
}

export const createLeaderboardData = build;
