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
      if (attempts === 1) throw new Error("Sheets unavailable");
      return [first];
    }
  };

  dispatch({ type: "load-start", requestId: 1 });
  await loadCompetitionList({ repository, dispatch, requestId: 1 });
  assert.equal(state.status, "error");
  assert.equal(state.error.message, "Sheets unavailable");

  dispatch({ type: "load-start", requestId: 2 });
  await loadCompetitionList({ repository, dispatch, requestId: 2 });
  assert.equal(attempts, 2);
  assert.equal(state.status, "success");
  assert.deepEqual(state.competitions, [first]);
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
