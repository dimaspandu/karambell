// ==============================
// History++ Core v1.0.0
// Full Lifecycle
// ==============================

(function () {
  const routes = [];
  let current = null;

  // ==============================
  // CONFIG
  // ==============================

  let CONFIG = {
    base: "",
    mode: "history" // "history" | "hash"
  };

  History.prototype.config = function (options = {}) {
    CONFIG.base = options.base || "";
    CONFIG.mode = options.mode || "history";
  };

  // ==============================
  // PATH MANAGER
  // ==============================

  function normalizePath(path) {
    if (!path) return "/";

    if (path.startsWith("#")) path = path.slice(1);
    if (!path.startsWith("/")) path = "/" + path;

    return path;
  }

  function stripBase(path) {
    if (CONFIG.base && path.startsWith(CONFIG.base)) {
      const stripped = path.slice(CONFIG.base.length);
      return stripped || "/";
    }
    return path;
  }

  function addBase(path) {
    if (!CONFIG.base) return path;
    if (path.startsWith(CONFIG.base)) return path;
    return CONFIG.base + path;
  }

  function parseQuery(search = "") {
    const query = {};
    const params = new URLSearchParams(search);

    for (const [k, v] of params.entries()) {
      query[k] = v;
    }

    return query;
  }

  function buildURL(path) {
    path = normalizePath(path);

    if (CONFIG.mode === "hash") {
      return "/#" + path;
    }

    return addBase(path);
  }

  function getCurrentPath() {
    if (CONFIG.mode === "hash") {
      const hash = location.hash.replace(/^#/, "");
      return normalizePath(hash || "/");
    }

    return normalizePath(location.pathname + location.search);
  }

  // ==============================
  // ROUTE MATCHER
  // ==============================

  function matchRoute(path) {
    path = normalizePath(path);

    for (const r of routes) {
      if (r.path === path) {
        return { route: r, params: {} };
      }

      if (r.path.includes(":")) {
        const keys = [];

        const pattern = r.path.replace(/:([^/]+)/g, (_, key) => {
          keys.push(key);
          return "([^/]+)";
        });

        const regex = new RegExp("^" + pattern + "$");
        const match = path.match(regex);

        if (match) {
          const params = {};
          keys.forEach((k, i) => {
            params[k] = match[i + 1];
          });

          return { route: r, params };
        }
      }
    }

    return null;
  }

  // ==============================
  // END RESOLVER (NEW)
  // ==============================

  /**
   * Resolve whether a route is an end route.
   * Supports:
   * - boolean
   * - function(ctx)
   */
  function isEndRoute(route, ctx) {
    if (!route) return false;

    if (typeof route.end === "function") {
      return !!route.end(ctx);
    }

    return !!route.end;
  }

  // ==============================
  // CORE RUNNER
  // ==============================

  function run(fullPath, type) {
    const [pathname, search = ""] = fullPath.split("?");

    const cleanPath = stripBase(normalizePath(pathname));
    const query = parseQuery(search);

    const match = matchRoute(cleanPath);

    const ctx = {
      path: cleanPath,
      params: match?.params || {},
      query,
      from: current?.path || null,
      to: cleanPath,
      type
    };

    // ==============================
    // GUARD (canLeave)
    // ==============================

    if (current && current.canLeave) {
      const allowed = current.canLeave(ctx);

      if (!allowed) {
        if (type === "pop" && current) {
          const rollbackURL = buildURL(current.path);

          if (CONFIG.mode === "hash") {
            location.replace("#" + current.path);
          } else {
            history.replaceState(history.state, "", rollbackURL);
          }
        }

        return;
      }
    }

    // ==============================
    // EXIT PHASE
    // ==============================

    if (current) {
      if (type === "pop" && current.onReturn) {
        current.onReturn(ctx);
      }

      if (current.onExit) {
        current.onExit(ctx);
      }
    }

    if (!match) {
      console.warn("Route not found:", cleanPath);
      return;
    }

    const next = match.route;
    current = next;

    // ==============================
    // ENTER PHASE
    // ==============================

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
  }

  // ==============================
  // ROUTER API
  // ==============================

  History.prototype.router = function (path, handler) {
    if (typeof handler === "function") {
      handler = { onMeet: handler };
    }

    routes.push({
      path: normalizePath(path),

      onMeet: handler?.onMeet || (() => {}),
      onArrive: handler?.onArrive || null,
      onExit: handler?.onExit || null,
      onReturn: handler?.onReturn || null,
      onComeback: handler?.onComeback || null,
      canLeave: handler?.canLeave || null,
      end: handler?.end ?? false
    });

    return this;
  };

  // ==============================
  // NAVIGATION
  // ==============================

  History.prototype.navigatePush = function (path, state = {}) {
    const url = buildURL(path);

    if (CONFIG.mode === "hash") {
      const clean = url.replace("/#", "");
      location.hash = clean;
      run(clean, "push");
      return;
    }

    history.pushState(state, "", url);
    run(url, "push");
  };

  History.prototype.navigateReplace = function (path, state = {}) {
    const url = buildURL(path);

    if (CONFIG.mode === "hash") {
      const clean = url.replace("/#", "");
      location.replace("#" + clean);
      run(clean, "replace");
      return;
    }

    history.replaceState(state, "", url);
    run(url, "replace");
  };

  History.prototype.navigatePop = function () {
    history.back();
  };

  // ==============================
  // EVENTS
  // ==============================

  window.addEventListener("popstate", () => {
    if (CONFIG.mode !== "history") return;

    // minimal ctx for end evaluation
    const ctx = {
      path: current?.path,
      from: current?.path,
      to: null,
      type: "pop",
      query: {}
    };

    // dynamic end support
    if (current && isEndRoute(current, ctx)) {
      history.go(-1);
      return;
    }

    run(location.pathname + location.search, "pop");
  });

  window.addEventListener("hashchange", () => {
    if (CONFIG.mode === "hash") {
      run(getCurrentPath(), "pop");
    }
  });

})();