import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(target));
    else if (/\.(js|jsx)$/.test(entry.name)) files.push(target);
  }
  return files;
}

async function localImportGraph(files) {
  const known = new Set(files.map(file => path.resolve(file)));
  const graph = new Map();
  for (const file of files) {
    const source = await readFile(file, "utf8");
    const imports = [];
    const expression = /(?:^|\n)\s*(?:import\s+(?:[^;\n]*?\s+from\s+)?|export\s+[^;\n]*?\s+from\s+)["']([^"']+)["']/g;
    for (const match of source.matchAll(expression)) {
      if (!match[1].startsWith(".")) continue;
      const base = path.resolve(path.dirname(file), match[1]);
      const target = [base, `${base}.js`, `${base}.jsx`].find(candidate => known.has(candidate));
      if (target) imports.push(target);
    }
    graph.set(path.resolve(file), imports);
  }
  return graph;
}

test("domain modules contain no browser, React, or provider dependencies", async () => {
  const files = await sourceFiles(path.join(projectRoot, "src", "domain"));
  for (const file of files) {
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(source, /\b(?:window|document|localStorage|fetch)\b|from\s+["']react(?:\/|["'])/, path.relative(projectRoot, file));
    assert.doesNotMatch(source, /from\s+["'][^"']*(?:providers|components|features|shared\/persistence)[^"']*["']/, path.relative(projectRoot, file));
  }
});

test("feature views do not import provider adapters or app composition", async () => {
  const files = await sourceFiles(path.join(projectRoot, "src", "features"));
  for (const file of files.filter(target => target.endsWith(".jsx"))) {
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(source, /from\s+["'][^"']*(?:providers\/|createAppDependencies|config\/data)[^"']*["']/, path.relative(projectRoot, file));
  }
});

test("application source has no cycles in its static local import graph", async () => {
  const files = await sourceFiles(path.join(projectRoot, "src"));
  const graph = await localImportGraph(files);
  const complete = new Set();
  const active = [];
  const cycles = [];
  function visit(file) {
    const cycleAt = active.indexOf(file);
    if (cycleAt >= 0) {
      cycles.push(active.slice(cycleAt).concat(file).map(item => path.relative(projectRoot, item)));
      return;
    }
    if (complete.has(file)) return;
    active.push(file);
    for (const imported of graph.get(file) || []) visit(imported);
    active.pop();
    complete.add(file);
  }
  for (const file of graph.keys()) visit(file);
  assert.deepEqual(cycles, []);
});
