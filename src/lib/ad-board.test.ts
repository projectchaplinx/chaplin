import assert from "node:assert/strict";
import test from "node:test";
import {
  adBoardSchema,
  applyVoiceTimings,
  chainDepth,
  expandLongAdSlots,
  forwardPromptHasTargetFrame,
  lintAdBoard,
  promoteSlotToFinal,
  reanchorOverdeepChains,
  renderResolution,
  stripForwardTargetFrameLanguage,
} from "@/lib/ad-board";
import {
  BOAT_PROBLEM_SOLUTION_BOARD,
  JOURNEY_DELIVERY_BOARD,
} from "@/lib/ad-board-fixtures";

test("both house arc templates produce typed eight-slot boards pivoting at slot 4", () => {
  for (const board of [BOAT_PROBLEM_SOLUTION_BOARD, JOURNEY_DELIVERY_BOARD]) {
    assert.equal(adBoardSchema.parse(board).slots.length, 8);
    assert.equal(board.slots[3].slot_no, 4);
    assert.equal(board.slots[3].product_visible, true);
    assert.equal(board.slots[7].product_visible, true);
    assert.ok(board.slots.slice(0, 3).every((slot) => slot.screen_text == null));
    assert.ok(board.slots.filter((slot) => slot.product_visible).every((slot) => [4, 8].includes(slot.slot_no)));
  }
  assert.equal(BOAT_PROBLEM_SOLUTION_BOARD.slots[3].segment, "THE TURN");
  assert.equal(JOURNEY_DELIVERY_BOARD.slots[3].segment, "THE HUMAN");
});

test("forward prompts reject and strip destination-frame language", () => {
  const unsafe = "She crosses the deck. Ends on the final frame with the compass.";
  assert.equal(forwardPromptHasTargetFrame(unsafe), true);
  assert.equal(stripForwardTargetFrameLanguage(unsafe), "She crosses the deck.");
});

test("chain queueing requires a rendered source and warns at depth two", () => {
  const board = structuredClone(BOAT_PROBLEM_SOLUTION_BOARD);
  let issues = lintAdBoard(board);
  assert.ok(issues.some((issue) => issue.rule === "A2" && issue.slotId === "slot-2" && issue.level === "failure"));

  board.slots[0].status = "rendered";
  board.slots[0].rendered_asset_id = "clip-1";
  board.slots[1].status = "rendered";
  board.slots[1].rendered_asset_id = "clip-2";
  issues = lintAdBoard(board);
  assert.equal(chainDepth(board, "slot-3"), 2);
  assert.ok(issues.some((issue) => issue.rule === "A3" && issue.slotId === "slot-3" && issue.level === "warning"));
  assert.ok(!issues.some((issue) => issue.rule === "A2"));
});

test("chain depth beyond three is forced back to the canonical reference", () => {
  const board = structuredClone(JOURNEY_DELIVERY_BOARD);
  for (let index = 1; index <= 4; index += 1) {
    board.slots[index].motion = { mode: "chain", from_slot_id: board.slots[index - 1].id, prompt: "Continue forward." };
    board.slots[index - 1].status = "rendered";
    board.slots[index - 1].rendered_asset_id = `clip-${index}`;
  }
  assert.equal(chainDepth(board, "slot-5"), 4);
  const controlled = reanchorOverdeepChains(board);
  assert.equal(controlled.slots[4].motion.mode, "forward");
  assert.equal(controlled.slots[4].motion.mode === "forward" && controlled.slots[4].motion.first_frame_asset, board.canonical_reference_asset);
});

test("first/last-frame mode always warns and fails without a reason", () => {
  const board = structuredClone(BOAT_PROBLEM_SOLUTION_BOARD);
  let issues = lintAdBoard(board).filter((issue) => issue.slotId === "slot-8");
  assert.ok(issues.some((issue) => issue.rule === "A4" && issue.level === "warning"));
  board.slots[7].motion_reason = null;
  issues = lintAdBoard(board).filter((issue) => issue.slotId === "slot-8");
  assert.ok(issues.some((issue) => issue.rule === "A4" && issue.level === "failure"));
});

test("VO-first timings add the correct gap and split clips longer than five seconds", () => {
  const timed = applyVoiceTimings(JOURNEY_DELIVERY_BOARD, {
    "slot-1": 5100,
    "slot-2": 1800,
  });
  assert.equal(timed.slots[0].duration_ms, 5450);
  assert.equal(timed.slots[1].duration_ms, 2150);
  assert.equal(timed.slots[3].duration_ms, 4000);
  const expanded = expandLongAdSlots(timed);
  assert.deepEqual(expanded.filter((slot) => slot.source_slot_id === "slot-1").map((slot) => slot.id), ["slot-1a", "slot-1b"]);
  assert.equal(expanded.filter((slot) => slot.source_slot_id === "slot-1").reduce((total, slot) => total + slot.duration_ms, 0), 5450);
});

test("boards explore at 720p and promote keeper clips to 1080p", () => {
  assert.ok(JOURNEY_DELIVERY_BOARD.slots.every((slot) => slot.tier === "draft"));
  const promoted = promoteSlotToFinal(JOURNEY_DELIVERY_BOARD, "slot-6");
  assert.equal(promoted.slots[5].tier, "final");
  assert.equal(renderResolution(promoted.slots[5].tier), "1080p");
  assert.equal(renderResolution(promoted.slots[4].tier), "720p");
});
