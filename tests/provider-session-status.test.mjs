import test from "node:test";
import assert from "node:assert/strict";
import { dataConfig } from "../js/data/config.js";

const completeCompetition = {
  session: { session_id: "session-1", status: "in_progress" },
  participants: [],
  matches: [{ match_id: "final-1", round: 1, winner_id: "team-2", status: "completed" }]
};

test("Google Sheets adapter persists the computed status with its session ID", async () => {
  const previousProvider = dataConfig.dataProvider;
  const previousFetch = globalThis.fetch;
  const calls = [];
  let savedStatus = "in_progress";
  dataConfig.dataProvider = "google-sheets";
  globalThis.fetch = async (path, options = {}) => {
    const method = options.method || "GET";
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ path: String(path), method, body });
    if (String(path) === "/api/sessions/status") savedStatus = body.status;
    const data = String(path) === "/api/session?session_id=session-1" ? { ...completeCompetition, session: { ...completeCompetition.session, status: savedStatus } } : {};
    return new Response(JSON.stringify({ ok: true, data }), { status: 200 });
  };

  try {
    const { dataService } = await import("../js/data/service.js?google-status-test");
    await dataService.recordScore({ session_id: "session-1", match_id: "final-1", score1: 0, score2: 1 });
    const statusCall = calls.find(call => call.path === "/api/sessions/status");
    assert.deepEqual(statusCall.body, { session_id: "session-1", status: "completed" });
  } finally {
    dataConfig.dataProvider = previousProvider;
    globalThis.fetch = previousFetch;
  }
});

test("Supabase adapter persists status using the session row ID", async () => {
  const previousProvider = dataConfig.dataProvider;
  const previousFetch = globalThis.fetch;
  const calls = [];
  const matchRow = { id: "final-1", session_id: "session-1", round: 1, match_number: 1, team1_id: "team-1", team2_id: "team-2", winner_team_id: "team-2", status: "completed" };
  dataConfig.dataProvider = "supabase";
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
    const { dataService } = await import("../js/data/service.js?supabase-status-test");
    await dataService.recordWinner({ session_id: "session-1", match_id: "final-1", winner_team_id: "team-2" });
    const statusCall = calls.find(call => call.table === "sessions" && call.method === "PATCH");
    assert.equal(statusCall.url.searchParams.get("id"), "eq.session-1");
    assert.deepEqual(statusCall.body, { status: "completed" });
  } finally {
    dataConfig.dataProvider = previousProvider;
    globalThis.fetch = previousFetch;
  }
});
