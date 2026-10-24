import test from "node:test";
import assert from "node:assert/strict";
import { createCompetitionRepository } from "../src/repositories/competitionRepository.js";

const competition = {
  id: "session-1", name: "Cup", format: "single", isTeamCompetition: false, status: "in_progress",
  participants: [{ id: "p1", name: "One" }, { id: "p2", name: "Two" }, { id: "p3", name: "Three" }],
  matches: [
    { id: "m1", round: 1, index: 0, participant1Id: "p1", participant2Id: "p2", winnerId: null, status: "pending", score1: null, score2: null, nextMatchId: "m2", nextSlot: "participant1" },
    { id: "m2", round: 2, index: 0, participant1Id: null, participant2Id: "p3", winnerId: null, status: "pending", score1: null, score2: null, nextMatchId: null, nextSlot: null }
  ], totalRounds: 2
};

function response({ winner = "p2", score1 = 0, score2 = 2 } = {}) {
  return {
    session: { session_id: "session-1", name: "Cup", format: "single_elimination", status: "in_progress" },
    participants: [{ participant_id: "p1", name: "One" }, { participant_id: "p2", name: "Two" }, { participant_id: "p3", name: "Three" }],
    matches: [
      { match_id: "m1", round: 1, match_number: 1, participant1_id: "p1", participant2_id: "p2", winner_id: winner, status: "completed", score1, score2, next_match_id: "m2", next_slot: "participant1" },
      { match_id: "m2", round: 2, match_number: 1, participant1_id: winner, participant2_id: "p3", winner_id: "", status: "pending", next_match_id: "", next_slot: "" }
    ]
  };
}

function makeRepository(overrides = {}) {
  const calls = [];
  const provider = {
    listCompetitions: async () => [], listLeaderboardCompetitions: async () => [], getCompetition: async () => response(), createCompetition: async () => response(),
    addPlayer: async () => response(),
    recordMatchScore: async input => { calls.push({ operation: "score", input }); return response({ score1: input.score1, score2: input.score2 }); },
    recordMatchWinner: async input => { calls.push({ operation: "winner", input }); return response({ winner: input.winnerId, score1: 1, score2: 0 }); },
    ...overrides
  };
  return { repository: createCompetitionRepository({ provider }), calls };
}

test("repository maps score mutations to provider-neutral operations and returns normalized competition data", async () => {
  const { repository, calls } = makeRepository();
  const result = await repository.recordMatchScore({ competition, matchId: "m1", score1: 0, score2: 2 });
  assert.deepEqual(calls, [{ operation: "score", input: { sessionId: "session-1", matchId: "m1", score1: 0, score2: 2 } }]);
  assert.equal(result.matches[0].winnerId, "p2");
  assert.equal(result.matches[1].participant1Id, "p2");
});

test("repository maps manual winner selection without converting it into an application score", async () => {
  const { repository, calls } = makeRepository();
  const result = await repository.recordMatchWinner({ competition, matchId: "m1", winnerId: "p1" });
  assert.deepEqual(calls, [{ operation: "winner", input: { sessionId: "session-1", matchId: "m1", winnerId: "p1", participant1Id: "p1", participant2Id: "p2" } }]);
  assert.equal(result.matches[0].winnerId, "p1");
});

test("repository rejects invalid score, winner, and downstream links before persistence", async () => {
  const { repository, calls } = makeRepository();
  await assert.rejects(repository.recordMatchScore({ competition, matchId: "m1", score1: 2, score2: 2 }), error => error.code === "MATCH_VALIDATION");
  await assert.rejects(repository.recordMatchWinner({ competition, matchId: "m1", winnerId: "p3" }), error => error.code === "MATCH_VALIDATION");
  const invalidBracket = { ...competition, matches: [{ ...competition.matches[0], nextMatchId: "missing" }] };
  await assert.rejects(repository.recordMatchScore({ competition: invalidBracket, matchId: "m1", score1: 1, score2: 0 }), error => error.code === "MATCH_VALIDATION");
  assert.deepEqual(calls, []);
});

test("repository preserves provider partial-write and refresh failure classifications", async () => {
  const partial = makeRepository({ recordMatchScore: async () => { const error = new Error("partial"); error.code = "PARTIAL_MATCH_MUTATION"; throw error; } }).repository;
  await assert.rejects(partial.recordMatchScore({ competition, matchId: "m1", score1: 0, score2: 1 }), error => error.code === "PARTIAL_MATCH_MUTATION");
  const refresh = makeRepository({ recordMatchWinner: async () => { const error = new Error("refresh"); error.code = "MATCH_REFRESH_FAILED"; throw error; } }).repository;
  await assert.rejects(refresh.recordMatchWinner({ competition, matchId: "m1", winnerId: "p2" }), error => error.code === "MATCH_REFRESH_FAILED");
});
