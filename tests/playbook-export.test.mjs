import test from "node:test";
import assert from "node:assert/strict";
import { buildPlaybookHtml, printPlaybook } from "../src/features/competitions/playbookExport.js";

const competition = {
  id: "cup-1", name: "Cup <2026> & Friends", date: "2026-01-02", location: "Jakarta & Bandung",
  isTeamCompetition: true, totalRounds: 2,
  participants: [{ id: "t1", name: "A <One> & B" }, { id: "t2", name: "C & D" }],
  matches: [
    { id: "m1", round: 1, participant1Id: "t1", participant2Id: null, winnerId: "t1", status: "bye" },
    { id: "m2", round: 2, participant1Id: "t1", participant2Id: "t2", winnerId: null, status: "pending" }
  ]
};

test("playbook document preserves printable structure, copy, and HTML escaping", () => {
  const html = buildPlaybookHtml(competition);
  assert.match(html, /^<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Playbook - Cup &lt;2026&gt; &amp; Friends<\/title>/);
  assert.match(html, /<h1>Cup &lt;2026&gt; &amp; Friends<\/h1>/);
  assert.match(html, /<p class="meta">2 Januari 2026 · Jakarta &amp; Bandung<\/p>/);
  assert.match(html, /<h2>Daftar Tim \(2\)<\/h2><ul><li>A &lt;One&gt; &amp; B<\/li><li>C &amp; D<\/li><\/ul>/);
  assert.match(html, /<tr><td>m1<\/td><td>Semifinal<\/td><td>A &lt;One&gt; &amp; B vs Bye<\/td><td>A &lt;One&gt; &amp; B menang<\/td><td>A &lt;One&gt; &amp; B<\/td><\/tr>/);
  assert.match(html, /<td>Final<\/td><td>A &lt;One&gt; &amp; B vs C &amp; D<\/td><td>Belum dimainkan<\/td>/);
  assert.match(html, /window\.onload=\(\)=>window\.print\(\)/);
  assert.match(html, /Pemenang maju ke babak berikutnya\. Playbook ini dibuat dari data sesi saat tombol ditekan\./);
});

test("individual playbooks keep score results and participant headings", () => {
  const html = buildPlaybookHtml({
    name: "Solo Cup", date: "", location: "", isTeamCompetition: false, totalRounds: 1,
    participants: [{ id: "p1", name: "One" }, { id: "p2", name: "Two" }],
    matches: [{ id: "final", round: 1, participant1Id: "p1", participant2Id: "p2", winnerId: "p1", status: "completed", score1: 21, score2: 13 }]
  });
  assert.match(html, /<h2>Daftar Peserta \(2\)<\/h2>/);
  assert.match(html, /<td>21 — 13<\/td><td>One<\/td>/);
});

test("print action keeps the existing popup options and reports a blocked popup", () => {
  let args;
  let written = "";
  let closed = false;
  const opened = printPlaybook(competition, (...values) => {
    args = values;
    return { document: { write: value => { written = value; }, close: () => { closed = true; } } };
  });
  assert.equal(opened, true);
  assert.deepEqual(args, ["", "_blank", "noopener,noreferrer"]);
  assert.equal(written, buildPlaybookHtml(competition));
  assert.equal(closed, true);
  assert.equal(printPlaybook(competition, () => null), false);
});
