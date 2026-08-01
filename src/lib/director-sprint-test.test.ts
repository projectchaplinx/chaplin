import assert from "node:assert/strict";
import test from "node:test";
import { buildDirectorSprintTestVariants, DIRECTOR_SPRINT_TEST_VARIANT_IDS } from "@/lib/director-sprint-test";

const shortlist = [
  [1, "performance", "Hold long enough for the reaction to register."],
  [2, "performance", "Use a compact protective silhouette."],
  [3, "framing", "Make hand placement legible in close framing."],
  [4, "framing", "Keep a lone figure readable in dark space."],
  [5, "blocking", "Use architecture to clarify changing body levels."],
].map(([rank, axis, principle]) => ({
  id: `assessment-${rank}`,
  shortlistRank: rank as number,
  characterAxis: axis as "performance" | "framing" | "blocking",
  principleText: principle as string,
}));

test("Sprint 1 builds exactly one control and five single-principle challengers", () => {
  const variants = buildDirectorSprintTestVariants("Nova hears a train and chooses not to turn.", shortlist);
  assert.deepEqual(variants.map((variant) => variant.id), [...DIRECTOR_SPRINT_TEST_VARIANT_IDS]);
  assert.equal(variants[0].principle, null);
  for (const [index, variant] of variants.slice(1).entries()) {
    assert.equal(variant.principle, shortlist[index].principleText);
    assert.match(variant.imagePrompt, new RegExp(shortlist[index].principleText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(variant.videoPrompt, new RegExp(shortlist[index].principleText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    for (const other of shortlist.filter((_, otherIndex) => otherIndex !== index)) {
      assert.doesNotMatch(variant.videoPrompt, new RegExp(other.principleText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  }
});

test("every variant keeps the same fixed brief", () => {
  const brief = "Arjan stops at the doorway, hears his name, and closes one hand around the ticket.";
  const variants = buildDirectorSprintTestVariants(brief, shortlist);
  for (const variant of variants) {
    assert.match(variant.imagePrompt, new RegExp(brief));
    assert.match(variant.videoPrompt, new RegExp(brief));
  }
});

test("Sprint 1 refuses an incomplete or mis-ranked shortlist", () => {
  assert.throws(() => buildDirectorSprintTestVariants("A complete fixed brief for the test.", shortlist.slice(0, 4)), /exact ranked top five/i);
  assert.throws(() => buildDirectorSprintTestVariants("A complete fixed brief for the test.", shortlist.map((item, index) => ({ ...item, shortlistRank: index + 2 }))), /exact ranked top five/i);
});
