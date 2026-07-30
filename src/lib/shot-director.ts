import {
  planCameraForScene,
  type CameraMovementId,
  type CameraPlan,
} from "@/lib/camera-movements";
import { buildSceneHandAnatomyDirection } from "@/lib/image-anatomy";
import {
  safeCameraForEnergy,
  type EnergyState,
  type FramingConstraint,
} from "@/lib/direction-safety";

export type ShotSceneInput = {
  slotId?: string;
  sourceSlotId?: string;
  setting?: string;
  objective?: string;
  action?: string;
  energyState?: EnergyState;
  lockedCharacterIds?: string[];
  dressing?: string;
  behaviorTell?: { characterId: string; tell: string } | null;
  durationSeconds?: number;
  durationMs?: number;
  motionMode?: "forward" | "chain";
  motionFromSlotId?: string | null;
  framingConstraint?: FramingConstraint;
  sensitiveNegatives?: string[];
  referencedProps?: string[];
  dialogueFramingConstraint?: "off_face" | null;
  cameraMovementId?: CameraMovementId;
};

export type ShotActor = {
  name: string;
  /** Short visible-identity description; becomes this actor's half of the lock. */
  identity?: string;
};

export type ShotPromptInput = {
  productionTitle: string;
  productionLogline?: string;
  scene: ShotSceneInput;
  sceneIndex: number;
  sceneCount: number;
  format?: string;
  actorName: string;
  actorIdentity?: string;
  /**
   * Every actor in this frame, lead first. When two or more are supplied the
   * prompt switches to ensemble grammar: explicit screen staging plus anti-blend
   * locks. `actorName`/`actorIdentity` remain the single-actor fallback.
   */
  actors?: ShotActor[];
  productName?: string;
  hasProductReference?: boolean;
  continuityNote?: string;
};

/** Stage positions assigned in cast order, so the lead holds screen-left. */
const STAGE_POSITIONS = [
  "screen-left, facing screen-right",
  "screen-right, facing screen-left",
  "centre frame, between the other two",
  "background-left, clearly behind the leads",
  "background-right, clearly behind the leads",
  "foreground edge, partially cropped",
];

function shotActors(input: ShotPromptInput): ShotActor[] {
  const supplied = (input.actors ?? []).filter((actor) => actor?.name?.trim());
  if (supplied.length) return supplied;
  return [{ name: input.actorName, identity: input.actorIdentity }];
}

function castingComposition(actors: ShotActor[]) {
  const staged = actors.map((actor, index) => `${actor.name} (${STAGE_POSITIONS[index] ?? "clearly separated from the others"})`);
  return `CASTING COMPOSITION: Exactly ${actors.length} distinct people are in this frame — ${staged.join("; ")}. Every one of them must be fully visible, separately posed, and individually recognisable in a single shared location under one continuous light. Do not merge, blend, average, duplicate, or substitute one actor's face onto another, and do not reduce the frame to a single person.`;
}

function actorLock(actors: ShotActor[]) {
  if (actors.length === 1) {
    return `ACTOR LOCK: ${actors[0].name}. Match the supplied identity reference exactly. ${actors[0].identity ?? ""}`.trim();
  }
  const locks = actors.map((actor, index) => (
    `${actor.name} matches reference image ${index + 1}${actor.identity ? ` — ${actor.identity}` : ""}`
  ));
  return `ACTOR LOCK: Each actor is bound to their own reference, in order: ${locks.join("; ")}. Preserve each face, skin tone, hair, age, and wardrobe independently.`;
}

export type ShotSequenceValidation = {
  valid: boolean;
  error?: string;
};

