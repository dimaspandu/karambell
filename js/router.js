(() => {
  "use strict";

  const routes = Object.freeze({
    home: { path: "/", tab: null, requiresSession: false },
    competitions: { path: "/competitions", tab: null, requiresSession: false },
    "competition-detail": { path: "/competitions", tab: "bracket", requiresSession: true },
    participants: { path: "/participants", tab: "participants", requiresSession: false },
    bracket: { path: "/bracket", tab: "bracket", requiresSession: false },
    matches: { path: "/matches", tab: "matches", requiresSession: false }
  });
  let routeHandler = null;

  function safeDecode(segment) {
    try { return decodeURIComponent(segment); }
    catch { return null; }
  }

  function resolve(url = new URL(window.location.href)) {
    const pathname = url.pathname.replace(/\/$/, "") || "/";
    if (pathname === "/") {
      const legacyId = url.searchParams.get("session_id");
      if (legacyId !== null) {
        const legacyPage = url.searchParams.get("page");
        const name = legacyPage === "participants" || legacyPage === "matches" || legacyPage === "bracket" ? legacyPage : "bracket";
        return { name, sessionId: legacyId, tab: routes[name].tab, legacy: true };
      }
      return { name: "home", sessionId: null, tab: null };
    }
    if (pathname === "/competitions") return { name: "competitions", sessionId: null, tab: null };

    const detailMatch = pathname.match(/^\/competitions\/([^/]+)$/);
    if (detailMatch) {
      const sessionId = safeDecode(detailMatch[1]);
      return sessionId ? { name: "competition-detail", sessionId, tab: "bracket" } : invalid("ID kompetisi pada URL tidak valid.");
    }

    for (const name of ["participants", "bracket", "matches"]) {
      const base = routes[name].path;
      if (pathname === base) return { name, sessionId: null, tab: routes[name].tab };
      const match = pathname.match(new RegExp(`^${base}/([^/]+)$`));
      if (match) {
        const sessionId = safeDecode(match[1]);
        return sessionId ? { name, sessionId, tab: routes[name].tab } : invalid("ID kompetisi pada URL tidak valid.");
      }
    }

    return invalid(`Rute "${pathname}" tidak dikenal.`);
  }

  function invalid(message) {
    return { name: "competitions", sessionId: null, tab: null, error: message };
  }

  function buildURL(name, params = {}) {
    const definition = routes[name];
    if (!definition) throw new Error(`Unknown route: ${name}`);
    if (definition.requiresSession && !params.sessionId) return buildURL("competitions");

    const url = new URL(window.location.href);
    url.pathname = definition.requiresSession || (name !== "home" && params.sessionId)
      ? `${definition.path}/${encodeURIComponent(params.sessionId)}`
      : definition.path;
    url.searchParams.delete("page");
    url.searchParams.delete("session_id");
    url.searchParams.delete("match_id");
    return url;
  }

  function navigate(name, params = {}, { replace = false } = {}) {
    const url = buildURL(name, params);
    const current = new URL(window.location.href);
    const currentRoute = resolve(current);
    const targetName = name === "competition-detail" && !params.sessionId ? "competitions" : name;
    if (currentRoute.name === targetName && currentRoute.sessionId === (params.sessionId || null)) return false;
    if (url.href === current.href) return false;

    const method = replace ? "replaceState" : "pushState";
    window.history[method]({ ...window.history.state, karambell: true }, "", url);
    dispatch(resolve(url));
    return true;
  }

  function normalizeAndDispatch() {
    const route = resolve();
    if (route.error || route.legacy) {
      const url = buildURL(route.name, { sessionId: route.sessionId });
      window.history.replaceState({ ...window.history.state, karambell: true }, "", url);
    }
    dispatch(route);
  }

  function dispatch(route) {
    if (routeHandler) routeHandler(route);
  }

  function start(handler) {
    routeHandler = handler;
    window.removeEventListener("popstate", normalizeAndDispatch);
    window.addEventListener("popstate", normalizeAndDispatch);
    normalizeAndDispatch();
  }

  window.KarambellRouter = Object.freeze({ routes, resolve, navigate, start });
})();
