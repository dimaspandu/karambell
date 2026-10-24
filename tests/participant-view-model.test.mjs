import test from "node:test";
import assert from "node:assert/strict";
import { createParticipantSubmissionGate, initialParticipantState, participantStateReducer } from "../src/features/participants/participantViewModel.js";

test("participant submission state reports saving, success, and recoverable errors", () => {
  let state = participantStateReducer(initialParticipantState, { type: "submit-start" });
  assert.equal(state.status, "saving");
  state = participantStateReducer(state, { type: "submit-error", error: "Nama peserta sudah ada." });
  assert.deepEqual(state, { status: "error", error: "Nama peserta sudah ada." });
  state = participantStateReducer(state, { type: "clear-error" });
  assert.deepEqual(state, initialParticipantState);
  state = participantStateReducer(state, { type: "submit-start" });
  state = participantStateReducer(state, { type: "submit-success" });
  assert.deepEqual(state, { status: "success", error: null });
});

test("participant submission gate blocks a second request while the first is pending", async () => {
  const gate = createParticipantSubmissionGate();
  let release;
  const first = gate(() => new Promise(resolve => { release = resolve; }));
  assert.equal(await gate(async () => "duplicate"), false);
  release(true);
  assert.equal(await first, true);
  assert.equal(await gate(async () => "next"), "next");
});
