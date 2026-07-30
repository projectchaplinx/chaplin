import type { CameraMovementId } from "@/lib/camera-movements";
import type { DirectorBrainTrace } from "@/lib/director-brain";
import type { CharacterCardV2 } from "@/lib/character-card";
import type { EnergyState, FramingConstraint, SceneProp } from "@/lib/direction-safety";

// Project Chaplin: core data model.
// This is the traceability spine: every entity below carries the IDs that
// let you walk the full chain, character -> castings -> stories -> scenes
// -> ledger entries -> maker earnings, from any screen in the app.

export type Archetype =
  | "villain"
  | "mentor"
  | "love-interest"
  | "comic-relief"
  | "hero"
  | "superhero"
  | "horror"
  | "rebel"
  | "sidekick"
  | "outsider";

export type LicenseType = "open" | "paid" | "approval";
export type VoiceGender = "feminine" | "masculine" | "androgynous";
export type AppRole = "maker" | "caster" | "brand" | "admin";

export interface User {
  id: string;
  name: string;
  handle: string;
  roleBadges: AppRole[];
  avatarInitial: string;
  avatarHue: number; // 0-360, used to color the monogram poster (fallback when imageUrl is unset)
  imageUrl?: string;
}

export interface CharacterStats {
  castings: number;
  fans: number;
  earnings: number; // lifetime, in mock currency units
  socialImpressions: number;
  socialViews: number;
  socialLikes: number;
}

export type CharacterSheetViewId =
  | "front"
  | "left-three-quarter"
  | "right-three-quarter"
  | "left-profile"
  | "right-profile"
  | "back"
  | "full-body"
  | "pressure-expression";

export type CharacterAgeStateId = "younger" | "canonical" | "older";

export interface CharacterSheetView {
  id: CharacterSheetViewId;
  label: string;
  framing: string;
  promptDelta: string;
  referenceAssetId?: string;
  referenceUrl?: string;
}

export interface CharacterAgeState {
  id: CharacterAgeStateId;
  label: string;
  promptDelta: string;
  invariantLocks: string[];
  referenceAssetId?: string;
  referenceUrl?: string;
}

export interface CharacterInteractionProfile {
  firstPersonSelfConcept: string;
  conversationGoal: string;
  responseRules: string[];
  emotionalBoundaries: string[];
  voiceContinuity: string;
}

export interface CharacterMemoryPolicy {
  immutableCanon: string[];
  writableMemoryTypes: Array<"event" | "relationship" | "promise" | "injury" | "possession">;
  forbiddenMemoryWrites: string[];
  retrieveRecent: number;
  retrieveSalient: number;
}

export interface CharacterSystemProfile {
  version: 1;
  sheet: {
    canonicalViewId: CharacterSheetViewId;
    canonicalAgeStateId: CharacterAgeStateId;
    views: CharacterSheetView[];
    ageStates: CharacterAgeState[];
  };
  interaction: CharacterInteractionProfile;
  memory: CharacterMemoryPolicy;
}

export interface CharacterMemoryRecord {
  id: string;
  characterId: string;
  scope: "episodic" | "relationship";
  summary: string;
  participants: string[];
  salience: number;
  occurredAt: string;
  sourceStoryId?: string;
  sourceSceneId?: string;
}

export interface CharacterProductionBible {
  version: 1;
  /** Creator-entered material retained verbatim for reuse, audit, and prompt export. */
  creationInputs?: {
    characterBrief: string;
    /** The creator-selected visual format, such as live action, anime, or manga. */
    visualFormat?: string;
    appearanceBrief: string;
    worldBrief: string;
    archetypes: Archetype[];
    voiceDirection: string;
    signatureSfxDirection: string;
    themeDirection: string;
    licenseType: LicenseType;
    royaltyRate: number;
  };
  dramatic: {
    externalWant: string;
    innerNeed: string;
    contradiction: string;
    stakes: string;
    vulnerability: string;
    moralBoundary: string;
  };
  performance: {
    restingExpression: string;
    underPressure: string;
    signatureGesture: string;
    movementStyle: string;
    eyeline: string;
    tempo: string;
  };
  visual: {
    perceivedAge: string;
    medium?: string;
    recognitionLocks?: string[];
    faceAnchors: string[];
    hair: string;
    wardrobe: string;
    silhouette: string;
    palette: string[];
    continuityRules: string[];
  };
  cinematography: {
    heroFraming: string;
    cameraHeight: string;
    lens: string;
    keyLight: string;
    fillLight: string;
    edgeLight: string;
    worldTexture: string;
  };
  story: {
    hookPattern: string;
    escalationPattern: string;
    cliffhangerPattern: string;
    payoffPattern: string;
    recurringMotifs: string[];
    avoid: string[];
  };
  system?: CharacterSystemProfile;
}