export const SHOT_KNOWLEDGE_BASE = {
  foundation: [
    "Lock cast, product, hero props, location, runtime, and shot count before generation.",
    "Treat the approved image as the binding first frame and visual source of truth.",
    "Use one generated clip for one shot. Put cuts in the edit, not inside a four-second generation.",
    "Prefer short, direct, intentional instructions over ornate prose.",
  ],
  image: [
    "Design the first frame around one readable dramatic decision, not a biography or mood board.",
    "Show face, hands, important prop or product, environment, and usable negative space for the planned motion.",
    "Match reference lighting to the intended scene; flat or cinematic reference light transfers more reliably than bright studio light.",
    "Use separate product coverage for full shape and label detail when both are critical.",
    "Generate a new reference still for every materially different camera angle rather than asking video to invent it mid-shot.",
  ],
  video: [
    "Animate one subject action, one facial beat, one camera path, and one final landing.",
    "Use timestamped phases: establish, perform, land.",
    "State who owns, holds, touches, or operates every moving prop; never leave object contact implicit.",
    "Preserve screen direction, subject position, background geography, and subject-to-object relationships between adjacent shots.",
    "Keep the supplied frame's face, wardrobe, set, product, palette, lighting logic, lens character, horizon, and object count locked.",
    "Generate picture silently; dialogue, effects, room tone, and music remain separate controllable layers.",
  ],
  limitations: [
    "Avoid crowds performing many independent actions; replace them with one lead action and restrained background reactions.",
    "Avoid multi-person physical contact, intricate hand choreography, liquid transfers, and mechanical transformations unless isolated into their own shot.",
    "Avoid camera teleportation, multiple cuts, new angles, new subjects, new props, or environments not established in the first frame.",
    "Do not ask the model to reveal an unseen asymmetric detail without explicitly anchoring what must appear.",
  ],
  continuity: [
    "Anchor exact identity, distinguishing asymmetry, wardrobe materials, hero props, product geometry, and persistent marks.",
    "Carry forward a successful frame as the next shot's spatial reference whenever positions matter.",
    "Record left-to-right or right-to-left travel and never reverse it accidentally between shots.",
    "Keep product label, cap, silhouette, proportions, colors, materials, and hand contact stable.",
  ],
  negative: [
    "No identity drift, beautification, age shift, body morphing, duplicate person, or costume redesign.",
    "No floating props, detached hands, extra hands, duplicate hands, branching wrists, fused or extra fingers, merged bodies, disappearing products, relabeled packaging, or background rebuild.",
    "No held poster, sign, placard, banner, card, or any object that was not already in the actor's hand in the first frame.",
    "No robotic or mechanical motion, no puppet-like joints, no evenly-timed looping gestures, no slow-motion drift, and no physically impossible movement.",
    /*
      Reverse motion was prohibited only in the default continuity note, and
      every caller passes its own - so the rule was dropped in production and
      shots came back with bikes and people travelling backwards. It belongs
      here, where a caller cannot displace it.
    */
    "No reversed, rewound, or time-inverted motion. People walk forward, wheels roll in the direction of travel, thrown and falling objects continue along their arc, and nothing retraces its own path unless the written action explicitly says so.",
    "No subtitles, captions, UI, logo, watermark, unintended speech, lip-sync, music, or new sound source.",
  ],
  review: [
    "Judge each generated shot by usable ranges, not all-or-nothing success.",
    "Regenerate only the missing bridge or failed action instead of the complete sequence.",
    "A clean crop may hide a peripheral defect; flipping is allowed only when labels, handedness, and geography remain correct.",
    "Sound bridges can begin before a cut and continue across it to make independently generated shots feel continuous.",
  ],
} as const;

export type ShotRisk = {
  code: "crowd" | "multi-cut" | "complex-contact" | "screen-direction" | "prop-contact";
  message: string;
};

