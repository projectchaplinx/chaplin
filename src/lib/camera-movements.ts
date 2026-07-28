export type CameraMovementCategory =
  | "dolly"
  | "lens"
  | "reveal"
  | "tilt"
  | "lateral"
  | "orbit"
  | "vertical"
  | "aerial"
  | "tracking"
  | "expressive";

export type CameraMovementEnergy = "restrained" | "moderate" | "high";

export type CameraMovementDefinition = {
  id: string;
  label: string;
  category: CameraMovementCategory;
  energy: CameraMovementEnergy;
  prompt: string;
  angle: string;
  lens: string;
  bestFor: string[];
};

export const CAMERA_MOVEMENTS = [
  { id: "locked-off", label: "Locked Camera", category: "dolly", energy: "restrained", prompt: "Lock the camera completely. No pan, tilt, roll, orbit, crane, zoom, reframing, or drift.", angle: "fixed eye-level axis with a level horizon", lens: "50mm natural perspective", bestFor: ["action", "dialogue", "identity", "controlled motion"] },
  { id: "micro-push-in", label: "Micro Push In", category: "dolly", energy: "restrained", prompt: "Move forward on one stable axis by no more than ten percent of the frame, then stop completely.", angle: "fixed eye-level axis with a level horizon", lens: "50mm natural perspective", bestFor: ["action", "pressure", "reaction"] },
  { id: "micro-lateral", label: "Micro Lateral", category: "lateral", energy: "restrained", prompt: "Move laterally on one stable axis by no more than ten percent of the frame, without orbiting or changing subject scale.", angle: "level shoulder-height axis", lens: "50mm natural perspective", bestFor: ["action", "reveal", "pressure"] },
  { id: "slow-dolly-in", label: "Slow Dolly In", category: "dolly", energy: "restrained", prompt: "Move slowly forward toward the subject on one stable axis, easing to a complete stop before the final frame.", angle: "eye level with a level horizon", lens: "50mm natural perspective", bestFor: ["intimacy", "decision", "pressure", "dialogue"] },
  { id: "slow-dolly-out", label: "Slow Dolly Out", category: "dolly", energy: "restrained", prompt: "Move slowly backward from the subject, revealing meaningful environment while preserving the original axis and horizon.", angle: "eye level with expanding environmental context", lens: "40mm environmental perspective", bestFor: ["aftermath", "isolation", "payoff", "reveal"] },
  { id: "fast-dolly-in", label: "Fast Dolly In", category: "dolly", energy: "high", prompt: "Drive rapidly toward the subject, decelerating cleanly on the decisive facial or object detail without a cut.", angle: "eye level or slightly below the subject", lens: "35mm close environmental perspective", bestFor: ["shock", "urgency", "realization", "action"] },
  { id: "vertigo-zolly", label: "Vertigo Effect / Zolly", category: "lens", energy: "high", prompt: "Dolly backward while zooming in to hold the subject's size, making the background expand around the moment of realization.", angle: "locked eye-level axis", lens: "continuous 35mm-to-70mm zoom", bestFor: ["dread", "realization", "power reversal", "horror"] },
  { id: "extreme-macro-zoom", label: "Extreme Macro Zoom", category: "lens", energy: "high", prompt: "Transition from the readable subject to an extreme macro detail that carries the story beat, keeping the detail physically coherent.", angle: "detail-level axis aligned to the object", lens: "90mm macro perspective", bestFor: ["product detail", "evidence", "texture", "clue"] },
  { id: "cosmic-hyper-zoom", label: "Cosmic Hyper Zoom", category: "lens", energy: "high", prompt: "Rush from an immense wide scale down to one precise human or object detail in a single continuous scale transition.", angle: "axis centered on the final detail", lens: "extreme continuous scale transition", bestFor: ["spectacle", "world reveal", "superhero", "stylized transition"] },
  { id: "over-shoulder", label: "Over-the-Shoulder Shot", category: "reveal", energy: "restrained", prompt: "Hold behind the foreground subject's shoulder and make a subtle motivated adjustment to reveal the opposing subject's response.", angle: "eye level just behind the shoulder line", lens: "65mm dialogue compression", bestFor: ["dialogue", "confrontation", "relationship", "negotiation"] },
  { id: "fisheye-peephole", label: "Fisheye / Peephole Lens", category: "lens", energy: "moderate", prompt: "Hold a distorted extreme-wide peephole perspective while the subject crosses the curved frame naturally.", angle: "fixed observer height", lens: "8mm fisheye with circular distortion", bestFor: ["surveillance", "comic unease", "doorway", "subjective view"] },
  { id: "reveal-from-behind", label: "Reveal from Behind", category: "reveal", energy: "restrained", prompt: "Slide laterally from behind a foreground object to reveal the subject and the story-critical detail in one continuous move.", angle: "shoulder-height lateral reveal", lens: "40mm with foreground separation", bestFor: ["entrance", "reveal", "discovery", "product"] },
  { id: "through-shot", label: "Through Shot", category: "reveal", energy: "moderate", prompt: "Travel through a real opening into the scene, landing on the subject without clipping geometry or changing the established axis.", angle: "opening-height forward axis", lens: "28mm deep environmental perspective", bestFor: ["arrival", "world entry", "threshold", "transition"] },
  { id: "reveal-from-blur", label: "Reveal from Blur", category: "reveal", energy: "restrained", prompt: "Begin fully defocused and pull focus smoothly until the subject and story-critical detail resolve sharply.", angle: "locked composition", lens: "50mm with a controlled focus pull", bestFor: ["memory", "awakening", "identity reveal", "product"] },
  { id: "rack-focus", label: "Rack Focus", category: "lens", energy: "restrained", prompt: "Shift focus from the foreground story object to the background subject, with both positions composed from the first frame.", angle: "locked two-plane composition", lens: "65mm shallow depth of field", bestFor: ["clue", "reaction", "product", "power shift"] },
  { id: "tilt-up", label: "Tilt Up", category: "tilt", energy: "restrained", prompt: "Tilt upward from the lower story detail to the subject's face or the source of pressure, keeping the camera position fixed.", angle: "fixed base with a vertical pan upward", lens: "40mm natural perspective", bestFor: ["entrance", "scale", "identity", "reveal"] },
  { id: "tilt-down", label: "Tilt Down", category: "tilt", energy: "restrained", prompt: "Tilt downward from the upper context to the subject's hands, product, evidence, or consequence.", angle: "fixed base with a vertical pan downward", lens: "45mm natural perspective", bestFor: ["product", "evidence", "consequence", "gesture"] },
  { id: "truck-left", label: "Camera Truck Left", category: "lateral", energy: "moderate", prompt: "Move laterally left on a stable parallel track, preserving subject scale and screen direction.", angle: "level shoulder-height profile", lens: "35mm environmental perspective", bestFor: ["blocking", "inspection", "ensemble", "product row"] },
  { id: "truck-right", label: "Lateral Truck Right", category: "lateral", energy: "moderate", prompt: "Move laterally right beside the action on one clean track, maintaining the established horizon and distance.", angle: "level shoulder-height profile", lens: "35mm environmental perspective", bestFor: ["blocking", "inspection", "ensemble", "product row"] },
  { id: "orbit-180", label: "Orbit 180", category: "orbit", energy: "moderate", prompt: "Arc halfway around the subject while keeping a constant radius, using the background change to reveal a new relationship.", angle: "subject-centered shoulder height", lens: "40mm with stable subject scale", bestFor: ["reversal", "relationship", "transformation", "reveal"] },
  { id: "fast-orbit-360", label: "Fast 360 Orbit", category: "orbit", energy: "high", prompt: "Circle rapidly around the subject once, preserving identity and body geometry and landing on the original screen axis.", angle: "subject-centered torso height", lens: "28mm dynamic perspective", bestFor: ["action", "spectacle", "power", "transformation"] },
  { id: "true-orbit-180", label: "True Orbit 180", category: "orbit", energy: "moderate", prompt: "Orbit exactly 180 degrees around the subject at a constant radius and height, ending on the reverse side without reframing.", angle: "precise subject-centered eye level", lens: "50mm with constant subject scale", bestFor: ["power reversal", "two-sided reveal", "character turn"] },
  { id: "true-orbit-360", label: "True Orbit 360", category: "orbit", energy: "high", prompt: "Complete a precise 360-degree orbit at constant radius, keeping the subject centered and the environment geometrically stable.", angle: "precise subject-centered torso height", lens: "35mm dynamic perspective", bestFor: ["spectacle", "hero moment", "environment reveal"] },
  { id: "slow-cinematic-arc", label: "Slow Cinematic Arc", category: "orbit", energy: "restrained", prompt: "Move in a broad slow curve around the subject, revealing the side profile and a meaningful background detail.", angle: "eye-level three-quarter arc", lens: "55mm gentle compression", bestFor: ["portrait in action", "decision", "romance", "reveal"] },
  { id: "pedestal-down", label: "Pedestal Down", category: "vertical", energy: "restrained", prompt: "Lower the entire camera vertically without tilting, moving attention from the face to the hands or consequence.", angle: "level vertical descent", lens: "50mm natural perspective", bestFor: ["gesture", "product", "evidence", "defeat"] },
  { id: "pedestal-up", label: "Pedestal Up", category: "vertical", energy: "restrained", prompt: "Raise the entire camera vertically from waist height to eye level while maintaining a level lens and stable distance.", angle: "level vertical rise", lens: "50mm natural perspective", bestFor: ["resolve", "entrance", "confidence", "identity"] },
  { id: "crane-up", label: "Crane Up / High-Angle Reveal", category: "vertical", energy: "moderate", prompt: "Lift high above the subject to reveal the larger environment and the consequence of the action.", angle: "rising into a high-angle view", lens: "28mm wide environmental perspective", bestFor: ["establishing", "aftermath", "scale", "ending"] },
  { id: "crane-down", label: "Crane Down / Landing", category: "vertical", energy: "moderate", prompt: "Descend smoothly from an elevated view and settle near the subject at the exact moment the beat begins.", angle: "high-to-eye-level descent", lens: "35mm environmental perspective", bestFor: ["arrival", "opening", "location reveal", "hero entrance"] },
  { id: "optical-zoom-in", label: "Smooth Optical Zoom In", category: "lens", energy: "restrained", prompt: "Keep the camera body fixed and slowly zoom toward the subject, ending on the decisive expression or detail.", angle: "locked eye-level composition", lens: "smooth 40mm-to-70mm optical zoom", bestFor: ["realization", "dialogue", "detail", "pressure"] },
  { id: "optical-zoom-out", label: "Smooth Optical Zoom Out", category: "lens", energy: "restrained", prompt: "Keep the camera body fixed and slowly widen the lens to reveal the context surrounding the subject.", angle: "locked eye-level composition", lens: "smooth 70mm-to-35mm optical zoom", bestFor: ["context reveal", "isolation", "ending", "comedy"] },
  { id: "snap-zoom", label: "Snap Zoom / Crash Zoom", category: "lens", energy: "high", prompt: "Execute one abrupt crash zoom onto the decisive eyes, object, or product detail, then hold completely still.", angle: "locked axis centered on the target", lens: "rapid 35mm-to-85mm zoom", bestFor: ["punchline", "shock", "product detail", "reaction"] },
  { id: "drone-flyover", label: "Drone Flyover", category: "aerial", energy: "moderate", prompt: "Fly forward at high altitude over the location, maintaining a readable destination and stable horizon.", angle: "high oblique aerial view", lens: "24mm wide aerial perspective", bestFor: ["establishing", "journey", "landscape", "scale"] },
  { id: "epic-drone-reveal", label: "Epic Drone Reveal", category: "aerial", energy: "moderate", prompt: "Rise from behind a foreground obstruction while tilting down to reveal the complete location and subject.", angle: "low-hidden to high oblique aerial reveal", lens: "24mm wide aerial perspective", bestFor: ["opening", "location reveal", "spectacle", "arrival"] },
  { id: "large-drone-orbit", label: "Large-Scale Drone Orbit", category: "aerial", energy: "high", prompt: "Sweep in a large controlled circle around the location, keeping the central landmark stable and readable.", angle: "high oblique aerial orbit", lens: "20mm wide aerial perspective", bestFor: ["scale", "landscape", "battlefield", "world reveal"] },
  { id: "top-down", label: "Top-Down / God's-Eye View", category: "aerial", energy: "moderate", prompt: "Look straight down and rotate subtly above the scene, preserving readable spatial relationships and object geometry.", angle: "true 90-degree overhead view", lens: "32mm rectilinear perspective", bestFor: ["pattern", "blocking", "product layout", "isolation"] },
  { id: "fpv-drone-dive", label: "Aggressive FPV Drone Dive", category: "aerial", energy: "high", prompt: "Dive aggressively along a real vertical structure, then pull out smoothly toward the story destination.", angle: "steep downward FPV axis", lens: "16mm ultra-wide action perspective", bestFor: ["chase", "spectacle", "action transition", "scale"] },
  { id: "handheld-documentary", label: "Handheld Documentary", category: "expressive", energy: "moderate", prompt: "Use restrained operator-responsive handheld movement with natural micro-corrections, never chaotic shake.", angle: "human shoulder-height observer", lens: "35mm documentary perspective", bestFor: ["urgency", "realism", "crowd", "conflict"] },
  { id: "whip-pan", label: "Whip Pan", category: "expressive", energy: "high", prompt: "Whip rapidly sideways from the first subject to the second story beat, using directional blur only during the pan.", angle: "level lateral pivot", lens: "32mm action perspective", bestFor: ["surprise", "punchline", "reaction", "action"] },
  { id: "dutch-roll", label: "Dutch Angle / Roll", category: "expressive", energy: "moderate", prompt: "Roll the camera gradually off level as control breaks, then hold the tilted horizon through the final frame.", angle: "10-to-18-degree Dutch angle", lens: "40mm natural perspective", bestFor: ["unease", "disruption", "dread", "power imbalance"] },
  { id: "leading-shot", label: "Leading Shot", category: "tracking", energy: "moderate", prompt: "Track backward in front of the advancing subject at matching speed, preserving a safe constant distance.", angle: "chest-height frontal tracking", lens: "35mm environmental perspective", bestFor: ["walk and talk", "pursuit", "entrance", "confidence"] },
  { id: "following-shot", label: "Following Shot", category: "tracking", energy: "moderate", prompt: "Follow behind the moving subject at matching speed, keeping their destination and obstacles readable.", angle: "shoulder-height rear tracking", lens: "32mm environmental perspective", bestFor: ["pursuit", "discovery", "journey", "suspense"] },
  { id: "side-tracking", label: "Side Tracking", category: "tracking", energy: "moderate", prompt: "Track parallel beside the moving subject, matching pace and preserving clean profile screen direction.", angle: "waist-to-chest-height profile", lens: "40mm natural perspective", bestFor: ["movement", "product use", "travel", "conversation"] },
  { id: "pov-walk", label: "POV Walk", category: "tracking", energy: "moderate", prompt: "Advance in first person with restrained footstep bob and natural head corrections toward the story target.", angle: "human eye-level first-person view", lens: "26mm wide subjective perspective", bestFor: ["discovery", "suspense", "arrival", "subjective experience"] },
  { id: "hyperlapse", label: "Hyperlapse", category: "tracking", energy: "high", prompt: "Advance rapidly through the environment as surrounding time accelerates, preserving a stable central route and destination.", angle: "eye-level forward travel", lens: "24mm wide perspective", bestFor: ["time passage", "city", "journey", "transition"] },
  { id: "barrel-roll", label: "Barrel Roll", category: "expressive", energy: "high", prompt: "Move forward while rotating one full turn around the viewing axis, landing level on the final subject.", angle: "forward axis with a 360-degree roll", lens: "20mm ultra-wide perspective", bestFor: ["stylized action", "disorientation", "flight", "transition"] },
  { id: "bullet-time", label: "Bullet Time", category: "expressive", energy: "high", prompt: "Freeze or heavily slow the decisive action while the camera arcs around it, preserving anatomy, particles, and geometry.", angle: "subject-centered three-quarter orbit", lens: "35mm dynamic perspective", bestFor: ["impact", "reveal", "superhero", "climax"] },
  { id: "worms-eye-tracking", label: "Worm's-Eye Tracking", category: "tracking", energy: "moderate", prompt: "Track at ground level while looking upward, keeping footsteps, obstacles, and the subject's weight physically grounded.", angle: "ground-level low angle", lens: "24mm wide perspective", bestFor: ["threat", "entrance", "scale", "pursuit"] },
] as const satisfies readonly CameraMovementDefinition[];

