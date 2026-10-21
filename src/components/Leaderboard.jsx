import { formatDate } from "../domain/competitionModel.js";

const percent = value => `${Number(value || 0).toFixed(2)}%`;
function Stats({ team }) { return <div className="leader-stats"><span>W {team.wins}</span><span>L {team.losses}</span><span>{team.played} played</span><span>{percent(team.winRate)}</span><span>{team.tournamentsPlayed} tournaments</span></div>; }

export function Leaderboard({ data, loading, error, route, onNavigate, onRetry }) {
  if (loading) return <div className="empty-state" role="status"><h2>Loading leaderboard…</h2></div>;
  if (error) return <div className="empty-state"><h2>Could not load leaderboard</h2><p>{error}</p><button className="button button--outline" onClick={onRetry}>Try again</button></div>;
  if (!data || route.name === "leaderboard") return <>
    <p className="leaderboard-intro">Ranked by win rate, wins, then tournaments played.</p>
    {!data?.leaderboard.length ? <div className="empty-state"><h3>No completed team tournaments yet</h3></div> : <div className="table-wrap"><table><thead><tr><th>Rank</th><th>Team</th><th>W–L</th><th>Played</th><th>Win rate</th><th>Tournaments</th></tr></thead><tbody>{data.leaderboard.map(team => <tr key={team.teamKey}><td>#{team.rank}</td><td><button className="table-action" onClick={() => onNavigate("leaderboard-team", { teamKey: team.teamKey })}>{team.teamName}</button></td><td>{team.wins}–{team.losses}</td><td>{team.played}</td><td>{percent(team.winRate)}</td><td>{team.tournamentsPlayed}</td></tr>)}</tbody></table></div>}
  </>;
  const team = data.getTeam(route.teamKey);
  if (!team) return <div className="empty-state"><h2>Team not found</h2><button className="back-link" onClick={() => onNavigate("leaderboard")}>← Leaderboard</button></div>;
  if (route.name === "leaderboard-team") return <>
    <button className="back-link" onClick={() => onNavigate("leaderboard")}>← Global leaderboard</button><header className="leader-heading"><p>Rank #{team.rank}</p><h2>{team.teamName}</h2><p>{team.player1Name} &amp; {team.player2Name}</p></header><Stats team={team}/>
    <div className="section-heading"><div><h2>Tournament history</h2><p>Completed tournaments with valid team participation.</p></div></div>
    {!team.tournaments.length ? <div className="empty-state">No tournament history.</div> : <div className="leader-tournaments">{team.tournaments.map(item => <article className="leader-tournament" key={item.sessionId}><div><h3>{item.tournamentName}</h3><p>{item.eventDate ? formatDate(item.eventDate) : "Date unavailable"}{item.location ? ` · ${item.location}` : ""}</p><p>{item.wins} wins · {item.losses} losses · {item.played} played</p></div><button className="button button--outline" onClick={() => onNavigate("leaderboard-tournament", { teamKey: team.teamKey, sessionId: item.sessionId })}>Match history</button></article>)}</div>}
  </>;
  const tournament = team.tournaments.find(item => item.sessionId === route.sessionId);
  if (!tournament) return <div className="empty-state"><h2>Tournament not found</h2><button className="back-link" onClick={() => onNavigate("leaderboard-team", { teamKey: team.teamKey })}>← {team.teamName}</button></div>;
  return <><button className="back-link" onClick={() => onNavigate("leaderboard-team", { teamKey: team.teamKey })}>← {team.teamName}</button><header className="leader-heading"><p>{tournament.eventDate ? formatDate(tournament.eventDate) : "Date unavailable"}{tournament.location ? ` · ${tournament.location}` : ""}</p><h2>{tournament.tournamentName}</h2><p>{team.teamName}: {tournament.wins} wins · {tournament.losses} losses · {tournament.played} played · {percent(tournament.winRate)}</p></header>
    {!tournament.matches.length ? <div className="empty-state">No match history available.</div> : <div className="leader-tournaments">{tournament.matches.map((match, index) => <article className="leader-tournament" key={`${match.matchId}-${index}`}><div><span className={`status-pill ${match.isBye ? "" : "status-pill--done"}`}>{match.isBye ? "Bye" : match.result === "win" ? "Win" : "Loss"}</span><h3>{match.isBye ? "Bye" : `vs ${match.opponentTeamName}`}</h3><p>Round {match.round || "—"} · Match {match.matchNumber || "—"}</p></div></article>)}</div>}
  </>;
}
