import type { Archetype, Character, CharacterProductionBible } from "@/lib/types";
import { buildCharacterSystem } from "@/lib/character-system";
import {
  buildImagePrompt as buildCardImagePrompt,
  buildIdentitySeedPrompt as buildCardIdentitySeedPrompt,
  buildVideoPrompt as buildCardVideoPrompt,
  buildVoiceDesignPrompt as buildCardVoiceDesignPrompt,
  readCharacterCardV2,
  selectedWardrobeState,
  type SignatureSfxEvent,
} from "@/lib/character-card";
import { productIdentityLock, type ProductCard } from "@/lib/product-card";
import { VideoType, isProductVideoType } from "@/lib/video-brief";
import {
  resolveVoiceLanguageDirection,
  sanitizeVoicePerformanceDirection,
} from "@/lib/voice-language";
import { composePromptSlots, joinPromptList, unwrapLegacyDirection } from "@/lib/prompt-composer";
import { buildAudioSceneBlock, type AudioPlan } from "@/lib/audio-plan";
import {
  THEME_DIRECTION_TEMPLATE,
  fillThemeDirectionTemplate,
  splitThemeGenres,
} from "@/lib/theme-direction-template";
import {
  ARCHETYPE_VOICE_DELIVERY,
  DEFAULT_VOICE_DELIVERY,
  VOICE_DIRECTION_TEMPLATE,
  fillVoiceDirectionTemplate,
  voiceAgeDescriptor,
} from "@/lib/voice-direction-template";
import { finalizeVideoPrompt, withStandingInjections } from "@/lib/prompt-standards";
import {
  generationSafePerformanceText,
  safeSignatureGesture,
  staticRecognitionLocks,
} from "@/lib/performance-safety";

export type CharacterIdentityInput = Pick<Character, "name" | "archetype" | "tagline" | "personality" | "voiceGender"> &
  Partial<Pick<Character, "voiceDesc" | "sfxDesc" | "themeDesc" | "productionBible" | "cardV2" | "brollLine" | "brollScene">> & {
    appearanceBrief?: string;
    worldBrief?: string;
  };

export type ShotBlueprint = {
  sceneName: string;
  dramaticBeat: string;
  hook: string;
  setting: string;
  subjectStart: string;
  actionTimeline: [string, string, string];
  facialBeat: string;
  framing: string;
  cameraAngle: string;
  lens: string;
  cameraMovement: string;
  keyLight: string;
  fillAndEdge: string;
  environmentalMotion: string;
  soundTexture: string;
  musicalArc: string;
  finalFrame: string;
  dialogue: string;
  /** Optional shot-level exclusions; product grammars merge these with the product lock. */
  negative?: string;
};

export type ScenePackage = {
  sceneName: string;
  hook: string;
  dialogue: string;
  image: string;
  video: string;
  sfx: string;
  theme: string;
  blueprint: ShotBlueprint;
};

type ArchetypeDirection = {
  want: string;
  need: string;
  contradiction: string;
  stakes: string;
  vulnerability: string;
  boundary: string;
  expression: string;
  pressure: string;
  gesture: string;
  movement: string;
  hook: string;
  escalation: string;
  cliffhanger: string;
  payoff: string;
  motifs: string[];
  framing: string;
  angle: string;
  lens: string;
  key: string;
  fill: string;
  edge: string;
  texture: string;
  palette: string[];
};

const DIRECTIONS: Record<Archetype, ArchetypeDirection> = {
  villain: {
    want: "control the room before anyone sees the trap",
    need: "accept that loyalty cannot be forced",
    contradiction: "offers exquisite courtesy while engineering irreversible pressure",
    stakes: "losing control exposes the fear beneath the performance",
    vulnerability: "a sincere act of trust leaves them without a script",
    boundary: "never harms a powerless person merely to prove authority",
    expression: "an unreadable half-smile with still eyes",
    pressure: "the smile disappears; the voice grows quieter and the body becomes perfectly still",
    gesture: "aligns one nearby object before making a threat",
    movement: "economical steps, squared turns, no wasted hand movement",
    hook: "begin with an apparently generous act that contains a trap",
    escalation: "every concession removes one escape route",
    cliffhanger: "reveal that the opponent already accepted the dangerous bargain",
    payoff: "force a choice between control and the one relationship they value",
    motifs: ["symmetry", "sealed objects", "reflections"],
    framing: "formal medium close-up with controlled negative space",
    angle: "eye level drifting five degrees low only when control changes hands",
    lens: "65mm portrait perspective with shallow but readable depth",
    key: "narrow warm key from frame left, motivated by a practical lamp",
    fill: "minimal cool bounce from frame right",
    edge: "thin amber edge separating the shoulders from shadow",
    texture: "polished surfaces interrupted by one imperfect detail",
    palette: ["oxblood", "aged brass", "charcoal"],
  },
  mentor: {
    want: "prepare another person for a choice they cannot make for them",
    need: "stop confusing restraint with emotional distance",
    contradiction: "patient in conversation and ruthless about avoided truth",
    stakes: "their guidance may create a successor who no longer needs them",
    vulnerability: "recognition of their own old mistake breaks the calm",
    boundary: "never takes the decisive action away from the learner",
    expression: "soft attention with one assessing eyebrow",
    pressure: "a long exhale, lowered chin, then one exact instruction",
    gesture: "turns an everyday object into a practical lesson",
    movement: "grounded weight, deliberate hands, lets others cross the frame first",
    hook: "open on the mentor quietly correcting the consequence, not the mistake",
    escalation: "remove advice and make the learner act",
    cliffhanger: "reveal that the mentor once failed the same test",
    payoff: "the learner repeats the lesson in an unexpected form",
    motifs: ["worn tools", "thresholds", "morning light"],
    framing: "two-thirds profile medium shot with space for the learner",
    angle: "calm eye-level camera",
    lens: "50mm natural perspective",
    key: "large soft daylight source from frame right",
    fill: "warm practical bounce below eye line",
    edge: "subtle window edge on hair and shoulder",
    texture: "worn wood, repaired objects, tactile dust",
    palette: ["indigo", "warm wood", "soft gold"],
  },
  "love-interest": {
    want: "be chosen without surrendering independence",
    need: "say the dangerous truth before charm turns into distance",
    contradiction: "inviting presence, fiercely guarded private life",
    stakes: "the relationship fails if either person performs instead of answering",
    vulnerability: "direct tenderness disarms their practiced wit",
    boundary: "never uses intimacy as leverage",
    expression: "composed gaze with amusement arriving before the smile",
    pressure: "breaks eye contact once, then returns with complete honesty",
    gesture: "touches a small personal token before taking an emotional risk",
    movement: "fluid turns, assured stillness, closes distance only by choice",
    hook: "open on them knowing one detail they should not know",
    escalation: "make emotional honesty conflict with the practical mission",
    cliffhanger: "end on an intimate truth that changes the alliance",
    payoff: "let independence become the reason the relationship survives",
    motifs: ["kept letters", "doorways", "shared reflections"],
    framing: "intimate medium close-up with foreground occlusion",
    angle: "eye level, camera just off the other person's eyeline",
    lens: "75mm portrait compression",
    key: "soft tungsten key through patterned glass from frame right",
    fill: "very low neutral fill preserving eye detail",
    edge: "warm practical halo on the far cheek and hair",
    texture: "embroidered fabric, glass, soft atmospheric grain",
    palette: ["deep emerald", "antique gold", "black"],
  },
  "comic-relief": {
    want: "prove the apparent fool is the person paying closest attention",
    need: "risk sincerity without hiding behind the next joke",
    contradiction: "chaotic delivery, precise situational intelligence",
    stakes: "if nobody listens, the joke becomes a warning delivered too late",
    vulnerability: "silence after a joke exposes how much they care",
    boundary: "never makes the weakest person the punchline",
    expression: "alert eyes and a smile that changes direction mid-thought",
    pressure: "the rhythm accelerates, then stops on one unexpectedly plain sentence",
    gesture: "catches or fixes a prop without interrupting the line",
    movement: "quick lateral entries, compact gestures, sudden clean stillness",
    hook: "open on a visual mistake that turns out to be deliberate",
    escalation: "let each joke solve one problem and create a larger one",
    cliffhanger: "end when the comic notices the threat before everyone else",
    payoff: "the throwaway observation becomes the winning clue",
    motifs: ["misplaced props", "near misses", "repeated threes"],
    framing: "slightly wide medium shot that leaves room for physical timing",
    angle: "eye level with a subtle off-center composition",
    lens: "35mm environmental perspective",
    key: "bright soft key motivated by an overhead shop or street source",
    fill: "clean open fill for readable expressions",
    edge: "colored practical edge from the deep background",
    texture: "busy lived-in surfaces with one strong graphic shape",
    palette: ["marigold", "teal", "warm red"],
  },
  hero: {
    want: "protect ordinary people without needing their applause",
    need: "accept help before duty becomes isolation",
    contradiction: "decisive under pressure, hesitant with personal need",
    stakes: "saving the mission while losing the person who still sees the human being",
    vulnerability: "gratitude is harder to receive than danger",
    boundary: "never trades an innocent life for a cleaner victory",
    expression: "level gaze, relaxed mouth, concern held behind the eyes",
    pressure: "checks the exits, sets the jaw once, then commits without flourish",
    gesture: "rolls one shoulder or tightens a cuff before action",
    movement: "grounded forward motion, protective positioning, turns with the torso before the head",
    hook: "open after the obvious plan has already failed",
    escalation: "make every rescue cost a tactical advantage",
    cliffhanger: "end on evidence that the protected person caused the crisis",
    payoff: "win by keeping the moral boundary that seemed impractical",
    motifs: ["open doors", "weathered metal", "held breath"],
    framing: "chest-up hero frame with meaningful environment on one side",
    angle: "eye level, never exaggerated low-angle worship",
    lens: "50mm with natural facial proportions",
    key: "hard-soft motivated key from frame left, shaped through a doorway",
    fill: "cool low-level environmental fill",
    edge: "restrained warm rim from a practical behind the actor",
    texture: "weathered architecture, realistic skin, tactile uniform or workwear",
    palette: ["deep olive", "steel blue", "warm tungsten"],
  },
  superhero: {
    want: "turn impossible ability into practical help",
    need: "separate public usefulness from personal worth",
    contradiction: "spectacular power, stubbornly ordinary sense of humor",
    stakes: "a public failure could make protection itself look dangerous",
    vulnerability: "being watched makes private doubt impossible to hide",
    boundary: "never uses power to humiliate an opponent",
    expression: "open confidence with a flicker of calculation before action",
    pressure: "absorbs the impact, plants the feet, then looks first for bystanders",
    gesture: "opens the hand before energy or force gathers",
    movement: "clean arcs, strong landings, human recovery weight after impossible motion",
    hook: "open on a tiny human problem inside a spectacular event",
    escalation: "make greater power create a more personal consequence",
    cliffhanger: "end when the rescue reveals who engineered the emergency",
    payoff: "solve the climax through judgment rather than raw force",
    motifs: ["charged air", "three-note light pulses", "ordinary objects surviving impact"],
    framing: "dynamic medium-wide with clear body silhouette and human-scale foreground",
    angle: "slightly low but close to eye level",
    lens: "40mm cinematic perspective",
    key: "directional cool daylight from frame right",
    fill: "warm city bounce keeping skin natural",
    edge: "controlled energy-colored rim, never a full-body glow",
    texture: "real materials, fine airborne particles, restrained energy effects",
    palette: ["cobalt", "sunlit gold", "graphite"],
  },
  horror: {
    want: "make the living acknowledge what the place remembers",
    need: "release the one memory that keeps the haunting alive",
    contradiction: "terrifying patience, one recognizably human ritual",
    stakes: "every denial allows the environment to repeat the original harm",
    vulnerability: "a familiar melody or object interrupts the menace",
    boundary: "never appears in full light until the truth is spoken",
    expression: "almost neutral, with attention fixed slightly past the other person",
    pressure: "does not accelerate; the environment moves instead",
    gesture: "repeats one small unfinished action from the past",
    movement: "minimal displacement, delayed head turns, appears closer after occlusion",
    hook: "open on an ordinary background detail behaving one beat late",
    escalation: "let the space respond before the figure does",
    cliffhanger: "end with proof the haunting belongs to the viewer's side of the frame",
    payoff: "repeat the opening image with one devastating changed detail",
    motifs: ["empty seats", "stalled mechanisms", "delayed reflections"],
    framing: "locked medium-wide with threatening negative space",
    angle: "waist-height camera held perfectly level",
    lens: "45mm with deep background legibility",
    key: "single weak practical from frame right creating a steep falloff",
    fill: "near-zero fill with only enough level to retain facial structure",
    edge: "cold intermittent edge from a failing source behind frame left",
    texture: "damp walls, dust, damaged emulsion, restrained grain",
    palette: ["mildewed green", "dead amber", "ink black"],
  },
  rebel: {
    want: "expose the bargain everyone agreed not to mention",
    need: "build something after becoming excellent at refusal",
    contradiction: "provocative surface, disciplined strategy underneath",
    stakes: "winning attention without changing the system turns rebellion into branding",
    vulnerability: "loyalty to one person can compromise the clean argument",
    boundary: "never demands a risk they will not take first",
    expression: "direct challenge softened by quick private concern",
    pressure: "moves closer, lowers the voice, and makes the choice concrete",
    gesture: "tears, marks, or repurposes a symbol of authority",
    movement: "diagonal paths, purposeful pace, uses obstacles as staging",
    hook: "open on a familiar rule being broken for an unexpected humane reason",
    escalation: "turn public defiance into a private cost",
    cliffhanger: "end when the movement adopts the tactic they opposed",
    payoff: "replace the rejected system with a visible working alternative",
    motifs: ["torn paper", "hand-painted marks", "crossed sightlines"],
    framing: "handheld-feeling medium shot with assertive diagonals",
    angle: "shoulder-height camera slightly canted only during disruption",
    lens: "32mm close environmental perspective",
    key: "hard lateral daylight or sodium practical from frame left",
    fill: "natural location bounce",
    edge: "brief red or amber edge from moving background light",
    texture: "concrete, paper, paint, real sweat and fabric wear",
    palette: ["rust red", "concrete grey", "electric blue"],
  },
  sidekick: {
    want: "be trusted with more than repairing someone else's legend",
    need: "claim authorship without abandoning loyalty",
    contradiction: "supportive instincts, quietly competitive intelligence",
    stakes: "remaining invisible keeps the team safe but erases the contribution",
    vulnerability: "praise from the lead lands harder than criticism",
    boundary: "never withholds vital information to earn credit",
    expression: "active listening with ideas visible before speech",
    pressure: "hands become precise while speech becomes candid",
    gesture: "checks one tool or note, then hands it over handle-first",
    movement: "works around the lead's axis, then steps into center when needed",
    hook: "open on the sidekick solving the problem just outside the hero's frame",
    escalation: "make competence create a conflict over ownership",
    cliffhanger: "end when the lead asks them to make the call",
    payoff: "the team succeeds only after roles visibly change",
    motifs: ["shared tools", "unfinished diagrams", "hand-offs"],
    framing: "medium two-shot language that can resolve into a clean single",
    angle: "eye level with balanced headroom",
    lens: "45mm natural perspective",
    key: "soft practical key from the work surface",
    fill: "open neutral fill for fast expression changes",
    edge: "cool technical edge from background equipment",
    texture: "workbench detail, layered clothing, functional wear",
    palette: ["copper", "navy", "cream"],
  },
  outsider: {
    want: "belong without becoming harmless",
    need: "let one person interpret the silence correctly",
    contradiction: "self-contained presence, startlingly direct observations",
    stakes: "acceptance may require erasing the difference that makes them useful",
    vulnerability: "an unprompted welcome defeats their prepared distance",
    boundary: "never pretends to misunderstand in order to manipulate",
    expression: "watchful stillness with brief unguarded curiosity",
    pressure: "tracks the room first, then states the forbidden obvious fact",
    gesture: "keeps one hand near a personal object tied to home",
    movement: "holds frame edges, crosses only after mapping the space",
    hook: "open on them noticing a rule nobody else can see",
    escalation: "make each attempt to belong reveal a deeper exclusion",
    cliffhanger: "end when their difference becomes the only route forward",
    payoff: "belonging arrives without requiring assimilation",
    motifs: ["maps", "unfamiliar thresholds", "distant transport"],
    framing: "medium-long frame with layered foreground separation",
    angle: "eye level from just beyond a threshold",
    lens: "55mm compressed environment",
    key: "cool window key from frame left",
    fill: "warm reflected practical from below frame right",
    edge: "soft neutral edge defining the silhouette",
    texture: "transit spaces, worn luggage, rain-softened surfaces",
    palette: ["slate", "distant amber", "faded teal"],
  },
};