export type CameraMovementId = (typeof CAMERA_MOVEMENTS)[number]["id"];

export type CameraSceneContext = {
  movementId?: string;
  setting?: string;
  objective?: string;
  action?: string;
  format?: string;
  sceneIndex?: number;
  sceneCount?: number;
};

export type CameraPlan = {
  movementId: CameraMovementId;
  movementName: string;
  movementPrompt: string;
  angle: string;
  lens: string;
  rationale: string;
};

const MOVEMENT_BY_ID = new Map(CAMERA_MOVEMENTS.map((movement) => [movement.id, movement]));

const POOLS = {
  establishing: ["crane-down", "epic-drone-reveal", "slow-dolly-out", "through-shot", "tilt-up"],
  dialogue: ["slow-dolly-in", "over-shoulder", "rack-focus", "slow-cinematic-arc", "optical-zoom-in"],
  product: ["rack-focus", "tilt-down", "truck-left", "truck-right", "extreme-macro-zoom", "snap-zoom"],
  reveal: ["reveal-from-behind", "through-shot", "reveal-from-blur", "rack-focus", "orbit-180", "crane-up"],
  action: ["leading-shot", "following-shot", "side-tracking", "handheld-documentary", "fast-dolly-in", "worms-eye-tracking"],
  unease: ["slow-dolly-in", "dutch-roll", "vertigo-zolly", "pov-walk", "reveal-from-blur"],
  spectacle: ["true-orbit-360", "fast-orbit-360", "bullet-time", "fpv-drone-dive", "large-drone-orbit"],
  resolution: ["slow-dolly-out", "crane-up", "optical-zoom-out", "slow-cinematic-arc", "pedestal-up"],
  general: ["slow-dolly-in", "side-tracking", "rack-focus", "reveal-from-behind", "slow-cinematic-arc", "truck-right"],
} as const satisfies Record<string, readonly CameraMovementId[]>;

