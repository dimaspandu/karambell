import { useLayoutEffect, useRef, useState } from "react";
import { getCompetitionProgress } from "../../domain/competitionProgress.js";
import { getParticipant } from "../../domain/competitionModel.js";
import { TOURNAMENT_FORMATS } from "../../domain/tournamentFormats.js";
import { initials, matchRoundName } from "../../shared/presentation/competitionFormatters.js";
import { shouldShowWinnerAction } from "./winnerActionVisibility.js";

function competitorInitials(competition, participant) {
  return !participant ? "" : competition.isTeamCompetition ? participant.name.split(" & ").map(initials).join("&") : initials(participant.name);
}

function MatchCard({ competition, match, isTournamentCompleted, onEditScore, onChooseWinner }) {
  const first = getParticipant(competition, match.participant1Id);
  const second = getParticipant(competition, match.participant2Id);
  const canEdit = Boolean(first && second);
  const playerRow = (player, score, side) => {
    const isWinner = Boolean(player && match.winnerId === player.id);
    const isLoser = Boolean(player && match.winnerId && !isWinner);
    const result = competition.isTeamCompetition
      ? match.status === "bye" ? (isWinner ? "Menang" : player ? "" : "Bye") : match.winnerId ? (isWinner ? "Menang" : "Kalah") : ""
      : score == null ? "–" : score;
    return <div className={`match-player ${isWinner ? "match-player--winner" : ""} ${isLoser ? "match-player--loser" : ""} ${!player ? "match-player--empty" : ""}`} data-bracket-slot={side} key={player?.id || `empty-${side}`}>
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
    data-bracket-round={match.round} data-bracket-index={match.index} data-bracket-match-id={match.id}
    role={!competition.isTeamCompetition && canEdit ? "button" : undefined}
    tabIndex={!competition.isTeamCompetition && canEdit ? 0 : undefined}
    aria-label={!competition.isTeamCompetition && canEdit ? `Update skor ${match.id}` : undefined}
    onClick={edit}
    onKeyDown={event => { if ((event.key === "Enter" || event.key === " ") && !competition.isTeamCompetition && canEdit) { event.preventDefault(); onEditScore(match.id); } }}>
    <div className="match-card__head"><span>{match.id} · {matchRoundName(match.round, competition.totalRounds, match.stage, competition.format)}</span><span>{status}</span></div>
    {playerRow(first, match.score1, 1)}{playerRow(second, match.score2, 2)}
    {competition.isTeamCompetition && shouldShowWinnerAction({ isTournamentCompleted, canEditMatch: canEdit }) && <div className="team-result-actions"><button type="button" onClick={() => onChooseWinner(match.id)}>{match.winnerId ? "Ubah pemenang" : "Tentukan pemenang"}</button></div>}
    {!competition.isTeamCompetition && canEdit && <button className="match-card__edit" type="button" onClick={() => onEditScore(match.id)}>{match.status === "completed" ? "✎ Ubah skor" : "＋ Input skor"}</button>}
  </article>;
}

export function Bracket({ competition, isTournamentCompleted, onEditScore, onChooseWinner }) {
  const rootRef = useRef(null);
  const [paths, setPaths] = useState([]);
  const progress = getCompetitionProgress(competition.matches, competition);
  const champion = progress.championId ? getParticipant(competition, progress.championId) : null;

  useLayoutEffect(() => {
    const supportsProgressionLines = [TOURNAMENT_FORMATS.SINGLE_ELIMINATION, "single", TOURNAMENT_FORMATS.DOUBLE_ELIMINATION, TOURNAMENT_FORMATS.GROUP_KNOCKOUT].includes(competition.format);
    if (!supportsProgressionLines) { setPaths([]); return undefined; }
    const root = rootRef.current;
    if (!root) return undefined;
    const update = () => {
      const rootRect = root.getBoundingClientRect();
      const cards = [...root.querySelectorAll(".match-card[data-bracket-round]")];
      if (!rootRect.width || !rootRect.height || !cards.length) { setPaths([]); return; }
      const byId = new Map(cards.map(card => [card.dataset.bracketMatchId, card]));
      const progressions = competition.progressions?.length
        ? competition.progressions
        : competition.matches.filter(match => match.nextMatchId).map(match => ({ sourceMatchId: match.id, targetMatchId: match.nextMatchId }));
      const finalMatches = competition.format === TOURNAMENT_FORMATS.DOUBLE_ELIMINATION
        ? competition.matches.filter(match => match.stage === "grand_final")
        : competition.matches.filter(match => {
          const finalStage = "main";
          const finalRound = Math.max(0, ...competition.matches.filter(item => item.stage === finalStage).map(item => Number(item.round)));
          return match.stage === finalStage && Number(match.round) === finalRound;
        });
      const edges = [
        ...progressions,
        ...finalMatches.map(match => ({ sourceMatchId: match.id, toChampion: true }))
      ];
      const progressionPaths = edges.flatMap(edge => {
        const source = byId.get(String(edge.sourceMatchId));
        const target = edge.toChampion ? root.querySelector(".champion-card") : byId.get(String(edge.targetMatchId));
        if (!source || !target) return [];
        const from = source.getBoundingClientRect();
        const to = target.getBoundingClientRect();
        const x1 = from.right - rootRect.left;
        const y1 = from.top - rootRect.top + from.height / 2;
        const x2 = to.left - rootRect.left;
        const y2 = to.top - rootRect.top + to.height / 2;
        const midpoint = x1 + (x2 - x1) / 2;
        return [`M ${x1} ${y1} H ${midpoint} V ${y2} H ${x2}`];
      });
      const qualifierPaths = [];
      if (competition.format === TOURNAMENT_FORMATS.GROUP_KNOCKOUT && competition.groups.length) {
        const knockoutMatches = competition.matches.filter(match => match.stage === "main");
        const firstRound = Math.min(...knockoutMatches.map(match => Number(match.round)));
        const firstRoundMatches = knockoutMatches.filter(match => Number(match.round) === firstRound).sort((a, b) => a.index - b.index);
        const groupOrder = [...competition.groups].sort((a, b) => a.groupNumber - b.groupNumber);
        groupOrder.forEach((group, groupIndex) => {
          const pairStart = Math.floor(groupIndex / 2) * 2;
          const topMatchIndex = pairStart + (groupIndex % 2);
          const runnerUpMatchIndex = pairStart + (groupIndex % 2 ? 0 : 1);
          for (const [rank, matchIndex, slot] of [[1, topMatchIndex, 1], [2, runnerUpMatchIndex, groupIndex % 2 ? 2 : 2]]) {
            const source = [...root.querySelectorAll("[data-bracket-qualifier-rank]")].find(anchor => anchor.dataset.bracketGroupId === group.id && Number(anchor.dataset.bracketQualifierRank) === rank);
            const target = byId.get(firstRoundMatches[matchIndex]?.id)?.querySelector(`[data-bracket-slot="${slot}"]`);
            if (!source || !target) continue;
            const from = source.getBoundingClientRect();
            const to = target.getBoundingClientRect();
            const x1 = from.right - rootRect.left;
            const y1 = from.top - rootRect.top + from.height / 2;
            const x2 = to.left - rootRect.left;
            const y2 = to.top - rootRect.top + to.height / 2;
            const midpoint = x1 + (x2 - x1) / 2;
            if (groupIndex === 0 && groupOrder.length > 1) {
              // Group A sits before the other group columns, so a direct route
              // would be hidden behind their match cards. Take the clear top gutter.
              const gutterY = 5 + (rank - 1) * 4;
              qualifierPaths.push(`M ${x1} ${y1} V ${gutterY} H ${x2} V ${y2}`);
            } else {
              qualifierPaths.push(`M ${x1} ${y1} H ${midpoint} V ${y2} H ${x2}`);
            }
          }
        });
      }
      setPaths([...progressionPaths, ...qualifierPaths]);
    };
    const observer = window.ResizeObserver ? new ResizeObserver(update) : null;
    observer?.observe(root);
    root.querySelectorAll(".match-card, .champion-card").forEach(element => observer?.observe(element));
    window.addEventListener("resize", update, { passive: true });
    update();
    return () => { observer?.disconnect(); window.removeEventListener("resize", update); };
  }, [competition]);

  const sortedRounds = (matches, prefix) => {
    const rounds = [...new Set(matches.map(match => match.round))].sort((a, b) => a - b);
    const totalRounds = rounds.at(-1) || 0;
    return rounds.map(round => ({ key: `${prefix}-${round}`, title: matchRoundName(round, competition.format === TOURNAMENT_FORMATS.GROUP_KNOCKOUT && matches[0]?.stage === "main" ? totalRounds : competition.totalRounds, matches[0]?.stage, competition.format), matches: matches.filter(match => match.round === round).sort((a, b) => a.index - b.index) }));
  };
  let columns;
  if (competition.format === TOURNAMENT_FORMATS.DOUBLE_ELIMINATION) {
    columns = [
      ...sortedRounds(competition.matches.filter(match => match.stage === "winners"), "winners"),
      ...sortedRounds(competition.matches.filter(match => match.stage === "losers"), "losers"),
      ...sortedRounds(competition.matches.filter(match => match.stage === "grand_final"), "grand-final")
    ];
  } else if (competition.format === TOURNAMENT_FORMATS.GROUP_KNOCKOUT) {
    columns = [
      ...competition.groups.map(group => ({ key: `group-${group.id}`, group, title: group.name, matches: competition.matches.filter(match => match.stage === "group" && match.groupId === group.id).sort((a, b) => a.round - b.round || a.index - b.index) })),
      ...sortedRounds(competition.matches.filter(match => match.stage === "main"), "knockout")
    ];
  } else if (competition.format === TOURNAMENT_FORMATS.ROUND_ROBIN) {
    columns = sortedRounds(competition.matches, "round-robin").map(column => ({ ...column, title: column.title.replace("Ronde", "Hari") }));
  } else {
    columns = sortedRounds(competition.matches, "single");
  }
  return <div className="bracket" ref={rootRef}>
    {[TOURNAMENT_FORMATS.SINGLE_ELIMINATION, "single", TOURNAMENT_FORMATS.DOUBLE_ELIMINATION, TOURNAMENT_FORMATS.GROUP_KNOCKOUT].includes(competition.format) && <svg className="bracket__connectors" aria-hidden="true" width="100%" height="100%"><g>{paths.map((path, index) => <path d={path} key={index}/>)}</g></svg>}
    {columns.map((column, index) => {
      const isGroupColumn = Boolean(column.group);
      const knockoutRounds = competition.format === TOURNAMENT_FORMATS.GROUP_KNOCKOUT
        ? [...new Set(competition.matches.filter(match => match.stage === "main").map(match => Number(match.round)))].sort((a, b) => a - b)
        : [];
      const roundClass = competition.format === TOURNAMENT_FORMATS.ROUND_ROBIN || isGroupColumn
        ? "schedule"
        : competition.format === TOURNAMENT_FORMATS.GROUP_KNOCKOUT
          ? Number(column.matches[0]?.round) === knockoutRounds[0] ? "r1" : Number(column.matches[0]?.round) === knockoutRounds.at(-1) ? "r3" : "r2"
          : index === 0 ? "r1" : index === columns.length - 1 ? "r3" : "r2";
      return <section className={`bracket__round bracket__round--${roundClass}`} aria-label={column.title} key={column.key}>
        <h4 className="bracket__round-title">{column.title}</h4>
        {column.matches.map(match => <MatchCard key={match.id} competition={competition} match={match} isTournamentCompleted={isTournamentCompleted} onEditScore={onEditScore} onChooseWinner={onChooseWinner}/>) }
        {column.group && <div className="bracket-qualifiers" aria-label={`${column.group.name} qualifiers`}>
          <span data-bracket-qualifier-rank="1" data-bracket-group-id={column.group.id}><strong>1</strong> Peringkat 1</span>
          <span data-bracket-qualifier-rank="2" data-bracket-group-id={column.group.id}><strong>2</strong> Peringkat 2</span>
          <small>Lolos ke knockout</small>
        </div>}
      </section>;
    })}
    <section className="bracket__round bracket__round--champion"><h4 className="bracket__round-title">Juara</h4><div className="champion-card">
      <div className="champion-card__crown">♛</div><div className="champion-card__avatar">{champion ? competitorInitials(competition, champion) : "?"}</div>
      <strong>{champion?.name || "Belum ada"}</strong><p>{champion ? "Juara kompetisi" : "Menunggu final"}</p>
    </div></section>
  </div>;
}