export function auditShotScene(scene: ShotSceneInput): ShotRisk[] {
  const text = `${scene.objective ?? ""} ${scene.action ?? ""}`.toLowerCase();
  const risks: ShotRisk[] = [];
  if (/\b(crowd|dozens|hundreds|everyone|mob)\b/.test(text) && /\b(run|fight|shout|point|dance|attack|move)\b/.test(text)) {
    risks.push({ code: "crowd", message: "Reduce the crowd to restrained background reactions and one lead action." });
  }
  if (/\b(cut to|montage|meanwhile|then we see|another angle)\b/.test(text)) {
    risks.push({ code: "multi-cut", message: "Split every camera cut into its own four-second scene." });
  }
  if (/\b(pour|pushes? .* apart|wrestle|grabs? .* from|passes? .* to|handshake)\b/.test(text)) {
    risks.push({ code: "complex-contact", message: "Isolate the physical contact and state exact hands, objects, and positions." });
  }
  if (/\b(left to right|right to left|screen left|screen right)\b/.test(text) === false && /\b(walk|run|cross|drive|moves?)\b/.test(text)) {
    risks.push({ code: "screen-direction", message: "Lock left-to-right or right-to-left travel for continuity." });
  }
  if (/\b(pen|bottle|glass|phone|tool|weapon|product|prop)\b/.test(text) && !/\b(left hand|right hand|both hands|holds?|grips?|touches?|rests? in|attached to)\b/.test(text)) {
    risks.push({ code: "prop-contact", message: "State exactly who holds or touches the important object and with which hand." });
  }
  return risks;
}

export function cameraPlanForShot(input: ShotPromptInput): CameraPlan {
  return planCameraForScene({
    movementId: input.scene.energyState
      ? safeCameraForEnergy(input.scene.energyState, input.scene.cameraMovementId)
      : input.scene.cameraMovementId,
    setting: input.scene.setting,
    objective: input.scene.objective,
    action: input.scene.action,
    format: input.format,
    sceneIndex: input.sceneIndex,
    sceneCount: input.sceneCount,
  });
}

function normalizedSceneSignature(scene: ShotSceneInput) {
  return [scene.setting, scene.objective, scene.action]
    .map((value) => value?.trim().toLowerCase().replace(/\s+/g, " ") ?? "")
    .join("|");
}

/*
  Words that carry no dramatic information. Dropping them stops two scenes from
  looking distinct merely because one says "he then walks" and the other "he
  walks".
*/
const BEAT_STOPWORDS = new Set([
  "a", "an", "and", "as", "at", "away", "back", "be", "before", "behind", "but",
  "by", "down", "for", "from", "he", "her", "here", "hers", "him", "his", "in",
  "into", "is", "it", "its", "of", "off", "on", "one", "onto", "out", "over",
  "she", "so", "that", "the", "their", "them", "then", "there", "they", "this",
  "to", "up", "upon", "with", "while", "who",
]);

function beatTokens(scene: ShotSceneInput) {
  return new Set(
    `${scene.objective ?? ""} ${scene.action ?? ""}`
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 2 && !BEAT_STOPWORDS.has(word)),
  );
}

/** Jaccard overlap of two scenes' dramatic content, 0 (distinct) to 1 (identical). */
export function beatSimilarity(left: ShotSceneInput, right: ShotSceneInput) {
  const a = beatTokens(left);
  const b = beatTokens(right);
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return shared / (a.size + b.size - shared);
}

/*
  Two scenes this alike are the same beat rewritten.

  Measured rather than guessed. On the production that shipped four takes of one
  standoff, pairwise overlap ran 0.39-0.56; a Punch that genuinely moves through
  four beats in the same alley peaks at 0.04. The gap between those is wide, so
  the threshold sits in the middle of it and is forgiving of a shared location,
  a recurring prop, or a repeated character name.
*/
export const BEAT_REPEAT_THRESHOLD = 0.32;

