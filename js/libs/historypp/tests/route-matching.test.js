import assert from "node:assert/strict";
import { createEngine } from "../src/1.0.5/index.js";

function test(name, fn) {
  try {
    fn();
    console.log("✓", name);
  } catch (e) {
    console.log("✗", name, e.message);
    process.exit(1);
  }
}

// ==============================
// TESTS
// ==============================

test("Simple matcher works", () => {
  const r = createEngine();

  r.router("/user/:id");

  const m = r.matchRoute("/user/10");

  assert.equal(m.params.id, "10");
});

test("Trie matcher works", () => {
  const r = createEngine();
  r.config({ matcher: "trie" });

  r.router("/user/:id");

  const m = r.matchRoute("/user/20");

  assert.equal(m.params.id, "20");
});

test("Matcher parity", () => {
  const r1 = createEngine();
  r1.router("/x/:id");

  const r2 = createEngine();
  r2.config({ matcher: "trie" });
  r2.router("/x/:id");

  const m1 = r1.matchRoute("/x/1");
  const m2 = r2.matchRoute("/x/1");

  assert.equal(m1.params.id, m2.params.id);
});

test("Cache works (same reference)", () => {
  const r = createEngine();

  r.router("/p/:id");

  const m1 = r.matchRoute("/p/1");
  const m2 = r.matchRoute("/p/1");

  assert.strictEqual(m1, m2);
});

test("Navigation context", () => {
  const r = createEngine();

  r.router("/a");

  const ctx = r.navigate("/a");

  assert.equal(ctx.path, "/a");
});

test("NotFound handler is triggered", () => {
  const r = createEngine();

  let called = false;

  r.notFound((ctx) => {
    called = true;
    assert.equal(ctx.path, "/unknown");
  });

  r.navigate("/unknown");

  assert.equal(called, true);
});