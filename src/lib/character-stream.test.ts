import assert from "node:assert/strict";
import test from "node:test";
import { completedJsonValue } from "@/lib/character-stream";

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
