import test from "node:test";
import assert from "node:assert/strict";
import { clearTeamPairingDraft, getTeamSessionIds, isKnownTeamSession, readLastSessionId, readTeamPairingDraft, rememberTeamSession, saveLastSessionId, saveTeamPairingDraft } from "../src/shared/persistence/appStorage.js";

function installStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  const previous = globalThis.window;
  globalThis.window = { localStorage: {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  } };
  return { values, restore: () => { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; } };
}

test("browser persistence keeps existing keys and serialized team/draft formats", () => {
  const storage = installStorage({ "karambell:team-session-ids": '["legacy-team"]' });
  try {
    assert.equal(isKnownTeamSession("legacy-team"), true);
    rememberTeamSession("new-team");
    saveLastSessionId("session-9");
    saveTeamPairingDraft({ participants: ["A", "B"], teams: [{ members: ["A", "B"] }] });
    assert.deepEqual(getTeamSessionIds(), ["legacy-team", "new-team"]);
    assert.equal(storage.values.get("karambell:last-session-id"), "session-9");
    assert.equal(readLastSessionId(), "session-9");
    assert.deepEqual(JSON.parse(storage.values.get("karambell:team-session-ids")), ["legacy-team", "new-team"]);
    assert.deepEqual(readTeamPairingDraft(), { participants: ["A", "B"], teams: [{ members: ["A", "B"] }] });
    clearTeamPairingDraft();
    assert.equal(readTeamPairingDraft(), null);
  } finally { storage.restore(); }
});

test("storage tolerates malformed values and unavailable browser storage", () => {
  const malformed = installStorage({ "karambell:team-session-ids": "not json", "karambell:team-pairing-draft": "[]" });
  try {
    assert.deepEqual(getTeamSessionIds(), []);
    assert.equal(readTeamPairingDraft(), null);
  } finally { malformed.restore(); }

  const previous = globalThis.window;
  delete globalThis.window;
  try {
    assert.equal(readLastSessionId(), null);
    assert.deepEqual(getTeamSessionIds(), []);
    rememberTeamSession("safe-without-window");
    saveLastSessionId("safe-without-window");
    saveTeamPairingDraft({ teams: [] });
    clearTeamPairingDraft();
  } finally { if (previous !== undefined) globalThis.window = previous; }
});
