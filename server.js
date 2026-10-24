#!/usr/bin/env node
"use strict";

// Optional local static preview server for the built application.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number.parseInt(process.env.PORT || "3000", 10);
const ROOT = path.resolve(__dirname, "dist");
const MIME_TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon" };

const server = http.createServer((req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD" });
    return res.end("Method Not Allowed");
  }
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, `http://${req.headers.host || "localhost"}`).pathname); }
  catch { res.writeHead(400); return res.end("Bad Request"); }
  if (pathname.includes("\0")) { res.writeHead(400); return res.end("Bad Request"); }
  const requested = path.resolve(ROOT, `.${pathname}`);
  if (requested !== ROOT && !requested.startsWith(ROOT + path.sep)) { res.writeHead(403); return res.end("Forbidden"); }
  let file = requested;
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    if (!path.extname(pathname)) file = path.join(ROOT, "index.html");
    else { res.writeHead(404); return res.end("Not Found"); }
  }
  res.writeHead(200, { "Content-Type": MIME_TYPES[path.extname(file).toLowerCase()] || "application/octet-stream", "X-Content-Type-Options": "nosniff", "Cache-Control": "no-cache" });
  if (req.method === "HEAD") return res.end();
  fs.createReadStream(file).pipe(res);
});

server.listen(PORT, HOST, () => console.log(`Karambell preview running at http://${HOST}:${PORT}`));
