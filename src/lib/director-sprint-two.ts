export type DenseVerifierRun = {
  id: string;
  sprintKey: string;
  status: "running" | "calibration_failed" | "succeeded" | "failed";
  model: string;
  sampleFps: number;
  expectedCandidates: number;
  calibrationCount: number;
  calibrationMatches: number;
  calibrated: boolean;
  costUsd: number;
  failureSummary: string;
  createdAt: string;
  completedAt: string | null;
};

export type DenseVerification = {
  id: string;
  runId: string;
  assessmentId: string;
  principle: string;
  axis: string;
  workTitle: string;
  verdict: "held" | "refuted";
  frameCount: number;
  evidenceSummary: string;
  refutation: string;
  confidence: number;
  humanVerdict: "held" | "refuted" | null;
  calibrationMatch: boolean | null;
  responseId: string | null;
  createdAt: string;
};

export type DenseShortlistEntry = {
  id: string;
  assessmentId: string;
  rank: number;
  axis: string;
  duplicateKey: string;
  score: number;
  rationale: string;
  principle: string;
  workTitle: string;
};

export type DirectorSprintTwoBundle = {
  storageReady: boolean;
  characters: Array<{ id: string; name: string; archetype: string; imageUrl: string | null }>;
  runs: DenseVerifierRun[];
  activeRunId: string | null;
  verifications: DenseVerification[];
  shortlist: DenseShortlistEntry[];
  comparison: {
    characterId: string;
    characterName: string;
    brief: string;
    lockedLine: string;
    lightingPlan: Record<string, string>;
    audioPlan: Record<string, string>;
    cameraPlan: Record<string, string>;
    variants: DirectorSprintTwoVariant[];
  } | null;
  voice: {
    id: string;
    status: "succeeded" | "failed";
    assetId: string | null;
    url: string | null;
    error: string;
  } | null;
  outputs: Array<{
    id: string;
    variantId: string;
    kind: "keyframe" | "video-shot" | "final-mix";
    durationSeconds: 5 | 15;
    shotIndex: number;
    status: "succeeded" | "failed";
    url: string | null;
    provider: string;
    model: string;
    voicePath: "A-native-reference" | "B-post-mix" | "failed" | null;
    whatChanged: string;
    handoff: Record<string, string>;
    error: string;
  }>;
  evaluations: Array<{
    id: string;
    outputId: string;
    variantId: string;
    durationSeconds: 5 | 15;
    identity: number;
    performance: number;
    readability: number;
    lighting: number;
    audio: number;
    lipSync: number | null;
    composite: number;
    identityGate: "pass" | "fail";
    audioGate: "pass" | "fail";
    lipSyncGate: "pass" | "fail" | "not-applicable";
    nullResult: boolean;
    evidence: Record<string, unknown>;
  }>;
  matrix: {
    runId: string | null;
    status: string | null;
    keyframes: number;
    videoShots: number;
    mixes: number;
    evaluations: number;
    humanPicks: number;
  };
};

export const DIRECTOR_SPRINT_TWO_KEY = "finished-output-comparison-2026-08-02";

export type DirectorSprintTwoVariant = {
  id: "control" | `challenger-${1 | 2 | 3 | 4 | 5}`;
  name: string;
  assessmentId: string | null;
  axis: string;
  sourceWork: string | null;
  principle: string | null;
  verificationVerdict: "held";
  whatChanged: string;
  keyframePrompt: string;
  fiveSecondPrompt: string;
  fifteenSecondShots: Array<{ shotIndex: 1 | 2 | 3; prompt: string; handoff: Record<string, string> }>;
};

export function defaultDirectorSprintTwoContract(characterName: string) {
  return {
    brief: `${characterName} waits alone on a rain-dark elevated metro platform after midnight, holding a folded paper ticket. A distant train brakes; ${characterName} tightens one hand around the ticket, refuses to turn toward the arriving light, says the locked line once, and takes one deliberate step away. The world, action, wardrobe, props, and ending are identical in every version.`,
    lockedLine: "The signal changed. I didn't.",
    lightingPlan: {
      key: "flickering overhead sodium platform practical",
      fill: "cold timetable-box fluorescent spill",
      continuity: "same sodium flicker phase, wet-platform reflections, face exposure, and approaching train light direction in every version",
    },
    audioPlan: {
      dialogue: "one exact locked ElevenLabs render, reused byte-for-byte",
      ambience: "rain on metal canopy, distant city wash, empty elevated-platform air",
      sfx: "train brake squeal, ticket-paper compression, one measured footstep",
      music: "none",
    },
    cameraPlan: {
      fiveSeconds: "50mm medium three-quarter shot at chest height; fixed position with one restrained six-inch push after the brake",
      fifteenSeconds: "Shot 1 35mm platform geography; Shot 2 65mm hand/profile reaction; Shot 3 50mm rear three-quarter choice and step",
      movementRule: "Every move begins only after the motivated sound or action; no orbit, whip, drone, or decorative shake",
    },
  };
}
