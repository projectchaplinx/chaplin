import assert from "node:assert/strict";
import test from "node:test";
import { characterBuildProgress, completedJsonValue } from "@/lib/character-stream";

test("reveals only completed streamed character fields", () => {
  const partial = `{"name":"Ira Vale","archetypes":["outsider","rebel"],"tagline":"She never`;
  assert.equal(completedJsonValue(partial, "name"), "Ira Vale");
  assert.deepEqual(completedJsonValue(partial, "archetypes"), ["outsider", "rebel"]);
  assert.equal(completedJsonValue(partial, "tagline"), undefined);
});

test("handles escaped quotation marks in streamed prose", () => {
  const complete = `{"tagline":"She calls it \\"mercy\\" only once."}`;
  assert.equal(completedJsonValue(complete, "tagline"), `She calls it "mercy" only once.`);
});

test("shows bounded startup progress before the first complete field", () => {
  assert.deepEqual(characterBuildProgress(0, 0), { percent: 3, estimated: true });
  assert.deepEqual(characterBuildProgress(12, 0), { percent: 18, estimated: true });
  assert.deepEqual(characterBuildProgress(120, 0), { percent: 18, estimated: true });
});

test("switches to real field milestones after streaming begins", () => {
  assert.deepEqual(characterBuildProgress(30, 1), { percent: 20, estimated: false });
  assert.deepEqual(characterBuildProgress(30, 4), { percent: 80, estimated: false });
  assert.deepEqual(characterBuildProgress(30, 5), { percent: 100, estimated: false });
});