export function validateShotSequence(
  scenes: ShotSceneInput[],
  expectedCount: number,
): ShotSequenceValidation {
  if (scenes.length !== expectedCount) {
    return {
      valid: false,
      error: `This production needs exactly ${expectedCount} authored scenes. It currently has ${scenes.length}.`,
    };
  }

  const incompleteIndex = scenes.findIndex((scene) => !scene.objective?.trim() || !scene.action?.trim());
  if (incompleteIndex >= 0) {
    return {
      valid: false,
      error: `Scene ${incompleteIndex + 1} needs both a visible objective and a four-second action before rendering.`,
    };
  }

  const signatures = scenes.map(normalizedSceneSignature);
  const repeatedIndex = signatures.findIndex((signature, index) => (
    signature.length > 2
    && signatures.some((candidate, earlier) => (
      earlier < index
      && candidate === signature
      && (!scenes[index].sourceSlotId || scenes[index].sourceSlotId !== scenes[earlier].sourceSlotId)
    ))
  ));
  if (repeatedIndex >= 0) {
    return {
      valid: false,
      error: `Scene ${repeatedIndex + 1} repeats another scene. Give every shot its own setting, objective, or visible action.`,
    };
  }

  /*
    Exact-match detection let a whole production through as four takes of one
    moment: same location, same standoff, wording varied just enough to differ
    byte for byte. A format that promises hook, pressure, and a memorable choice
    has to actually change between shots, so near-duplicate beats are rejected
    too. Staying in one location is still fine - what must move is the beat.
  */
  for (let index = 1; index < scenes.length; index += 1) {
    for (let earlier = 0; earlier < index; earlier += 1) {
      if (scenes[index].sourceSlotId && scenes[index].sourceSlotId === scenes[earlier].sourceSlotId) continue;
      if (beatSimilarity(scenes[index], scenes[earlier]) >= BEAT_REPEAT_THRESHOLD) {
        return {
          valid: false,
          error: `Scene ${index + 1} plays the same beat as scene ${earlier + 1}. Each shot needs its own objective and a visible action that changes the situation — the story has to move, even if the location does not.`,
        };
      }
    }
  }

  return { valid: true };
}

