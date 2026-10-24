import test from "node:test";
import assert from "node:assert/strict";
import { buildTournamentPlan } from "../src/domain/tournamentGenerator.js";
import { TOURNAMENT_FORMATS } from "../src/domain/tournamentFormats.js";
import { getTournamentStandings } from "../src/domain/tournamentStandings.js";

test("double-elimination plans advance the final losers round to the grand final", () => {
  for (const teamCount of [4, 8]) {
    const teams = Array.from({ length: teamCount }, (_, index) => ({ id: `team-${index + 1}` }));
    const participants = teams.map((team, index) => ({ id: `participant-${index + 1}`, team_id: team.id }));

    const plan = buildTournamentPlan({
      format: TOURNAMENT_FORMATS.DOUBLE_ELIMINATION,
      teams,
      participants
    });
    const matchKeys = new Set(plan.matches.map(match => match.key));

    assert.ok(plan.matches.some(match => match.stage === "grand_final"));
    assert.ok(plan.progressions.every(edge => matchKeys.has(edge.sourceKey) && matchKeys.has(edge.targetKey)));
    const finalWinnersMatch = plan.matches.filter(match => match.stage === "winners").sort((a, b) => b.round - a.round)[0];
    const lastLosersRound = Math.max(...plan.matches.filter(match => match.stage === "losers").map(match => match.round));
    const finalDrop = plan.progressions.find(edge => edge.sourceKey === finalWinnersMatch.key && edge.source_outcome === "loser");
    assert.ok(finalDrop, "the winners-bracket finalist must drop into the losers bracket");
    assert.equal(plan.matches.find(match => match.key === finalDrop.targetKey).round, lastLosersRound);
    assert.equal(finalDrop.target_slot, 2);
    assert.equal(plan.progressions.filter(edge => {
      const source = plan.matches.find(match => match.key === edge.sourceKey);
      return source.stage === "losers" && !plan.matches.some(match => match.key === edge.targetKey && match.stage === "losers");
    }).length, 1);
  }
});

test("round-robin fixtures are grouped by numbered rounds without calendar dates", () => {
  const teams = Array.from({ length: 5 }, (_, index) => ({ id: `team-${index + 1}` }));
  const participants = teams.map((team, index) => ({ id: `participant-${index + 1}`, team_id: team.id }));
  const plan = buildTournamentPlan({ format: TOURNAMENT_FORMATS.ROUND_ROBIN, teams, participants });
  const rounds = [...new Set(plan.matches.map(match => match.round))].sort((a, b) => a - b);
  assert.deepEqual(rounds, [1, 2, 3, 4, 5]);
  assert.ok(plan.matches.every(match => Number.isInteger(match.round) && !("date" in match) && !("day" in match)));
  assert.equal(new Set(plan.matches.map(match => match.key)).size, plan.matches.length);
});

test("round-robin standings follow valid results when a winner changes", () => {
  const participants = [{ id: "p1", name: "A", seed: 1 }, { id: "p2", name: "B", seed: 2 }, { id: "p3", name: "C", seed: 3 }];
  const matches = [
    { id: "m1", stage: "main", round: 1, status: "completed", participant1Id: "p1", participant2Id: "p2", winnerId: "p1" },
    { id: "m2", stage: "main", round: 2, status: "pending", participant1Id: "p2", participant2Id: "p3", winnerId: null }
  ];
  const standings = () => getTournamentStandings({ matches, participants, stage: "main" });
  assert.equal(standings()[0].id, "p1");
  matches[0].winnerId = "p2";
  assert.equal(standings()[0].id, "p2");
  assert.deepEqual(standings().map(row => row.played).sort((a, b) => b - a), [1, 1, 0]);
});
