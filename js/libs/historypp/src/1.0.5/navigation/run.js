import { normalizePath, stripBase, buildURL } from "../utils/path.js";
import { parseQuery } from "../utils/query.js";
import { runMiddlewares } from "../middleware/run-middlewares.js";
import { matchRoute } from "../matcher/match-route.js";

export function run(state, fullPath, type) {

  const [pathname, search = ""] = fullPath.split("?");

  const cleanPath = stripBase(
    normalizePath(pathname),
    state.config.base
  );

  const query = parseQuery(search);

  const match = matchRoute(cleanPath, state);

  const ctx = {
    path: cleanPath,
    params: match?.params || {},
    query,
    from: state.current?.path || null,
    to: cleanPath,
    type
  };

  runMiddlewares(state.middlewares, ctx, () => {

    if (type === "pop" &&
        state.current &&
        state.current.canLeave) {

      const allowed = state.current.canLeave(ctx);

      if (!allowed) {

        const rollbackURL = buildURL(
          state.current.path,
          state.config
        );

        if (state.config.mode === "hash") {
          location.replace("#" + state.current.path);
        } else {
          history.pushState(history.state, "", rollbackURL);
        }

        return;
      }
    }

    if (state.current) {

      if (type === "pop" &&
          state.current.onReturn) {

        state.current.onReturn(ctx);
      }

      if (state.current.onExit) {
        state.current.onExit(ctx);
      }
    }

    if (!match) {

      if (state.notFoundHandler) {
        state.notFoundHandler(ctx);
      }

      return;
    }

    const next = match.route;

    state.current = next;

    if (type === "pop") {

      if (next.onComeback) {
        next.onComeback(ctx);
      }

    } else {

      if (next.onArrive) {
        next.onArrive(ctx);
      }
    }

    if (next.onMeet) {
      next.onMeet(ctx);
    }
  });
}