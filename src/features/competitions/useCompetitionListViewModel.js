import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { competitionListStateReducer, initialCompetitionListState, loadCompetitionList } from "./competitionListViewModel.js";

export function useCompetitionListViewModel({ repository }) {
  const [state, dispatch] = useReducer(competitionListStateReducer, initialCompetitionListState);
  const [reloadKey, setReloadKey] = useState(0);
  const nextRequestId = useRef(0);

  useEffect(() => {
    let active = true;
    const requestId = ++nextRequestId.current;
    dispatch({ type: "load-start", requestId });
    loadCompetitionList({ repository, dispatch, requestId, isActive: () => active });
    return () => { active = false; };
  }, [repository, reloadKey]);

  const retry = useCallback(() => setReloadKey(value => value + 1), []);
  const upsertCompetition = useCallback(competition => dispatch({ type: "upsert", competition }), []);
  return { ...state, loading: state.status === "loading", loadError: state.status === "error", retry, upsertCompetition };
}
