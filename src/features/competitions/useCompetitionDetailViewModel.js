import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { competitionDetailStateReducer, initialCompetitionDetailState, selectCompetitionDetail } from "./competitionDetailViewModel.js";

export function useCompetitionDetailViewModel({ repository, route, listStatus, competitions, upsertCompetition }) {
  const [state, dispatch] = useReducer(competitionDetailStateReducer, initialCompetitionDetailState);
  const [retryKey, setRetryKey] = useState(0);
  const nextRequestId = useRef(0);
  const sessionId = route.sessionId == null ? null : String(route.sessionId);
  const listed = competitions.find(item => item.id === sessionId);

  useEffect(() => {
    const requestId = ++nextRequestId.current;
    if (!sessionId) {
      dispatch({ type: "clear", requestId });
      return undefined;
    }
    if (listStatus === "loading" || listed) return undefined;
    let active = true;
    dispatch({ type: "load-start", requestId, sessionId });
    repository.getCompetition(sessionId).then(competition => {
      if (!active) return;
      dispatch({ type: "load-success", requestId, competition });
      upsertCompetition(competition);
    }).catch(error => {
      if (active) dispatch({ type: "load-error", requestId, error });
    });
    return () => { active = false; };
  }, [repository, sessionId, listStatus, listed, upsertCompetition, retryKey]);

  const retry = useCallback(() => setRetryKey(value => value + 1), []);
  return { ...selectCompetitionDetail(state, sessionId, competitions), retry };
}
