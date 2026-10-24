import test from "node:test";
import assert from "node:assert/strict";
import { createCompetitionRepository } from "../src/repositories/competitionRepository.js";
import { createSupabaseProvider } from "../src/providers/supabase.js";

const input = {
  name: "Cup", event_date: "2026-10-21", location: "Jakarta", format: "single_elimination",
  isTeamCompetition: true, participants: ["Dimas & Rahman", "Athaya & Prastio"]
};
const created = {
  session: { session_id: "new-session", name: "Cup", event_date: "2026-10-21", location: "Jakarta", format: "team_single_elimination", status: "in_progress" },
  participants: [
    { participant_id: "team-1", name: "Dimas & Rahman", seed: 1 },
    { participant_id: "team-2", name: "Athaya & Prastio", seed: 2 }
  ],
  matches: [{ match_id: "final", round: 1, match_number: 1, participant1_id: "team-1", participant2_id: "team-2", winner_id: "", status: "pending" }]
};

function makeRepository(create = async () => created) {
  const calls = [];
  const provider = {
    listCompetitions: async () => [], listLeaderboardCompetitions: async () => [], getCompetition: async () => created,
    createCompetition: async request => { calls.push(request); return create(request); },
    addPlayer: async () => created, recordMatchScore: async () => created, recordMatchWinner: async () => created
  };
  return { repository: createCompetitionRepository({ provider }), calls };
}

test("creation repository sends a normalized request and returns the normalized provider result", async () => {
  const { repository, calls } = makeRepository();
  const competition = await repository.createCompetition(input);
  assert.deepEqual(calls, [{ ...input, name: "Cup", location: "Jakarta" }]);
  assert.equal(competition.id, "new-session");
  assert.equal(competition.isTeamCompetition, true);
  assert.deepEqual(competition.participants.map(team => team.seed), [1, 2]);
});

test("creation repository blocks invalid input before provider persistence", async () => {
  const { repository, calls } = makeRepository();
  await assert.rejects(repository.createCompetition({ ...input, participants: ["Only one pair"] }), error => error.code === "COMPETITION_VALIDATION");
  assert.deepEqual(calls, []);
});

test("creation repository preserves provider errors and rejects unexpected results", async () => {
  const providerFailure = new Error("write failed");
  const failing = makeRepository(async () => { throw providerFailure; }).repository;
  await assert.rejects(failing.createCompetition(input), error => error === providerFailure);
  const malformed = makeRepository(async () => ({ session: { session_id: "new-session" }, participants: [], matches: [] })).repository;
  await assert.rejects(malformed.createCompetition(input), error => error.code === "COMPETITION_REFRESH_FAILED");
});