const LOCAL_FACE_BLUEPRINTS = [
  {
    age: "late 30s, with fine forehead lines and lived-in eye texture",
    anchors: ["broad straight brows with the left sitting slightly higher", "deep-set almond eyes with a faint crease beneath the right eye", "long straight nose, compact mouth, and a squared jaw softened by one cheek dimple"],
    hair: "dense collar-length wavy dark hair, off-center part, one loose section at the right temple, natural matte finish",
  },
  {
    age: "early 40s, with visible smile lines and an unretouched working face",
    anchors: ["low arched brows with generous spacing above alert round eyes", "slightly hooked nose with a narrow bridge", "full lower lip, tapered chin, and a small mole high on the left cheek"],
    hair: "short coarse dark hair, high left part, lightly receded temples, closely controlled sides without a glossy finish",
  },
  {
    age: "early 30s, with clear adult bone structure and natural under-eye detail",
    anchors: ["strong horizontal brow line broken by a small notch over the right eye", "wide-set hooded eyes with a steady asymmetrical gaze", "rounded nose tip, defined cupid's bow, and a narrow angular jaw"],
    hair: "thick chin-length textured hair, center-left part, tucked behind one ear, soft flyaways retained",
  },
  {
    age: "late 40s, with sun texture at the temples and no cosmetic smoothing",
    anchors: ["dense gently curved brows framing close-set observant eyes", "broad nose with a subtle leftward asymmetry", "thin upper lip, pronounced nasolabial lines, and a strong rounded chin"],
    hair: "short salt-and-pepper waves, natural hairline, brushed back by hand rather than styled into place",
  },
  {
    age: "mid 20s, unmistakably adult, with natural pores and faint expression lines",
    anchors: ["fine straight brows above large deep-set eyes", "compact nose with a softly squared bridge", "wide expressive mouth with one corner resting higher and a softly pointed chin"],
    hair: "dense shoulder-length curls, irregular side part, controlled volume with individual strands visible against the light",
  },
  {
    age: "mid 50s, with a weathered forehead, textured cheeks, and calm age-specific eyes",
    anchors: ["heavy brows with a clean gap over narrow-set eyes", "prominent straight nose with a broad base", "compressed mouth, high cheekbones, and a shallow scar beside the right jaw"],
    hair: "close-cropped salt-and-pepper hair, receded but precise hairline, natural crown texture",
  },
] as const;

