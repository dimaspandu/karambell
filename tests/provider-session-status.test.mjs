import test from "node:test";
import assert from "node:assert/strict";
import { createSupabaseProvider } from "../src/providers/supabase.js";
import { googleSheetsProvider } from "../src/providers/googleSheets.js";

const completeCompetition = {
  session: { session_id: "session-1", status: "in_progress" },
  participants: [],
  matches: [{ match_id: "final-1", round: 1, winner_id: "team-2", status: "completed" }]
};

test("Google Sheets adapter persists the computed status with its session ID", async () => {
  const previousFetch = globalThis.fetch;
  const calls = [];
  let savedStatus = "in_progress";
  globalThis.fetch = async (path, options = {}) => {
    const method = options.method || "GET";
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ path: String(path), method, body });
    if (String(path) === "/api/sessions/status") savedStatus = body.status;
    const data = String(path) === "/api/session?session_id=session-1" ? { ...completeCompetition, session: { ...completeCompetition.session, status: savedStatus } } : {};
    return new Response(JSON.stringify({ ok: true, data }), { status: 200 });
  };

  try {
    await googleSheetsProvider.recordScore({ session_id: "session-1", match_id: "final-1", score1: 0, score2: 1 });
    const statusCall = calls.find(call => call.path === "/api/sessions/status");
    assert.deepEqual(statusCall.body, { session_id: "session-1", status: "completed" });
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("Supabase adapter persists status using the session row ID", async () => {
  const previousFetch = globalThis.fetch;
  const calls = [];
  const matchRow = { id: "final-1", session_id: "session-1", round: 1, match_number: 1, team1_id: "team-1", team2_id: "team-2", winner_team_id: "team-2", status: "completed" };
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(input);
    const table = url.pathname.split("/").at(-1);
    const method = options.method || "GET";
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ table, method, url, body });
    let data = [];
    if (table === "matches" && method === "GET") data = [matchRow];
    if (table === "sessions" && method === "GET") data = [{ id: "session-1", format: "team_single_elimination", status: "in_progress" }];
    if (table === "teams" && method === "GET") data = [{ id: "team-1" }, { id: "team-2" }];
    if (table === "players" && method === "GET") data = [];
    if (table === "team_members" && method === "GET") data = [];
    if (table === "matches" && method === "PATCH") data = [matchRow];
    if (table === "sessions" && method === "PATCH") data = [{ id: "session-1", status: body.status }];
    return new Response(JSON.stringify(data), { status: 200 });
  };

  try {
    const provider = createSupabaseProvider({ url: "https://example.supabase.co", key: "test" });
    await provider.recordWinner({ session_id: "session-1", match_id: "final-1", winner_team_id: "team-2" });
    const statusCall = calls.find(call => call.table === "sessions" && call.method === "PATCH");
    assert.equal(statusCall.url.searchParams.get("id"), "eq.session-1");
    assert.deepEqual(statusCall.body, { status: "completed" });
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("Supabase score operation stores scores and advances its winner into the configured slot", async () => {
  const previousFetch = globalThis.fetch;
  const calls = [];
  const session = { id: "session-1", format: "single_elimination", status: "in_progress" };
  const matches = [
    { id: "m1", session_id: "session-1", round: 1, match_number: 1, team1_id: "p1", team2_id: "p2", winner_team_id: null, status: "pending", next_match_id: "m2", next_slot: 1 },
    { id: "m2", session_id: "session-1", round: 2, match_number: 1, team1_id: null, team2_id: "p3", winner_team_id: null, status: "pending", next_match_id: null, next_slot: null }
  ];
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(input);
    const table = url.pathname.split("/").at(-1);
    const method = options.method || "GET";
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ table, method, body });
    let data = [];
    if (table === "sessions" && method === "GET") data = [session];
    if (table === "sessions" && method === "PATCH") { Object.assign(session, body); data = [session]; }
    if (table === "players" && method === "GET") data = ["p1", "p2", "p3"].map(id => ({ id, name: id }));
    if (table === "teams" && method === "GET") data = [];
    if (table === "matches" && method === "GET") data = matches;
    if (table === "matches" && method === "PATCH") {
      const row = matches.find(match => `eq.${match.id}` === url.searchParams.get("id"));
      Object.assign(row, body);
      data = [row];
    }
    return new Response(JSON.stringify(data), { status: 200 });
  };
  try {
    const provider = createSupabaseProvider({ url: "https://example.supabase.co", key: "test" });
    const result = await provider.recordMatchScore({ sessionId: "session-1", matchId: "m1", score1: 0, score2: 3 });
    assert.equal(matches[0].winner_team_id, "p2");
    assert.equal(matches[0].score1, 0);
    assert.equal(matches[0].score2, 3);
    assert.equal(matches[1].team1_id, "p2");
    assert.equal(result.matches[1].participant1_id, "p2");
    assert.ok(calls.some(call => call.table === "sessions" && call.method === "PATCH"));
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("Google Sheets winner operation retains its 1-0 indicator payload", async () => {
  const previousFetch = globalThis.fetch;
  const calls = [];
  let savedStatus = "in_progress";
  globalThis.fetch = async (path, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ path: String(path), body });
    if (String(path) === "/api/sessions/status") savedStatus = body.status;
    const data = String(path) === "/api/session?session_id=session-1"
      ? { ...completeCompetition, session: { ...completeCompetition.session, status: savedStatus } }
      : {};
    return new Response(JSON.stringify({ ok: true, data }), { status: 200 });
  };
  try {
    const { googleSheetsProvider } = await import("../src/providers/googleSheets.js?winner-provider-contract");
    await googleSheetsProvider.recordMatchWinner({ sessionId: "session-1", matchId: "final-1", winnerId: "team-2", participant1Id: "team-1", participant2Id: "team-2" });
    const write = calls.find(call => call.path === "/api/matches/score");
    assert.deepEqual(write.body, { session_id: "session-1", match_id: "final-1", score1: 0, score2: 1 });
  } finally {
    globalThis.fetch = previousFetch;
  }
});
