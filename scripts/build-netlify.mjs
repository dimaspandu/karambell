import { cp, copyFile, mkdir } from "node:fs/promises";

await mkdir("dist", { recursive: true });
await copyFile("index.html", "dist/index.html");
await copyFile("_redirects", "dist/_redirects");
await cp("css", "dist/css", { recursive: true });
await cp("js", "dist/js", { recursive: true });

console.log("Copied Karambell static assets to dist/.");
