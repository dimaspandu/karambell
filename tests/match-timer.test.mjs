import test from "node:test";
import assert from "node:assert/strict";
import { elapsedMilliseconds, formatElapsedTime, remainingMilliseconds } from "../src/features/matches/matchTimer.js";

test("elapsed time uses timestamps so delayed callbacks do not lose time", () => {
  assert.equal(elapsedMilliseconds({ elapsedMs: 1200, startedAt: 1000 }, 9500), 9700);
  assert.equal(elapsedMilliseconds({ elapsedMs: 1200, startedAt: null }, 9500), 1200);
});

test("timer formats minutes and hours", () => {
  assert.equal(formatElapsedTime(65_000), "01:05");
  assert.equal(formatElapsedTime(3_723_000), "01:02:03");
});

test("countdown supports selected durations and stops at zero", () => {
  const timer = { elapsedMs: 30_000, startedAt: 1000 };
  assert.equal(remainingMilliseconds(timer, 10, 31_000), 9 * 60_000);
  assert.equal(remainingMilliseconds(timer, 15, 31_000), 14 * 60_000);
  assert.equal(remainingMilliseconds({ elapsedMs: 10 * 60_000, startedAt: null }, 10), 0);
});
