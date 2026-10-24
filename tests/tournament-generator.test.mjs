import test from "node:test";
import assert from "node:assert/strict";
import { buildTournamentPlan } from "../src/domain/tournamentGenerator.js";
import { TOURNAMENT_FORMATS } from "../src/domain/tournamentFormats.js";

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
