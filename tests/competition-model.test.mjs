import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCompetition } from "../src/domain/competitionModel.js";
import { formatDate, initials, matchRoundName } from "../src/shared/presentation/competitionFormatters.js";

test("competition normalization is pure and preserves the normalized read model", () => {
  const result = normalizeCompetition({
    session: { session_id: "s1", name: "Cup", event_date: "2026-02-03T00:00:00Z", format: "single_elimination", status: "in_progress" },
    participants: [{ participant_id: "p1", name: "A & B", seed: 1 }],
    matches: [{ match_id: "m1", round: "1", match_number: "1", participant1_id: "p1", participant2_id: "", winner_id: "p1", status: "bye", score1: "", score2: null }]
  });
  assert.deepEqual(result, {
    id: "s1", name: "Cup", date: "2026-02-03", location: "", format: "single", isTeamCompetition: false, status: "in_progress",
    participants: [{ id: "p1", name: "A & B", seed: 1 }],
    matches: [{ id: "m1", round: 1, index: 0, participant1Id: "p1", participant2Id: null, score1: null, score2: null, winnerId: "p1", status: "bye", nextMatchId: null, nextSlot: null }],
    totalRounds: 1, createdAt: "", updatedAt: ""
  });
});

test("normalization accepts a compatibility hint without accessing browser storage", () => {
  const result = normalizeCompetition({ session: { session_id: "old-team", format: "single_elimination" }, participants: [], matches: [] }, { isTeamSessionKnown: true });
  assert.equal(result.isTeamCompetition, true);
});

test("display formatters retain existing text behavior", () => {
  assert.equal(initials("  Dimas Rahman Putra "), "DR");
  assert.equal(formatDate("2026-02-03"), "3 Februari 2026");
  assert.equal(formatDate("not-a-date"), "not-a-date");
  assert.equal(formatDate(""), "Tanggal belum ditentukan");
  assert.equal(matchRoundName(1, 4), "Babak 1");
  assert.equal(matchRoundName(2, 4), "Perempat final");
  assert.equal(matchRoundName(3, 4), "Semifinal");
  assert.equal(matchRoundName(4, 4), "Final");
});
