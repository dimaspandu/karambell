const DEFAULT_APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwuNExJjIzedJqZhVPz84QSsNLwG4V2thsYTkskGsQsiIKOkYDYCFvgdZy_0nciFGC8bg/exec";
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL || DEFAULT_APPS_SCRIPT_URL;

function jsonResponse(status, payload) {
  return Response.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

async function callAppsScript({ method = "GET", params = {}, body = null }) {
  const url = new URL(APPS_SCRIPT_URL);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }

  const options = { method, redirect: "follow", headers: { Accept: "application/json" } };
  if (body !== null) {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`Apps Script returned a non-JSON response (HTTP ${response.status}). Check Web App deployment access and script execution logs.`);
  }
  if (!response.ok) throw new Error(payload.error || `Apps Script request failed (${response.status}).`);
  if (payload?.ok === false) throw new Error(payload.error || "Apps Script request failed.");
  return payload && Object.prototype.hasOwnProperty.call(payload, "data") ? payload.data : payload;
}

async function readJsonBody(request) {
  const text = await request.text();
  if (text.length > 1024 * 1024) throw new Error("Request body too large.");
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Invalid JSON request body.");
  }
}

export default async function handler(request) {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();

  if (method === "GET" && url.pathname === "/api/health") {
    return jsonResponse(200, { ok: true, service: "karambol-gamebell-api" });
  }

  if (method === "GET" && url.pathname === "/api/sessions") {
    try {
      const data = await callAppsScript({ params: { action: "listSessions" } });
      return jsonResponse(200, { ok: true, data });
    } catch (error) {
      return apiError(error);
    }
  }

  if (method === "GET" && url.pathname === "/api/session") {
    const sessionId = url.searchParams.get("session_id");
    if (!sessionId) return jsonResponse(400, { ok: false, error: "session_id is required." });
    try {
      const data = await callAppsScript({ params: { action: "getSession", session_id: sessionId } });
      return jsonResponse(200, { ok: true, data });
    } catch (error) {
      return apiError(error);
    }
  }

  const actions = {
    "/api/sessions": { action: "createSession", status: 201 },
    "/api/participants": { action: "addParticipant", status: 200 },
    "/api/matches/score": { action: "updateMatchScore", status: 200 }
  };
  if (method === "POST" && actions[url.pathname]) {
    try {
      const input = await readJsonBody(request);
      const route = actions[url.pathname];
      const data = await callAppsScript({ method: "POST", body: { ...input, action: route.action } });
      return jsonResponse(route.status, { ok: true, data });
    } catch (error) {
      const status = error.message === "Request body too large." || error.message === "Invalid JSON request body." ? 400 : 502;
      return jsonResponse(status, { ok: false, error: error.message || "Unable to reach Google Apps Script." });
    }
  }

  if (["GET", "POST"].includes(method)) return jsonResponse(404, { ok: false, error: "API endpoint not found." });
  return jsonResponse(405, { ok: false, error: "Method Not Allowed" });
}

function apiError(error) {
  console.error("API request failed:", error.message);
  return jsonResponse(502, { ok: false, error: error.message || "Unable to reach Google Apps Script." });
}

export const config = {
  path: [
    "/api/health",
    "/api/sessions",
    "/api/session",
    "/api/participants",
    "/api/matches/score"
  ]
};
