import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { initialLeaderboardState, leaderboardStateReducer, selectLeaderboardPage } from "./leaderboardViewModel.js";

export function useLeaderboardViewModel({ repository, route, enabled }) {
  const [state, dispatch] = useReducer(leaderboardStateReducer, initialLeaderboardState);
  const [reloadKey, setReloadKey] = useState(0);
  const nextRequestId = useRef(0);

  useEffect(() => {
    if (!enabled) return undefined;
    let active = true;
    const requestId = ++nextRequestId.current;
    dispatch({ type: "load-start", requestId });
    repository.getLeaderboardData().then(data => {
      if (active) dispatch({ type: "load-success", requestId, data });
    }).catch(error => {
      if (active) dispatch({ type: "load-error", requestId, error });
    });
    return () => { active = false; };
  }, [repository, enabled, reloadKey]);

  const retry = useCallback(() => setReloadKey(value => value + 1), []);
  return {
    status: state.status,
    page: selectLeaderboardPage(state, route),
    retry
  };
}
