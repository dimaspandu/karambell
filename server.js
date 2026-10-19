#!/usr/bin/env node
"use strict";

/**
 * Tiny static file server for the Karambell UI.
 * Uses Node.js built-ins only; no npm install required.
 */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number.parseInt(process.env.PORT || "3000", 10);
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL || "https://script.google.com/macros/s/AKfycbwuNExJjIzedJqZhVPz84QSsNLwG4V2thsYTkskGsQsiIKOkYDYCFvgdZy_0nciFGC8bg/exec";
const ROOT = path.resolve(__dirname);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8"
};

function send(res, status, body, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": contentType,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Cache-Control": "no-cache"
  });
  res.end(body);
}

async function readJsonBody(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 1024 * 1024) throw new Error("Request body too large.");
  }
  if (!body) return {};
  try { return JSON.parse(body); }
  catch { throw new Error("Invalid JSON request body."); }
}

function sendJson(res, status, payload) {
  return send(res, status, JSON.stringify(payload), "application/json; charset=utf-8");
}

async function callAppsScript({ method = "GET", params = {}, body = null }) {
  const url = new URL(APPS_SCRIPT_URL);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  });
  const options = { method, redirect: "follow", headers: { Accept: "application/json" } };
  if (body !== null) {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  const text = await response.text();
  let payload;
  try { payload = JSON.parse(text); }
  catch { throw new Error(`Apps Script returned a non-JSON response (HTTP ${response.status}). Check Web App deployment access and script execution logs.`); }
  if (!response.ok) throw new Error(payload.error || `Apps Script request failed (${response.status}).`);
  if (payload && payload.ok === false) throw new Error(payload.error || "Apps Script request failed.");
  return payload && Object.prototype.hasOwnProperty.call(payload, "data") ? payload.data : payload;
}

async function handleApi(req, res, url) {
  try {
    if (req.method === "GET" && url.pathname === "/api/health") {
      return sendJson(res, 200, { ok: true, service: "karambol-gamebell-api" });
    }

    if (req.method === "GET" && url.pathname === "/api/sessions") {
      const data = await callAppsScript({ params: { action: "listSessions" } });
      return sendJson(res, 200, { ok: true, data });
    }

    if (req.method === "GET" && url.pathname === "/api/session") {
      const sessionId = url.searchParams.get("session_id");
      if (!sessionId) return sendJson(res, 400, { ok: false, error: "session_id is required." });
      const data = await callAppsScript({ params: { action: "getSession", session_id: sessionId } });
      return sendJson(res, 200, { ok: true, data });
    }

    if (req.method === "POST" && url.pathname === "/api/sessions") {
      const input = await readJsonBody(req);
      const data = await callAppsScript({ method: "POST", body: { ...input, action: "createSession" } });
      return sendJson(res, 201, { ok: true, data });
    }

    if (req.method === "POST" && url.pathname === "/api/participants") {
      const input = await readJsonBody(req);
      const data = await callAppsScript({ method: "POST", body: { ...input, action: "addParticipant" } });
      return sendJson(res, 200, { ok: true, data });
    }

    if (req.method === "POST" && url.pathname === "/api/matches/score") {
      const input = await readJsonBody(req);
      const data = await callAppsScript({ method: "POST", body: { ...input, action: "updateMatchScore" } });
      return sendJson(res, 200, { ok: true, data });
    }

    return sendJson(res, 404, { ok: false, error: "API endpoint not found." });
  } catch (error) {
    console.error("API request failed:", error.message);
    return sendJson(res, 502, { ok: false, error: error.message || "Unable to reach Google Apps Script." });
  }
}

const server = http.createServer(async (req, res) => {
  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  } catch {
    return send(res, 400, "Bad Request");
  }

  if (url.pathname.startsWith("/api/")) {
    if (!["GET", "POST"].includes(req.method)) {
      res.setHeader("Allow", "GET, POST");
      return sendJson(res, 405, { ok: false, error: "Method Not Allowed" });
    }
    return handleApi(req, res, url);
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return send(res, 405, "Method Not Allowed");
  }

  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return send(res, 400, "Bad Request");
  }

  if (pathname.includes("\0")) return send(res, 400, "Bad Request");

  const requestedPath = path.resolve(ROOT, `.${pathname}`);
  if (requestedPath !== ROOT && !requestedPath.startsWith(ROOT + path.sep)) {
    return send(res, 403, "Forbidden");
  }

  let filePath = requestedPath;
  try {
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, "index.html");
    }
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      return send(res, 404, "Not Found");
    }

    const contentType = MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
    const stat = fs.statSync(filePath);
    res.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": stat.size,
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "SAMEORIGIN",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Cache-Control": "no-cache"
    });
    if (req.method === "HEAD") return res.end();

    const stream = fs.createReadStream(filePath);
    stream.on("error", () => {
      if (!res.headersSent) send(res, 500, "Internal Server Error");
      else res.destroy();
    });
    stream.pipe(res);
  } catch (error) {
    console.error("Request failed:", error.message);
    if (!res.headersSent) send(res, 500, "Internal Server Error");
    else res.destroy();
  }
});
server.listen(PORT, HOST, () => {
  console.log(`Karambol Gamebell UI running at http://${HOST}:${PORT}`);
  console.log("API proxy: /api/sessions, /api/session, /api/participants, /api/matches/score");
  console.log("Press Ctrl+C to stop.");
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use. Try PORT=3001 node server.js`);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});
