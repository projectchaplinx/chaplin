import assert from "node:assert/strict";
import test from "node:test";
import {
  generationSafePerformanceText,
  safeSignatureGesture,
  staticRecognitionLocks,
} from "@/lib/performance-safety";

test("numbered-finger gestures are removed from production action", () => {
  const action = "Dimitri secures the wrench; he pauses, two fingers tapping his temple through the visor, then checks the readout.";
  const safe = generationSafePerformanceText(action);

  assert.match(safe, /secures the wrench/i);
  assert.match(safe, /checks the readout/i);
  assert.doesNotMatch(safe, /two fingers|temple/i);
});

test("risky finger gestures never become the signature performance", () => {
  assert.equal(
    safeSignatureGesture("Taps two fingers against his temple", "Becomes very still and methodical under pressure"),
    "Becomes very still and methodical under pressure",
  );
});

test("identity recognition locks keep static traits and reject transient poses", () => {
  assert.deepEqual(staticRecognitionLocks([
    "crooked left eyebrow scar",
    "two-finger temple tap gesture",
    "weathered blue flight suit with a Russian flag patch",
  ]), [
    "crooked left eyebrow scar",
    "weathered blue flight suit with a Russian flag patch",
  ]);
});
