import test from "node:test";
import assert from "node:assert/strict";
import { createCompetitionRepository } from "../src/repositories/competitionRepository.js";
import { createSupabaseProvider } from "../src/providers/supabase.js";

const current = {
  id: "session-1", name: "Cup", format: "single", isTeamCompetition: false, status: "in_progress",
  participants: [{ id: "p1", name: "Dimas", seed: 1 }],
  matches: [{ id: "m1", round: 1, index: 0, status: "pending", score1: null, score2: null }], totalRounds: 1
};
const updated = {
  session: { session_id: "session-1", name: "Cup", format: "single_elimination", status: "in_progress" },
  participants: [{ participant_id: "p1", name: "Dimas", seed: 1 }, { participant_id: "p2", name: "Rahman", seed: 2 }],
  matches: [{ match_id: "m1", round: 1, match_number: 1, participant1_id: "p1", participant2_id: "p2", status: "pending" }]
};

function makeProvider(overrides = {}) {
  const calls = [];
  return {
    calls,
    provider: {
      listCompetitions: async () => [],
      listLeaderboardCompetitions: async () => [],
      getCompetition: async () => updated,
      createCompetition: async () => updated,
      addPlayer: async input => { calls.push(input); return updated; },
      recordMatchScore: async () => updated,
      recordMatchWinner: async () => updated,
      ...overrides
    }
  };
}

test("repository maps addParticipant to the selected provider contract and normalized detail", async () => {
  const { provider, calls } = makeProvider();
  const repository = createCompetitionRepository({ provider });
  const result = await repository.addParticipant({ competition: current, name: "  Rahman " });
  assert.deepEqual(calls, [{ session_id: "session-1", name: "Rahman" }]);
  assert.equal(result.id, "session-1");
  assert.deepEqual(result.participants.map(participant => participant.name), ["Dimas", "Rahman"]);
});

test("repository prevents invalid or duplicate additions before calling a provider", async () => {
  const { provider, calls } = makeProvider();
  const repository = createCompetitionRepository({ provider });
  await assert.rejects(repository.addParticipant({ competition: current, name: " dimas " }), error => error.code === "PARTICIPANT_VALIDATION" && /sudah ada/.test(error.message));
  assert.deepEqual(calls, []);
});

test("repository maps backend validation errors and propagates unexpected provider failures", async () => {
  const duplicateProvider = makeProvider({ addPlayer: async () => { throw new Error("That participant is already in this session."); } }).provider;
  const duplicateRepository = createCompetitionRepository({ provider: duplicateProvider });
  await assert.rejects(duplicateRepository.addParticipant({ competition: current, name: "Rahman" }), error => error.code === "PARTICIPANT_VALIDATION" && error.message === "Nama peserta sudah ada.");

  const failedProvider = makeProvider({ addPlayer: async () => { throw new Error("Network unavailable"); } }).provider;
  const failedRepository = createCompetitionRepository({ provider: failedProvider });
  await assert.rejects(failedRepository.addParticipant({ competition: current, name: "Rahman" }), /Network unavailable/);
});

test("repository rejects an unexpected provider response after submission", async () => {
  const { provider } = makeProvider({ addPlayer: async () => ({ ok: true }) });
  const repository = createCompetitionRepository({ provider });
  await assert.rejects(repository.addParticipant({ competition: current, name: "Rahman" }), /tidak memuat detail kompetisi/);
});

test("Supabase adapter adds a participant and returns normalized competition detail", async () => {
  const previousFetch = globalThis.fetch;
  const calls = [];
  const supabasePlayers = [{ id: "p1", name: "Dimas", session_id: "session-1" }];
  const session = { id: "session-1", name: "Cup", format: "single_elimination", status: "in_progress" };
  const match = { id: "m1", round: 1, match_number: 1, status: "pending", score1: null, score2: null };
  try {
    globalThis.fetch = async (input, options = {}) => {
      const url = new URL(input);
      const table = url.pathname.split("/").at(-1);
      const method = options.method || "GET";
      const body = options.body ? JSON.parse(options.body) : null;
      calls.push({ url, table, method, body });
      let data = [];
      if (table === "sessions") data = [session];
      if (table === "players" && method === "GET") data = supabasePlayers;
      if (table === "players" && method === "POST") {
        supabasePlayers.push({ id: "p2", session_id: body.session_id, name: body.name });
        data = [supabasePlayers.at(-1)];
      }
      if (table === "matches") data = [match];
      return new Response(JSON.stringify(data), { status: 200 });
    };
    const supabaseProvider = createSupabaseProvider({ url: "https://example.supabase.co", key: "test-key" });
    const supabaseRepository = createCompetitionRepository({ provider: supabaseProvider });
    const supabaseResult = await supabaseRepository.addParticipant({ competition: current, name: "Rahman" });
    assert.deepEqual(supabaseResult.participants.map(participant => participant.name), ["Dimas", "Rahman"]);
    assert.deepEqual(calls.find(call => call.table === "players" && call.method === "POST").body, { session_id: "session-1", name: "Rahman" });

  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("Supabase checks duplicates and match state before inserting a player", async () => {
  const previousFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async input => {
    const url = new URL(input);
    const table = url.pathname.split("/").at(-1);
    calls.push({ table, method: "GET" });
    const data = table === "sessions" ? [{ id: "session-1", format: "single_elimination", status: "in_progress" }]
      : table === "players" ? [{ id: "p1", name: "Dimas" }]
        : table === "matches" ? [{ id: "m1", round: 1, match_number: 1, status: "completed", score1: 1, score2: 0 }]
          : [];
    return new Response(JSON.stringify(data), { status: 200 });
  };
  try {
    const repository = createCompetitionRepository({ provider: createSupabaseProvider({ url: "https://example.supabase.co", key: "test-key" }) });
    await assert.rejects(repository.addParticipant({ competition: current, name: "Rahman" }), /sebelum pertandingan/);
    assert.equal(calls.some(call => call.table === "players" && call.method === "POST"), false);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("Supabase distinguishes a successful insert from a failed detail refresh", async () => {
  const previousFetch = globalThis.fetch;
  let sessionReads = 0;
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(input);
    const table = url.pathname.split("/").at(-1);
    const method = options.method || "GET";
    if (table === "sessions" && method === "GET" && ++sessionReads === 2) {
      return new Response(JSON.stringify({ message: "Refresh unavailable" }), { status: 503 });
    }
    const data = table === "sessions" ? [{ id: "session-1", format: "single_elimination", status: "in_progress" }]
      : table === "players" && method === "GET" ? [{ id: "p1", name: "Dimas" }]
        : table === "players" && method === "POST" ? [{ id: "p2", name: "Rahman" }]
          : table === "matches" ? [{ id: "m1", round: 1, match_number: 1, status: "pending", score1: null, score2: null }]
            : [];
    return new Response(JSON.stringify(data), { status: 200 });
  };
  try {
    const repository = createCompetitionRepository({ provider: createSupabaseProvider({ url: "https://example.supabase.co", key: "test-key" }) });
    await assert.rejects(repository.addParticipant({ competition: current, name: "Rahman" }), error => error.code === "PARTICIPANT_REFRESH_FAILED" && /tersimpan/.test(error.message));
  } finally {
    globalThis.fetch = previousFetch;
  }
});
