import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Vercel rewrites app paths to the Vite entry point", async () => {
  const config = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
  assert.deepEqual(config.rewrites, [{ source: "/(.*)", destination: "/index.html" }]);
  assert.match(await readFile(new URL("../vite.config.js", import.meta.url), "utf8"), /outDir:\s*["']dist["']/);
});

test("browser Supabase configuration uses only public Vite environment variables", async () => {
  const source = await readFile(new URL("../src/config/data.js", import.meta.url), "utf8");
  assert.match(source, /import\.meta\.env\.VITE_SUPABASE_URL/);
  assert.match(source, /import\.meta\.env\.VITE_SUPABASE_ANON_KEY/);
  assert.doesNotMatch(source, /service.role|postgres(?:ql)?:\/\//i);
});