export function buildShotImagePrompt(input: ShotPromptInput): string {
  const camera = cameraPlanForShot(input);
  const actors = shotActors(input);
  const ensemble = actors.length > 1;
  // A two-hander's physical contact is the point of the shot, so it must be
  // directed rather than flagged as a risk to simplify away.
  const risks = auditShotScene(input.scene).filter((risk) => !(ensemble && risk.code === "complex-contact"));
  return [
    `PURPOSE: Binding first frame for scene ${input.sceneIndex + 1} of ${input.sceneCount} in "${input.productionTitle}".`,
    "SHOT UNIT: This image is the exact visual start of one four-second clip. It is not a portrait, poster, montage, or finished edit.",
    `STORY PROMISE: ${input.productionLogline || "Make the scene's visible change clear without explanatory text."}`,
    `SETTING: ${input.scene.setting || "A specific location grounded in the locked production."}`,
    `DRAMATIC OBJECTIVE: ${input.scene.objective || "Create one visible situation change."}`,
    `FIRST-FRAME ACTION: Compose the instant immediately before ${input.scene.action || `${actors[0].name} begins one concise, camera-readable action.`}`,
    input.scene.energyState ? `ENERGY STATE: ${input.scene.energyState}. Identity budget is already resolved for this frame.` : "",
    input.scene.behaviorTell ? `CARD BEHAVIOR TELL: ${input.scene.behaviorTell.tell}. Make this visible without explaining it.` : "",
    input.scene.dressing ? `HUMAN DRESSING: ${input.scene.dressing}` : "",
    input.scene.framingConstraint === "non_readable" ? "FRAMING CONSTRAINT: NON-READABLE. Use silhouette, partial framing, off-frame action, or reaction-only coverage." : "",
    input.scene.referencedProps?.length ? `CLOSED PROP SET: ${input.scene.referencedProps.join(", ")}. Add no other prop or weapon.` : "CLOSED PROP SET: no new props or weapons.",
    "DISTINCT SHOT RULE: Represent only this scene's authored setting, objective, and starting action. Do not copy the pose, staging, camera angle, or background of another scene in the sequence.",
    "SINGLE-FRAME RULE: Return one full-bleed camera view only. No split screen, tiled variants, storyboard, contact sheet, diptych, triptych, or collage.",
    ...(ensemble ? [castingComposition(actors)] : []),
    actorLock(actors),
    ...(ensemble
      ? [`CONTACT: Stage the interaction physically — state whose hand, shoulder, or weight meets whom, keep both actors' full bodies coherent through the contact, and preserve the ${actors[0].name}-to-${actors[1].name} screen direction. No merged bodies and no detached limbs.`]
      : []),
    ...(input.hasProductReference
      ? [`PRODUCT LOCK: The supplied ${input.productName || "product"} reference is binding. Preserve exact silhouette, packaging, label placement, proportions, colors, cap, and materials. Keep it readable at its real scale.`]
      : ["STORY EVIDENCE: Show only the physical evidence required by this scene's action and objective. Do not invent a product, storefront, service demonstration, or advertising setup that is absent from the script. Never return an empty portrait-only frame."]),
    `CAMERA: ${camera.angle}; ${camera.lens}. Compose enough space for ${camera.movementName}: ${camera.movementPrompt}`,
    "COMPOSITION: Show the actor's face, hands, important object or product, and environment in one coherent depth structure. Keep foreground occlusion intentional and preserve a clean direction of travel.",
    buildSceneHandAnatomyDirection({
      actorNames: actors.map((actor) => actor.name),
      action: input.scene.action,
    }),
    "LIGHT: Use motivated cinematic light from visible or plausible sources. Natural skin, tactile materials, controlled contrast, and no bright studio-light contamination unless the scene explicitly requires a studio.",
    `CONTINUITY: ${input.continuityNote || "Preserve identity, wardrobe, props, product, screen direction, background geography, palette, and time of day across adjacent shots."}`,
    "REALISM: Photoreal live-action captured through a physical camera unless the concept explicitly requests animation, manga, illustration, or another stylized medium.",
    ...(risks.length ? [`DIRECTOR CHECK: ${risks.map((risk) => risk.message).join(" ")}`] : []),
    `EXCLUSIONS: ${[...SHOT_KNOWLEDGE_BASE.negative, ...(input.scene.sensitiveNegatives ?? [])].join(" ")}`,
  ].filter(Boolean).join("\n");
}

