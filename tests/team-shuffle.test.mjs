import test from "node:test";
import assert from "node:assert/strict";
import { generateTeamShuffleCandidates, getEligibleShuffleTeams, validateTeamShuffleCandidate } from "../src/domain/teamShuffle.js";
import { createSupabaseProvider } from "../src/providers/supabase.js";

const team = (teamId, participantId, playerIds, names = playerIds) => ({
  id: participantId, participantId, sourceId: teamId, sourceType: "team", name: names.join(" & "),
  members: playerIds.map((playerId, index) => ({ playerId, name: names[index], position: index + 1 }))
});
const match = (id, first, second, fields = {}) => ({ id, round: 1, participant1Id: first, participant2Id: second, status: "pending", winnerId: null, score1: null, score2: null, ...fields });
const makeCompetition = (format = "round_robin") => ({
  id: "session-1", format, status: "in_progress", isTeamCompetition: true,
  participants: [team("t1", "cp1", ["p1", "p2"], ["Untoro", "Lena"]), team("t2", "cp2", ["p3", "p4"], ["Rara", "Bastian"]), team("t3", "cp3", ["p5", "p6"])],
  matches: [match("m1", "cp1", "cp2"), match("m2", "cp1", "cp3", { round: 2 })],
  groups: []
});

test("generates alternative player combinations without touching matches", () => {
  const competition = makeCompetition();
  const matchesBefore = structuredClone(competition.matches);
  const participantsBefore = structuredClone(competition.participants);
  const result = generateTeamShuffleCandidates(competition);
  assert.equal(result.valid, true);
  assert.equal(result.candidates.length, 6);
  const candidate = result.candidates[0];
  assert.ok(candidate.assignments.length >= 2 && candidate.assignments.length <= 4);
  assert.equal(new Set(candidate.assignments.map(item => item.playerId)).size, candidate.assignments.length);
  assert.equal(new Set(candidate.assignments.map(item => item.fromTeamId)).size, 2);
  assert.equal(new Set(candidate.assignments.map(item => item.toTeamId)).size, 2);
  assert.ok(candidate.assignments.every(item => item.fromTeamId !== item.toTeamId));
  assert.deepEqual(competition.matches, matchesBefore);
  assert.deepEqual(competition.participants, participantsBefore);
});

test("preserves two-player team capacities and accepts only registered unique players", () => {
  const competition = makeCompetition();
  const candidate = generateTeamShuffleCandidates(competition).candidates[0];
  assert.equal(validateTeamShuffleCandidate(competition, candidate.assignments).valid, true);
  assert.equal(validateTeamShuffleCandidate(competition, candidate.assignments.map((item, i) => i ? item : { ...item, playerId: "foreign-player" })).valid, false);
  assert.equal(validateTeamShuffleCandidate(competition, candidate.assignments.map(item => ({ ...item, toTeamId: "t3" }))).valid, false);
  assert.equal(validateTeamShuffleCandidate(competition, candidate.assignments.map(item => ({ ...item, playerId: "p1" }))).valid, false);
});

test("protects teams with completed, in-progress, bye, score, or winner data", () => {
  for (const protectedMatch of [
    { status: "completed", winnerId: "cp1" },
    { status: "in_progress" },
    { status: "bye", winnerId: "cp1" },
    { status: "pending", score1: 0 },
    { status: "pending", winnerId: "cp2" }
  ]) {
    const competition = makeCompetition();
    competition.matches = [match("protected", "cp1", "cp3", { ...protectedMatch })];
    const eligible = getEligibleShuffleTeams(competition);
    assert.equal(eligible.valid, false);
    assert.match(eligible.reason, /dua tim yang belum memiliki hasil/);
  }
});

test("format support is explicit and safe for all existing team tournament formats", () => {
  for (const format of ["single", "single_elimination", "double_elimination", "round_robin", "group_knockout"]) {
    assert.equal(generateTeamShuffleCandidates(makeCompetition(format)).valid, true, format);
  }
  assert.equal(generateTeamShuffleCandidates({ ...makeCompetition(), isTeamCompetition: false }).valid, false);
  assert.equal(generateTeamShuffleCandidates({ ...makeCompetition(), status: "completed" }).valid, false);
});

test("repeated shuffle choices produce different valid combinations and no-op choices are absent", () => {
  const result = generateTeamShuffleCandidates(makeCompetition());
  const firstTwo = result.candidates.filter(candidate => candidate.teams.map(item => item.teamId).join(":") === "t1:t2");
  assert.equal(firstTwo.length, 2);
  assert.notDeepEqual(firstTwo[0].teams.map(item => item.proposedMembers.map(member => member.playerId)), firstTwo[1].teams.map(item => item.proposedMembers.map(member => member.playerId)));
  assert.ok(result.candidates.every(candidate => candidate.teams.every(item => item.currentMembers.map(member => member.playerId).sort().join(":") !== item.proposedMembers.map(member => member.playerId).sort().join(":"))));
});

test("no candidate is reported when fewer than two untouched teams remain", () => {
  const competition = makeCompetition();
  competition.matches = [match("played", "cp1", "cp2", { status: "completed", winnerId: "cp1" })];
  const result = generateTeamShuffleCandidates(competition);
  assert.equal(result.valid, false);
  assert.match(result.reason, /belum memiliki hasil/);
});

test("player assignments persist through one RPC and stale writes are rejected without separate table updates", async () => {
  const previousFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response(JSON.stringify({ message: "Team assignments changed since preview" }), { status: 400 });
  };
  try {
    const provider = createSupabaseProvider({ url: "https://example.supabase.co", key: "public-key" });
    const assignments = [{ player_id: "p2", from_team_id: "t1", to_team_id: "t2", from_position: 2, to_position: 1 }, { player_id: "p3", from_team_id: "t2", to_team_id: "t1", from_position: 1, to_position: 2 }];
    await assert.rejects(provider.shuffleTeamPlayers({ sessionId: "session-1", assignments }), /changed since preview/);
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /rpc\/shuffle_team_players$/);
    assert.equal(calls[0].options.method, "POST");
    assert.deepEqual(JSON.parse(calls[0].options.body), { p_session_id: "session-1", p_assignments: assignments });
  } finally {
    globalThis.fetch = previousFetch;
  }
});
