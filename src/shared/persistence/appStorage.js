const LAST_SESSION_ID_KEY = "karambell:last-session-id";
const TEAM_SESSION_IDS_KEY = "karambell:team-session-ids";
const TEAM_PAIRING_DRAFT_KEY = "karambell:team-pairing-draft";

function getStorage() {
  try { return globalThis.window?.localStorage || null; }
  catch { return null; }
}

function readJson(key, fallback) {
  try {
    const storage = getStorage();
    if (!storage) return fallback;
    const value = JSON.parse(storage.getItem(key) || "null");
    return value == null ? fallback : value;
  } catch { return fallback; }
}

export function readLastSessionId() {
  try { return getStorage()?.getItem(LAST_SESSION_ID_KEY) || null; }
  catch { return null; }
}

export function saveLastSessionId(sessionId) {
  try { getStorage()?.setItem(LAST_SESSION_ID_KEY, String(sessionId)); }
  catch { /* Navigation still works when browser storage is unavailable. */ }
}

export function getTeamSessionIds() {
  const ids = readJson(TEAM_SESSION_IDS_KEY, []);
  return Array.isArray(ids) ? ids.map(String) : [];
}

export function isKnownTeamSession(sessionId) {
  return sessionId != null && getTeamSessionIds().includes(String(sessionId));
}

export function rememberTeamSession(sessionId) {
  if (sessionId == null) return;
  const ids = getTeamSessionIds();
  if (!ids.includes(String(sessionId))) ids.push(String(sessionId));
  try { getStorage()?.setItem(TEAM_SESSION_IDS_KEY, JSON.stringify(ids)); }
  catch { /* Provider data remains the cross-device source of truth. */ }
}

export function readTeamPairingDraft() {
  const draft = readJson(TEAM_PAIRING_DRAFT_KEY, null);
  return draft && typeof draft === "object" && !Array.isArray(draft) ? draft : null;
}

export function saveTeamPairingDraft(draft) {
  try { getStorage()?.setItem(TEAM_PAIRING_DRAFT_KEY, JSON.stringify(draft)); }
  catch { /* Pairing remains available for the current session. */ }
}

export function clearTeamPairingDraft() {
  try { getStorage()?.removeItem(TEAM_PAIRING_DRAFT_KEY); }
  catch { /* Clearing a draft is optional. */ }
}
