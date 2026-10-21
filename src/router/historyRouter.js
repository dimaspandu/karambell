import { createEngine } from "../libs/historypp/src/1.0.5/index.js";

const engine = createEngine();
const listeners = new Set();
let snapshot = { name: "home", sessionId: null, tab: null, error: null };
let registered = false;

function safeDecode(segment) {
  try { return decodeURIComponent(segment); } catch { return null; }
}

function resolveLocation() {
  const url = new URL(window.location.href);
  const pathname = url.pathname.replace(/\/$/, "") || "/";
  if (pathname === "/") {
    const legacyId = url.searchParams.get("session_id");
    if (legacyId !== null) {
      const legacyPage = url.searchParams.get("page");
      const name = ["participants", "matches", "bracket"].includes(legacyPage) ? legacyPage : "bracket";
      queueMicrotask(() => navigate(name, { sessionId: legacyId }, { replace: true }));
      return { name, sessionId: legacyId, tab: name === "matches" ? "matches" : name, error: null };
    }
    return { name: "home", sessionId: null, tab: null, error: null };
  }
  if (pathname === "/competitions") return { name: "competitions", sessionId: null, tab: null, error: null };
  const detail = pathname.match(/^\/competitions\/([^/]+)$/);
  if (detail) {
    const sessionId = safeDecode(detail[1]);
    return sessionId ? { name: "competition-detail", sessionId, tab: "bracket", error: null } : { name: "competitions", sessionId: null, tab: null, error: "ID kompetisi pada URL tidak valid." };
  }
  for (const name of ["participants", "bracket", "matches"]) {
    const base = `/${name}`;
    if (pathname === base) return { name, sessionId: null, tab: name, error: null };
    const match = pathname.match(new RegExp(`^${base}/([^/]+)$`));
    if (match) {
      const sessionId = safeDecode(match[1]);
      return sessionId ? { name, sessionId, tab: name, error: null } : { name: "competitions", sessionId: null, tab: null, error: "ID kompetisi pada URL tidak valid." };
    }
  }
  return { name: "competitions", sessionId: null, tab: null, error: `Rute "${pathname}" tidak dikenal.` };
}

function publish(route = resolveLocation()) {
  snapshot = route;
  listeners.forEach(listener => listener());
}

function onMeet() {
  const route = resolveLocation();
  publish(route);
  if (route.error) queueMicrotask(() => engine.navigateReplace("/competitions", { karambell: true }));
}

function startRouter() {
  if (!registered) {
    registered = true;
    for (const path of ["/", "/competitions", "/competitions/:sessionId", "/participants", "/participants/:sessionId", "/bracket", "/bracket/:sessionId", "/matches", "/matches/:sessionId"]) {
      engine.router(path, { onMeet });
    }
    engine.notFound(() => {
      publish({ name: "competitions", sessionId: null, tab: null, error: `Rute "${window.location.pathname}" tidak dikenal.` });
      queueMicrotask(() => engine.navigateReplace("/competitions", { karambell: true }));
    });
  }
  engine.navigateReplace(`${window.location.pathname}${window.location.search}${window.location.hash}`, { karambell: true });
}

function navigate(name, params = {}, { replace = false } = {}) {
  const paths = { home: "/", competitions: "/competitions", "competition-detail": "/competitions", participants: "/participants", bracket: "/bracket", matches: "/matches" };
  if (!paths[name]) throw new Error(`Rute tidak dikenal: ${name}`);
  if (name === "competition-detail" && !params.sessionId) name = "competitions";
  const path = name === "competition-detail" || (name !== "home" && name !== "competitions" && params.sessionId)
    ? `${paths[name]}/${encodeURIComponent(params.sessionId)}`
    : paths[name];
  const url = new URL(window.location.href);
  url.pathname = path;
  url.searchParams.delete("page");
  url.searchParams.delete("session_id");
  url.searchParams.delete("match_id");
  const next = `${url.pathname}${url.search}${url.hash}`;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (current === next) return false;
  engine[replace ? "navigateReplace" : "navigatePush"](next, { karambell: true });
  return true;
}

export const historyRouter = {
  start: startRouter,
  navigate,
  subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  getSnapshot() { return snapshot; }
};