test("Supabase creation persists related team records and returns a normalized bracket", async () => {
  const previousFetch = globalThis.fetch;
  const calls = [];
  const rows = { players: [], teams: [], team_members: [], matches: [] };
  const session = { id: "new-session", name: "Cup", event_date: "2026-10-21", location: "Jakarta", format: "single_elimination", status: "in_progress" };
  globalThis.fetch = async (urlLike, options = {}) => {
    const url = new URL(urlLike);
    const table = url.pathname.split("/").at(-1);
    const method = options.method || "GET";
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ table, method, body, query: Object.fromEntries(url.searchParams) });
    let data = [];
    if (table === "sessions" && method === "POST") data = [session];
    else if (table === "sessions" && method === "GET") data = [session];
    else if (table === "players" && method === "POST") {
      rows.players = body.map((row, index) => ({ ...row, id: `player-${index + 1}` })); data = rows.players;
    } else if (table === "players" && method === "GET") data = rows.players;
    else if (table === "teams" && method === "POST") {
      rows.teams = body.map((row, index) => ({ ...row, id: `team-${index + 1}` })); data = rows.teams;
    } else if (table === "teams" && method === "GET") data = rows.teams;
    else if (table === "team_members" && method === "POST") { rows.team_members = body.map(row => ({ ...row })); data = rows.team_members; }
    else if (table === "team_members" && method === "GET") data = rows.team_members;
    else if (table === "matches" && method === "POST") {
      rows.matches = body.map((row, index) => ({ ...row, id: `match-${index + 1}` })); data = rows.matches;
    } else if (table === "matches" && method === "PATCH") {
      const row = rows.matches.find(match => `eq.${match.id}` === url.searchParams.get("id"));
      Object.assign(row, body); data = [row];
    } else if (table === "matches" && method === "GET") data = rows.matches;
    return new Response(JSON.stringify(data), { status: 200 });
  };
  try {
    const repository = createCompetitionRepository({ provider: createSupabaseProvider({ url: "https://example.supabase.co", key: "test" }) });
    const result = await repository.createCompetition({ ...input, participants: [...input.participants, "Dedi & Azhar"] });
    assert.equal(result.id, "new-session");
    assert.equal(result.isTeamCompetition, true);
    assert.deepEqual(result.participants.map(team => team.seed), [1, 2, 3]);
    assert.equal(result.matches.length, 3);
    assert.equal(result.matches[0].status, "bye");
    assert.equal(result.matches[1].participant1Id, "team-2");
    assert.equal(result.matches[1].participant2Id, "team-3");
    assert.deepEqual(calls.filter(call => call.method === "POST").map(call => call.table), ["sessions", "players", "teams", "team_members", "matches"]);
    assert.equal(calls.find(call => call.table === "teams" && call.method === "POST").body[1].seed, 2);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("Supabase compensates a later write failure and preserves the original error if cleanup also fails", async () => {
  const previousFetch = globalThis.fetch;
  const previousConsoleError = console.error;
  const calls = [];
  console.error = () => {};
  globalThis.fetch = async (urlLike, options = {}) => {
    const url = new URL(urlLike);
    const table = url.pathname.split("/").at(-1);
    const method = options.method || "GET";
    calls.push({ table, method, query: Object.fromEntries(url.searchParams) });
    if (table === "sessions" && method === "POST") return new Response(JSON.stringify([{ id: "new-session" }]), { status: 201 });
    if (table === "players" && method === "POST") return new Response(JSON.stringify(input.participants.flatMap((team, index) => team.split(" & ").map((name, member) => ({ id: `p${index * 2 + member + 1}`, session_id: "new-session", name })))), { status: 201 });
    if (table === "teams" && method === "POST") return new Response(JSON.stringify({ message: "team write failed" }), { status: 500 });
    if (table === "players" && method === "DELETE") return new Response(JSON.stringify({ message: "cleanup failed" }), { status: 500 });
    return new Response("[]", { status: 200 });
  };
  try {
    const provider = createSupabaseProvider({ url: "https://example.supabase.co", key: "test" });
    await assert.rejects(provider.createCompetition(input), error => {
      assert.match(error.message, /team write failed/);
      assert.equal(error.code, "COMPETITION_CLEANUP_FAILED");
      assert.equal(error.cleanupFailures.length, 1);
      assert.match(error.cleanupFailures[0].message, /cleanup failed/);
      return true;
    });
    const deletions = calls.filter(call => call.method === "DELETE");
    assert.deepEqual(deletions.map(call => call.table), ["matches", "team_members", "teams", "players", "sessions"]);
    assert.ok(deletions.every(call => Object.values(call.query).some(value => value === "eq.new-session")));
  } finally {
    globalThis.fetch = previousFetch;
    console.error = previousConsoleError;
  }
});

test("Supabase does not attempt cleanup when session creation fails before an ID is returned", async () => {
  const previousFetch = globalThis.fetch;
  const previousConsoleError = console.error;
  const calls = [];
  console.error = () => {};
  globalThis.fetch = async (urlLike, options = {}) => {
    const url = new URL(urlLike);
    const table = url.pathname.split("/").at(-1);
    calls.push({ table, method: options.method || "GET" });
    return new Response(JSON.stringify({ message: "session unavailable" }), { status: table === "sessions" ? 503 : 200 });
  };
  try {
    const provider = createSupabaseProvider({ url: "https://example.supabase.co", key: "test" });
    await assert.rejects(provider.createCompetition(input), /session unavailable/);
    assert.deepEqual(calls, [{ table: "sessions", method: "POST" }]);
  } finally {
    globalThis.fetch = previousFetch;
    console.error = previousConsoleError;
  }
});
