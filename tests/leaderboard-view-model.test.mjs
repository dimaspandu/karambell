import test from "node:test";
import assert from "node:assert/strict";
import { createLeaderboardData } from "../src/domain/leaderboard.js";
import { initialLeaderboardState, leaderboardStateReducer, selectLeaderboardPage } from "../src/features/leaderboard/leaderboardViewModel.js";

const data = createLeaderboardData([{
  session: { session_id: "cup-1", name: "Cup", event_date: "2026-10-12", status: "completed", format: "team_single_elimination" },
  participants: [{ participant_id: "a", name: "Dedi & Dimas" }, { participant_id: "b", name: "Andi & Budi" }],
  matches: [{ match_id: "m1", round: 1, match_number: 1, participant1_id: "a", participant2_id: "b", winner_id: "a", status: "completed" }]
}]);

test("view state moves from loading to successful route-specific data", () => {
  let state = leaderboardStateReducer(initialLeaderboardState, { type: "load-start", requestId: 1 });
  assert.equal(selectLeaderboardPage(state, { name: "leaderboard" }).type, "loading");
  state = leaderboardStateReducer(state, { type: "load-success", requestId: 1, data });
  assert.equal(selectLeaderboardPage(state, { name: "leaderboard" }).teams.length, 2);
  assert.equal(selectLeaderboardPage(state, { name: "leaderboard-team", teamKey: "dedi|dimas" }).team.wins, 1);
  assert.equal(selectLeaderboardPage(state, { name: "leaderboard-tournament", teamKey: "dedi|dimas", sessionId: "cup-1" }).tournament.tournamentName, "Cup");
});

test("view state exposes errors and supports a retry transition", () => {
  let state = leaderboardStateReducer(initialLeaderboardState, { type: "load-start", requestId: 1 });
  state = leaderboardStateReducer(state, { type: "load-error", requestId: 1, error: new Error("Provider unavailable") });
  assert.deepEqual(selectLeaderboardPage(state, { name: "leaderboard" }), { type: "error", message: "Provider unavailable" });
  state = leaderboardStateReducer(state, { type: "load-start", requestId: 2 });
  assert.equal(selectLeaderboardPage(state, { name: "leaderboard" }).type, "loading");
  state = leaderboardStateReducer(state, { type: "load-success", requestId: 2, data });
  assert.equal(selectLeaderboardPage(state, { name: "leaderboard" }).type, "leaderboard");
});

test("invalid selections return not-found pages and route changes select fresh details", () => {
  let state = leaderboardStateReducer(initialLeaderboardState, { type: "load-start", requestId: 1 });
  state = leaderboardStateReducer(state, { type: "load-success", requestId: 1, data });
  assert.equal(selectLeaderboardPage(state, { name: "leaderboard-team", teamKey: "missing" }).type, "not-found");
  assert.equal(selectLeaderboardPage(state, { name: "leaderboard-tournament", teamKey: "dedi|dimas", sessionId: "missing" }).type, "not-found");
  assert.equal(selectLeaderboardPage(state, { name: "leaderboard-team", teamKey: "dedi|dimas" }).team.teamKey, "dedi|dimas");
  assert.equal(selectLeaderboardPage(state, { name: "leaderboard-team", teamKey: "andi|budi" }).team.teamKey, "andi|budi");
});

test("late responses from an older request cannot overwrite the current state", () => {
  let state = leaderboardStateReducer(initialLeaderboardState, { type: "load-start", requestId: 1 });
  state = leaderboardStateReducer(state, { type: "load-start", requestId: 2 });
  const current = state;
  state = leaderboardStateReducer(state, { type: "load-success", requestId: 1, data });
  assert.equal(state, current);
  state = leaderboardStateReducer(state, { type: "load-success", requestId: 2, data });
  assert.equal(state.status, "success");
});
