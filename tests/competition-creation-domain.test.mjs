import test from "node:test";
import assert from "node:assert/strict";
import { createRandomTeamPairing, parseParticipantNames, validateCompetitionCreation } from "../src/domain/teamPairing.js";

const validInput = {
  name: "  Weekend Cup  ", event_date: "2026-10-21", location: "  Jakarta ",
  format: "single_elimination", isTeamCompetition: true,
  participants: ["A & B", "C & D", "E & F"]
};

test("participant parsing trims supported separators and detects case-insensitive duplicates", () => {
  assert.deepEqual(parseParticipantNames(" Dimas, Rahman\nAthaya; DIMAS "), {
    names: ["Dimas", "Rahman", "Athaya", "DIMAS"], duplicates: ["DIMAS"]
  });
});

test("team pairing preserves Fisher-Yates ordering and team member order", () => {
  const values = ["A", "B", "C", "D"];
  const randomValues = [0, 0, 0];
  const pairs = createRandomTeamPairing(values, () => randomValues.shift());
  assert.deepEqual(pairs, [{ members: ["B", "C"] }, { members: ["D", "A"] }]);
  assert.deepEqual(values, ["A", "B", "C", "D"]);
});

test("creation validation normalizes fields and retains team order as seed order", () => {
  const result = validateCompetitionCreation(validInput);
  assert.deepEqual(result, {
    valid: true,
    value: { name: "Weekend Cup", event_date: "2026-10-21", location: "Jakarta", format: "single_elimination", isTeamCompetition: true, participants: ["A & B", "C & D", "E & F"] }
  });
});

test("creation validation rejects unsupported formats, incomplete pairs, duplicates, and missing required fields", () => {
  for (const input of [
    { ...validInput, format: "double_elimination" },
    { ...validInput, participants: ["A & B", "C"] },
    { ...validInput, participants: ["A & B", "a & D"] },
    { ...validInput, name: " " },
    { ...validInput, event_date: "" },
    { ...validInput, participants: ["A & B"] }
  ]) assert.equal(validateCompetitionCreation(input).valid, false);
});
