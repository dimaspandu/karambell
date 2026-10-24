import test from "node:test";
import assert from "node:assert/strict";
import { createCompetitionRepository } from "../src/repositories/competitionRepository.js";
import { createSupabaseProvider } from "../src/providers/supabase.js";

const payload = {
  session: { session_id: "cup-1", name: "Weekend Cup", event_date: "2026-10-12", location: "Jakarta", format: "team_single_elimination", status: "completed" },
  participants: [{ participant_id: "team-1", name: "Dedi & Dimas", seed: 1 }],
  matches: [{ match_id: "match-1", round: 1, match_number: 1, participant1_id: "team-1", participant2_id: "", winner_id: "team-1", status: "bye", score1: "", score2: "" }]
};

function source(overrides = {}) {
  return {
    listCompetitions: async () => [payload],
    getCompetition: async id => id === "cup-1" ? payload : Promise.reject(new Error("Kompetisi tidak ditemukan.")),
    listLeaderboardCompetitions: async () => [payload], createCompetition: async () => payload,
    addPlayer: async () => payload, recordMatchScore: async () => payload, recordMatchWinner: async () => payload,
    ...overrides
  };
}

test("repository normalizes Supabase-backed list and detail consistently", async () => {
  const repository = createCompetitionRepository({ provider: source() });
  const [listed] = await repository.listCompetitions();
  const detail = await repository.getCompetition("cup-1");
  assert.deepEqual(detail, listed);
  assert.equal(listed.id, "cup-1");
  assert.equal(listed.isTeamCompetition, true);
  assert.equal(listed.participants[0].id, "team-1");
  assert.equal(listed.matches[0].winnerId, "team-1");
});

test("repository preserves empty results and request failures", async () => {
  const empty = createCompetitionRepository({ provider: source({ listCompetitions: async () => [] }) });
  assert.deepEqual(await empty.listCompetitions(), []);
  const failing = createCompetitionRepository({ provider: source({ listCompetitions: async () => { throw new Error("Supabase unavailable"); } }) });
  await assert.rejects(failing.listCompetitions(), /Supabase unavailable/);
  const malformed = createCompetitionRepository({ provider: source({ listCompetitions: async () => [{ session: {}, participants: [], matches: [] }] }) });
  await assert.rejects(malformed.listCompetitions(), /without an ID/);
});

test("repository rejects malformed details and missing IDs", async () => {
  const repository = createCompetitionRepository({ provider: source({ getCompetition: async () => ({ session: {}, participants: [], matches: [] }) }) });
  await assert.rejects(repository.getCompetition("missing"), /tidak ditemukan/);
  await assert.rejects(repository.getCompetition(" "), /ID kompetisi/);
});

test("Supabase maps its tables into the competition list and detail model", async () => {
  const previousFetch = globalThis.fetch;
  const rows = {
    sessions: [{ id: "cup-1", name: "Weekend Cup", event_date: "2026-10-12", location: "Jakarta", format: "team_single_elimination", status: "completed" }],
    teams: [{ id: "team-1", seed: 1 }], players: [{ id: "player-a", name: "Dedi" }, { id: "player-b", name: "Dimas" }],
    team_members: [{ team_id: "team-1", player_id: "player-a", position: 1 }, { team_id: "team-1", player_id: "player-b", position: 2 }],
    matches: [{ id: "match-1", round: 1, match_number: 1, team1_id: "team-1", team2_id: null, winner_team_id: "team-1", status: "completed" }]
  };
  globalThis.fetch = async input => {
    const url = new URL(input);
    const table = url.pathname.split("/").at(-1);
    return new Response(JSON.stringify(table === "sessions" && url.searchParams.get("select") === "id" ? [{ id: "cup-1" }] : rows[table] || []), { status: 200 });
  };
  try {
    const repository = createCompetitionRepository({ provider: createSupabaseProvider({ url: "https://example.supabase.co", key: "test-key" }) });
    const [listed] = await repository.listCompetitions();
    const detail = await repository.getCompetition("cup-1");
    assert.deepEqual(listed, detail);
    assert.equal(detail.participants[0].name, "Dedi & Dimas");
    assert.equal(detail.matches[0].status, "bye");
  } finally { globalThis.fetch = previousFetch; }
});

test("Supabase configuration and network failures have actionable diagnostics", async () => {
  await assert.rejects(createSupabaseProvider({ url: "", key: "" }).listCompetitions(), /supabaseUrl dan supabaseAnonKey/);
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new TypeError("network down"); };
  try {
    await assert.rejects(createSupabaseProvider({ url: "https://example.supabase.co", key: "test" }).listCompetitions(), error => error.code === "SUPABASE_NETWORK_ERROR" && /browser console/.test(error.message));
  } finally { globalThis.fetch = previousFetch; }
});