export interface Character {
  id: string;
  makerId: string;
  name: string;
  archetype: Archetype;
  archetypeMix?: Archetype[]; // full multi-select (primary first); archetype stays the primary for filters/hues
  tagline: string;
  personality: string;
  voiceGender: VoiceGender;
  voiceDesc: string;
  voiceId?: string; // ElevenLabs voice locked to this character
  sfxDesc: string; // signature sound effect, same mock pattern as voiceDesc
  themeDesc: string; // signature background score, same mock pattern as voiceDesc
  productionBible?: CharacterProductionBible; // persistent performance, visual, camera, and story continuity
  /** Structured, consumer-routed identity source. V1 prose remains a fallback during migration. */
  cardV2?: CharacterCardV2;
  cardVersion?: number;
  brollLine?: string; // short signature punchline performed in the character's locked voice
  brollScene?: string; // character-specific visual setup for the five-second profile reel
  avatarHue: number; // fallback color when imageUrl is unset (e.g. freshly built characters)
  imageUrl?: string;
  bannerUrl?: string; // wide cast-photo with negative space, used on the profile hero
  videoUrl?: string; // looping performance clip, shown once a tile is highlighted or on the profile hero
  galleryUrls?: string[]; // extra stills shown in a small gallery on the profile page
  licenseType: LicenseType;
  royaltyRate: number; // fee per casting, in mock currency units (0 if open)
  createdAt: string; // ISO date
  stats: CharacterStats;
}

export interface VoiceClipMock {
  durationSec: number;
  waveformSeed: number; // seeds a deterministic-looking fake waveform
}

export interface Line {
  id: string;
  characterId: string;
  text: string;
  voiceClipMock: VoiceClipMock;
}

export interface Scene {
  id: string;
  slotId?: string;
  sourceSlotId?: string;
  setting: string;
  objective?: string;
  action?: string;
  energyState?: EnergyState;
  lockedCharacterIds?: string[];
  dressing?: string;
  behaviorTell?: { characterId: string; tell: string } | null;
  durationSeconds?: number;
  durationMs?: number;
  previewImageUrl?: string;
  previewAssetId?: string;
  cameraMovementId?: CameraMovementId;
  motionMode?: "forward" | "chain";
  motionFromSlotId?: string | null;
  framingConstraint?: FramingConstraint;
  sensitiveNegatives?: string[];
  referencedProps?: string[];
  dialogueFramingConstraint?: "off_face" | null;
  lines: Line[];
}

export interface Story {
  id: string;
  authorId: string;
  title: string;
  logline: string;
  format?: "story" | "ad" | "reel" | "spark" | "punch" | "episode" | "spot";
  durationSeconds?: number;
  punchGenerationMode?: "scene-clips" | "single-take";
  status?: "production" | "published";
  creativeDirection?: string;
  sceneProps?: SceneProp[];
  productImageUrl?: string;
  productImageName?: string;
  /** Exact explainable direction selected when Magic authored this script. */
  directorTrace?: DirectorBrainTrace;
  coverHue: number; // fallback gradient when backdropUrl is unset
  backdropUrl?: string;
  posterUrl?: string; // finished portrait poster art (title baked in) shown on the story page
  createdAt: string; // ISO date
  scenes: Scene[];
  views: number;
}

export interface Casting {
  id: string;
  characterId: string;
  storyId: string;
  casterId: string;
  timestamp: string; // ISO date
  fee: number;
}

export type LedgerType = "royalty" | "tip";

export interface LedgerEntry {
  id: string;
  castingId: string;
  characterId: string;
  storyId: string;
  makerId: string;
  amount: number;
  type: LedgerType;
  timestamp: string; // ISO date
}

export interface ChaplinWorld {
  users: User[];
  characters: Character[];
  stories: Story[];
  castings: Casting[];
  ledger: LedgerEntry[];
}
