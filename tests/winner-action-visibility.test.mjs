import test from "node:test";
import assert from "node:assert/strict";
import { shouldShowWinnerAction } from "../src/features/competitions/winnerActionVisibility.js";

test("in-progress tournaments keep winner actions available in every round", () => {
  for (const round of ["quarterfinal", "semifinal", "final"]) {
    assert.equal(shouldShowWinnerAction({ isTournamentCompleted: false, canEditMatch: true }), true, `${round} action remains visible`);
  }
});

test("completed tournaments hide every winner action, including earlier rounds", () => {
  for (const round of ["quarterfinal", "semifinal", "final"]) {
    assert.equal(shouldShowWinnerAction({ isTournamentCompleted: true, canEditMatch: true }), false, `${round} action is hidden`);
  }
});

test("matches without two participants remain ineligible for winner actions", () => {
  assert.equal(shouldShowWinnerAction({ isTournamentCompleted: false, canEditMatch: false }), false);
});
