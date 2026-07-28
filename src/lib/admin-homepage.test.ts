import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_HOMEPAGE_CHARACTERS,
  normalizeHomepageCharacterIds,
} from "@/lib/admin-homepage";

test("homepage selection preserves the exact admin order", () => {
  assert.deepEqual(
    normalizeHomepageCharacterIds([" c-nova ", "c-arjan", "c-selene"]),
    ["c-nova", "c-arjan", "c-selene"],
  );
});

test("homepage selection requires at least one unique character", () => {
  assert.throws(() => normalizeHomepageCharacterIds([]), /at least one/i);
  assert.throws(() => normalizeHomepageCharacterIds(["c-nova", "c-nova"]), /only be selected once/i);
});

test("homepage selection enforces the visible cast limit", () => {
  assert.throws(
    () => normalizeHomepageCharacterIds(
      Array.from({ length: MAX_HOMEPAGE_CHARACTERS + 1 }, (_, index) => `c-${index}`),
    ),
    /no more than 10/i,
  );
});
