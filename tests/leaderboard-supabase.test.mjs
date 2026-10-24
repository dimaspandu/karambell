import test from "node:test";
import assert from "node:assert/strict";
import { createSupabaseProvider } from "../src/providers/supabase.js";
import { createCompetitionRepository } from "../src/repositories/competitionRepository.js";

const sessionId = "session-1";

const supabaseRows = {
  sessions: [{ id: sessionId, name: "Weekend Cup", event_date: "2026-10-12", location: "Jakarta", status: "completed", format: "single_elimination" }],
  teams: [{ id: "team-a", seed: 1 }, { id: "team-b", seed: 2 }, { id: "team-c", seed: 3 }],
  players: [
    { id: "player-dimas", name: "Dimas" }, { id: "player-dedi", name: "Dedi" },
    { id: "player-andi", name: "Andi" }, { id: "player-budi", name: "Budi" },
    { id: "player-carlo", name: "Carlo" }, { id: "player-don", name: "Don" }
  ],
  team_members: [
    { team_id: "team-a", player_id: "player-dimas", position: 1 }, { team_id: "team-a", player_id: "player-dedi", position: 2 },
    { team_id: "team-b", player_id: "player-andi", position: 1 }, { team_id: "team-b", player_id: "player-budi", position: 2 },
    { team_id: "team-c", player_id: "player-carlo", position: 1 }, { team_id: "team-c", player_id: "player-don", position: 2 }
  ],
  matches: [
    { id: "db-bye", round: 1, match_number: 1, team1_id: "team-a", team2_id: null, winner_team_id: "team-a", status: "completed" },
    { id: "db-open", round: 1, match_number: 2, team1_id: "team-b", team2_id: "team-c", winner_team_id: "team-b", status: "completed", score1: 1, score2: 0 },
    { id: "db-final", round: 2, match_number: 1, team1_id: "team-a", team2_id: "team-b", winner_team_id: "team-a", status: "completed" },
    { id: "db-pending", round: 3, match_number: 1, team1_id: "team-a", team2_id: "team-c", winner_team_id: null, status: "pending" },
    { id: "db-invalid-winner", round: 4, match_number: 1, team1_id: "team-a", team2_id: "team-b", winner_team_id: "unknown", status: "completed" }
  ]
};

function response(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

test("Supabase data produces leaderboard and history with bye participation rules", async () => {
  const previousFetch = globalThis.fetch;
  const supabaseCalls = [];
  globalThis.fetch = async input => {
    const url = new URL(input);
    const table = url.pathname.split("/").at(-1);
    supabaseCalls.push({ table, select: url.searchParams.get("select") });
    if (table === "sessions" && url.searchParams.get("select") === "id") return response([{ id: sessionId }]);
    if (table === "sessions") return response(supabaseRows.sessions);
    return response(supabaseRows[table] || []);
  };

  try {
    const supabase = createSupabaseProvider({ url: "https://example.supabase.co", key: "test-anon-key" });
    const supabaseRepository = createCompetitionRepository({ provider: supabase });
    const supabaseData = await supabaseRepository.getLeaderboardData();
    assert.ok(supabaseCalls.some(call => call.table === "team_members"));

    for (const key of ["dedi|dimas", "andi|budi", "carlo|don"]) {
      assert.ok(supabaseData.getTeam(key), `leaderboard includes ${key}`);
    }
    assert.deepEqual(supabaseData.getTeam("dedi|dimas").tournaments[0].matches.map(match => [match.isBye, match.result]), [[true, null], [false, "win"]]);
    assert.equal(supabaseData.getTeam("dedi|dimas").played, 1);
    assert.equal(supabaseData.getTeam("andi|budi").played, 2);
    assert.ok(supabaseData.getTeam("dedi|dimas").tournaments[0].matches.every(match => match.score1 === null && match.score2 === null));
  } finally {
    globalThis.fetch = previousFetch;
  }
});
