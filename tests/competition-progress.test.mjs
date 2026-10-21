import test from "node:test";
import assert from "node:assert/strict";
import { getCompetitionProgress } from "../js/data/competition-progress.js";

test("counts bye matches as decided and reports a complete competition", () => {
  const progress = getCompetitionProgress([
    { round: 1, status: "bye", winnerId: "team-1" },
    { round: 1, status: "completed", winnerId: "team-2" },
    { round: 2, status: "completed", winnerId: "team-1" }
  ]);

  assert.equal(progress.completedMatches, 3);
  assert.equal(progress.totalMatches, 3);
  assert.equal(progress.progress, 100);
  assert.equal(progress.status, "completed");
  assert.equal(progress.championId, "team-1");
});

test("a decided final with all matches decided completes the competition", () => {
  const progress = getCompetitionProgress([
    { round: 1, status: "completed", winnerId: "team-1" },
    { round: 1, status: "completed", winnerId: "team-3" },
    { round: 2, status: "completed", winnerId: "team-3" }
  ]);

  assert.equal(progress.isComplete, true);
  assert.equal(progress.championId, "team-3");
  assert.equal(progress.progress, 100);
});

test("a pending final keeps the competition in progress", () => {
  const progress = getCompetitionProgress([
    { round: 1, status: "completed", winnerId: "team-1" },
    { round: 1, status: "completed", winnerId: "team-3" },
    { round: 2, status: "pending", winnerId: null }
  ]);

  assert.equal(progress.status, "in_progress");
  assert.equal(progress.isComplete, false);
  assert.equal(progress.completedMatches, 2);
  assert.equal(progress.progress, 67);
  assert.equal(progress.championId, null);
});

test("any remaining pending match prevents completion even if the final has a winner", () => {
  const progress = getCompetitionProgress([
    { round: 1, status: "pending", winnerId: null },
    { round: 1, status: "completed", winnerId: "team-3" },
    { round: 2, status: "completed", winnerId: "team-3" }
  ]);

  assert.equal(progress.status, "in_progress");
  assert.equal(progress.completedMatches, 2);
  assert.equal(progress.progress, 67);
  assert.equal(progress.championId, null);
});
