// ==============================
// History++ Core v1.0.3
// ==============================
//
// A lightweight client-side router built on top of the native History API.
// Designed for simplicity, extensibility, and predictable lifecycle behavior.
//
// This version introduces non-breaking enhancements over v1.0.2:
//
// + Route caching (O(1) lookup after first match)
// + Optional trie-based matcher for large route sets
// + Global notFound handler for unmatched routes
// + Improved navigation guards and rollback handling
//
// Key Features:
// - History & Hash mode support
// - Dynamic route params (/user/:id)
// - Middleware pipeline
// - Full lifecycle hooks:
//   onArrive, onMeet, onExit, onReturn, onComeback
// - End route support (mobile-like back behavior)
// - Configurable matcher: "simple" (default) or "trie"
//
// Notes:
// - Default matcher uses regex + cache for optimal real-world performance
// - Trie matcher is recommended for large-scale routing scenarios
// - NotFound handler is optional and non-breaking
//
// ==============================

(function () {
  // ==============================
  // INTERNAL STATE
  // ==============================

  // Registered routes
  let routes = [];

  // Global middleware stack
  let middlewares = [];

  // Currently active route
  let current = null;

  // Optional not found handler
  let notFoundHandler = null;

  // Global configuration
  let CONFIG = {
    base: "",          // base path (e.g. /examples/app)
    mode: "history",   // "history" or "hash"
    matcher: "simple"  // "simple" (regex) or "trie"
  };

  // ==============================
  // PUBLIC API
  // ==============================

  // Configure router behavior
  History.prototype.config = function (options = {}) {
    CONFIG.base = options.base || "";
    CONFIG.mode = options.mode || "history";
    CONFIG.matcher = options.matcher || "simple";
  };

  // Register middleware
  History.prototype.use = function (fn) {
    middlewares.push(fn);
  };

  // Register global 404 handler
  History.prototype.notFound = function (handler) {
    if (typeof handler === "function") {
      notFoundHandler = handler;
    }
    return this;
  };

  // ==============================
  // MIDDLEWARE EXECUTION
  // ==============================

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
  // PATH UTILITIES
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

  // Build URL based on mode (history/hash)
  function buildURL(path) {
    path = normalizePath(path);

    if (CONFIG.mode === "hash") {
      return "/#" + path;
    }

    return addBase(path);
  }

  // Get current path depending on mode
  function getCurrentPath() {
    if (CONFIG.mode === "hash") {
      const hash = location.hash.replace(/^#/, "");
      return normalizePath(hash || "/");
    }

    return normalizePath(location.pathname + location.search);
  }

  // ==============================
  // MATCHING SYSTEM
  // ==============================

  // Cache for simple matcher
  let routeCache = Object.create(null);

  // Root node for trie matcher
  const trieRoot = {};

  // Compile route into optimized structure
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

  // Insert route into trie structure
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

  // Trie-based matching (faster for large route sets)
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

  // Simple matcher (regex + cache)
  function matchSimple(path) {
    path = normalizePath(path);

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
  // END ROUTE LOGIC
  // ==============================

  function isEndRoute(route, ctx) {
    if (!route) return false;

    if (typeof route.end === "function") {
      return !!route.end(ctx);
    }

    return !!route.end;
  }

  // ==============================
  // CORE NAVIGATION ENGINE
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
      // Guard: canLeave
      if (current && current.canLeave) {
        const allowed = current.canLeave(ctx);

        if (!allowed) {
          // rollback navigation if blocked
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

      // Exit hooks
      if (current) {
        if (type === "pop" && current.onReturn) {
          current.onReturn(ctx);
        }

        if (current.onExit) {
          current.onExit(ctx);
        }
      }

      // Not found handling
      if (!match) {
        if (notFoundHandler) {
          notFoundHandler(ctx);
        } else {
          console.warn("Route not found:", cleanPath);
        }
        return;
      }

      const next = match.route;
      current = next;

      // Entry lifecycle
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
  // ROUTE REGISTRATION
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

    // Reset cache when routes change
    routeCache = Object.create(null);

    return this;
  };

  // ==============================
  // NAVIGATION METHODS
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
  // BROWSER EVENTS
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

    // End route behavior (mobile-like exit)
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