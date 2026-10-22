import test from "node:test";
import assert from "node:assert/strict";
import { createCompetitionRepository } from "../src/repositories/competitionRepository.js";
import { createSupabaseProvider } from "../src/providers/supabase.js";
import { googleSheetsProvider } from "../src/providers/googleSheets.js";

const payload = {
  session: { session_id: "cup-1", name: "Weekend Cup", event_date: "2026-10-12", location: "Jakarta", format: "team_single_elimination", status: "completed" },
  participants: [{ participant_id: "team-1", name: "Dedi & Dimas", seed: 1 }],
  matches: [{ match_id: "match-1", round: 1, match_number: 1, participant1_id: "team-1", participant2_id: "", winner_id: "team-1", status: "bye", score1: "", score2: "" }]
};

function provider(overrides = {}) {
  return {
    listCompetitions: async () => [payload],
    getCompetition: async id => id === "cup-1" ? payload : Promise.reject(new Error("Kompetisi tidak ditemukan.")),
    listLeaderboardCompetitions: async () => [payload],
    createCompetition: async () => payload,
    addPlayer: async () => payload,
    recordMatchScore: async () => payload,
    recordMatchWinner: async () => payload,
    ...overrides
  };
}

test("repository returns the same normalized model for list and detail", async () => {
  const repository = createCompetitionRepository({ provider: provider() });
  const [listed] = await repository.listCompetitions();
  const detail = await repository.getCompetition("cup-1");
  assert.deepEqual(detail, listed);
  assert.equal(listed.id, "cup-1");
  assert.equal(listed.isTeamCompetition, true);
  assert.equal(listed.participants[0].id, "team-1");
  assert.equal(listed.matches[0].winnerId, "team-1");
});

test("repository preserves empty results and provider failures", async () => {
  const empty = createCompetitionRepository({ provider: provider({ listCompetitions: async () => [] }) });
  assert.deepEqual(await empty.listCompetitions(), []);

  const failing = createCompetitionRepository({ provider: provider({ listCompetitions: async () => { throw new Error("Sheets unavailable"); } }) });
  await assert.rejects(failing.listCompetitions(), /Sheets unavailable/);
  const malformed = createCompetitionRepository({ provider: provider({ listCompetitions: async () => [{ session: {}, participants: [], matches: [] }] }) });
  await assert.rejects(malformed.listCompetitions(), /without an ID/);
});

test("repository rejects malformed details and missing IDs", async () => {
  const repository = createCompetitionRepository({ provider: provider({ getCompetition: async () => ({ session: {}, participants: [], matches: [] }) }) });
  await assert.rejects(repository.getCompetition("missing"), /tidak ditemukan/);
  await assert.rejects(repository.getCompetition(" "), /ID kompetisi/);
});

test("repository applies legacy team-session persistence hints outside the domain model", async () => {
  const legacyPayload = { ...payload, session: { ...payload.session, format: "single_elimination" } };
  const repository = createCompetitionRepository({
    provider: provider({ getCompetition: async () => legacyPayload }),
    isTeamSessionKnown: sessionId => sessionId === "cup-1"
  });
  const result = await repository.getCompetition("cup-1");
  assert.equal(result.isTeamCompetition, true);
});

test("Google Sheets and Supabase providers return matching normalized list and detail models", async () => {
  const previousFetch = globalThis.fetch;
  const supabaseRows = {
    sessions: [{ id: "cup-1", name: "Weekend Cup", event_date: "2026-10-12", location: "Jakarta", format: "team_single_elimination", status: "completed" }],
    teams: [{ id: "team-1", seed: 1 }],
    players: [{ id: "player-a", name: "Dedi" }, { id: "player-b", name: "Dimas" }],
    team_members: [{ team_id: "team-1", player_id: "player-a", position: 1 }, { team_id: "team-1", player_id: "player-b", position: 2 }],
    matches: [{ id: "match-1", round: 1, match_number: 1, team1_id: "team-1", team2_id: null, winner_team_id: "team-1", status: "completed" }]
  };
  const response = data => new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } });

  try {
    globalThis.fetch = async input => {
      const url = new URL(input);
      const table = url.pathname.split("/").at(-1);
      if (table === "sessions" && url.searchParams.get("select") === "id") return response([{ id: "cup-1" }]);
      return response(supabaseRows[table] || []);
    };
    const supabase = createCompetitionRepository({ provider: createSupabaseProvider({ url: "https://example.supabase.co", key: "test-key" }) });
    const supabaseList = await supabase.listCompetitions();
    const supabaseDetail = await supabase.getCompetition("cup-1");

    globalThis.fetch = async path => {
      if (String(path) === "/api/sessions") return response({ ok: true, data: { sessions: [{ session_id: "cup-1" }] } });
      return response({ ok: true, data: payload });
    };
    const google = createCompetitionRepository({ provider: googleSheetsProvider });
    const googleList = await google.listCompetitions();
    const googleDetail = await google.getCompetition("cup-1");

    assert.deepEqual(supabaseList, googleList);
    assert.deepEqual(supabaseDetail, googleDetail);
    assert.deepEqual(supabaseList[0], supabaseDetail);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("Google Sheets list retrieval rejects failed session detail requests", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async path => String(path) === "/api/sessions"
    ? new Response(JSON.stringify({ ok: true, data: { sessions: [{ session_id: "cup-1" }] } }), { status: 200 })
    : new Response(JSON.stringify({ ok: false, error: "Detail unavailable" }), { status: 502 });
  try {
    const repository = createCompetitionRepository({ provider: googleSheetsProvider });
    await assert.rejects(repository.listCompetitions(), /Detail unavailable/);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