function stableIndex(value: string, length: number) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % length;
}

export function isCameraMovementId(value: unknown): value is CameraMovementId {
  return typeof value === "string" && MOVEMENT_BY_ID.has(value as CameraMovementId);
}

export function selectCameraMovement(context: CameraSceneContext): CameraMovementId {
  if (isCameraMovementId(context.movementId)) return context.movementId;

  const text = [context.setting, context.objective, context.action, context.format].filter(Boolean).join(" ").toLowerCase();
  const explicit = CAMERA_MOVEMENTS.find((movement) =>
    text.includes(movement.id.replaceAll("-", " ")) || text.includes(movement.label.toLowerCase())
  );
  if (explicit) return explicit.id;

  const lastScene = Number.isFinite(context.sceneCount)
    && Number.isFinite(context.sceneIndex)
    && Number(context.sceneCount) > 1
    && Number(context.sceneIndex) === Number(context.sceneCount) - 1;
  let intent: keyof typeof POOLS = "general";
  if (/\b(product|packaging|bottle|label|store|shop|merchandise|proof|benefit)\b/.test(text)) intent = "product";
  else if (/\b(chase|chases|run|runs|running|rush|rushes|fight|fights|escape|escapes|pursuit|sprint|sprints|follow|follows)\b/.test(text)) intent = "action";
  else if (/\b(horror|dread|unease|haunt|disturb|wrong|fear|trap)\b/.test(text)) intent = "unease";
  else if (/\b(superhero|power|impact|flight|explosion|spectacle|impossible)\b/.test(text)) intent = "spectacle";
  else if (/\b(reveal|discover|notice|clue|evidence|transform|reverse|surprise)\b/.test(text)) intent = "reveal";
  else if (/\b(dialogue|conversation|asks|answers|confess|confesses|negotiate|negotiates|argue|argues|whisper|whispers|looks back)\b/.test(text)) intent = "dialogue";
  else if (Number(context.sceneIndex ?? 0) === 0) intent = "establishing";
  if (lastScene && intent === "general") intent = "resolution";

  const pool = POOLS[intent];
  const requestsHighEnergy = /\b(fast|rapid|explosive|violent|whip|snap|bullet time|hyper|vertigo|impossible)\b/.test(text);
  const eligiblePool = requestsHighEnergy ? pool : pool.filter((id) => MOVEMENT_BY_ID.get(id)?.energy !== "high");
  const seed = `${text}|${context.sceneIndex ?? 0}|${context.sceneCount ?? 1}`;
  return eligiblePool[stableIndex(seed, eligiblePool.length)] ?? pool[0];
}

export function planCameraForScene(context: CameraSceneContext): CameraPlan {
  const movementId = selectCameraMovement(context);
  const movement = MOVEMENT_BY_ID.get(movementId) ?? CAMERA_MOVEMENTS[0];
  const rationale = movement.bestFor.find((use) => {
    const words = use.toLowerCase().split(/\s+/);
    const text = [context.objective, context.action].filter(Boolean).join(" ").toLowerCase();
    return words.some((word) => text.includes(word));
  }) ?? movement.bestFor[0];

  return {
    movementId,
    movementName: movement.label,
    movementPrompt: movement.prompt,
    angle: movement.angle,
    lens: movement.lens,
    rationale: `Chosen for ${rationale}.`,
  };
}

export function getCameraMovement(id: string | undefined) {
  return isCameraMovementId(id) ? MOVEMENT_BY_ID.get(id) : undefined;
}
