import test from "node:test";
import assert from "node:assert/strict";
import { validateParticipantAddition } from "../src/domain/participantValidation.js";

const competition = overrides => ({
  id: "session-1",
  format: "single",
  isTeamCompetition: false,
  status: "in_progress",
  participants: [{ id: "player-1", name: "Dimas", seed: 1 }],
  matches: [{ id: "match-1", status: "pending", score1: null, score2: null }],
  ...overrides
});

test("accepts and trims a unique participant name", () => {
  assert.deepEqual(validateParticipantAddition({ competition: competition({}), name: "  Rahman  " }), { valid: true, name: "Rahman" });
});

test("rejects missing and overlong names", () => {
  assert.match(validateParticipantAddition({ competition: competition({}), name: "  " }).error, /wajib diisi/);
  assert.match(validateParticipantAddition({ competition: competition({}), name: "x".repeat(61) }).error, /60 karakter/);
});

test("rejects names that duplicate participants without regard to case", () => {
  assert.match(validateParticipantAddition({ competition: competition({}), name: "dImAs" }).error, /sudah ada/);
});

test("keeps participant addition limited to eligible individual competitions", () => {
  assert.match(validateParticipantAddition({ competition: competition({ isTeamCompetition: true }), name: "Rahman" }).error, /individual/);
  assert.match(validateParticipantAddition({ competition: competition({ status: "completed" }), name: "Rahman" }).error, /selesai/);
  assert.match(validateParticipantAddition({ competition: null, name: "Rahman" }).error, /tidak ditemukan/);
  assert.match(validateParticipantAddition({ competition: { id: "session-1" }, name: "Rahman" }).error, /belum lengkap/);
  assert.match(validateParticipantAddition({ competition: competition({ format: "round_robin" }), name: "Rahman" }).error, /tidak mendukung/);
});

test("preserves the 64 participant limit and blocks started matches but permits opening byes", () => {
  const full = competition({ participants: Array.from({ length: 64 }, (_, index) => ({ name: `Player ${index}` })) });
  assert.match(validateParticipantAddition({ competition: full, name: "New Player" }).error, /64 peserta/);

  const scored = competition({ matches: [{ status: "pending", score1: 0, score2: null }] });
  assert.match(validateParticipantAddition({ competition: scored, name: "Rahman" }).error, /sebelum pertandingan/);

  const started = competition({ matches: [{ status: "completed", score1: null, score2: null }] });
  assert.match(validateParticipantAddition({ competition: started, name: "Rahman" }).error, /sebelum pertandingan/);

  const bye = competition({ matches: [{ status: "bye", score1: null, score2: null }] });
  assert.deepEqual(validateParticipantAddition({ competition: bye, name: "Rahman" }), { valid: true, name: "Rahman" });
});

test("accepts the provider response shape used for persistence-side validation", () => {
  const providerCompetition = {
    session: { session_id: "session-1", format: "single_elimination", status: "in_progress" },
    participants: [{ participant_id: "player-1", name: "Dimas" }],
    matches: [{ status: "bye", score1: "", score2: "" }]
  };
  assert.deepEqual(validateParticipantAddition({ competition: providerCompetition, name: "Rahman" }), { valid: true, name: "Rahman" });
});
