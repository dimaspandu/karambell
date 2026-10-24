import test from "node:test";
import assert from "node:assert/strict";
import { getDownstreamMatchPath, validateMatchScore, validateMatchWinner } from "../src/domain/matchRules.js";

const competition = overrides => ({
  id: "session-1",
  status: "in_progress",
  isTeamCompetition: false,
  participants: [{ id: "p1", name: "One" }, { id: "p2", name: "Two" }],
  matches: [
    { id: "m1", round: 1, participant1Id: "p1", participant2Id: "p2", status: "pending", score1: null, score2: null, winnerId: null, nextMatchId: "m2", nextSlot: "participant1" },
    { id: "m2", round: 2, participant1Id: null, participant2Id: "p3", status: "pending", score1: null, score2: null, winnerId: null, nextMatchId: null, nextSlot: null }
  ],
  ...overrides
});

test("score results use the higher score and accept bounded integer scores, including zero", () => {
  assert.equal(validateMatchScore({ competition: competition({}), matchId: "m1", score1: 0, score2: 1 }).winnerId, "p2");
  assert.equal(validateMatchScore({ competition: competition({}), matchId: "m1", score1: 999, score2: 3 }).winnerId, "p1");
});

test("score validation rejects ties, decimals, out-of-range values and incomplete matches", () => {
  for (const scores of [[2, 2], [1.5, 2], [-1, 2], [1000, 2]]) {
    assert.equal(validateMatchScore({ competition: competition({}), matchId: "m1", score1: scores[0], score2: scores[1] }).valid, false);
  }
  assert.equal(validateMatchScore({ competition: competition({}), matchId: "m404", score1: 1, score2: 0 }).valid, false);
  const noOpponent = competition({ matches: [{ id: "m1", participant1Id: "p1", participant2Id: null, status: "bye" }] });
  assert.equal(validateMatchScore({ competition: noOpponent, matchId: "m1", score1: 1, score2: 0 }).valid, false);
  const bye = competition({ matches: [{ id: "m1", participant1Id: "p1", participant2Id: null, status: "bye" }] });
  assert.equal(validateMatchScore({ competition: bye, matchId: "m1", score1: 1, score2: 0 }).valid, false);
});

test("manual winner must be one of the match participants", () => {
  assert.equal(validateMatchWinner({ competition: competition({}), matchId: "m1", winnerId: "p2" }).valid, true);
  assert.equal(validateMatchWinner({ competition: competition({}), matchId: "m1", winnerId: "p3" }).valid, false);
});

test("downstream references resolve in slot order and reject missing, invalid or cyclic links", () => {
  assert.deepEqual(getDownstreamMatchPath(competition({}), "m1"), [{ matchId: "m2", slot: "participant1" }]);
  assert.throws(() => getDownstreamMatchPath(competition({ matches: [{ id: "m1", nextMatchId: "missing", nextSlot: "participant1" }] }), "m1"), /not found/i);
  assert.throws(() => getDownstreamMatchPath(competition({ matches: [{ id: "m1", nextMatchId: "m2", nextSlot: "invalid" }, { id: "m2" }] }), "m1"), /slot/i);
  assert.throws(() => getDownstreamMatchPath(competition({ matches: [{ id: "m1", nextMatchId: "m2", nextSlot: "participant1" }, { id: "m2", nextMatchId: "m1", nextSlot: "participant2" }] }), "m1"), /cycle/i);
});
