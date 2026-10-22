import test from "node:test";
import assert from "node:assert/strict";
import { createMatchSubmissionGate, initialMatchState, matchStateReducer } from "../src/features/matches/matchViewModel.js";

test("match state reports saving, success, and errors without losing operation identity", () => {
  const saving = matchStateReducer(initialMatchState, { type: "save-start", operation: "score" });
  assert.deepEqual(saving, { status: "saving", operation: "score", error: null });
  const success = matchStateReducer(saving, { type: "save-success", operation: "score" });
  assert.deepEqual(success, { status: "success", operation: "score", error: null });
  const failure = matchStateReducer(saving, { type: "save-error", operation: "score", error: "offline" });
  assert.deepEqual(failure, { status: "error", operation: "score", error: "offline" });
});

test("match submission gate prevents overlapping writes and releases after failure", async () => {
  const gate = createMatchSubmissionGate();
  let release;
  const first = gate(() => new Promise(resolve => { release = resolve; }));
  assert.equal(await gate(async () => "duplicate"), false);
  release("saved");
  assert.equal(await first, "saved");
  await assert.rejects(gate(async () => { throw new Error("network"); }), /network/);
  assert.equal(await gate(async () => "retry"), "retry");
});
