import { createServer } from "http";
import {
  existsSync,
  createReadStream,
  statSync
} from "fs";

import {
  extname,
  join,
  dirname
} from "path";

import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = process.env.PORT || 5173;

const mimeTypes = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json"
};

function serveFile(res, filePath) {

  if (!existsSync(filePath)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const ext = extname(filePath);

  const contentType =
    mimeTypes[ext] || "text/plain";

  res.writeHead(200, {
    "Content-Type": contentType
  });

  createReadStream(filePath).pipe(res);
}

function findNearestIndex(baseDir, urlPath) {

  let currentPath = join(baseDir, urlPath);

  while (true) {

    const indexPath = join(
      currentPath,
      "index.html"
    );

    if (existsSync(indexPath)) {
      return indexPath;
    }

    const parent = dirname(currentPath);

    if (
      parent === currentPath ||
      parent === baseDir
    ) {
      break;
    }

    currentPath = parent;
  }

  return null;
}

createServer((req, res) => {

  let urlPath = req.url.split("?")[0];

  console.log("REQ:", urlPath);

  // =========================
  // ROOT
  // =========================

  if (urlPath === "/") {
    return serveFile(
      res,
      join(__dirname, "index.html")
    );
  }

  const cleanPath = urlPath.replace(/^\/+/, "");
  const filePath = join(__dirname, cleanPath);

  // =========================
  // DIRECT STATIC FILE
  // =========================

  if (
    existsSync(filePath) &&
    !statSync(filePath).isDirectory()
  ) {
    return serveFile(res, filePath);
  }

  // =========================
  // DIRECTORY -> index.html
  // =========================

  if (
    existsSync(filePath) &&
    statSync(filePath).isDirectory()
  ) {
    return serveFile(
      res,
      join(filePath, "index.html")
    );
  }

  // =========================
  // /about -> /about.html
  // =========================

  const htmlFile = join(
    __dirname,
    cleanPath + ".html"
  );

  if (existsSync(htmlFile)) {
    return serveFile(res, htmlFile);
  }

  // If the request has a file extension (e.g. .js, .css, .map) do not fall back to index.html
  // This prevents serving HTML for module/script requests and avoids MIME type errors.
  const requestExt = extname(urlPath);
  if (requestExt) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  // =========================
  // SMART SPA FALLBACK
  // =========================

  if (
    urlPath.startsWith("/examples/") ||
    urlPath.startsWith("/docs/")
  ) {

    const found = findNearestIndex(
      __dirname,
      cleanPath
    );

    if (found) {
      return serveFile(res, found);
    }
  }

  // =========================
  // NOT FOUND
  // =========================

  res.writeHead(404);
  res.end("Not found");

}).listen(PORT, () => {

  console.log(
    `Server running at http://localhost:${PORT}`
  );

});