export function buildLegacyUnsafeShotVideoPrompt(input: ShotPromptInput): string {
  const camera = cameraPlanForShot(input);
  const actors = shotActors(input);
  const ensemble = actors.length > 1;
  const risks = auditShotScene(input.scene).filter((risk) => !(ensemble && risk.code === "complex-contact"));
  return [
    `Animate scene ${input.sceneIndex + 1} of ${input.sceneCount} for "${input.productionTitle}" as one continuous five-second silent source clip whose usable action lands by four seconds.`,
    `STORY PROMISE: ${input.productionLogline || input.scene.objective || "One visible action creates one visible change."}`,
    "SOURCE FRAME: The supplied image is the exact first frame and complete art direction. Do not redesign, recompose, or invent a second angle.",
    `SCENE BEAT: ${input.scene.setting || "The established location"}; ${input.scene.objective || "one visible situation change"}.`,
    `0.0-0.8s — ESTABLISH: Hold long enough to read the actor, location, important object or product, and the starting body position.`,
    `0.8-3.2s — PERFORM: ${input.scene.action || `${actors[0].name} completes one concise, physically plausible action.`}`,
    `3.2-4.0s — LAND: Finish the action, settle body and camera motion, and hold a clean final frame that expresses ${input.scene.objective || "the changed situation"}.`,
    `CAMERA PATH — ${camera.movementName}: ${camera.movementPrompt}`,
    `CAMERA LOCK: Preserve ${camera.angle}, ${camera.lens}, the source-image axis, horizon, lens character, subject scale, and established screen direction. No second move and no cut.`,
    "EDIT HANDLE: After the action lands at four seconds, hold the same pose and composition through five seconds with only natural breath and environmental inertia. The master edit uses the first four seconds.",
    ensemble
      ? `IDENTITY ANCHOR: Keep all ${actors.length} actors present for the full five seconds — ${actors.map((actor) => actor.name).join(", ")}. Each keeps their own exact face, apparent age, hair, body proportions, skin detail, wardrobe, and distinguishing asymmetry from the supplied frame. Never blend two actors into one, drop an actor out of frame, or swap their positions.`
      : `IDENTITY ANCHOR: Keep ${actors[0].name}'s exact face, apparent age, hair, body proportions, skin detail, wardrobe, and distinguishing asymmetry from the supplied image.`,
    ...(input.hasProductReference
      ? [`PRODUCT ANCHOR: Keep the visible ${input.productName || "product"} continuously present, correctly shaped, correctly labeled, stable in scale, and physically connected to the stated surface or hand.`]
      : ["STORY ANCHOR: Preserve only the people, objects, and environmental evidence visible in this scene's supplied first frame. Do not invent an advertising setup or borrow objects from another scene."]),
    /*
      A four-second shot has to contain a performance. Without this the model
      returns an actor standing still, staring off, waiting to speak - correct
      in every locked detail and completely inert.
    */
    `PERFORMANCE: ${actors[0].name} is alive and occupied throughout. Head turns, eyeline changes, and hand movement are motivated by the action and carry human timing - uneven, weighted, with a settle at the end rather than a mechanical ease. Include continuous secondary life: breath, a weight shift, a small adjustment of grip or posture. Do not open on the actor idling, staring into the distance, or visibly waiting to speak; the action is already underway by the end of the establish beat.`,
    `DYNAMICS: Match the energy to the beat - ${input.scene.objective || "the situation changes"}. A tense beat is tight and contained; an urgent beat moves. Something visible must change between the first and last frame.`,
    "PHYSICS: Natural blink, breath, grounded weight, cloth inertia, plausible hand contact, and restrained environmental motion. Every moving object must have an explicit owner, support, or contact point. Motion runs forward in time: gait, wheels, and momentum all read in the direction the subject is actually going.",
    `CONTINUITY: ${input.continuityNote || "Do not reverse travel direction, swap positions, rebuild the background, add people, or change object count."}`,
    ...(risks.length ? [`SIMPLIFY BEFORE RENDER: ${risks.map((risk) => risk.message).join(" ")}`] : []),
    `NEGATIVE: ${SHOT_KNOWLEDGE_BASE.negative.join(" ")}`,
    "AUDIO: Silent visual plate only. No lip-sync, speech, effects, ambience, or music; audio is generated and mixed separately. --duration 5 --camerafixed false",
  ].join("\n");
}

