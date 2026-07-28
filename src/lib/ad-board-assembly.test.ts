import assert from "node:assert/strict";
import test from "node:test";
import { planAdBoardPictureSources } from "@/lib/ad-board-assembly";

test("assembly trims or holds video, uses stills, and carries the previous frame instead of black", () => {
  const plan = planAdBoardPictureSources(
    ["slot-1", "slot-2", "slot-3", "slot-4"],
    [
      { slotId: "slot-1", videoUrl: "https://storage.example/one.mp4" },
      { slotId: "slot-2", stillUrl: "https://storage.example/two.png" },
      { slotId: "slot-4", videoUrl: "https://storage.example/four.mp4" },
    ],
    "https://storage.example/canonical.png",
  );
  assert.deepEqual(plan.map((entry) => entry.source.kind), ["video", "still", "carry", "video"]);
  assert.equal(plan[2].source.kind === "carry" && plan[2].source.fromSlotId, "slot-2");
});

test("the first missing slot uses the canonical reference and never black", () => {
  const plan = planAdBoardPictureSources(["slot-1"], [], "https://storage.example/canonical.png");
  assert.equal(plan[0].source.kind, "canonical");
  assert.throws(() => planAdBoardPictureSources(["slot-1"], [], ""), /no picture source/i);
});
