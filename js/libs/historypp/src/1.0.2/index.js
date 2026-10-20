// ==============================
// History++ Core v1.0.2
// Non-breaking upgrade from v1.0.1
// + Route cache (memoization)
// + Precompiled dynamic routes
// + Optional trie matcher
// ==============================

(function () {
  let routes = [];
  let middlewares = [];
  let current = null;

  // ==============================
  // CONFIG
  // ==============================

  let CONFIG = {
    base: "",
    mode: "history",
    matcher: "simple" // "simple" | "trie"
  };

  History.prototype.config = function (options = {}) {
    CONFIG.base = options.base || "";
    CONFIG.mode = options.mode || "history";
    CONFIG.matcher = options.matcher || "simple";
  };

  // ==============================
  // MIDDLEWARE
  // ==============================

  History.prototype.use = function (fn) {
    middlewares.push(fn);
  };

  function runMiddlewares(ctx, finalHandler) {
    let index = -1;

    function dispatch(i) {
      if (i <= index) return;
      index = i;

      const mw = middlewares[i];
      if (!mw) return finalHandler();

      return mw(ctx, () => dispatch(i + 1));
    }

    return dispatch(0);
  }

  // ==============================
  // PATH UTILS
  // ==============================

  function normalizePath(path) {
    if (!path) return "/";
    if (path.startsWith("#")) path = path.slice(1);
    if (!path.startsWith("/")) path = "/" + path;
    return path;
  }

  function stripBase(path) {
    if (CONFIG.base && path.startsWith(CONFIG.base)) {
      const p = path.slice(CONFIG.base.length);
      return p || "/";
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
  // MATCHER (UPGRADED)
  // ==============================

  let routeCache = Object.create(null);
  const trieRoot = {};

  function compileRoute(path, handler) {
    const isDynamic = path.includes(":");

    let keys = [];
    let regex = null;

    if (isDynamic) {
      const pattern = path.replace(/:([^/]+)/g, (_, key) => {
        keys.push(key);
        return "([^/]+)";
      });

      regex = new RegExp("^" + pattern + "$");
    }

    return {
      path,
      isDynamic,
      keys,
      regex,
      ...handler
    };
  }

  function addToTrie(route) {
    const parts = route.path.split("/").filter(Boolean);
    let node = trieRoot;

    for (const part of parts) {
      const key = part.startsWith(":") ? ":" : part;

      node[key] = node[key] || {};
      node = node[key];

      if (key === ":") {
        node.paramKey = part.slice(1);
      }
    }

    node.route = route;
  }

  function matchTrie(path) {
    const parts = normalizePath(path).split("/").filter(Boolean);
    let node = trieRoot;
    const params = {};

    for (const part of parts) {
      if (node[part]) {
        node = node[part];
      } else if (node[":"]) {
        params[node[":"].paramKey] = part;
        node = node[":"];
      } else {
        return null;
      }
    }

    if (!node.route) return null;
    return { route: node.route, params };
  }

  function matchSimple(path) {
    path = normalizePath(path);

    // CACHE HIT
    if (routeCache[path]) {
      return routeCache[path];
    }

    for (const r of routes) {
      if (!r.isDynamic && r.path === path) {
        return (routeCache[path] = { route: r, params: {} });
      }

      if (r.isDynamic) {
        const match = path.match(r.regex);
        if (match) {
          const params = {};
          r.keys.forEach((k, i) => {
            params[k] = match[i + 1];
          });

          return (routeCache[path] = { route: r, params });
        }
      }
    }

    return null;
  }

  function matchRoute(path) {
    return CONFIG.matcher === "trie"
      ? matchTrie(path)
      : matchSimple(path);
  }

  // ==============================
  // END ROUTE
  // ==============================

  function isEndRoute(route, ctx) {
    if (!route) return false;

    if (typeof route.end === "function") {
      return !!route.end(ctx);
    }

    return !!route.end;
  }

  // ==============================
  // CORE RUNNER (UNCHANGED LOGIC)
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

    runMiddlewares(ctx, () => {

      // GUARD
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

      // EXIT
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

      // ENTER
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

  // ==============================
  // ROUTER API
  // ==============================

  History.prototype.router = function (path, handler) {
    if (typeof handler === "function") {
      handler = { onMeet: handler };
    }

    const compiled = compileRoute(normalizePath(path), handler);

    routes.push({
      ...compiled,
      onMeet: handler?.onMeet || (() => {}),
      onArrive: handler?.onArrive || null,
      onExit: handler?.onExit || null,
      onReturn: handler?.onReturn || null,
      onComeback: handler?.onComeback || null,
      canLeave: handler?.canLeave || null,
      end: handler?.end ?? false
    });

    if (CONFIG.matcher === "trie") {
      addToTrie(compiled);
    }

    // clear cache when route changes
    routeCache = Object.create(null);

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

    const ctx = {
      path: current?.path,
      from: current?.path,
      to: null,
      type: "pop",
      query: {}
    };

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