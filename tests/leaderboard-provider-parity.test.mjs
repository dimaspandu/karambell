import test from "node:test";
import assert from "node:assert/strict";
import { createSupabaseProvider } from "../src/providers/supabase.js";
import { googleSheetsProvider } from "../src/providers/googleSheets.js";
import { createCompetitionRepository } from "../src/repositories/competitionRepository.js";
import { createAppDependencies } from "../src/app/createAppDependencies.js";

const sessionId = "session-1";

const googleCompetition = {
  session: { session_id: sessionId, name: "Weekend Cup", event_date: "2026-10-12", location: "Jakarta", status: "completed", format: "team_single_elimination" },
  participants: [
    { participant_id: "sheet-a", name: "Dedi  & Dimas" },
    { participant_id: "sheet-b", name: "Andi & Budi" },
    { participant_id: "sheet-c", name: "Carlo & Don" }
  ],
  matches: [
    { match_id: "sheet-bye", round: 1, match_number: 1, participant1_id: "sheet-a", participant2_id: "", winner_id: "sheet-a", status: "bye" },
    { match_id: "sheet-open", round: 1, match_number: 2, participant1_id: "sheet-b", participant2_id: "sheet-c", winner_id: "sheet-b", status: "completed", score1: 1, score2: 0 },
    { match_id: "sheet-final", round: 2, match_number: 1, participant1_id: "sheet-a", participant2_id: "sheet-b", winner_id: "sheet-a", status: "completed", score1: 1, score2: 0 },
    { match_id: "sheet-pending", round: 3, match_number: 1, participant1_id: "sheet-a", participant2_id: "sheet-c", winner_id: "", status: "pending" },
    { match_id: "sheet-invalid-winner", round: 4, match_number: 1, participant1_id: "sheet-a", participant2_id: "sheet-b", winner_id: "unknown", status: "completed" }
  ]
};

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

function comparableTeam(data, teamKey) {
  const team = data.getTeam(teamKey);
  return {
    ...Object.fromEntries(["rank", "teamKey", "teamName", "player1Name", "player2Name", "wins", "losses", "played", "winRate", "tournamentsPlayed"].map(key => [key, team[key]])),
    tournaments: team.tournaments.map(({ sessionId, tournamentName, eventDate, location, wins, losses, played, winRate, matches }) => ({
      sessionId, tournamentName, eventDate, location, wins, losses, played, winRate,
      matches: matches.map(({ round, matchNumber, opponentTeamName, result, score1, score2, status, isBye }) => ({ round, matchNumber, opponentTeamName, result, score1, score2, status, isBye }))
    }))
  };
}

function response(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

test("Supabase and Google Sheets fixtures produce equivalent leaderboard and history", async () => {
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

    globalThis.fetch = async path => {
      if (String(path) === "/api/sessions") return response({ ok: true, data: { sessions: [{ session_id: sessionId }] } });
      return response({ ok: true, data: googleCompetition });
    };
    const googleRepository = createCompetitionRepository({ provider: googleSheetsProvider });
    const googleData = await googleRepository.getLeaderboardData();
    assert.deepEqual(supabaseData.leaderboard, googleData.leaderboard);
    for (const key of ["dedi|dimas", "andi|budi", "carlo|don"]) {
      assert.deepEqual(comparableTeam(supabaseData, key), comparableTeam(googleData, key));
    }
    assert.deepEqual(supabaseData.getTeam("dedi|dimas").tournaments[0].matches.map(match => [match.isBye, match.result]), [[true, null], [false, "win"]]);
    assert.equal(supabaseData.getTeam("dedi|dimas").played, 1);
    assert.equal(supabaseData.getTeam("andi|budi").played, 2);
    assert.ok(supabaseData.getTeam("dedi|dimas").tournaments[0].matches.every(match => match.score1 === null && match.score2 === null));
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("Google Sheets leaderboard retrieval propagates a failed session detail request", async () => {
  const previousFetch = globalThis.fetch;
  const requestedPaths = [];
  globalThis.fetch = async path => {
    requestedPaths.push(String(path));
    return String(path) === "/api/sessions"
      ? response({ ok: true, data: { sessions: [{ session_id: sessionId }] } })
      : response({ ok: false, error: "Session detail unavailable." }, 502);
  };
  try {
    const { competitionRepository } = createAppDependencies({ dataProvider: "google-sheets" });
    await assert.rejects(competitionRepository.getLeaderboardData(), /Session detail unavailable/);
    assert.deepEqual(requestedPaths, ["/api/sessions", `/api/session?session_id=${sessionId}`]);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("composition selects only the configured provider and rejects unknown providers", () => {
  const googleServices = createAppDependencies({ dataProvider: "google-sheets" });
  assert.equal(googleServices.provider, googleSheetsProvider);
  assert.equal(typeof googleServices.competitionRepository.getLeaderboardData, "function");
  const supabaseServices = createAppDependencies({ dataProvider: "supabase", supabaseUrl: "https://example.supabase.co", supabaseAnonKey: "public-test-key" });
  assert.notEqual(supabaseServices.provider, googleSheetsProvider);
  assert.equal(typeof supabaseServices.competitionRepository.getLeaderboardData, "function");
  assert.throws(() => createAppDependencies({ dataProvider: "not-configured" }), /Provider data tidak didukung/);
});