function localFaceBlueprint(name: string) {
  let hash = 0;
  for (const character of name) hash = (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0;
  return LOCAL_FACE_BLUEPRINTS[hash % LOCAL_FACE_BLUEPRINTS.length];
}

function compact(value: string, max = 420) {
  const cleaned = value.trim().replace(/\s+/g, " ");
  return cleaned.length <= max ? cleaned : `${cleaned.slice(0, max).replace(/\s+\S*$/, "")}...`;
}

const STYLIZED_MEDIUM = /\b(?:manga|anime|illustration|illustrated|comic(?:-book)?|animation|animated|digital painting|3d render|cgi|claymation|stop[- ]motion|watercolou?r|ink drawing|cel shading|screentone)\b/i;

function visualMedium(...directions: Array<string | undefined>) {
  const clauses = directions
    .filter((value): value is string => Boolean(value?.trim()))
    .flatMap((value) => value.split(/[.\n]/).map((clause) => clause.trim()).filter(Boolean));
  const explicit = clauses.find((clause) => STYLIZED_MEDIUM.test(clause));
  return explicit
    ? compact(explicit, 180)
    : "Live-action cinematic photograph, natural skin texture, tactile materials, optical depth, restrained film grain";
}

function concise(value: string | undefined, max = 150) {
  if (!value) return "";
  const cleaned = value.trim().replace(/\s+/g, " ").replace(/[.;]+$/, "");
  if (cleaned.length <= max) return cleaned;
  return cleaned.slice(0, max).replace(/\s+\S*$/, "");
}

const LOCK_CATEGORIES = [
  /\b(?:hair|hairline|streak|braid|bun|fringe|curl|part)\b/i,
  /\b(?:left eye|right eye|eyes?|brows?|scar|mole|freckle|nose|jaw|mouth)\b/i,
  /\b(?:coat|jacket|saree|sari|robe|uniform|shirt|dress|kurta|blouse|trousers|collar)\b/i,
  /\b(?:badge|pin|bangle|ring|glasses|eyepatch|necklace|pendant|watch|cane|prop)\b/i,
] as const;

function appearanceRecognitionLocks(appearance?: string) {
  if (!appearance) return [];
  const clauses = appearance
    .split(/[.;,\n]/)
    .map((value) => concise(value, 90))
    .filter((value) => value.length >= 8 && !STYLIZED_MEDIUM.test(value));
  const locks: string[] = [];
  for (const category of LOCK_CATEGORIES) {
    const candidate = clauses.find((value) => category.test(value) && !locks.includes(value));
    if (candidate) locks.push(candidate);
  }
  return locks;
}

function visibleIdentity(character: CharacterIdentityInput, bible: CharacterProductionBible) {
  if (character.appearanceBrief?.trim()) {
    const clauses = character.appearanceBrief
      .split(/[.\n]/)
      .map((value) => value.trim())
      .filter((value) => value && !STYLIZED_MEDIUM.test(value))
      .map((value) => generationSafePerformanceText(value, ""))
      .filter(Boolean);
    return concise(clauses.join(". "), 520);
  }
  return concise([
    bible.visual.perceivedAge,
    bible.visual.faceAnchors.join("; "),
    bible.visual.hair,
    bible.visual.wardrobe,
  ].filter(Boolean).join(". "), 520);
}
function recognitionLocks(bible: CharacterProductionBible, appearance?: string) {
  const supplied = staticRecognitionLocks(bible.visual.recognitionLocks ?? []).map((value) => concise(value, 90)).filter(Boolean);
  const fallback = staticRecognitionLocks([
    ...appearanceRecognitionLocks(appearance || bible.visual.faceAnchors.join(". ")),
    ...bible.visual.faceAnchors,
    bible.visual.hair,
    bible.visual.wardrobe,
    ...bible.visual.continuityRules,
  ]).map((value) => concise(value, 90)).filter(Boolean);
  const unique = [...new Set([...supplied, ...fallback])].slice(0, 4);
  const generic = [
    "same face geometry and distinctive asymmetry",
    "same hairline, part, length, texture, and colour detail",
    "same hero garment, opening, material, and fastening",
    "same signature accessory or prop in its exact position",
  ];
  for (const value of generic) {
    if (unique.length === 4) break;
    unique.push(value);
  }
  return unique;
}

function visibleRecognitionLocks(locks: string[], framing: string, expression: string) {
  return locks.filter((lock) => {
    if (/\b(grin|smile|teeth|canine)\b/i.test(lock)) return /\b(grin|smile|teeth)\b/i.test(expression);
    if (/\b(hip|belt|feet|shoe|flip-flop)\b/i.test(lock)) return /\b(full.body|chest.to.knee|waist|wide|long)\b/i.test(framing);
    return true;
  });
}
function identityNegative(medium: string) {
  return STYLIZED_MEDIUM.test(medium)
    ? "photoreal, live-action, 3D, CGI, unrelated art style, generic face, costume drift, extra person, text, logo, watermark"
    : "cartoon, anime, manga, illustration, 3D, CGI, beauty-filter skin, generic face, costume drift, extra person, text, logo, watermark";
}

export function buildProductionBible(input: CharacterIdentityInput): CharacterProductionBible {
  if (input.productionBible) {
    return input.productionBible.system
      ? input.productionBible
      : { ...input.productionBible, system: buildCharacterSystem(input, input.productionBible) };
  }
  const d = DIRECTIONS[input.archetype] ?? DIRECTIONS.hero;
  const appearance = input.appearanceBrief?.trim();
  const world = input.worldBrief?.trim();
  const localFace = localFaceBlueprint(input.name);
  const bible: CharacterProductionBible = {
    version: 1,
    dramatic: {
      externalWant: d.want,
      innerNeed: d.need,
      contradiction: d.contradiction,
      stakes: d.stakes,
      vulnerability: d.vulnerability,
      moralBoundary: d.boundary,
    },
    performance: {
      restingExpression: d.expression,
      underPressure: d.pressure,
      signatureGesture: d.gesture,
      movementStyle: d.movement,
      eyeline: "looks at the other person while listening; meets lens only for a deliberate direct-address beat",
      tempo: input.archetype === "comic-relief" ? "quick setup, precise pause, clean landing" : "measured start, compressed decision, decisive finish",
    },
    visual: {
      medium: visualMedium(appearance, world),
      perceivedAge: appearance || localFace.age,
      faceAnchors: appearance
        ? [`follow this exact visible appearance brief: ${appearance}`, ...localFace.anchors.slice(0, 2)]
        : [...localFace.anchors],
      hair: appearance
        ? `derive one exact cut, hairline, part, texture, length, and finish from this direction and never restyle it: ${appearance}`
        : localFace.hair,
      wardrobe: appearance
        ? "preserve the wardrobe, materials, accessories, and wear specified in the appearance direction as one repeatable hero look"
        : `functional ${input.archetype.replace("-", " ")} wardrobe with one repeatable hero garment and no logos`,
      silhouette: d.movement,
      palette: d.palette,
      recognitionLocks: [
        ...appearanceRecognitionLocks(appearance),
        concise(localFace.anchors[0], 90),
        concise(localFace.anchors[1], 90),
        concise(localFace.hair, 90),
        "the same repeatable hero garment, material, and fastening",
      ].slice(0, 4),
      continuityRules: [
        "same face geometry, perceived age, skin tone, hairline, and body proportions",
        "same hero garment, materials, accessories, and wear pattern unless the story explicitly changes them",
        "real skin pores, fabric weight, hand anatomy, and grounded contact with the set",
      ],
    },
    cinematography: {
      heroFraming: d.framing,
      cameraHeight: d.angle,
      lens: d.lens,
      keyLight: d.key,
      fillLight: d.fill,
      edgeLight: d.edge,
      worldTexture: world || d.texture,
    },
    story: {
      hookPattern: d.hook,
      escalationPattern: d.escalation,
      cliffhangerPattern: d.cliffhanger,
      payoffPattern: d.payoff,
      recurringMotifs: d.motifs,
      avoid: [
        "biography spoken as dialogue",
        "generic hero poses or empty walking shots",
        "explaining an emotion already visible on the face",
        "a cliffhanger that only withholds information without changing the situation",
      ],
    },
  };
  return { ...bible, system: buildCharacterSystem(input, bible) };
}

export function composeVoiceDesignPrompt(character: CharacterIdentityInput) {
  const card = readCharacterCardV2(character.cardV2);
  if (card) return buildCardVoiceDesignPrompt(card);
  const bible = buildProductionBible(character);
  const persona = `${character.archetype.replace("-", " ")}, ${bible.dramatic.contradiction}`;
  const source = bible.creationInputs;
  const voiceContext = {
    characterBrief: source?.characterBrief,
    worldBrief: source?.worldBrief || character.worldBrief,
    personality: character.personality,
    tagline: character.tagline,
    voiceDirection: source?.voiceDirection || character.voiceDesc,
  };
  const languageDirection = resolveVoiceLanguageDirection(voiceContext);
  const performanceDirection = unwrapLegacyDirection(
    sanitizeVoicePerformanceDirection(voiceContext),
    "voice",
  );
  const delivery = ARCHETYPE_VOICE_DELIVERY[character.archetype] ?? DEFAULT_VOICE_DELIVERY;
  /*
    Rendered through the one global template so every actor is briefed on the
    same twelve slots. The creator's own direction still wins the pitch slot -
    the template fixes the shape of the brief, not its content.
  */
  return fillVoiceDirectionTemplate(VOICE_DIRECTION_TEMPLATE, {
    LANGUAGE: languageDirection
      .replace(/^Primary spoken language:\s*/i, "")
      .replace(/\.\s*$/, ""),
    AGE: voiceAgeDescriptor(bible.visual.perceivedAge),
    GENDER: character.voiceGender,
    // The authored direction usually opens by restating age and gender, which
    // the template has already said - keeping it produced "adult feminine
    // voice. adult feminine, low and steady...".
    PITCH: voiceClause(withoutPresentationRestatement(performanceDirection), delivery.PITCH),
    TONE: delivery.TONE,
    CHARACTER_SUMMARY: persona,
    PACE: voiceClause(bible.performance.tempo, delivery.PACE),
    ARTICULATION: delivery.ARTICULATION,
    BREATH_STYLE: delivery.BREATH_STYLE,
    DICTION: delivery.DICTION,
    EMOTIONAL_STYLE: delivery.EMOTIONAL_STYLE,
    PRESSURE_BEHAVIOUR: voiceClause(bible.performance.underPressure, "They compress rather than escalate"),
  });
}

/** Drops a leading age/gender restatement so the pitch slot describes only sound. */
function withoutPresentationRestatement(value: string) {
  return value
    .replace(/^(?:an?\s+)?(?:late-teenage|young adult|middle-aged|older adult|adult|teenage|elderly)?\s*(?:feminine|masculine|androgynous|female|male|neutral)?\s*(?:voice)?\s*[,;:.-]?\s*/i, "")
    .trim();
}

/** Trims canon prose to one clause so a voice slot stays a direction, not a paragraph. */
function voiceClause(value: string | undefined, fallback: string) {
  const first = value?.trim().split(/(?<=[.;])\s/)[0]?.trim().replace(/[.;,]+$/, "");
  return first && first.length >= 3 ? first.slice(0, 180) : fallback;
}

/**
 * A portable prompt export. It includes the creator's original inputs when
 * available and the complete saved canon that Chaplin derived from them.
 */
export function composeCharacterMasterPrompt(character: Character) {
  const bible = buildProductionBible(character);
  const source = bible.creationInputs;
  const card = readCharacterCardV2(character.cardV2);
  const system = bible.system ?? buildCharacterSystem(character, bible);
  const originalInputs = source
    ? [
        `Creator brief: ${source.characterBrief || "Not supplied."}`,
        `Selected visual format: ${source.visualFormat || "Live action."}`,
        `Appearance brief: ${source.appearanceBrief || "Not supplied."}`,
        `World brief: ${source.worldBrief || "Not supplied."}`,
        `Selected archetypes: ${source.archetypes.join(", ") || character.archetype}.`,
        `Voice direction: ${source.voiceDirection || character.voiceDesc}.`,
        `Signature SFX direction: ${source.signatureSfxDirection || character.sfxDesc}.`,
        `Theme direction: ${source.themeDirection || character.themeDesc}.`,
        `License: ${source.licenseType}; royalty: ${source.royaltyRate}.`,
      ].join("\n")
    : "Original builder form fields were not retained for this older character. The canonical profile below is the complete reconstructed source of truth.";

  return [
    `# Chaplin character master brief — ${character.name}`,
    "",
    "Use this as the complete source of truth for the same fictional AI actor. Preserve identity locks in every future still, video, voice, conversation, and story. Do not substitute a generic actor or silently redesign the person.",
    "",
    "## Original creator inputs",
    originalInputs,
    "",
    "## Core character",
    `Name: ${character.name}`,
    `Primary archetype: ${character.archetype}`,
    `Archetype mix: ${(character.archetypeMix ?? [character.archetype]).join(", ")}`,
    `Tagline: ${character.tagline}`,
    `Personality: ${character.personality}`,
    `Voice presentation: ${character.voiceGender}`,
    `Voice: ${character.voiceDesc}`,
    `Signature SFX: ${character.sfxDesc}`,
    `Theme: ${character.themeDesc}`,
    `Signature spoken line: ${character.brollLine ?? "Not set."}`,
    `Profile scene: ${character.brollScene ?? "Not set."}`,
    "",
    "## Dramatic engine",
    `External want: ${bible.dramatic.externalWant}`,
    `Inner need: ${bible.dramatic.innerNeed}`,
    `Contradiction: ${bible.dramatic.contradiction}`,
    `Stakes: ${bible.dramatic.stakes}`,
    `Vulnerability: ${bible.dramatic.vulnerability}`,
    `Moral boundary: ${bible.dramatic.moralBoundary}`,
    "",
    "## Performance and voice behavior",
    `At rest: ${bible.performance.restingExpression}`,
    `Under pressure: ${bible.performance.underPressure}`,
    `Signature behavior: ${safeSignatureGesture(bible.performance.signatureGesture, bible.performance.underPressure || bible.performance.movementStyle)}`,
    `Movement: ${bible.performance.movementStyle}`,
    `Eyeline: ${bible.performance.eyeline}`,
    `Tempo: ${bible.performance.tempo}`,
    "",
    "## Visual identity locks",
    `Medium: ${bible.visual.medium ?? "live-action cinematic photography"}`,
    `Perceived age: ${bible.visual.perceivedAge}`,
    `Face anchors: ${bible.visual.faceAnchors.join("; ")}`,
    `Hair: ${bible.visual.hair}`,
    `Wardrobe: ${bible.visual.wardrobe}`,
    `Silhouette: ${bible.visual.silhouette}`,
    `Palette: ${bible.visual.palette.join(", ")}`,
    `Recognition locks: ${(bible.visual.recognitionLocks ?? bible.visual.continuityRules).join("; ")}`,
    `Continuity rules: ${bible.visual.continuityRules.join("; ")}`,
    "",
    "## Camera, light, and world",
    `Hero framing: ${bible.cinematography.heroFraming}`,
    `Camera height / angle: ${bible.cinematography.cameraHeight}`,
    `Lens: ${bible.cinematography.lens}`,
    `Key light: ${bible.cinematography.keyLight}`,
    `Fill light: ${bible.cinematography.fillLight}`,
    `Edge light: ${bible.cinematography.edgeLight}`,
    `World texture: ${bible.cinematography.worldTexture}`,
    "",
    "## Story grammar",
    `Hook: ${bible.story.hookPattern}`,
    `Escalation: ${bible.story.escalationPattern}`,
    `Cliffhanger: ${bible.story.cliffhangerPattern}`,
    `Payoff: ${bible.story.payoffPattern}`,
    `Recurring motifs: ${bible.story.recurringMotifs.join(", ")}`,
    `Avoid: ${bible.story.avoid.join("; ")}`,
    "",
    "## Conversation and memory runtime",
    `First-person self-concept: ${system.interaction.firstPersonSelfConcept}`,
    `Conversation goal: ${system.interaction.conversationGoal}`,
    `Response rules: ${system.interaction.responseRules.join(" | ")}`,
    `Emotional boundaries: ${system.interaction.emotionalBoundaries.join(" | ")}`,
    `Voice continuity: ${system.interaction.voiceContinuity}`,
    `Immutable canon: ${system.memory.immutableCanon.join(" | ")}`,
    `Writable memory types: ${system.memory.writableMemoryTypes.join(", ")}`,
    `Forbidden memory writes: ${system.memory.forbiddenMemoryWrites.join(" | ")}`,
    "",
    "## Derived production audio",
    "### Modern theme prompt",
    composeThemePrompt(character),
    "",
    "### Layered signature SFX plan",
    ...composeCharacterSignatureSfxEvents(character).map((event, index) =>
      `${index + 1}. ${event.label} @ ${event.start_ms}ms, ${event.gain_db}dB, ${event.duration_seconds}s — ${event.prompt}`
    ),
    "",
    "## Exact saved Magic Write production bible",
    "```json",
    JSON.stringify(character.productionBible ?? bible, null, 2),
    "```",
    ...(card
      ? [
          "",
          "## Exact saved CharacterCardV2",
          "```json",
          JSON.stringify(card, null, 2),
          "```",
        ]
      : []),
  ].join("\n");
}

export function composeSfxPrompt(character: CharacterIdentityInput, _sceneTexture?: string) {
  void _sceneTexture;
  const source = unwrapLegacyDirection(character.sfxDesc, "sfx") || "one tactile signature action";
  return composePromptSlots(
    ["identity", "event", "acoustics", "finish", "exclude"],
    {
      identity: `Premium cinematic Foley one-shot for ${character.name}.`,
      event: `One atomic physical event: ${source}.`,
      acoustics: "Precise attack, weighty material body, microscopic texture, and a short controlled natural tail.",
      finish: "Blend close and room-mic detail into one coherent, full-spectrum, polished event recognizable at low volume.",
      exclude: "No repeated variations, sequence, ambience bed, speech, melody, generic whoosh, riser, or trailer braam.",
    },
    { separator: " " },
  );
}

export function signatureSfxPromptIssues(prompt: string) {
  const issues: string[] = [];
  if (/(?:\bthen\b|\bfollowed by\b|\bafter (?:that|it)\b|\bnext\b|(?:^|\s)\d+(?:\.\d+)?s\s*[-—:])/i.test(prompt)) {
    issues.push("SFX prompt describes a sequence rather than one atomic event");
  }
  return issues;
}

export function assertSignatureSfxPrompt(prompt: string) {
  const issues = signatureSfxPromptIssues(prompt);
  if (!issues.length) return issues;
  const message = `Signature SFX prompt failure: ${issues.join("; ")}`;
  if (process.env.NODE_ENV !== "production") throw new Error(message);
  console.warn(message);
  return issues;
}

/** Builds one provider request. Timeline and other events are deliberately absent. */
export function composeSignatureSfxEventPrompt(event: SignatureSfxEvent) {
  const prompt = `${event.prompt.replace(/\s+/g, " ").trim()}. Premium cinematic Foley, single concrete physical event only. Capture a clean transient, weighty material body, microscopic texture, and short controlled natural tail as one coherent high-resolution sound. Blend close and room-mic perspective; polished, full-spectrum, clean stop. No repeated variation, sequence, ambience bed, music, speech, generic whoosh, or trailer braam.`;
  assertSignatureSfxPrompt(prompt);
  return prompt;
}

type AudioIdentityFamily =
  | "space"
  | "cyber"
  | "horror"
  | "villain"
  | "rebel"
  | "comic"
  | "romance"
  | "drama"
  | "hero"
  | "grounded";

export type ModernThemePalette = {
  family: AudioIdentityFamily;
  genres: string;
  instruments: [string, string, string, string];
  groove: string;
  production: string;
  sfxLayers: [
    { label: string; prompt: string },
    { label: string; prompt: string },
  ];
};

/*
  A music model needs affect, not biography. The theme prompt used to fall back
  to the character's dramatic contradiction, so ElevenLabs received a paragraph
  of narrative psychology - "he has never forgiven himself for the one betrayal
  he could not stop" - where a mood belongs. These are the musical reading of
  each family: short, affective, and playable.
*/
const THEME_MOODS: Record<AudioIdentityFamily, string> = {
  space: "dark orbital isolation rising into hard-won resolve",
  cyber: "cold precision with buried momentum",
  horror: "held breath and creeping dread",
  villain: "controlled menace with unhurried certainty",
  rebel: "restless defiance with a bruised edge",
  comic: "bright mischief with a wrong-footed skip",
  romance: "aching closeness with unspoken restraint",
  drama: "guarded stillness with buried warmth",
  hero: "steady resolve gathering to open air",
  grounded: "watchful calm with quiet weight",
};

/**
 * A mood must read as musical direction. Anything sentence-shaped or long is
 * narrative canon that leaked in from the production bible, and a music model
 * cannot play it - the family mood is used instead.
 */
function playableMood(candidate: string | undefined, family: AudioIdentityFamily) {
  const value = candidate?.trim() ?? "";
  const narrative = /\b(?:he|she|they|his|her|their|who|because|yet|but)\b/i.test(value);
  return value && value.length <= 80 && !narrative ? value : THEME_MOODS[family];
}

/** True when the value is already a rendered theme brief rather than a colour note. */
function alreadyComposedTheme(value: string | undefined) {
  return /Create a cinematic character theme for|Energy Arc:|Musical Characteristics:/i.test(value ?? "");
}

/**
 * Recovers the acoustic colour note from a brief this composer already wrote.
 *
 * A saved themeDesc is often a previously composed brief. Quoting one back
 * wholesale would nest a template inside the next prompt and grow it on every
 * regeneration, but discarding it silently drops the creator's colour note, so
 * the note is lifted back out and the surrounding brief thrown away.
 */
function themeColorFromComposed(value: string) {
  return value.match(/Character-specific acoustic color:\s*([^.]+)\./i)?.[1]?.trim() ?? "";
}

/**
 * The character slot is the one place the template asks for psychology, but a
 * music model still cannot use three sentences of it. Trimmed to a single
 * clause so it reads as a brief rather than a bible entry.
 */
function playableDescription(
  character: CharacterIdentityInput,
  bible: CharacterProductionBible,
) {
  const source = character.personality?.trim() || bible.dramatic.contradiction;
  const first = source?.trim().split(/(?<=[.;])\s/)[0]?.trim().replace(/[.;,]+$/, "");
  return first && first.length >= 3
    ? first.slice(0, 200)
    : `a ${character.archetype.replace(/-/g, " ")} defined by one unresolved contradiction`;
}

const MODERN_THEME_PALETTES: Record<AudioIdentityFamily, ModernThemePalette> = {
  space: {
    family: "space",
    genres: "dark space score, orbital ambient tension, and cinematic electronica",
    instruments: ["processed cello", "granular metal texture", "deep analog pulse", "restrained low brass"],
    groove: "a slow pressure pulse that gathers mass and rises once without becoming a repetitive ostinato",
    production: "vast controlled low end, tactile spacecraft resonance, cold stereo depth, evolving harmonic pressure, and one memorable motif that resolves with human warmth",
    sfxLayers: [
      { label: "Station pressure", prompt: "one spacecraft ventilation system settles into a deep mechanical hum with precise pressurized air detail" },
      { label: "Engineer contact", prompt: "one steel hand tool makes a compact controlled contact against an orbital station panel, close tactile metal detail" },
    ],
  },
  cyber: {
    family: "cyber",
    genres: "2020s future garage, cyber-industrial bass, and cinematic electronica",
    instruments: ["granular metallic percussion", "modular synth arpeggio", "reese sub-bass", "processed low brass"],
    groove: "a syncopated half-time garage pulse with detailed micro-glitches and a decisive mechanical lift",
    production: "precision-cut transients, deep controlled sub, transformer-like mechanical texture, wide granular atmosphere, and a bold three-note identity motif",
    sfxLayers: [
      { label: "Servo weight", prompt: "one heavy precision servo lock engages inside a large alloy chassis, close mechanical detail, controlled metal resonance" },
      { label: "Energy seal", prompt: "one electromagnetic power core seals with a compact sub-frequency pulse and crystalline electrical edge, dry futuristic chamber" },
    ],
  },
  horror: {
    family: "horror",
    genres: "contemporary dark ambient, post-industrial tension design, and ritual bass",
    instruments: ["bowed metal", "granular string harmonics", "distorted sub pulse", "prepared piano"],
    groove: "an unstable negative-space pulse with asymmetrical impacts and no predictable loop",
    production: "microscopic room detail, corroded texture, controlled infrasonic weight, narrow-to-wide spatial movement, and one unforgettable dissonant motif",
    sfxLayers: [
      { label: "Structural dread", prompt: "one stressed timber joint twists under hidden weight, intimate splinter detail, dark empty interior, short natural decay" },
      { label: "Cold mechanism", prompt: "one corroded concealed mechanism judders into place, close iron friction, restrained low-frequency weight, dry dead room" },
    ],
  },
  villain: {
    family: "villain",
    genres: "deconstructed club, industrial techno, and dark cinematic bass",
    instruments: ["muted modular bass", "prepared low strings", "granular metal clicks", "distorted frame drum"],
    groove: "a restrained broken-club pulse that withholds the downbeat before one controlled impact",
    production: "luxurious dark low end, surgical silence, tactile close detail, asymmetric stereo pressure, and a cold minimal motif with real development",
    sfxLayers: [
      { label: "Control mechanism", prompt: "one precision latch closes under deliberate pressure, dense machined metal body, intimate close mic, short expensive room tail" },
      { label: "Authority mark", prompt: "one weighted object contacts polished stone with a compact low resonance, controlled transient, private interior" },
    ],
  },
  rebel: {
    family: "rebel",
    genres: "electro-punk breakbeat, grime-inflected bass, and cinematic industrial electronica",
    instruments: ["distorted electric sarod", "modular bass", "broken acoustic drums", "contact-mic metal"],
    groove: "a clipped breakbeat that kicks against the grid and surges forward at the turn",
    production: "raw-edged transients, saturated midrange, tight sub pressure, live material noise, and a defiant hook that lands rather than loops",
    sfxLayers: [
      { label: "Pressure release", prompt: "one taut industrial cable snaps free from a metal catch, sharp tension release, close exterior recording, controlled decay" },
      { label: "Defiant impact", prompt: "one boot heel strikes a hollow steel platform with decisive weight, close contact detail, short open-air reflection" },
    ],
  },
  comic: {
    family: "comic",
    genres: "wonky UK garage, nu-disco percussion, and playful leftfield electronica",
    instruments: ["rubbery synth bass", "chopped hand percussion", "muted brass stab", "prepared toy piano"],
    groove: "a nimble two-step pocket with one deliberate rhythmic fake-out and a clean payoff",
    production: "punchy dry drums, elastic bass, bright transient detail, quick stereo gestures, and a witty motif that never becomes novelty music",
    sfxLayers: [
      { label: "Tactile mistake", prompt: "one small metal object skitters into an unexpectedly perfect stop, precise close Foley, lively material detail, dry room" },
      { label: "Comic lock", prompt: "one compact spring mechanism releases with a precise elastic clack, close mic, bright transient, clean stop" },
    ],
  },
  romance: {
    family: "romance",
    genres: "alternative R&B ambience, future-soul minimalism, and cinematic downtempo",
    instruments: ["felt piano", "warm analog sub-bass", "processed sarangi", "brushed electronic percussion"],
    groove: "a breathing off-grid pulse with intimate syncopation and one suspended emotional turn",
    production: "close tactile detail, warm low-mid depth, soft-edged transients, luminous stereo air, and a memorable motif that feels private rather than sentimental",
    sfxLayers: [
      { label: "Private detail", prompt: "one small personal clasp opens under a careful thumb, intimate metal and fabric detail, close mic, quiet warm room" },
      { label: "Held breath object", prompt: "one fingertip traces across textured glass and stops, delicate friction detail, intimate dry interior, controlled tail" },
    ],
  },
  drama: {
    family: "drama",
    genres: "ambient neoclassical, organic electronica, and modern cinematic minimalism",
    instruments: ["felt piano", "processed cello", "granular tape texture", "low electronic pulse"],
    groove: "a human, imperfect pulse that gathers emotional weight without becoming a repetitive ostinato",
    production: "detailed acoustic intimacy, restrained sub depth, evolving harmonic color, natural room perspective, and a clear motif with a meaningful turn",
    sfxLayers: [
      { label: "Human object", prompt: "one worn personal object settles onto a wooden surface, intimate contact texture, close mic, natural quiet room" },
      { label: "Threshold detail", prompt: "one old door latch shifts under gentle hand pressure, precise metal and wood friction, short realistic interior decay" },
    ],
  },
  hero: {
    family: "hero",
    genres: "cinematic future garage, hybrid breakbeat, and modern orchestral electronica",
    instruments: ["processed low strings", "modular arpeggio", "taiko ensemble", "synth brass"],
    groove: "a muscular syncopated pulse that builds through layered rhythm rather than a stock trailer march",
    production: "punchy transient architecture, controlled cinematic sub, detailed hybrid acoustics, wide but focused imaging, and an original ascending identity motif",
    sfxLayers: [
      { label: "Readiness", prompt: "one reinforced garment fastening pulls tight under a deliberate hand, dense fabric and metal detail, close exterior mic" },
      { label: "Resolve", prompt: "one controlled weighted impact lands on a solid composite surface, compact sub body, clean transient, short open-space reflection" },
    ],
  },
  grounded: {
    family: "grounded",
    genres: "organic electronica, contemporary cinematic folk, and broken-beat minimalism",
    instruments: ["prepared acoustic strings", "hand percussion", "warm synth bass", "granular field texture"],
    groove: "a tactile broken pulse shaped by the character's movement and one restrained rhythmic turn",
    production: "natural material detail, modern low-end control, layered acoustic depth, subtle stereo movement, and a concise identity motif with no filler",
    sfxLayers: [
      { label: "Material signature", prompt: "one practical handheld object clicks firmly into place, precise material texture, close mic, believable small room" },
      { label: "Movement signature", prompt: "one weighted fabric movement cuts through still air, detailed fibers, intimate Foley stage, short controlled tail" },
    ],
  },
};

function audioIdentityText(character: CharacterIdentityInput) {
  const bible = buildProductionBible(character);
  return [
    character.name,
    character.archetype,
    character.tagline,
    character.personality,
    character.themeDesc,
    character.sfxDesc,
    character.appearanceBrief,
    character.worldBrief,
    bible.dramatic.contradiction,
    bible.cinematography.worldTexture,
    bible.story.recurringMotifs.join(" "),
    bible.creationInputs?.characterBrief,
    bible.creationInputs?.worldBrief,
    bible.creationInputs?.themeDirection,
    bible.creationInputs?.signatureSfxDirection,
  ].filter(Boolean).join(" ").toLowerCase();
}

export function resolveModernThemePalette(character: CharacterIdentityInput): ModernThemePalette {
  const text = audioIdentityText(character);
  if (/\b(?:astronaut|cosmonaut|space station|orbital|orbit|zero gravity|spacecraft|international space station)\b/i.test(text)) {
    return MODERN_THEME_PALETTES.space;
  }
  if (/\b(?:transformer|autobot|robot|android|mech|cyber|synthetic|machine|exosuit|powered armor|powered armour|artificial intelligence|future tech|energy core)\b/i.test(text)) {
    return MODERN_THEME_PALETTES.cyber;
  }
  if (character.archetype === "horror" || /\b(?:horror|haunt|ghost|occult|dread|nightmare|possess|undead|spectral)\b/i.test(text)) {
    return MODERN_THEME_PALETTES.horror;
  }
  if (character.archetype === "villain") return MODERN_THEME_PALETTES.villain;
  if (character.archetype === "rebel") return MODERN_THEME_PALETTES.rebel;
  if (character.archetype === "comic-relief" || /\b(?:comic|comedy|funny|playful|mischief)\b/i.test(text)) return MODERN_THEME_PALETTES.comic;
  if (character.archetype === "love-interest" || /\b(?:romance|romantic|tender longing|love interest)\b/i.test(text)) return MODERN_THEME_PALETTES.romance;
  if (/\b(?:drama|dramatic|grief|family|memory|loss|regret|melancholy|domestic)\b/i.test(text)) return MODERN_THEME_PALETTES.drama;
  if (character.archetype === "hero" || character.archetype === "superhero") return MODERN_THEME_PALETTES.hero;
  return MODERN_THEME_PALETTES.grounded;
}

function atomicSfxSource(value: string | undefined) {
  const fallback = "one distinctive practical object makes a precise tactile contact";
  if (!value?.trim()) return fallback;
  const unwrapped = value
    .replace(/^.*?signature sound for [^:]+:\s*/i, "")
    .replace(/^.*?signature sfx for [^:]+:\s*/i, "")
    .replace(/^.*?one atomic physical event:\s*/i, "")
    .trim();
  const atomic = unwrapped
    .split(/\bthen\b|\bfollowed by\b|\bafter (?:that|it)\b|[.;\n]/i)[0]
    ?.replace(/\b(?:five|5|1-2)[- ]second\b/gi, "")
    .replace(/\s+/g, " ")
    .replace(/[,:;\s]+$/, "")
    .trim();
  return atomic && atomic.length >= 10 ? atomic.slice(0, 220) : fallback;
}

/**
 * All characters receive a complete layered five-second signature. Authored
 * CharacterCardV2 events remain authoritative; older characters get a
 * deterministic three-event plan derived from their full canon.
 */
export function composeCharacterSignatureSfxEvents(character: CharacterIdentityInput): SignatureSfxEvent[] {
  const authored = readCharacterCardV2(character.cardV2)?.signature_sfx_events;
  if (authored?.length) return authored;
  const palette = resolveModernThemePalette(character);
  return [
    {
      id: "canonical-material",
      label: "Canonical material",
      prompt: atomicSfxSource(character.sfxDesc),
      duration_seconds: 1.6,
      start_ms: 0,
      gain_db: 0,
    },
    {
      id: `${palette.family}-body`,
      label: palette.sfxLayers[0].label,
      prompt: palette.sfxLayers[0].prompt,
      duration_seconds: 1.5,
      start_ms: 1450,
      gain_db: -3,
    },
    {
      id: `${palette.family}-resolve`,
      label: palette.sfxLayers[1].label,
      prompt: palette.sfxLayers[1].prompt,
      duration_seconds: 1.5,
      start_ms: 3000,
      gain_db: -1,
    },
  ];
}

export const THEME_DURATION_PRESETS = [5, 8, 15] as const;
export type ThemeDurationPreset = (typeof THEME_DURATION_PRESETS)[number];

export function isThemeDurationPreset(value: unknown): value is ThemeDurationPreset {
  return typeof value === "number" && THEME_DURATION_PRESETS.some((preset) => preset === value);
}

function themeClause(value: string | undefined) {
  if (!value) return "";
  return value
    .split(/[,;\n]/)
    .map((clause) => clause.trim())
    .filter(Boolean)
    .filter((clause) => !(
      /\bBPM\b/i.test(clause)
      || /\bkey\s+of\b/i.test(clause)
      || /\b(?:[1-9]|1[0-6])\s*\/\s*(?:2|4|8|16)\b/.test(clause)
      || /^\s*[A-G](?:#|b)?\s+(?:major|minor)\s*$/i.test(clause)
      || /\bmix priority\b/i.test(clause)
      || /\b(?:5|8|12|15)\s*s\b/i.test(clause)
      || /\b(?:\d+(?:\.\d+)?|five|eight|twelve|fifteen)[- ]+sec(?:ond)?s?\b/i.test(clause)
    ))
    .join(", ")
    .replace(/\s+/g, " ")
    .replace(/[.,;:\s]+$/, "");
}

function sentenceStart(value: string) {
  return value ? `${value[0].toUpperCase()}${value.slice(1)}` : value;
}

/** Add provider timing without allowing a stale cue length in an editable prompt to win. */
export function withThemeDurationDirection(prompt: string, durationSeconds: ThemeDurationPreset) {
  const withoutPriorTiming = prompt
    .replace(/\babout\s+\d+(?:\.\d+)?\s+seconds?,\s*ends cleanly,\s*no fade-out\.?/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .replace(/\s+([.,])/g, "$1")
    .replace(/[.\s]+$/, "");
  const instrumentalMarker = /\bInstrumental only,\s*no vocals\.?/i;
  const marker = instrumentalMarker.exec(withoutPriorTiming);
  if (!marker) {
    return `${withoutPriorTiming}. About ${durationSeconds} seconds, ends cleanly, no fade-out. Instrumental only, no vocals.`;
  }
  const before = withoutPriorTiming.slice(0, marker.index).trim().replace(/[.\s]+$/, "");
  const after = withoutPriorTiming.slice(marker.index + marker[0].length).trim().replace(/[.\s]+$/, "");
  const productionDirection = [before, after].filter(Boolean).join(". ");
  return `${productionDirection}. About ${durationSeconds} seconds, ends cleanly, no fade-out. Instrumental only, no vocals.`;
}

export function assertThemePromptV2(prompt: string) {
  const forbidden = [
    { pattern: /\bBPM\b/i, label: "BPM slot" },
    { pattern: /\bkey\s+of\b/i, label: "key-of slot" },
    { pattern: /\b(?:[1-9]|1[0-6])\s*\/\s*(?:2|4|8|16)\b/, label: "time-signature token" },
  ];
  const violation = forbidden.find(({ pattern }) => pattern.test(prompt));
  if (violation) throw new Error(`Theme v2 prompt contains a forbidden ${violation.label}.`);
}

export function composeThemePrompt(
  character: CharacterIdentityInput,
  dramaticBeat?: string,
  durationSeconds: ThemeDurationPreset = 8,
) {
  if (!isThemeDurationPreset(durationSeconds)) {
    throw new Error(`Theme duration must be one of ${THEME_DURATION_PRESETS.join(", ")} seconds.`);
  }
  const card = readCharacterCardV2(character.cardV2);
  const bible = buildProductionBible(character);
  const profile = card?.theme_profile;
  const modern = resolveModernThemePalette(character);
  const turn = profile?.emotional_turn || themeClause(dramaticBeat);
  /*
    A saved themeDesc is often a previously composed brief. Embedding one as
    acoustic colour would nest a whole template inside the next prompt and grow
    it on every regeneration, so an already-composed brief is ignored rather
    than quoted back at the model.
  */
  const legacyColor = themeClause(profile?.style_anchor)
    || themeClause(alreadyComposedTheme(character.themeDesc)
      ? themeColorFromComposed(character.themeDesc ?? "")
      : unwrapLegacyDirection(character.themeDesc, "theme"));
  const profileInstruments = profile?.instruments
    .map((instrument) => themeClause(instrument))
    .filter(Boolean) ?? [];
  const instruments = profileInstruments.length
    ? [...new Set(profileInstruments)].slice(0, 4)
    : [...modern.instruments];
  const opening = themeClause(profile?.opening)
    || `the ${instruments[0]} states a concise, recognizable motif immediately`;
  const build = themeClause(profile?.build)
    || `${modern.groove} arrives underneath while ${instruments[1]} answers the motif`;
  const emotionalTurn = themeClause(turn)
    || `the harmony and sound design tighten into one emotionally legible turn`;
  const ending = themeClause(profile?.ending)
    || `the full arrangement resolves on one edit-ready final identity hit`;
  const mood = playableMood(themeClause(profile?.mood), modern.family);
  const { primary, secondary } = splitThemeGenres(modern.genres);
  /*
    The brief is now rendered through the one global template. Authored card
    values still win every slot they speak to - the template decides the shape
    of the brief, not its content.
  */
  const prompt = withThemeDurationDirection(
    fillThemeDirectionTemplate(THEME_DIRECTION_TEMPLATE, {
      CHARACTER_NAME: character.name,
      PRIMARY_GENRE: primary,
      SECONDARY_GENRE: secondary,
      MOOD: mood,
      // The character reading belongs here and only here. Splicing it into the
      // musical slots is what sent narrative psychology to the music model.
      CHARACTER_DESCRIPTION: playableDescription(character, bible),
      OPENING_FEEL: sentenceStart(opening),
      BUILD_FEEL: sentenceStart(build),
      CLIMAX_FEEL: sentenceStart(emotionalTurn),
      ENDING_FEEL: sentenceStart(ending),
      MUSICAL_CHARACTERISTICS: composePromptSlots(
        ["palette", "color", "production", "constraints"],
        {
          palette: `Core palette: ${joinPromptList(instruments)}.`,
          color: legacyColor ? `Character-specific acoustic color: ${legacyColor}.` : "",
          production: `${modern.production}. Fully arranged and mastered with foreground motif, supporting rhythm, bass movement, harmonic development, layered depth, polished transients, and a complete beginning-middle-end arc.`,
          // These density negatives predate the template and are kept: they are
          // what stops the model returning a sparse demo take with an empty
          // intro, which the template's own Avoid block does not cover.
          constraints: "Avoid sparse single-chord noodling, isolated solo demo playing, a stock orchestral trailer bed, thin percussion, or an empty intro. Instrumental only, no vocals. No imitation of an existing composition.",
        },
        { separator: " " },
      ),
    }),
    durationSeconds,
  );
  if (process.env.NODE_ENV !== "production") assertThemePromptV2(prompt);
  return prompt;
}

export function composeImagePrompt(character: CharacterIdentityInput, shot: ShotBlueprint) {
  const card = readCharacterCardV2(character.cardV2);
  if (card) {
    const wardrobeState = /kitchen|home|house|laundry|domestic/i.test(shot.setting)
      ? "domestic"
      : "operational";
    return buildCardImagePrompt(card, {
      wardrobe_state: selectedWardrobeState(card, wardrobeState).name,
      scene_beat: `${shot.dramaticBeat}. ${shot.subjectStart}. ${shot.facialBeat}`,
      setting: shot.setting,
      camera: `${shot.framing}; ${shot.cameraAngle}; ${shot.lens}`,
      light: `${shot.keyLight}; ${shot.fillAndEdge}`,
    });
  }
  const bible = buildProductionBible(character);
  const medium = bible.visual.medium || visualMedium(character.appearanceBrief, bible.visual.faceAnchors.join(" "), bible.cinematography.worldTexture);
  const locks = visibleRecognitionLocks(
    recognitionLocks(bible, character.appearanceBrief),
    shot.framing,
    shot.facialBeat,
  );
  return [
    `${medium}. 16:9. ${shot.framing} of ${character.name}. ${visibleIdentity(character, bible)}.`,
    `Scene: ${concise(shot.dramaticBeat, 120)}. ${concise(shot.subjectStart, 100)}. ${concise(shot.facialBeat, 80)}. ${concise(shot.setting, 110)}.`,
    `Camera: ${concise(shot.cameraAngle, 70)}, ${concise(shot.lens, 60)}. Light: ${concise(shot.keyLight, 85)}. ${concise(shot.fillAndEdge, 70)}. Palette: ${bible.visual.palette.slice(0, 4).join(", ")}.`,

    `NEGATIVE: ${identityNegative(medium)}, generic pose, floating object, distorted hands, extra fingers.`,
    `RECOGNITION LOCKS: ${locks.join("; ")}. These four carry recognition; everything else may adapt to this scene.`,
  ].join("\n");
}

export function composeLegacyImagePrompt(character: CharacterIdentityInput, shot: ShotBlueprint) {
  const bible = buildProductionBible(character);
  return [
    "CINEMATIC PRODUCTION STILL — 16:9.",
    `SUBJECT AND IDENTITY: ${character.name}, one original fictional actor. ${bible.visual.perceivedAge}. Preserve these recognition anchors exactly: ${bible.visual.faceAnchors.join("; ")}. Hair: ${bible.visual.hair}. Wardrobe: ${bible.visual.wardrobe}. Silhouette: ${bible.visual.silhouette}.`,
    `PERFORMANCE LOGIC: Their personality is ${compact(character.personality)} The visible contradiction is ${bible.dramatic.contradiction}. At rest: ${bible.performance.restingExpression}. Under pressure: ${bible.performance.underPressure}. Use the safe signature behavior—${safeSignatureGesture(bible.performance.signatureGesture, bible.performance.underPressure || bible.performance.movementStyle)}—instead of a generic pose.`,
    `DRAMATIC MOMENT: ${shot.dramaticBeat}. Start pose: ${shot.subjectStart}. Facial beat: ${shot.facialBeat}. The decision must be readable through the eyes, mouth tension, hands, weight distribution, and eyeline in this single frozen frame.`,
    `SET: ${shot.setting}. World texture: ${bible.cinematography.worldTexture}. Palette: ${bible.visual.palette.join(", ")}.`,
    `CAMERA: ${shot.framing}; ${shot.cameraAngle}; ${shot.lens}. Composition preserves a clean direction of movement and useful negative space.`,
    `LIGHTING: key ${shot.keyLight}; fill/edge ${shot.fillAndEdge}. Keep light direction physically motivated and readable on the face.`,
    `CONTINUITY: ${bible.visual.continuityRules.join("; ")}. Photoreal skin and fabric, correct hands, grounded feet, restrained film grain. No typography, captions, logo, UI, poster layout, watermark, duplicate person, beauty-filter skin, or costume redesign.`
  ].join("\n");
}

/** The definitive casting image: personality first, before any plot-specific scene. */
/** Definitive casting reference: concise visual evidence, not biography. */
export function composeIdentityImagePrompt(character: CharacterIdentityInput) {
  const card = readCharacterCardV2(character.cardV2);
  if (card) return buildCardIdentitySeedPrompt(card);
  const bible = buildProductionBible(character);
  const medium = bible.visual.medium || visualMedium(character.appearanceBrief, bible.visual.faceAnchors.join(" "), bible.cinematography.worldTexture);
  const locks = visibleRecognitionLocks(
    recognitionLocks(bible, character.appearanceBrief),
    "chest-to-knee casting portrait",
    "neutral expression",
  );
  return [
    `IDENTITY FEED SEED. ${medium}. One original fictional actor only: ${character.name}. ${visibleIdentity(character, bible)}.`,
    "CASTING COMPOSITION: calm chest-to-knee editorial casting portrait with face, hairline, shoulders, hands, and silhouette clearly readable. Direct but relaxed eyeline; neutral expression; no performance beat.",
    `BACKGROUND AND LIGHT: clean neutral seamless backdrop, soft even daylight, natural skin texture and fabric response. Palette: ${bible.visual.palette.slice(0, 4).join(", ")}. No location, room, street, set dressing, props, or narrative action.`,
    `NEGATIVE: ${identityNegative(medium)}, generic hero pose, glamour pose, distorted hands, extra fingers, poster layout, scene location, environmental story clues, crowd.`,
    `RECOGNITION LOCKS: ${locks.join("; ")}. These four carry recognition; everything else may move.`,
  ].join("\n");
}

export function composeLegacyIdentityImagePrompt(character: CharacterIdentityInput) {
  const bible = buildProductionBible(character);
  const motif = bible.story.recurringMotifs[0] ?? "one tactile object tied to the actor's world";
  const identityWorld = character.brollScene?.trim() || bible.cinematography.worldTexture;
  return [
    "IDENTITY HERO IMAGE — visually striking live-action cinematic photograph, 16:9, one real human only. Preserve natural facial asymmetry, pores, fine hair, believable hands, tactile fabric, grounded body weight, optical depth, physically plausible light, and restrained film grain. Never use cartoon, anime, illustration, digital painting, 3D render, CGI, doll, or wax-figure aesthetics unless the user explicitly requests that medium. This is the definitive visual identity used to recognize and cast the actor, not a poster and not a plot summary.",
    `ACTOR: ${character.name}, an original fictional ${character.archetype.replace("-", " ")}. ${bible.visual.perceivedAge}. The face must feel singular, lived-in, and repeatable rather than generically attractive. Lock these recognition anchors: ${bible.visual.faceAnchors.join("; ")}. Hair: ${bible.visual.hair}. Natural skin texture, facial asymmetry, believable hands and body proportions.`,
    `VISIBLE PERSONALITY: Translate this personality into behavior, not symbols or text: ${compact(character.personality)} The central contradiction is ${bible.dramatic.contradiction}. Show ${bible.performance.restingExpression}; let a trace of ${bible.dramatic.vulnerability} remain visible beneath it. The actor performs ${safeSignatureGesture(bible.performance.signatureGesture, bible.performance.underPressure || bible.performance.movementStyle)} with grounded ${bible.performance.movementStyle}. No smile or heroic pose unless those behaviors specifically require it.`,
    `SIGNATURE LOOK: ${bible.visual.wardrobe}. Build the silhouette around ${bible.visual.silhouette}. Materials must show weight, stitching, wear, and practical function. Palette: ${bible.visual.palette.join(", ")}. Include only one restrained story-world detail—${motif}—as evidence of a life, never as costume decoration.`,
    `WORLD: Place the actor in ${identityWorld}. Choose one uncluttered, believable area of that world that tells us what pressure they live under while keeping the face dominant. Separate foreground, actor, and background into readable depth; no crowd and no unrelated spectacle.`,
    `CAMERA AND COMPOSITION: ${bible.cinematography.heroFraming}; ${bible.cinematography.cameraHeight}; ${bible.cinematography.lens}. Eyes remain the visual priority. Keep enough environmental context to cast the actor, with intentional negative space on the side implied by the eyeline. The image should feel like the first frame before a consequential choice, not a fashion shoot.`,
    `LIGHTING: Motivated key—${bible.cinematography.keyLight}. Fill—${bible.cinematography.fillLight}. Edge—${bible.cinematography.edgeLight}. Preserve readable eye detail and natural skin tone; practical sources in the set must explain every highlight and shadow. Cinematic contrast, restrained grain, no artificial full-body glow.`,
    `LOCKS AND EXCLUSIONS: ${bible.visual.continuityRules.join("; ")}. No second person, duplicate face, celebrity likeness, generic superhero stance, glamour pose, beauty-filter skin, airbrushed or synthetic skin, excessive VFX, cartoon, anime, illustration, digital painting, concept art, 3D render, CGI character, game art, doll-like face, wax figure, floating objects, distorted hands, extra fingers, costume redesign, text, title, caption, logo, UI, border, poster layout, or watermark.`
  ].join("\n");
}

function simpleCameraMove(value: string) {
  if (/locked|static|still/i.test(value)) return "Locked camera";
  if (/pull|dolly[- ]?out|zoom[- ]?out/i.test(value)) return "Slow pull back";
  if (/circle|orbit|arc/i.test(value)) return "Slow circular orbit";
  if (/rise|crane|pedestal/i.test(value)) return "Slow rise";
  if (/lateral|slider|truck|track/i.test(value)) return "Slow lateral track";
  if (/handheld/i.test(value)) return "Gentle handheld drift";
  if (/pan/i.test(value)) return "Slow pan";
  return "Slow push in";
}

export function composeVideoPrompt(
  _character: CharacterIdentityInput,
  shot: ShotBlueprint,
  audio?: { plan: AudioPlan; durationMs: number; deliveryRegister?: "at_rest" | "under_pressure" },
) {
  const card = readCharacterCardV2(_character.cardV2);
  const cardVoice = card ? (card.voice_slots.primary ?? Object.values(card.voice_slots)[0]) : undefined;
  const withAudio = (prompt: string) => audio
    ? `${prompt}\n${buildAudioSceneBlock({
        plan: audio.plan,
        durationMs: audio.durationMs,
        delivery: audio.deliveryRegister === "under_pressure"
          ? cardVoice?.pressure_delivery
          : cardVoice?.pacing,
      })}`
    : prompt;
  if (card) {
    return finalizeVideoPrompt(withAudio(buildCardVideoPrompt(card, {
      scene_beat: shot.dramaticBeat,
      motion: `${shot.actionTimeline[0]}; ${shot.actionTimeline[1]}; ${shot.actionTimeline[2]}; ${shot.environmentalMotion}`,
      camera: simpleCameraMove(shot.cameraMovement),
      timing: `Five seconds. End on: ${shot.finalFrame}`,
    })), true);
  }
  const closeFrame = /extreme close|close[- ]?up|headshot|tight portrait/i.test(shot.framing);
  const camera = simpleCameraMove(shot.cameraMovement);
  const subjectMotion = closeFrame
    ? "Hold for a beat. The eyes shift first, then the head follows a few degrees late. One natural blink and a faint breath"
    : concise(shot.actionTimeline[1], 170);
  const secondaryMotion = concise(shot.environmentalMotion, 90);
  const ending = closeFrame
    ? "Ends on stillness, gaze fixed, camera fully stopped"
    : `Ends on ${concise(shot.finalFrame, 120)}`;
  const prompt = [
    `${camera}. ${subjectMotion}. ${secondaryMotion}. ${ending}.`,
    "Negative: warped face, lip movement, camera cut, invented objects.",
    "--duration 5",
  ].join("\n");
  const wardrobe = buildProductionBible(_character).visual.wardrobe;
  return finalizeVideoPrompt(
    withAudio(/\bcoat\b/i.test(wardrobe) ? prompt : prompt.replace(/\bcoat hem\b/gi, "garment edge")),
    true,
  );
}
export function composeLegacyVideoPrompt(_character: CharacterIdentityInput, shot: ShotBlueprint) {
  return finalizeVideoPrompt([
    "IMAGE-TO-VIDEO — 5 SECONDS. The supplied image is the exact first frame and the only source of truth for face, body, wardrobe, set, composition, color, and lighting. Do not redescribe or redesign them.",
    `INTENT: ${shot.dramaticBeat}.`,
    `0.0-1.2s — ${shot.actionTimeline[0]}`,
    `1.2-3.5s — ${shot.actionTimeline[1]} Facial beat: ${shot.facialBeat}.`,
    `3.5-5.0s — ${shot.actionTimeline[2]} End on ${shot.finalFrame}.`,
    `CAMERA PATH: ${shot.cameraMovement}; preserve the source-image axis, camera height, lens character, and horizon. No cut, no angle jump, no orbit unless stated.`,
    `LIGHT CONTINUITY: keep the source key direction and shadow pattern fixed; only animate motivated practical flicker or environmental changes.`,
    `SECONDARY MOTION: ${shot.environmentalMotion}. Natural blink, breath, cloth inertia, hair response, and grounded body weight; subtle motion beats over constant movement.`,
    "LOCKS: exact identity and facial geometry; stable hands, limbs, wardrobe, background architecture, and object count. No morphing, new props, new people, camera teleport, lip-sync, speech, subtitles, text, logo, or watermark. Silent visual plate; audio is produced separately. --duration 5 --camerafixed false"
  ].join("\n"), true);
}

export type ProductShotPromptInput = {
  videoType: VideoType;
  product: ProductCard;
  shot: Pick<ShotBlueprint, "dramaticBeat" | "subjectStart" | "framing" | "cameraAngle" | "lens" | "cameraMovement" | "keyLight" | "fillAndEdge" | "actionTimeline" | "environmentalMotion" | "finalFrame" | "negative">;
  actor?: CharacterIdentityInput;
  hookText?: string;
  ctaText?: string;
  personaStyle?: "casual" | "expert" | "excited";
  narrativeBeat?: "problem" | "ritual" | "reveal";
};

function assertProductPromptInput(input: ProductShotPromptInput) {
  if (!isProductVideoType(input.videoType)) throw new Error("Product prompt grammar requires a product video type.");
  if (!Array.isArray(input.product.reference_images) || input.product.reference_images.length === 0) {
    throw new Error("Product video prompts require at least one product reference image.");
  }
  if (input.videoType === VideoType.ProductHero && input.actor) {
    throw new Error("Product Hero prompts must never receive actor identity or biography.");
  }
  if (input.videoType !== VideoType.ProductHero && !input.actor) throw new Error("Actor-and-product prompt grammar requires an actor.");
}

function mergedProductNegative(input: ProductShotPromptInput) {
  const shotNegative = input.shot.negative?.trim();
  const productNegative = input.product.negative_prompt.trim();
  return [productNegative, shotNegative, "no warped text, invented labels, extra variants, changed proportions, mirrored logo, or product substitution"]
    .filter(Boolean)
    .join(", ");
}

function actorReferenceLock(actor: CharacterIdentityInput | undefined) {
  if (!actor) return "NO ACTOR: product-only film. No people, faces, hands, or human silhouettes.";
  const card = readCharacterCardV2(actor.cardV2);
  return card
    ? "ACTOR CANONICAL REFERENCE: use the approved canonical actor identity seed. Preserve the card's face, age, geometry, and wardrobe locks; do not rewrite the actor biography."
    : `ACTOR CANONICAL REFERENCE: use the approved canonical reference for ${actor.name}. Preserve the supplied face, silhouette, and wardrobe; do not redesign the actor.`;
}

/** Product grammar is deliberately separate from character-only prompt builders. */
export function composeProductImagePrompt(input: ProductShotPromptInput) {
  assertProductPromptInput(input);
  const base = [
    `VIDEO TYPE: ${input.videoType}.`,
    productIdentityLock(input.product),
    actorReferenceLock(input.actor),
    `SHOT: ${input.shot.dramaticBeat}. ${input.shot.subjectStart}.`,
    `CAMERA: ${input.shot.framing}; ${input.shot.cameraAngle}; ${input.shot.lens}.`,
    `LIGHT: ${input.shot.keyLight}; ${input.shot.fillAndEdge}.`,
  ];
  if (input.videoType === VideoType.UgcAd) {
    base.push(`UGC GRAMMAR: ${input.personaStyle ?? "casual"} persona; handheld feel, eye-level, natural light, imperfect framing. Product must be visible in the first second and handled only as instructed. Hook: ${input.hookText ?? ""}. CTA: ${input.ctaText ?? ""}. APPROVED CLAIMS ONLY: ${input.product.claims_allowed.join(" | ") || "none supplied; do not make a product claim"}.`);
  } else if (input.videoType === VideoType.ProductHero) {
    base.push("PRODUCT HERO GRAMMAR: no humans. Macro material detail, slow push/circle/rise only, readable label and a final pack shot with logo lockup frame.");
  } else {
    base.push(`BRAND SPOT GRAMMAR: cinematic narrative around ${input.narrativeBeat ?? "ritual"}; the product appears only at the slot-four pivot and slot-eight close unless an operator records an override reason; the final shot is a pack shot with actor.`);
  }
  base.push(`NEGATIVE: ${mergedProductNegative(input)}.`);
  return withStandingInjections(base.join("\n"), Boolean(input.actor));
}

export function composeProductVideoPrompt(input: ProductShotPromptInput) {
  assertProductPromptInput(input);
  const base = [
    `IMAGE-TO-VIDEO PRODUCT GRAMMAR — ${input.videoType}. The supplied product reference assets are binding.`,
    productIdentityLock(input.product),
    actorReferenceLock(input.actor),
    `0.0-1.5s: ${input.shot.actionTimeline[0]}. 1.5-3.8s: ${input.shot.actionTimeline[1]}. 3.8-5.0s: ${input.shot.actionTimeline[2]}. End on ${input.shot.finalFrame}.`,
    `CAMERA: preserve the source frame; ${simpleCameraMove(input.shot.cameraMovement)}. SECONDARY MOTION: ${input.shot.environmentalMotion}.`,
  ];
  if (input.videoType === VideoType.UgcAd) base.push(`UGC: eye-level handheld and natural light; direct-to-camera speech may not exceed two seconds. Dialogue/VO may use only these approved product claims plus the provided hook and CTA: ${input.product.claims_allowed.join(" | ") || "none supplied; do not make a product claim"}.`);
  if (input.videoType === VideoType.ProductHero) base.push("PRODUCT HERO: no humans, no hands, no actor audio. Slow macro push, circle, or rise only; finish on a readable pack shot and logo lockup.");
  if (input.videoType === VideoType.BrandSpot) base.push("BRAND SPOT: product appears only at slot four and slot eight unless an operator records an override reason; final shot is product pack shot with actor. Do not invent claims.");
  base.push(`NEGATIVE: ${mergedProductNegative(input)}, no morphing, relabeling. --duration 5`);
  return finalizeVideoPrompt(base.join("\n"), Boolean(input.actor));
}

export function productDialogueAllowlist(product: ProductCard, hookText?: string, ctaText?: string) {
  return [...product.claims_allowed, hookText, ctaText].filter((line): line is string => Boolean(line?.trim())).map((line) => line.trim());
}

const SCENE_BLUEPRINTS: Array<Omit<ShotBlueprint, "dialogue"> & { dialogue: (name: string) => string }> = [
  {
    sceneName: "The Interrupted Exit",
    dramaticBeat: "the actor discovers that the safe exit is also the trap and chooses to move toward it anyway",
    hook: "Open on a door unlocking by itself while the actor is still several steps away.",
    setting: "an old projection corridor at night, a metal exit door at frame right, projector spill cutting through suspended dust",
    subjectStart: "three-quarter profile at frame left, weight held on the back foot, one hand near but not touching the latch",
    actionTimeline: [
      "Hold the opening composition; the latch rotates by itself and the actor's eyes move to it before the head follows",
      "the actor transfers weight forward, turns the head toward the doorway, and lets concern resolve into a small deliberate half-smile",
      "one controlled step toward frame right; the hand stops two centimeters from the latch",
    ],
    facialBeat: "recognition, one breath of fear, then chosen resolve without smiling broadly",
    framing: "chest-up three-quarter composition with the door and hand both visible",
    cameraAngle: "eye-level camera just behind the actor's shoulder line",
    lens: "50mm natural perspective",
    cameraMovement: "a single eight-percent dolly-in beginning after the latch moves and easing to a complete stop by 4.6 seconds",
    keyLight: "warm projector spill from rear frame left crossing the cheek",
    fillAndEdge: "cool corridor bounce from frame right, thin warm edge on the far shoulder",
    environmentalMotion: "dust drifts through the projector beam; coat hem responds once to air from the opening door",
    soundTexture: "a close metal mechanism response settles over low projector vibration and short corridor decay",
    musicalArc: "tighten the pulse, interrupt it with one harmonic doubt, then stop on unresolved resolve",
    finalFrame: "the fingertips suspended before the latch and the eyes fixed into the dark gap",
    dialogue: (name) => `${name}: "If that door wanted me gone, it should not have opened."`,
  },
  {
    sceneName: "The False Reflection",
    dramaticBeat: "the actor notices the reflection moving first and decides not to reveal that they saw it",
    hook: "The background reflection completes a turn one beat before the actor.",
    setting: "a rain-dark railway waiting room with a long mirror, wet glass, and one tungsten station lamp",
    subjectStart: "seated in profile in the near foreground, shoulders relaxed, reflection visible over the far shoulder",
    actionTimeline: [
      "The actor remains still while the eyes register a tiny movement in the mirror",
      "the chin lowers by a few degrees and one hand slowly closes around the ticket; the reflection settles back into sync",
      "the actor looks away from the mirror toward the arriving light without exposing the discovery",
    ],
    facialBeat: "private alarm compressed into deliberate calm",
    framing: "medium profile with actor and reflection held in separate thirds",
    cameraAngle: "seated eye level, perfectly level horizon",
    lens: "65mm with compressed layers",
    cameraMovement: "locked frame with only a two-percent optical-feeling creep after 3.5 seconds",
    keyLight: "soft amber station practical from upper frame right",
    fillAndEdge: "cool rain bounce through glass from frame left, no artificial rim",
    environmentalMotion: "rain trails move down the window; distant train light travels across the back wall",
    soundTexture: "rain-muted room tone and a distant rail vibration bloom briefly, then narrow back to the foreground detail",
    musicalArc: "begin intimate, introduce one detuned answer to the motif, and leave the final note suspended",
    finalFrame: "the actor looking toward the train while the reflection appears to look toward camera",
    dialogue: (name) => `${name}: "The last train is never empty. It only looks that way."`,
  },
  {
    sceneName: "Proof in the Hand",
    dramaticBeat: "the actor reveals a tiny piece of evidence that reverses who holds power in the scene",
    hook: "Begin with the apparently empty hand already centered in frame.",
    setting: "a closed museum study under a green-shaded desk lamp, evidence envelopes and dark shelving held in soft depth",
    subjectStart: "standing square to the table, closed hand resting palm-up in the pool of light",
    actionTimeline: [
      "Hold on the closed hand; the thumb shifts and the actor watches the unseen opponent rather than the object",
      "the fingers open once to reveal a small key; the actor raises only the eyes and allows one restrained breath",
      "the hand closes again and exits the pool of light as the actor turns a shoulder toward the door",
    ],
    facialBeat: "quiet confirmation followed by controlled withdrawal",
    framing: "medium close-up including face, hand, and lit tabletop",
    cameraAngle: "slightly above hand level but below the actor's eyes",
    lens: "58mm portrait perspective",
    cameraMovement: "slow lateral slider move of ten centimeters from right to left, stopping when the key is revealed",
    keyLight: "hard-edged warm desk-lamp pool from lower frame left",
    fillAndEdge: "very low cool ambient fill, narrow shelf practical on the hairline",
    environmentalMotion: "one evidence tag shifts in the lamp heat; background remains otherwise still",
    soundTexture: "dry paper movement and close wooden-room reflections reveal one tiny metallic overtone",
    musicalArc: "hold a restrained pulse, reverse the harmony at the reveal, and cut before full resolution",
    finalFrame: "the actor's shoulder crossing the key light, leaving the table empty again",
    dialogue: (name) => `${name}: "You searched the room. You forgot to search the story."`,
  },
  {
    sceneName: "The Cost of the Signal",
    dramaticBeat: "the actor sends a signal that saves someone elsewhere while exposing their own position",
    hook: "A dark rooftop is broken by one deliberate pulse of light.",
    setting: "a monsoon rooftop above the old city, wet parapet, distant windows, a compact signal lamp held below chest level",
    subjectStart: "crouched behind the parapet in three-quarter view, eyes tracking a distant rooftop",
    actionTimeline: [
      "The actor watches the distant roof and takes one controlled breath; rain beads on the lamp glass",
      "the thumb activates one short light pulse and the face catches the reflected glow; the actor immediately reads the consequence off-screen",
      "the lamp is lowered while the actor rises into a ready stance and turns toward the newly revealed threat",
    ],
    facialBeat: "relief at the answering signal interrupted by the recognition of danger",
    framing: "medium-wide silhouette with readable face and city depth",
    cameraAngle: "low parapet height looking slightly upward without heroic exaggeration",
    lens: "40mm environmental perspective",
    cameraMovement: "subtle handheld breathing, then a short controlled push toward the face during the signal pulse",
    keyLight: "cool monsoon sky from frame left with the lamp briefly becoming a warm under-key",
    fillAndEdge: "soft city bounce, wet-surface edge from distant practicals",
    environmentalMotion: "rain moves diagonally left to right; fabric and loose cable respond to one gust after the pulse",
    soundTexture: "wind and rain against concrete widen around a short electrical pulse, then collapse to a dry stop",
    musicalArc: "rise toward a brief luminous motif, expose a darker counter-note, and end on alert tension",
    finalFrame: "the actor upright against the skyline, lamp dark, gaze locked on an off-screen approach",
    dialogue: (name) => `${name}: "They saw the signal. So did everyone else."`,
  },
];

/**
 * Which blueprint a character starts from. Callers ask for take 0, 1, 2… and
 * every character used to land on blueprint 0 — the projection-corridor door —
 * so its setting and its "If that door wanted me gone" line bled into every
 * actor's dialogue, SFX, theme, and scene-still card. Offsetting the take by a
 * stable hash of the actor's identity spreads characters across all 18
 * blueprints while keeping each actor's own takes deterministic and repeatable.
 */
export function characterSceneOffset(character: CharacterIdentityInput) {
  const seed = `${character.name ?? ""}|${character.archetype ?? ""}|${character.tagline ?? ""}`;
  let hash = 0;
  for (let position = 0; position < seed.length; position += 1) {
    hash = (Math.imul(hash, 31) + seed.charCodeAt(position)) | 0;
  }
  return Math.abs(hash);
}

/**
 * A profile Spark is an actor's introduction, not a random scene-template
 * audition. When the creator supplied a canonical world, make the first five
 * seconds prove who the actor is inside that world before cycling into the
 * broader scene library for later takes.
 */
function characterIntroBlueprint(character: CharacterIdentityInput): ShotBlueprint | null {
  const bible = buildProductionBible(character);
  const creator = bible.creationInputs;
  const explicitWorld = character.brollScene?.trim()
    || creator?.worldBrief?.trim()
    || character.worldBrief?.trim();
  const archetypeTexture = (DIRECTIONS[character.archetype] ?? DIRECTIONS.hero).texture;
  const derivedWorld = bible.cinematography.worldTexture?.trim();
  // Magic Write may derive a precise world from the creator's character brief
  // even when the separate world box was left blank. Keep that authored world,
  // but do not pretend the generic archetype texture is specific canon.
  const world = explicitWorld
    || (derivedWorld && derivedWorld !== archetypeTexture ? derivedWorld : "");
  if (!world) return null;

  const identityBrief = concise(
    creator?.characterBrief || character.personality || character.tagline,
    220,
  );
  const isOrbital = /\b(?:astronaut|cosmonaut|space station|international space station|orbital|orbit|spacecraft|zero gravity)\b/i
    .test(`${identityBrief} ${world}`);
  const motif = bible.story.recurringMotifs[0] ?? "one practical object from the actor's work";

  if (isOrbital) {
    return {
      sceneName: `${character.name}: Orbit Under Pressure`,
      dramaticBeat: `${character.name} is introduced through competence under pressure, not a pose: ${identityBrief}`,
      hook: "Open in unmistakable zero gravity with a small station failure already in progress.",
      setting: world,
      subjectStart: "braced inside a cramped International Space Station service module beside an open systems panel, one tethered wrench and a drifting checklist clearly visible",
      actionTimeline: [
        "A loose checklist drifts toward the open panel while the actor catches it against one forearm without looking away from the warning readout",
        "one hand turns the tethered wrench through a precise quarter-turn; the amber warning changes to green and the ventilation vibration steadies",
        "the actor releases the handhold into a controlled float, catches the wrench by its tether, and looks through the cupola toward Earth with private relief",
      ],
      facialBeat: "methodical concentration gives way to one restrained flash of wonder without becoming a smile-for-camera",
      framing: "environmental medium-wide showing the actor, open service panel, floating objects, and unmistakable ISS structure",
      cameraAngle: "eye level within the module, horizonless zero-gravity composition",
      lens: "32mm environmental perspective with readable face and working hands",
      cameraMovement: "slow controlled lateral float that reveals Earth through the cupola after the repair lands",
      keyLight: "cold motivated station practical across the working side of the face",
      fillAndEdge: "soft blue Earth bounce with a restrained amber panel edge",
      environmentalMotion: "checklist, tether, and one loose fabric edge drift continuously in zero gravity; the warning indicator changes once",
      soundTexture: "ISS ventilation hum, restrained warning pulse, tactile wrench contact, and pressurized cabin detail",
      musicalArc: "dark orbital tension rises through the repair, then opens into a brief human warmth at Earth reveal",
      finalFrame: "the actor floating in the working module with the panel stable, wrench secured, and Earth newly visible beyond",
      dialogue: character.brollLine?.trim() || character.tagline,
    };
  }

  return {
    sceneName: `${character.name}: First Proof`,
    dramaticBeat: `${character.name} is introduced by making one consequential choice inside the canonical world: ${identityBrief}`,
    hook: bible.story.hookPattern,
    setting: world,
    subjectStart: `already at work in the environment, physically engaged with ${motif}; never seated for a neutral portrait and never posing for camera`,
    actionTimeline: [
      `The actor performs one precise task tied to ${motif} while tracking a change elsewhere in the space`,
      `${bible.performance.underPressure}; the safe signature behavior becomes visible: ${safeSignatureGesture(bible.performance.signatureGesture, bible.performance.underPressure || bible.performance.movementStyle)}`,
      `The task changes the state of the environment and the actor commits to ${bible.dramatic.externalWant}`,
    ],
    facialBeat: `${bible.performance.restingExpression}, interrupted by ${bible.dramatic.vulnerability}`,
    framing: bible.cinematography.heroFraming,
    cameraAngle: bible.cinematography.cameraHeight,
    lens: bible.cinematography.lens,
    cameraMovement: "one controlled reveal from the practical task to the actor's decision",
    keyLight: bible.cinematography.keyLight,
    fillAndEdge: `${bible.cinematography.fillLight}; ${bible.cinematography.edgeLight}`,
    environmentalMotion: "one motivated environmental response confirms that the actor's action changed the situation",
    soundTexture: character.sfxDesc || `close tactile detail from ${motif} over the canonical room tone`,
    musicalArc: character.themeDesc || "build from character tension to one decisive identity motif and stop cleanly",
    finalFrame: "the practical task visibly resolved or transformed, with the actor already facing its consequence",
    dialogue: character.brollLine?.trim() || character.tagline,
  };
}

export function buildScenePackage(character: CharacterIdentityInput, index = 0): ScenePackage {
  const slot = characterSceneOffset(character) + index;
  const shotTemplate = index === 0
    ? characterIntroBlueprint(character)
      ?? SCENE_BLUEPRINTS[((slot % SCENE_BLUEPRINTS.length) + SCENE_BLUEPRINTS.length) % SCENE_BLUEPRINTS.length]
    : SCENE_BLUEPRINTS[((slot % SCENE_BLUEPRINTS.length) + SCENE_BLUEPRINTS.length) % SCENE_BLUEPRINTS.length];
  const authoredDialogue = typeof shotTemplate.dialogue === "function"
    ? shotTemplate.dialogue(character.name)
    : shotTemplate.dialogue;
  const shot: ShotBlueprint = {
    ...shotTemplate,
    setting: character.brollScene?.trim() || shotTemplate.setting,
    dialogue: index === 0 && character.brollLine?.trim()
      ? character.brollLine.trim()
      : authoredDialogue,
  };
  const dialoguePrefix = `${character.name}: `;
  const dialogue = shot.dialogue.startsWith(dialoguePrefix)
    ? shot.dialogue.slice(dialoguePrefix.length)
    : shot.dialogue;
  return {
    sceneName: shot.sceneName,
    hook: shot.hook,
    dialogue: dialogue.replace(/^"|"$/g, ""),
    image: composeImagePrompt(character, shot),
    video: composeVideoPrompt(character, shot),
    sfx: composeSfxPrompt(character, shot.soundTexture),
    theme: composeThemePrompt(character, shot.musicalArc),
    blueprint: shot,
  };
}
