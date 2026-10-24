import test from "node:test";
import assert from "node:assert/strict";
import { competitionListStateReducer, initialCompetitionListState, loadCompetitionList } from "../src/features/competitions/competitionListViewModel.js";
import { competitionDetailStateReducer, initialCompetitionDetailState, selectCompetitionDetail } from "../src/features/competitions/competitionDetailViewModel.js";

const first = { id: "one", name: "One" };
const second = { id: "two", name: "Two" };

test("list ViewModel state covers loading, success, error, retry and stale responses", () => {
  let state = competitionListStateReducer(initialCompetitionListState, { type: "load-start", requestId: 1 });
  state = competitionListStateReducer(state, { type: "load-error", requestId: 1, error: new Error("offline") });
  assert.equal(state.status, "error");
  state = competitionListStateReducer(state, { type: "load-start", requestId: 2 });
  assert.equal(state.status, "loading");
  const current = competitionListStateReducer(state, { type: "load-success", requestId: 1, competitions: [first] });
  assert.equal(current, state);
  state = competitionListStateReducer(state, { type: "load-success", requestId: 2, competitions: [first] });
  assert.equal(state.status, "success");
  assert.deepEqual(state.competitions, [first]);
});

test("list loading exits loading on failure and a fresh retry can recover", async () => {
  let state = initialCompetitionListState;
  let attempts = 0;
  const dispatch = action => { state = competitionListStateReducer(state, action); };
  const repository = {
    async listCompetitions() {
      attempts += 1;
      if (attempts === 1) throw new Error("Supabase unavailable");
      return [first];
    }
  };

  dispatch({ type: "load-start", requestId: 1 });
  await loadCompetitionList({ repository, dispatch, requestId: 1 });
  assert.equal(state.status, "error");
  assert.equal(state.error.message, "Supabase unavailable");

  dispatch({ type: "load-start", requestId: 2 });
  await loadCompetitionList({ repository, dispatch, requestId: 2 });
  assert.equal(attempts, 2);
  assert.equal(state.status, "success");
  assert.deepEqual(state.competitions, [first]);
});

test("mutation upserts replace the competition and propagate refreshed downstream match data", () => {
  const original = {
    id: "cup",
    matches: [
      { id: "quarterfinal", winnerId: "team-a", status: "completed" },
      { id: "semifinal", participant1Id: "team-a", winnerId: null, status: "pending" },
      { id: "final", participant1Id: null, winnerId: null, status: "pending" }
    ]
  };
  const unrelated = { id: "other-cup", matches: [] };
  const initial = { ...initialCompetitionListState, status: "success", requestId: 4, competitions: [original, unrelated] };
  const afterFirstUpdate = {
    ...original,
    matches: [
      { ...original.matches[0], winnerId: "team-b" },
      { ...original.matches[1], participant1Id: "team-b" },
      original.matches[2]
    ]
  };

  const first = competitionListStateReducer(initial, { type: "upsert", competition: afterFirstUpdate });
  assert.notEqual(first, initial);
  assert.notEqual(first.competitions, initial.competitions);
  assert.equal(first.competitions[0], afterFirstUpdate);
  assert.equal(first.competitions[0].matches[0].winnerId, "team-b");
  assert.equal(first.competitions[0].matches[1].participant1Id, "team-b");
  assert.equal(first.competitions[1], unrelated);

  const afterSecondUpdate = {
    ...afterFirstUpdate,
    matches: afterFirstUpdate.matches.map(match => match.id === "quarterfinal" ? { ...match, winnerId: "team-a" } : match)
  };
  const second = competitionListStateReducer(first, { type: "upsert", competition: afterSecondUpdate });
  assert.equal(second.competitions.length, 2);
  assert.equal(second.competitions[0].matches[0].winnerId, "team-a");
  assert.equal(second.competitions[0].matches[1].participant1Id, "team-b");
});

test("detail selection follows the route and never exposes a previous session while loading", () => {
  let state = competitionDetailStateReducer(initialCompetitionDetailState, { type: "load-start", requestId: 1, sessionId: "one" });
  state = competitionDetailStateReducer(state, { type: "load-success", requestId: 1, competition: first });
  assert.deepEqual(selectCompetitionDetail(state, "one", []), { status: "success", competition: first, error: null });
  assert.deepEqual(selectCompetitionDetail(state, "two", []), { status: "loading", competition: null, error: null });
  state = competitionDetailStateReducer(state, { type: "load-start", requestId: 2, sessionId: "two" });
  assert.equal(selectCompetitionDetail(state, "two", []).competition, null);
  state = competitionDetailStateReducer(state, { type: "load-error", requestId: 2, error: new Error("not found") });
  assert.equal(selectCompetitionDetail(state, "two", []).status, "error");
});

test("detail state ignores stale results and prefers a competition already loaded in the list", () => {
  let state = competitionDetailStateReducer(initialCompetitionDetailState, { type: "load-start", requestId: 2, sessionId: "two" });
  const current = competitionDetailStateReducer(state, { type: "load-success", requestId: 1, competition: first });
  assert.equal(current, state);
  assert.deepEqual(selectCompetitionDetail(state, "one", [first]), { status: "success", competition: first, error: null });
  assert.deepEqual(selectCompetitionDetail(state, null, []), { status: "idle", competition: null, error: null });
});
