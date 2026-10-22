import { formatDate } from "../../shared/presentation/competitionFormatters.js";

const percent = value => `${Number(value || 0).toFixed(2)}%`;

function Stats({ team }) {
  return <div className="leader-stats"><span>W {team.wins}</span><span>L {team.losses}</span><span>{team.played} played</span><span>{percent(team.winRate)}</span><span>{team.tournamentsPlayed} tournaments</span></div>;
}

function LeaderboardTable({ teams, onOpenTeam }) {
  if (!teams.length) return <div className="empty-state"><h3>No completed team tournaments yet</h3></div>;
  return <div className="table-wrap"><table><thead><tr><th>Rank</th><th>Team</th><th>W–L</th><th>Played</th><th>Win rate</th><th>Tournaments</th></tr></thead><tbody>
    {teams.map(team => <tr key={team.teamKey}><td>#{team.rank}</td><td><button className="table-action" onClick={() => onOpenTeam(team.teamKey)}>{team.teamName}</button></td><td>{team.wins}–{team.losses}</td><td>{team.played}</td><td>{percent(team.winRate)}</td><td>{team.tournamentsPlayed}</td></tr>)}
  </tbody></table></div>;
}

function TeamDetail({ team, onBack, onOpenTournament }) {
  return <>
    <button className="back-link" onClick={onBack}>← Global leaderboard</button>
    <header className="leader-heading"><p>Rank #{team.rank}</p><h2>{team.teamName}</h2><p>{team.player1Name} &amp; {team.player2Name}</p></header>
    <Stats team={team}/>
    <div className="section-heading"><div><h2>Tournament history</h2><p>Completed tournaments with valid team participation.</p></div></div>
    {!team.tournaments.length ? <div className="empty-state">No tournament history.</div> : <div className="leader-tournaments">{team.tournaments.map(item => <article className="leader-tournament" key={item.sessionId}>
      <div><h3>{item.tournamentName}</h3><p>{item.eventDate ? formatDate(item.eventDate) : "Date unavailable"}{item.location ? ` · ${item.location}` : ""}</p><p>{item.wins} wins · {item.losses} losses · {item.played} played</p></div>
      <button className="button button--outline" onClick={() => onOpenTournament(item.sessionId)}>Match history</button>
    </article>)}</div>}
  </>;
}

function TournamentHistory({ team, tournament, onBack }) {
  return <>
    <button className="back-link" onClick={onBack}>← {team.teamName}</button>
    <header className="leader-heading"><p>{tournament.eventDate ? formatDate(tournament.eventDate) : "Date unavailable"}{tournament.location ? ` · ${tournament.location}` : ""}</p><h2>{tournament.tournamentName}</h2><p>{team.teamName}: {tournament.wins} wins · {tournament.losses} losses · {tournament.played} played · {percent(tournament.winRate)}</p></header>
    {!tournament.matches.length ? <div className="empty-state">No match history available.</div> : <div className="leader-tournaments">{tournament.matches.map((match, index) => <article className="leader-tournament" key={`${match.matchId}-${index}`}>
      <div><span className={`status-pill ${match.isBye ? "" : "status-pill--done"}`}>{match.isBye ? "Bye" : match.result === "win" ? "Win" : "Loss"}</span><h3>{match.isBye ? "Bye" : `vs ${match.opponentTeamName}`}</h3><p>Round {match.round || "—"} · Match {match.matchNumber || "—"}</p></div>
    </article>)}</div>}
  </>;
}

export function Leaderboard({ viewModel, onNavigate }) {
  const { page, retry } = viewModel;
  if (page.type === "loading") return <div className="empty-state" role="status"><h2>Loading leaderboard…</h2></div>;
  if (page.type === "error") return <div className="empty-state"><h2>Could not load leaderboard</h2><p>{page.message}</p><button className="button button--outline" onClick={retry}>Try again</button></div>;
  if (page.type === "not-found") return <div className="empty-state"><h2>{page.message}</h2><button className="back-link" onClick={() => onNavigate(page.backRoute.name, page.backRoute.params || {})}>← Back</button></div>;
  if (page.type === "leaderboard") return <><p className="leaderboard-intro">Ranked by win rate, wins, then tournaments played.</p><LeaderboardTable teams={page.teams} onOpenTeam={teamKey => onNavigate("leaderboard-team", { teamKey })}/></>;
  if (page.type === "team") return <TeamDetail team={page.team} onBack={() => onNavigate("leaderboard")} onOpenTournament={sessionId => onNavigate("leaderboard-tournament", { teamKey: page.team.teamKey, sessionId })}/>;
  if (page.type === "tournament") return <TournamentHistory team={page.team} tournament={page.tournament} onBack={() => onNavigate("leaderboard-team", { teamKey: page.team.teamKey })}/>;
  return null;
}