export function buildShotVideoPrompt(input: ShotPromptInput): string {
  const camera = cameraPlanForShot(input);
  const actors = shotActors(input);
  const movingSubject = actors[0]?.name ?? input.actorName;
  const durationMs = Math.max(1000, Math.round(input.scene.durationMs ?? (input.scene.durationSeconds ?? 4) * 1000));
  const durationSeconds = durationMs / 1000;
  const establishEnd = Math.max(0.5, Math.min(1, durationSeconds * 0.2));
  const performEnd = Math.max(establishEnd + 0.5, durationSeconds * 0.82);
  const cameraDrift = input.scene.cameraMovementId === "locked-off"
    ? "none; the camera is completely locked"
    : `${camera.movementName} only; no unplanned drift`;
  const risks = auditShotScene(input.scene);
  return [
    `Animate slot ${input.scene.slotId ?? input.sceneIndex + 1} of ${input.sceneCount} for "${input.productionTitle}" as one continuous ${durationMs}ms silent source clip.`,
    `STORY PROMISE: ${input.productionLogline || input.scene.objective || "One visible action creates one visible change."}`,
    "SOURCE FRAME: The supplied image is the exact first frame and complete art direction. Do not redesign, recompose, or invent a second angle.",
    `SCENE BEAT: ${input.scene.setting || "The established location"}; ${input.scene.objective || "one visible situation change"}.`,
    `0.0-${establishEnd.toFixed(2)}s - ESTABLISH: Read the locked subject, location, important object, and starting body position.`,
    `${establishEnd.toFixed(2)}-${performEnd.toFixed(2)}s - PERFORM: ${input.scene.action || `${movingSubject} completes one concise, physically plausible action.`}`,
    `${performEnd.toFixed(2)}-${durationSeconds.toFixed(2)}s - LAND: Finish the action, settle body and camera motion, and hold the changed situation.`,
    `CONTROLLED MOTION: Exactly one named moving subject: ${movingSubject}. Every other person and all dressing remain explicitly still except for passive physical inertia. Camera drift: ${cameraDrift}.`,
    input.scene.energyState ? `ENERGY STATE: ${input.scene.energyState}. Do not exceed its camera or identity budget.` : "",
    `MOTION MODE: ${input.scene.motionMode ?? "forward"}${input.scene.motionMode === "chain" && input.scene.motionFromSlotId ? ` from rendered slot ${input.scene.motionFromSlotId}` : ""}.`,
    `CAMERA PATH - ${camera.movementName}: ${camera.movementPrompt}`,
    `CAMERA LOCK: Preserve ${camera.angle}, ${camera.lens}, source-image axis, horizon, lens character, subject scale, and screen direction. No second move and no cut.`,
    input.scene.behaviorTell ? `CARD BEHAVIOR TELL: ${input.scene.behaviorTell.tell}.` : "",
    `IDENTITY ANCHOR: Keep only ${actors.map((actor) => actor.name).join(" and ")} readable and identity-locked. Never blend, duplicate, beautify, age-shift, or substitute them.`,
    input.scene.dressing ? `HUMAN DRESSING: ${input.scene.dressing}` : "",
    input.scene.framingConstraint === "non_readable"
      ? "SENSITIVE FRAMING: Keep the minor, injury, or threatened person non-readable through silhouette, partial framing, off-frame action, or reaction-only coverage."
      : "",
    input.scene.dialogueFramingConstraint === "off_face"
      ? "DIALOGUE FRAMING: OFF-FACE. Hold on hands, profile, listener, rear three-quarter, or reaction coverage; the locked TTS performance is mixed separately."
      : "",
    input.scene.referencedProps?.length
      ? `CLOSED PROP SET: ${input.scene.referencedProps.join(", ")}. No new prop or weapon may appear.`
      : "CLOSED PROP SET: no new props or weapons.",
    "PHYSICS: Natural blink, breath, grounded weight, cloth inertia, plausible contact, and forward-time momentum. Every moving object has one explicit owner or support.",
    `CONTINUITY: ${input.continuityNote || "Do not reverse travel direction, swap positions, rebuild the background, add people, or change object count."}`,
    ...(risks.length ? [`SIMPLIFY BEFORE RENDER: ${risks.map((risk) => risk.message).join(" ")}`] : []),
    `NEGATIVE: ${[...SHOT_KNOWLEDGE_BASE.negative, ...(input.scene.sensitiveNegatives ?? [])].join(" ")}`,
    `AUDIO: Silent visual plate only. No lip-sync, speech, effects, ambience, or music; audio is generated and mixed separately. --duration ${durationSeconds.toFixed(3)} --camerafixed ${input.scene.cameraMovementId === "locked-off" ? "true" : "false"}`,
  ].filter(Boolean).join("\n");
}
