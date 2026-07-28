import { createAdBoard, type AdBoard } from "@/lib/ad-board";

const IDENTITY = "IDENTITY BLOCK: Mira Sen, angular oval face, deep-set brown eyes, cropped black hair, visible age 34.";
const WARDROBE = "Weathered navy deck jacket over an ivory cotton shirt.";
const AGE = "Age 34, unchanged across the board.";

export const BOAT_PROBLEM_SOLUTION_BOARD: AdBoard = (() => {
  const board = createAdBoard({
    arcTemplate: "problem_solution",
    mode: "emotional_counterpoint",
    canonicalReferenceAsset: "asset-mira-canonical",
    identityBlock: IDENTITY,
    wardrobeState: WARDROBE,
    ageState: AGE,
    productId: "product-compass",
  });
  return {
    ...board,
    slots: board.slots.map((slot) => {
      if (slot.slot_no === 1) return { ...slot, description: "A loose sail snaps across the listing deck.", vo_line: "Control is not the absence of weather.", duration_ms: 3600 };
      if (slot.slot_no === 2) return {
        ...slot,
        description: "A wave drives loose rope across the deck.",
        vo_line: "It is knowing what remains true.",
        duration_ms: 3400,
        motion: { mode: "chain" as const, from_slot_id: "slot-1", prompt: "Continue the same wave and forward deck motion." },
      };
      if (slot.slot_no === 3) return {
        ...slot,
        description: "Her wet hand loses the old compass bearing.",
        vo_line: "Even when everything else moves.",
        duration_ms: 3300,
        motion: { mode: "chain" as const, from_slot_id: "slot-2", prompt: "Continue the same storm pressure and screen direction." },
      };
      if (slot.slot_no === 4) return { ...slot, vo_line: null, duration_ms: 4000 };
      if (slot.slot_no === 8) return {
        ...slot,
        vo_line: "Hold your course.",
        vo_kind: "dialogue" as const,
        duration_ms: 2600,
        motion: {
          mode: "ff_lf" as const,
          first_frame_asset: "asset-close-first",
          last_frame_asset: "asset-lockup",
          prompt: "Move from the material detail into the supplied product lockup.",
        },
        motion_reason: "Must match the approved pre-made brand lockup.",
      };
      return { ...slot, vo_line: `Payoff beat ${slot.slot_no}.`, duration_ms: 2800 };
    }),
  };
})();

export const JOURNEY_DELIVERY_BOARD: AdBoard = (() => {
  const board = createAdBoard({
    arcTemplate: "journey_delivery",
    mode: "functional_explainer",
    canonicalReferenceAsset: "asset-rider-canonical",
    identityBlock: "IDENTITY BLOCK: Dev Malik, broad brow, warm brown eyes, close beard, visible age 41.",
    wardrobeState: "Olive courier shell, charcoal trousers, black road gloves.",
    ageState: "Age 41, unchanged across the board.",
    productId: "product-delivery-case",
  });
  return {
    ...board,
    slots: board.slots.map((slot) => ({
      ...slot,
      vo_line: slot.slot_no === 4 ? null : `Delivery step ${slot.slot_no}.`,
      duration_ms: slot.slot_no === 4 ? 4000 : 2500,
    })),
  };
})();
