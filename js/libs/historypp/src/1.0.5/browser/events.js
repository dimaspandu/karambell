import { run } from "../navigation/run.js";
import { isEndRoute } from "../navigation/guards.js";

export function bindBrowserEvents(state) {

  window.addEventListener("popstate", () => {

    if (state.config.mode !== "history") {
      return;
    }

    const ctx = {
      path: state.current?.path,
      from: state.current?.path,
      to: null,
      type: "pop",
      query: {}
    };

    if (
      state.current &&
      isEndRoute(state.current, ctx)
    ) {
      history.go(-1);
      return;
    }

    run(
      state,
      location.pathname + location.search,
      "pop"
    );
  });

  window.addEventListener("hashchange", () => {

    if (state.config.mode !== "hash") {
      return;
    }

    run(
      state,
      location.hash.replace(/^#/, ""),
      "pop"
    );
  });
}