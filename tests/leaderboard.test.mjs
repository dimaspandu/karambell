import test from "node:test";
import assert from "node:assert/strict";
import { createLeaderboardData, normalizeTeamName } from "../src/domain/leaderboard.js";

const session = (id, status = "completed") => ({ session: { session_id: id, name: `Cup ${id}`, event_date: "2026-10-12", status, format: "team_single_elimination" }, participants: [
  { participant_id: "a", name: " Dedi  & Dimas " }, { participant_id: "b", name: "Andi & Budi" }
], matches: [{ match_id: `m-${id}`, round: 1, match_number: 1, participant1_id: "a", participant2_id: "b", winner_id: "a", status: "completed", score1: 1, score2: 0 }] });

test("normalizes unordered names and rejects malformed identities", () => {
  assert.equal(normalizeTeamName(" Dimas &  DEDI ").teamKey, "dedi|dimas");
  assert.equal(normalizeTeamName("Dedi & "), null);
  assert.equal(normalizeTeamName("A & B & C"), null);
});

test("aggregates team identity across sessions and creates ordered match history", () => {
  const second = session("2");
  second.participants[0].name = "DIMAS & DEDI";
  second.participants[0].participant_id = "new-id";
  second.matches[0].participant1_id = "new-id";
  second.matches[0].winner_id = "new-id";
  const data = createLeaderboardData([session("1"), second]);
  const team = data.getTeam("dedi|dimas");
  assert.equal(data.leaderboard.length, 2);
  assert.equal(team.wins, 2);
  assert.equal(team.tournamentsPlayed, 2);
  assert.equal(team.tournaments[0].matches[0].opponentTeamName, "Andi & Budi");
  assert.equal(team.tournaments[0].matches[0].score1, null);
});

test("excludes pending and noncompleted tournaments while keeping bye participation", () => {
  const pending = session("pending"); pending.session.status = "in_progress";
  const bye = { session: { session_id: "bye", name: "Bye cup", status: "completed", format: "team_single_elimination" }, participants: [{ participant_id: "a", name: "Dedi & Dimas" }], matches: [{ match_id: "bye-match", participant1_id: "a", participant2_id: null, winner_id: "a", status: "bye", round: 1, match_number: 1 }] };
  const data = createLeaderboardData([pending, bye]);
  const team = data.getTeam("dedi|dimas");
  assert.equal(data.leaderboard.length, 1);
  assert.equal(team.played, 0);
  assert.equal(team.tournamentsPlayed, 1);
  assert.equal(team.tournaments[0].matches[0].isBye, true);
});

test("ranks using unrounded win rate then deterministic identity", () => {
  const a = session("a");
  a.participants = [{ participant_id: "x", name: "A & One" }, { participant_id: "y", name: "B & Two" }];
  a.matches = [{ match_id: "a1", participant1_id: "x", participant2_id: "y", winner_id: "x", status: "completed" }];
  const b = session("b");
  b.participants = [{ participant_id: "x", name: "C & One" }, { participant_id: "y", name: "D & Two" }];
  b.matches = [{ match_id: "b1", participant1_id: "x", participant2_id: "y", winner_id: "y", status: "completed" }];
  const data = createLeaderboardData([a, b]);
  assert.equal(data.leaderboard[0].teamKey, "a|one");
  assert.equal(data.leaderboard.at(-1).teamKey, "c|one");
});
