import test from "node:test";
import assert from "node:assert/strict";
import { createCompetitionSubmissionGate, createCompetitionStateReducer, deliverCreatedCompetition, initialCreateCompetitionState } from "../src/features/competitions/createCompetitionViewModel.js";

test("create state exposes saving, success, and recoverable error transitions", () => {
  const saving = createCompetitionStateReducer(initialCreateCompetitionState, { type: "submit-start" });
  assert.deepEqual(saving, { status: "saving", error: null });
  assert.deepEqual(createCompetitionStateReducer(saving, { type: "submit-success" }), { status: "success", error: null });
  assert.deepEqual(createCompetitionStateReducer(saving, { type: "submit-error", error: "try again" }), { status: "error", error: "try again" });
});

test("create submission gate rejects duplicate writes and releases after completion", async () => {
  const gate = createCompetitionSubmissionGate();
  let complete;
  const pending = gate(() => new Promise(resolve => { complete = resolve; }));
  assert.equal(await gate(async () => "duplicate"), false);
  complete("saved");
  assert.equal(await pending, "saved");
  assert.equal(await gate(async () => "retry"), "retry");
});

test("post-create navigation failure is reported separately from successful persistence", () => {
  const competition = { id: "created-session" };
  const failures = [];
  const completed = deliverCreatedCompetition(competition, () => { throw new Error("navigation failed"); }, (error, result) => failures.push({ message: error.message, result }));
  assert.equal(completed, true);
  assert.deepEqual(failures, [{ message: "navigation failed", result: competition }]);
});
