import assert from "node:assert/strict";
import test from "node:test";
import { canMarkEvidenceEligible, compactEvidenceTags, dedupeEvidenceInputs, evidenceNeedsReview, stableEvidenceContent, type NormalizedEvidenceInput } from "./director-evidence-manifest";

test("evidence remains separate and review gated", () => {
  assert.equal(evidenceNeedsReview({ reuseStatus: "reusable", culturallySensitive: false }), "discovered");
  assert.equal(evidenceNeedsReview({ reuseStatus: "restricted", culturallySensitive: false }), "needs-review");
  assert.equal(evidenceNeedsReview({ reuseStatus: "reusable", culturallySensitive: true }), "needs-review");
  assert.equal(canMarkEvidenceEligible("reusable", false), true);
  assert.equal(canMarkEvidenceEligible("metadata-only", false), false);
});

test("evidence tags are bounded and normalized", () => {
  assert.deepEqual(compactEvidenceTags(["Costume, Work", "costume", null]), ["costume", "work"]);
});

test("stable evidence content excludes access and review timestamps", () => {
  const input: NormalizedEvidenceInput = {
    kind: "collection-item", provider: "met", externalId: "1", canonicalUrl: "https://example.com/1",
    recordLocator: "object 1", title: "Coat", institution: "Museum", dateLabel: "1900", region: "Europe",
    tags: ["costume"], facets: { medium: "wool" }, rightsUri: null, rightsLabel: "public domain",
    reuseStatus: "reusable", culturallySensitive: false,
  };
  assert.deepEqual(stableEvidenceContent(input), stableEvidenceContent({ ...input }));
  assert.equal("accessedAt" in stableEvidenceContent(input), false);
  assert.equal("reviewNotes" in stableEvidenceContent(input), false);
});

test("duplicate provider records collapse before one database upsert", () => {
  const input: NormalizedEvidenceInput = {
    kind: "collection-item", provider: "loc", externalId: "00694131", canonicalUrl: "https://www.loc.gov/item/00694131/",
    recordLocator: "LOC item 00694131", title: "May Irwin kiss", institution: "Library of Congress", dateLabel: "1896", region: "United States",
    tags: ["film"], facets: {}, rightsUri: null, rightsLabel: "public domain", reuseStatus: "reusable", culturallySensitive: false,
  };
  assert.deepEqual(dedupeEvidenceInputs([input, { ...input, title: "Duplicate title" }]), [input]);
});
