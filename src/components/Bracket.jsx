import { useLayoutEffect, useRef, useState } from "react";
import { getCompetitionProgress } from "../domain/competitionProgress.js";
import { getParticipant, initials, matchRoundName } from "../domain/competitionModel.js";

function competitorInitials(competition, participant) {
  return !participant ? "" : competition.isTeamCompetition ? participant.name.split(" & ").map(initials).join("&") : initials(participant.name);
}

function MatchCard({ competition, match, onEditScore, onChooseWinner }) {
  const first = getParticipant(competition, match.participant1Id);
  const second = getParticipant(competition, match.participant2Id);
  const canEdit = Boolean(first && second);
  const playerRow = (player, score, side) => {
    const isWinner = Boolean(player && match.winnerId === player.id);
    const isLoser = Boolean(player && match.winnerId && !isWinner);
    const result = competition.isTeamCompetition
      ? match.status === "bye" ? (isWinner ? "Menang" : player ? "" : "Bye") : match.winnerId ? (isWinner ? "Menang" : "Kalah") : ""
      : score == null ? "–" : score;
    return <div className={`match-player ${isWinner ? "match-player--winner" : ""} ${isLoser ? "match-player--loser" : ""} ${!player ? "match-player--empty" : ""}`} key={player?.id || `empty-${side}`}>
      <span className="match-player__avatar">{player ? competitorInitials(competition, player) : "—"}</span>
      <span className="match-player__name">{player?.name || (match.status === "bye" ? "Bye" : "Menunggu")}</span>
      <span className={`match-player__score ${competition.isTeamCompetition && result ? "match-player__result" : ""}`}>{result}</span>
      {isWinner && <span className="match-player__win" aria-label="Pemenang">✓</span>}
    </div>;
  };
  const status = match.status === "completed" ? "Selesai" : match.status === "bye" ? "Bye" : canEdit ? "Belum dimainkan" : "Menunggu";
  const edit = event => {
    if (!competition.isTeamCompetition && canEdit && !event.target.closest("button")) onEditScore(match.id);
  };
  return <article className={`match-card ${competition.isTeamCompetition ? "match-card--teams" : "match-card--clickable"}`}
    data-bracket-round={match.round} data-bracket-index={match.index}
    role={!competition.isTeamCompetition && canEdit ? "button" : undefined}
    tabIndex={!competition.isTeamCompetition && canEdit ? 0 : undefined}
    aria-label={!competition.isTeamCompetition && canEdit ? `Update skor ${match.id}` : undefined}
    onClick={edit}
    onKeyDown={event => { if ((event.key === "Enter" || event.key === " ") && !competition.isTeamCompetition && canEdit) { event.preventDefault(); onEditScore(match.id); } }}>
    <div className="match-card__head"><span>{match.id} · {matchRoundName(match.round, competition.totalRounds)}</span><span>{status}</span></div>
    {playerRow(first, match.score1, 1)}{playerRow(second, match.score2, 2)}
    {competition.isTeamCompetition && canEdit && <div className="team-result-actions"><button type="button" onClick={() => onChooseWinner(match.id)}>{match.winnerId ? "Ubah pemenang" : "Tentukan pemenang"}</button></div>}
    {!competition.isTeamCompetition && canEdit && <button className="match-card__edit" type="button" onClick={() => onEditScore(match.id)}>{match.status === "completed" ? "✎ Ubah skor" : "＋ Input skor"}</button>}
  </article>;
}

export function Bracket({ competition, onEditScore, onChooseWinner }) {
  const rootRef = useRef(null);
  const [paths, setPaths] = useState([]);
  const progress = getCompetitionProgress(competition.matches);
  const champion = progress.championId ? getParticipant(competition, progress.championId) : null;

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const update = () => {
      const rootRect = root.getBoundingClientRect();
      const cards = [...root.querySelectorAll(".match-card[data-bracket-round]")];
      if (!rootRect.width || !rootRect.height || !cards.length) { setPaths([]); return; }
      const byPosition = new Map(cards.map(card => [`${card.dataset.bracketRound}:${card.dataset.bracketIndex}`, card]));
      const finalRound = Math.max(...cards.map(card => Number(card.dataset.bracketRound)));
      const championCard = root.querySelector(".champion-card");
      setPaths(cards.flatMap(card => {
        const round = Number(card.dataset.bracketRound);
        const index = Number(card.dataset.bracketIndex);
        const target = byPosition.get(`${round + 1}:${Math.floor(index / 2)}`) || (round === finalRound ? championCard : null);
        if (!target) return [];
        const from = card.getBoundingClientRect();
        const to = target.getBoundingClientRect();
        const x1 = from.right - rootRect.left;
        const y1 = from.top - rootRect.top + from.height / 2;
        const x2 = to.left - rootRect.left;
        const y2 = to.top - rootRect.top + to.height / 2;
        const midpoint = x1 + (x2 - x1) / 2;
        return [`M ${x1} ${y1} H ${midpoint} V ${y2} H ${x2}`];
      }));
    };
    const observer = window.ResizeObserver ? new ResizeObserver(update) : null;
    observer?.observe(root);
    root.querySelectorAll(".match-card, .champion-card").forEach(element => observer?.observe(element));
    window.addEventListener("resize", update, { passive: true });
    update();
    return () => { observer?.disconnect(); window.removeEventListener("resize", update); };
  }, [competition]);

  const rounds = Array.from({ length: competition.totalRounds }, (_, index) => index + 1);
  return <div className="bracket" ref={rootRef}>
    <svg className="bracket__connectors" aria-hidden="true" width="100%" height="100%"><g>{paths.map((path, index) => <path d={path} key={index}/>)}</g></svg>
    {rounds.map(round => {
      const matches = competition.matches.filter(match => match.round === round).sort((a, b) => a.index - b.index);
      const roundClass = round === 1 ? "r1" : round === competition.totalRounds ? "r3" : "r2";
      return <section className={`bracket__round bracket__round--${roundClass}`} aria-label={matchRoundName(round, competition.totalRounds)} key={round}>
        <h4 className="bracket__round-title">{matchRoundName(round, competition.totalRounds)}</h4>
        {matches.map(match => <MatchCard key={match.id} competition={competition} match={match} onEditScore={onEditScore} onChooseWinner={onChooseWinner}/>) }
      </section>;
    })}
    <section className="bracket__round bracket__round--champion"><h4 className="bracket__round-title">Juara</h4><div className="champion-card">
      <div className="champion-card__crown">♛</div><div className="champion-card__avatar">{champion ? competitorInitials(competition, champion) : "?"}</div>
      <strong>{champion?.name || "Belum ada"}</strong><p>{champion ? "Juara kompetisi" : "Menunggu final"}</p>
    </div></section>
  </div>;
}
