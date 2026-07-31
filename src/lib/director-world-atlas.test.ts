import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDirectorWorldAtlas,
  directorWorldEraFor,
  directorWorldRegionFor,
  yearFromPeriodLabel,
} from "@/lib/director-world-atlas";

test("world atlas resolves BCE, postwar, and late-twentieth-century periods", () => {
  assert.equal(yearFromPeriodLabel("ca. 3200-2900 BCE"), -3200);
  assert.equal(directorWorldEraFor("Uruk around 3000 BCE")?.id, "early-urban-bronze");
  assert.equal(directorWorldEraFor("Los Angeles, summer 1966")?.id, "postwar");
  assert.equal(directorWorldEraFor("Mumbai, 1987")?.id, "late-twentieth");
});

test("world atlas resolves regions without treating a date as a complete world", () => {
  assert.equal(directorWorldRegionFor("Uruk, southern Mesopotamia")?.id, "north-africa-west-asia");
  assert.equal(directorWorldRegionFor("Agra and Delhi, Mughal India")?.id, "south-asia");
  assert.equal(directorWorldRegionFor("Los Angeles, California")?.id, "north-america");
  assert.equal(directorWorldRegionFor("1960s")?.id, undefined);
});

test("only approved, explicitly world-grounded studies verify an atlas cell", () => {
  const atlas = buildDirectorWorldAtlas({
    profiles: [{
      id: "us-1960s",
      label: "United States, observed 1960s",
      dateRange: "1960-1969",
      region: "United States",
      tags: ["1960s"],
      evidence: ["Dated street photography records vehicles, clothing, work, and public life."],
      visualRules: ["Separate production design from photographic capture language."],
      materialRules: ["Verify tools, furniture, packaging, and accumulated wear."],
      soundRules: ["Build traffic and room tone from physical sources."],
    }],
    studies: [
      {
        id: "approved-world-study",
        status: "approved",
        periodLabel: "United States, 1966",
        region: "Los Angeles, California",
        tags: ["period", "transport", "costume", "sound"],
        observations: [{
          evidence: "A working service bay shows period road traffic, cotton workwear, steel tools, and analog signage.",
          audioEvidence: "Carbureted engine idle and steel tool impacts occupy different distances.",
          soundFunction: "Engine perspective defines the open bay and departing threat.",
        }],
      },
      {
        id: "draft-world-study",
        status: "draft",
        periodLabel: "United States, 1966",
        region: "Los Angeles, California",
        tags: ["period", "transport"],
      },
      {
        id: "approved-craft-only",
        status: "approved",
        periodLabel: "United States, 1966",
        region: "Los Angeles, California",
        tags: ["editing"],
      },
    ],
  });

  const cell = atlas.cells.find((candidate) => candidate.id === "postwar:north-america");
  assert.equal(cell?.status, "verified");
  assert.deepEqual(cell?.baselineProfileIds, ["us-1960s"]);
  assert.deepEqual(cell?.approvedStudyIds, ["approved-world-study"]);
  assert.ok(cell?.evidenceLayerIds.includes("transport-infrastructure"));
  assert.ok(cell?.evidenceLayerIds.includes("costume-body"));
  assert.ok(cell?.evidenceLayerIds.includes("sound-acoustics"));
  assert.equal(atlas.approvedStudyCount, 1);
  assert.ok(atlas.gapCells > atlas.verifiedCells, "the atlas must expose missing knowledge instead of implying global coverage");
});
