"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, WheelEvent } from "react";
import type { Character } from "@/lib/types";
import { useChaplinStore } from "@/lib/store";
import VoiceCapacityRecovery from "@/components/VoiceCapacityRecovery";
import MediaPlayer from "@/components/MediaPlayer";
import TakeVerdictControls from "@/components/TakeVerdictControls";
import BrandLogo from "@/components/BrandLogo";
import {
  buildProductionBible,
  buildScenePackage,
  composeIdentityImagePrompt,
  composeVoiceDesignPrompt,
  type ScenePackage,
  type ShotBlueprint,
} from "@/lib/production-prompting";
import { dialogueForEditor } from "@/lib/dialogue-performance";
import { pipelineModelLabel } from "@/lib/pipeline-config";
import {
  buildThemePlan,
  type ThemePlanKind,
} from "@/lib/theme-composition-plan";
import { isSelectableVideoSeedAsset } from "@/lib/video-seed-assets";

type ProductionAsset = {
  id: string;
  kind: string;
  url: string;
  provider: string;
  prompt: string | null;
  duration_seconds: number | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

function latestSceneReference(assets: ProductionAsset[]) {
  return assets.find((asset) =>
    isSelectableVideoSeedAsset(asset) && asset.metadata?.selectedForVideo === true
  )?.url ?? "";
}

function mergeProductionAssets(current: ProductionAsset[], incoming: ProductionAsset[]) {
  const assets = new Map(current.map((asset) => [asset.id, asset]));
  incoming.forEach((asset) => assets.set(asset.id, asset));
  return [...assets.values()].sort(
    (left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
  );
}

type ProductionState = {
  voiceId: string | null;
  voicePreviewUrl: string | null;
  latestDialogueUrl: string | null;
  latestSfxUrl: string | null;
  latestThemeUrl: string | null;
  latestImageUrl: string | null;
  latestVideoUrl: string | null;
  visualReference: {
    url: string;
    assetId: string | null;
    source: "selected-cover" | "identity-asset" | "character-image" | "character-media" | "character-banner";
  } | null;
  featured: {
    voiceAssetId: string | null;
    themeAssetId: string | null;
    videoAssetId: string | null;
    coverAssetId: string | null;
  };
  assets: ProductionAsset[];
};
type ProfileSlot = "voice" | "theme" | "video" | "cover";
type ImagePurpose = "identity" | "scene";
type ProviderStatus = {
  elevenLabs: boolean;
  seedModels: boolean;
  openRouter: boolean;
  openAI: boolean;
  database: boolean;
  production: ProductionState | null;
  providers: {
    elevenLabs: ProviderCheck | null;
    seedModels: ProviderCheck | null;
  } | null;
  pipeline?: {
    stages?: {
      sfx?: {
        settings?: Record<string, string | number | boolean>;
      };
      theme?: {
        model?: string;
        settings?: Record<string, string | number | boolean>;
      };
      image?: {
        provider?: string;
        model?: string;
      };
      video?: {
        provider?: string;
        model?: string;
      };
    };
  };
};
type ProviderCheck = {
  status: string;
  error: string | null;
  updatedAt: string;
  hasSucceeded?: boolean;
  lastSucceededAt?: string | null;
};
type VoicePreview = {
  audio_base_64: string;
  generated_voice_id: string;
  media_type?: string;
  duration_secs?: number;
};
type SfxCandidate = {
  assetId: string;
  label: string;
  direction: string;
  url: string;
};
type ImageCandidate = {
  assetId: string;
  url: string;
  provider: "openai" | "openrouter" | "byteplus";
  model: string;
};
type VideoSeedOption = {
  id: string;
  assetId: string | null;
  url: string;
  label: string;
};
type ImageProviderKey = ImageCandidate["provider"];
const IMAGE_PROVIDER_LABELS: Record<ImageProviderKey, string> = {
  openai: "GPT Image 2",
  openrouter: "Nano Banana 2",
  byteplus: "Dola Seedream 5",
};

function imageProviderLabel(provider: ImageProviderKey) {
  return IMAGE_PROVIDER_LABELS[provider];
}
type QuickWriteField =
  | "voice-description"
  | "voice-preview"
  | "dialogue"
  | "sfx"
  | "theme"
  | "identity-image"
  | "image"
  | "video";
type QuickWriteStreamEvent = {
  type?: "delta" | "done";
  text?: string;
  provider?: string;
  warning?: string;
};

async function revealTextProgressively(text: string, update: (value: string) => void) {
  const pieces = text.match(/\S+\s*/g) ?? [text];
  let visible = "";
  for (const piece of pieces) {
    visible += piece;
    update(visible);
    await new Promise((resolve) => window.setTimeout(resolve, 18));
  }
}

const WORKFLOW_STEPS = [
  { id: 1, stage: "voice", label: "Audition", title: "Create the performance reference" },
  { id: 2, stage: "dialogue", label: "Dialogue", title: "Build the dialogue" },
  { id: 3, stage: "sfx", label: "SFX", title: "Add signature SFX" },
  { id: 4, stage: "theme", label: "Theme", title: "Create the music score" },
  { id: 5, stage: "image", label: "Still", title: "Finalize the scene still" },
  { id: 6, stage: "video", label: "Video", title: "Assemble the scene" },
] as const;

const VOICE_BUILD_STAGES = [
  {
    label: "Reading the actor",
    detail: "Connecting identity, age, language, and personality.",
    progress: 14,
  },
  {
    label: "Directing the performance",
    detail: "Shaping tone, rhythm, texture, and emotional range.",
    progress: 38,
  },
  {
    label: "Writing the audition",
    detail: "Creating one line that reveals how this actor really sounds.",
    progress: 58,
  },
  {
    label: "Creating three voices",
    detail: "ElevenLabs is performing three original interpretations.",
    progress: 84,
  },
  {
    label: "Voice takes ready",
    detail: "Listen to the takes and choose the one that becomes canon.",
    progress: 100,
  },
] as const;

const GENERATION_TIMELINES = {
  "voice-build": {
    title: "Building the actor voice",
    expectedSeconds: 45,
    stages: ["Read identity", "Direct performance", "Create takes", "Prepare review"],
  },
  "magic-scene": {
    title: "Directing the complete scene",
    expectedSeconds: 35,
    stages: ["Read canon", "Shape the beat", "Direct each medium", "Sync prompts"],
  },
  speech: {
    title: "Performing the dialogue",
    expectedSeconds: 18,
    stages: ["Lock voice", "Direct delivery", "Render line", "Save take"],
  },
  sfx: {
    title: "Building signature sound",
    expectedSeconds: 32,
    stages: ["Read sound identity", "Direct four takes", "Render variations", "Attach takes"],
  },
  theme: {
    title: "Composing the character theme",
    expectedSeconds: 30,
    stages: ["Shape motif", "Build the cue", "Mix the ending", "Save theme"],
  },
  image: {
    title: "Creating the visual",
    expectedSeconds: 40,
    stages: ["Lock identity", "Build composition", "Render frame", "Save asset"],
  },
  upload: {
    title: "Locking the visual reference",
    expectedSeconds: 16,
    stages: ["Check image", "Upload source", "Set as canon", "Sync profile"],
  },
  video: {
    title: "Rendering the five-second scene",
    expectedSeconds: 75,
    stages: ["Lock first frame", "Direct motion", "Render scene", "Attach video"],
  },
} as const;

type GenerationKey = keyof typeof GENERATION_TIMELINES;
type GenerationRun = {
  key: GenerationKey;
  status: "running" | "complete" | "failed";
  elapsedSeconds: number;
  error?: string;
};

type AutoStudioStepState = "queued" | "writing" | "generating" | "complete" | "failed";
type AutoStudioStep = {
  state: AutoStudioStepState;
  detail: string;
};
type AutoStudioRun = {
  status: "running" | "complete" | "failed";
  error?: string;
  steps: Record<number, AutoStudioStep>;
};

function initialAutoStudioSteps(completed: Set<number>): Record<number, AutoStudioStep> {
  return Object.fromEntries(
    WORKFLOW_STEPS.map((step) => [
      step.id,
      completed.has(step.id)
        ? { state: "complete", detail: "Already ready" }
        : { state: "queued", detail: "Waiting" },
    ]),
  ) as Record<number, AutoStudioStep>;
}

const PRODUCTION_TASK_TO_STEP: Record<string, number> = {
  "voice-build": 1,
  "voice-save": 1,
  speech: 2,
  sfx: 3,
  "sfx-select": 3,
  theme: 4,
  image: 5,
  "image-select": 5,
  upload: 5,
  video: 6,
};

const QUICK_WRITE_TO_STEP: Record<string, number> = {
  "voice-description": 1,
  "voice-preview": 1,
  dialogue: 2,
  sfx: 3,
  theme: 4,
  "identity-image": 5,
  image: 5,
  video: 6,
};

function estimatedGenerationProgress(run: GenerationRun) {
  const timeline = GENERATION_TIMELINES[run.key];
  if (run.status === "complete") return 100;
  // Elapsed-time estimate only — the provider gives no interim progress, so the
  // bar must never imply more than time passed. No artificial floor: a run that
  // dies at 1s shows a bar frozen at ~1%, not a fabricated 8%.
  return Math.min(94, Math.max(0, Math.round((run.elapsedSeconds / timeline.expectedSeconds) * 90)));
}

const THEME_DURATION_PRESETS = [5, 8, 15] as const;
type ThemeDurationPreset = typeof THEME_DURATION_PRESETS[number];

function themeDurationPreset(value: unknown): ThemeDurationPreset {
  const duration = Number(value);
  return THEME_DURATION_PRESETS.includes(duration as ThemeDurationPreset)
    ? duration as ThemeDurationPreset
    : 8;
}

function characterSignatureSfxEventCount(character: Character) {
  if (!character.cardV2 || typeof character.cardV2 !== "object") return 3;
  const events = (character.cardV2 as unknown as Record<string, unknown>).signature_sfx_events;
  return Array.isArray(events) ? Math.min(4, Math.max(2, events.length)) : 3;
}

const SEEDANCE_SETUP_URL = "https://docs.byteplus.com/en/docs/ModelArk/2291680";

function modelArkHasPausedModel(message: string) {
  return /inference limit|service has been paused|safe experience mode/i.test(message);
}
async function errorFrom(response: Response) {
  const data = (await response.json().catch(() => null)) as { error?: string } | null;
  return data?.error ?? `Generation failed with status ${response.status}.`;
}

function QuickWriteButton({
  field,
  busy,
  writing,
  onClick,
  label = "Quick Write",
}: {
  field: QuickWriteField;
  busy: boolean;
  writing: boolean;
  onClick: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      data-quick-write={field}
      data-intelligence-action
      aria-busy={writing}
      className="magic-action shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold disabled:opacity-40"
    >
      {writing ? "Writing..." : `✦ ${label}`}
    </button>
  );
}

function GenerationTimeline({
  generationKey,
  run,
  providerLabel,
  previewUrl,
}: {
  generationKey: GenerationKey;
  run: GenerationRun | null;
  providerLabel?: string;
  previewUrl?: string;
}) {
  if (!run || run.key !== generationKey) return null;

  const timeline = GENERATION_TIMELINES[generationKey];
  const statusLabel = run.status === "complete" ? "Ready to review" : run.status === "failed" ? "Needs attention" : "Working";
  const expectedSeconds = timeline.expectedSeconds;
  const estimatedProgress = estimatedGenerationProgress(run);
  const activeStage = run.status === "complete"
    ? timeline.stages.length - 1
    : Math.min(timeline.stages.length - 1, Math.floor((estimatedProgress / 100) * timeline.stages.length));
  const remainingSeconds = Math.max(0, expectedSeconds - run.elapsedSeconds);

  return (
    <div
      className={`generation-timeline rounded-sm border p-3 ${
        run.status === "failed"
          ? "border-red-500/55 bg-red-500/[0.07]"
          : run.status === "complete"
            ? "border-accent-secondary/45 bg-accent-secondary/[0.06]"
            : "border-accent/40 bg-paper/75"
      }`}
      aria-live="polite"
      data-generation-timeline={generationKey}
    >
      <div className="flex items-start gap-3">
        {generationKey === "image" && (
          <div className="relative h-20 w-28 shrink-0 overflow-hidden rounded-sm border border-line bg-gradient-to-br from-[#24302b] via-[#10170f] to-[#451d2c]" data-generation-preview>
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- generated and uploaded provider URLs are dynamic
              <img src={previewUrl} alt="Locked identity reference while the new image renders" className="h-full w-full object-cover opacity-70" />
            ) : (
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_65%_25%,rgba(242,78,112,0.55),transparent_30%),linear-gradient(135deg,transparent_42%,rgba(255,255,255,0.12)_43%,transparent_45%)]" />
            )}
            <div className="absolute inset-x-2 bottom-2 h-px bg-white/40" />
            <span className="absolute left-2 top-2 rounded bg-black/55 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.12em] text-white">Preview</span>
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-ink">{timeline.title}</p>
              <p className="mt-0.5 text-[10px] text-grey">
                {providerLabel ? `${providerLabel} · ` : ""}{statusLabel}
                {run.status === "running" ? ` · ${run.elapsedSeconds}s elapsed` : ""}
              </p>
            </div>
            <span className={`shrink-0 text-lg font-semibold tabular-nums ${run.status === "failed" ? "text-red-400" : run.status === "complete" ? "text-emerald-400" : "text-accent"}`}>{run.status === "failed" ? "✕" : `${estimatedProgress}%`}</span>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10" aria-label={`${estimatedProgress}% complete`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={estimatedProgress}>
            <div className={`h-full rounded-full transition-[width] duration-700 ease-out ${run.status === "failed" ? "bg-red-400" : run.status === "complete" ? "bg-emerald-400" : "bg-accent"}`} style={{ width: `${estimatedProgress}%` }} />
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[10px]">
            <span className="font-medium text-ink">{timeline.stages[activeStage]}</span>
            {run.status === "running" && <span className="text-grey">{remainingSeconds > 0 ? `~${remainingSeconds}s left (typical, not live progress)` : "Taking longer than typical—still waiting on the provider"}</span>}
            {run.error && <span className="text-red-400">See message above</span>}
          </div>
          <div className="mt-3 grid grid-cols-4 gap-1" aria-hidden="true">
            {timeline.stages.map((stage, index) => (
              <span key={stage} className={`h-1 rounded-full ${index <= activeStage ? (run.status === "failed" ? "bg-red-400/80" : "bg-accent") : "bg-white/10"}`} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const ASSET_WAVEFORM = [34, 62, 44, 82, 54, 72, 38, 88, 58, 76, 42, 66, 32, 74, 48, 84];

function assetKindLabel(kind: string) {
  if (kind === "dialogue") return "Dialogue take";
  if (kind === "sfx") return "Signature SFX";
  if (kind === "theme") return "Theme score";
  if (kind === "video") return "Generated scene";
  if (kind === "avatar") return "Identity portrait";
  if (kind === "banner") return "Identity banner";
  return "Scene still";
}

function AssetCanvasSkeleton({
  stepId,
  running,
  progress,
}: {
  stepId: number;
  running: boolean;
  progress: number;
}) {
  const isVisual = stepId >= 5;
  const count = stepId === 1 ? 3 : 1;

  return (
    <div className={`asset-canvas-skeleton rounded-md border p-3 ${running ? "border-accent/50 bg-accent/[0.055]" : "border-line bg-white/[0.018]"}`} data-asset-skeleton={WORKFLOW_STEPS[stepId - 1]?.stage}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-grey">
          {running ? "Generating now" : "Preview reserved"}
        </span>
        <span className={`text-[10px] font-semibold tabular-nums ${running ? "text-accent" : "text-grey"}`}>
          {running ? `${progress}%` : "Waiting"}
        </span>
      </div>
      {isVisual ? (
        <div className="asset-canvas-shimmer relative mt-3 aspect-video overflow-hidden rounded-sm border border-white/[0.06] bg-gradient-to-br from-[#17211d] via-[#0d1210] to-[#25151c]">
          <div className="absolute inset-x-[18%] bottom-0 h-[72%] rounded-t-[46%] border border-white/[0.06] bg-white/[0.025]" />
          <div className="absolute left-[35%] top-[18%] h-[22%] w-[30%] rounded-full border border-white/[0.07] bg-white/[0.025]" />
          {stepId === 6 && <span className="absolute inset-0 flex items-center justify-center text-2xl text-white/20">▶</span>}
          <span className="absolute bottom-2 left-2 rounded-full border border-white/10 bg-black/35 px-2 py-1 text-[8px] uppercase tracking-[0.12em] text-white/45">
            {stepId === 5 ? "Image preview" : "Video preview"}
          </span>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {Array.from({ length: count }, (_, index) => (
            <div key={index} className="asset-canvas-shimmer rounded-sm border border-white/[0.06] bg-black/15 p-2.5">
              <div className="flex items-center gap-2.5">
                <span className="h-7 w-7 shrink-0 rounded-full border border-white/[0.08] bg-white/[0.035]" />
                <span className="flex h-8 min-w-0 flex-1 items-center gap-1 overflow-hidden">
                  {ASSET_WAVEFORM.map((height, barIndex) => (
                    <span key={barIndex} className="min-w-0 flex-1 rounded-full bg-white/[0.11]" style={{ height: `${Math.max(18, height - index * 7)}%` }} />
                  ))}
                </span>
                <span className="h-2 w-8 rounded-full bg-white/[0.06]" />
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/[0.07]">
        <span
          className={`block h-full rounded-full transition-[width] duration-700 ${running ? "bg-gradient-to-r from-accent to-accent-secondary" : "bg-white/10"}`}
          style={{ width: `${running ? progress : 18}%` }}
        />
      </div>
    </div>
  );
}

function FreshIdentityCanvasEmpty() {
  return (
    <div
      className="rounded-md border border-cyan-400/35 bg-cyan-400/[0.045] px-4 py-5"
      data-fresh-identity-canvas-empty
    >
      <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-cyan-300">
        Fresh identity · no reference attached
      </p>
      <p className="mt-2 text-[11px] font-semibold text-ink">Ready for a new casting</p>
      <p className="mt-1 text-[10px] leading-relaxed text-grey">
        The actor&apos;s current profile image is not shown here or sent to an image model. The next result will be created from the rewritten prompt only.
      </p>
    </div>
  );
}

export default function CharacterProductionStudio({
  character,
  onExit,
  onOpenStyleSheet,
}: {
  character: Character;
  onExit?: () => void;
  onOpenStyleSheet?: () => void;
}) {
  const setCharacterVoice = useChaplinStore((s) => s.setCharacterVoice);
  const addCharacterImage = useChaplinStore((s) => s.addCharacterImage);
  const setCharacterVideo = useChaplinStore((s) => s.setCharacterVideo);
  const mergePersistedCharacters = useChaplinStore((s) => s.mergePersistedCharacters);

  const productionBible = useMemo(() => buildProductionBible(character), [character]);
  // A profile b-roll line can be a marketing hook rather than a scene line.
  // Start dialogue from a dedicated, spoken scene beat instead of reusing it.
  const initialScene = useMemo(() => buildScenePackage({ ...character, brollLine: undefined }, 0), [character]);
  const brollLine = character.brollLine ?? initialScene.dialogue;
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [voiceDescription, setVoiceDescription] = useState(
    composeVoiceDesignPrompt(character)
  );
  const [previewText, setPreviewText] = useState(brollLine);
  const [previews, setPreviews] = useState<VoicePreview[]>([]);
  const [selectedVoicePreviewIndex, setSelectedVoicePreviewIndex] = useState(0);
  const [lockedVoiceId, setLockedVoiceId] = useState(character.voiceId ?? "");
  const [speechText, setSpeechText] = useState(dialogueForEditor(initialScene.dialogue));
  const [speechUrl, setSpeechUrl] = useState("");
  const [sfxPrompt, setSfxPrompt] = useState(
    initialScene.sfx
  );
  const [sfxUrl, setSfxUrl] = useState("");
  const [sfxCandidates, setSfxCandidates] = useState<SfxCandidate[]>([]);
  const [themePrompt, setThemePrompt] = useState(
    initialScene.theme
  );
  const [themeDurationSeconds, setThemeDurationSeconds] = useState<ThemeDurationPreset>(8);
  const [themePlanEnabled, setThemePlanEnabled] = useState(true);
  const [themeKind, setThemeKind] = useState<ThemePlanKind>("ident_8s");
  const [themeUrl, setThemeUrl] = useState("");
  const [imagePurpose, setImagePurpose] = useState<ImagePurpose>("identity");
  const [imagePrompt, setImagePrompt] = useState(composeIdentityImagePrompt(character));
  const [scenePrompt, setScenePrompt] = useState(
    initialScene.video
  );
  const [imageCandidates, setImageCandidates] = useState<ImageCandidate[]>([]);
  const [imageProviderErrors, setImageProviderErrors] = useState<Partial<Record<ImageProviderKey, string>>>({});
  const [selectedImageAssetId, setSelectedImageAssetId] = useState("");
  const [generatedImage, setGeneratedImage] = useState("");
  const [canonicalReferenceImage, setCanonicalReferenceImage] = useState("");
  const [selectedVideoSeedId, setSelectedVideoSeedId] = useState("");
  const [selectedVideoSeedUrl, setSelectedVideoSeedUrl] = useState("");
  const [generatedVideo, setGeneratedVideo] = useState("");
  const [assetHistory, setAssetHistory] = useState<ProductionAsset[]>([]);
  const [magicSceneIndex, setMagicSceneIndex] = useState(0);
  const [magicSceneBrief, setMagicSceneBrief] = useState("");
  const themePlan = useMemo(
    () => buildThemePlan(character, themeKind, initialScene.blueprint.musicalArc),
    [character, initialScene.blueprint.musicalArc, themeKind],
  );
  const [activeStep, setActiveStep] = useState<number>(1);
  const [sceneBlueprint, setSceneBlueprint] = useState<ShotBlueprint>(initialScene.blueprint);
  const [busy, setBusy] = useState("");
  const [generationRun, setGenerationRun] = useState<GenerationRun | null>(null);
  const [voiceBuildStage, setVoiceBuildStage] = useState<number | null>(null);
  const [quickWriting, setQuickWriting] = useState<QuickWriteField | null>(null);
  const [studioAutoMode, setStudioAutoMode] = useState(false);
  const [autoStudioRun, setAutoStudioRun] = useState<AutoStudioRun | null>(null);
  const [selectingAsset, setSelectingAsset] = useState("");
  const [message, setMessage] = useState("");
  const [seedanceRetryArmed, setSeedanceRetryArmed] = useState(false);
  const workflowContentRef = useRef<HTMLDivElement | null>(null);
  const quickWriteRevisionRef = useRef(0);
  const identityReferenceImage = canonicalReferenceImage || character.imageUrl || character.galleryUrls?.[0] || character.bannerUrl || "";
  const videoSeedOptions = useMemo(() => {
    const seeds = new Map<string, VideoSeedOption>();
    const addSeed = (seed: VideoSeedOption) => {
      if (!seed.url || seeds.has(seed.url)) return;
      seeds.set(seed.url, seed);
    };
    imageCandidates.forEach((candidate) => addSeed({
      id: candidate.assetId,
      assetId: candidate.assetId,
      url: candidate.url,
      label: imageProviderLabel(candidate.provider),
    }));
    assetHistory
      .filter(isSelectableVideoSeedAsset)
      .forEach((asset, index) => addSeed({
        id: asset.id,
        assetId: asset.id,
        url: asset.url,
        label: asset.metadata?.imagePurpose === "identity"
          ? "Identity image"
          : `Scene still ${index + 1}`,
      }));
    const visualReference = status?.production?.visualReference;
    if (visualReference?.url) {
      addSeed({
        id: visualReference.assetId ?? "profile-reference",
        assetId: visualReference.assetId,
        url: visualReference.url,
        label: "Profile reference",
      });
    }
    if (identityReferenceImage) {
      addSeed({
        id: "identity-reference",
        assetId: null,
        url: identityReferenceImage,
        label: "Identity reference",
      });
    }
    return [...seeds.values()];
  }, [assetHistory, identityReferenceImage, imageCandidates, status?.production?.visualReference]);

  useEffect(() => {
    if (!generationRun || generationRun.status !== "running") return;
    const startedAt = Date.now() - generationRun.elapsedSeconds * 1000;
    const timer = window.setInterval(() => {
      setGenerationRun((current) => current?.status === "running"
        ? { ...current, elapsedSeconds: Math.max(1, Math.floor((Date.now() - startedAt) / 1000)) }
        : current);
    }, 500);
    return () => window.clearInterval(timer);
  }, [generationRun]);
  // A newly composed scene frame takes priority, but an actor with an approved
  // canonical image is already ready for image-to-video. Requiring another
  // still here left the video action disabled for otherwise complete actors.
  const videoReferenceImage = selectedVideoSeedUrl || generatedImage || identityReferenceImage;
  function jumpToStep(stepId: number) {
    setActiveStep(stepId);
    window.requestAnimationFrame(() => {
      workflowContentRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  function advanceAfterCompletion(stepId: number) {
    window.setTimeout(() => jumpToStep(stepId), 320);
  }

  function scrollWorkspacePanel(event: WheelEvent<HTMLElement>) {
    const panel = event.currentTarget;
    if (panel.scrollHeight <= panel.clientHeight || event.deltaY === 0) return;
    panel.scrollTop = Math.max(
      0,
      Math.min(panel.scrollHeight - panel.clientHeight, panel.scrollTop + event.deltaY),
    );
    event.stopPropagation();
  }

  function scrollWorkspacePanelWithKeyboard(event: KeyboardEvent<HTMLElement>) {
    const panel = event.currentTarget;
    if (panel.scrollHeight <= panel.clientHeight) return;
    const page = Math.max(120, Math.round(panel.clientHeight * 0.8));
    const next = event.key === "PageDown"
      ? panel.scrollTop + page
      : event.key === "PageUp"
        ? panel.scrollTop - page
        : event.key === "ArrowDown"
          ? panel.scrollTop + 48
          : event.key === "ArrowUp"
            ? panel.scrollTop - 48
            : event.key === "Home"
              ? 0
              : event.key === "End"
                ? panel.scrollHeight
                : null;
    if (next === null) return;
    event.preventDefault();
    panel.scrollTop = Math.max(0, Math.min(panel.scrollHeight - panel.clientHeight, next));
  }

  useEffect(() => {
    fetch(`/api/generate?characterId=${encodeURIComponent(character.id)}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((data: ProviderStatus) => {
        setStatus(data);
        setThemeDurationSeconds(themeDurationPreset(data.pipeline?.stages?.theme?.settings?.durationSeconds));
        setThemePlanEnabled(data.pipeline?.stages?.theme?.settings?.compositionPlanEnabled !== false);
        const production = data.production;
        if (!production) return;
        const assets = production.assets ?? [];
        setAssetHistory(assets);
        const selectedVideoSeed = assets.find((asset) =>
          isSelectableVideoSeedAsset(asset) && asset.metadata?.selectedForVideo === true
        );
        setGeneratedImage(selectedVideoSeed?.url ?? "");
        if (selectedVideoSeed) {
          setSelectedVideoSeedId(selectedVideoSeed.id);
          setSelectedVideoSeedUrl(selectedVideoSeed.url);
        }
        setCanonicalReferenceImage(production.visualReference?.url ?? "");
        if (production.voiceId) setLockedVoiceId(production.voiceId);
        if (production.voiceId && production.voiceId !== character.voiceId) {
          setCharacterVoice(character.id, production.voiceId);
        }
        if (production.latestDialogueUrl) setSpeechUrl(production.latestDialogueUrl);
        if (production.latestSfxUrl) setSfxUrl(production.latestSfxUrl);
        if (production.latestThemeUrl) setThemeUrl(production.latestThemeUrl);
        if (production.latestImageUrl) {

          if (!character.galleryUrls?.includes(production.latestImageUrl)) {
            addCharacterImage(character.id, production.latestImageUrl);
          }
        }
        if (production.latestVideoUrl) {
          setGeneratedVideo(production.latestVideoUrl);
          if (production.latestVideoUrl !== character.videoUrl) {
            setCharacterVideo(character.id, production.latestVideoUrl);
          }
        }
        const resumeAt = production.latestImageUrl
          ? 6
          : production.latestThemeUrl
            ? 5
            : production.latestSfxUrl
              ? 4
              : production.latestDialogueUrl
                ? 3
                : production.voiceId
                  ? 2
                  : 1;
        setActiveStep((current) => current === 1 ? Math.max(current, resumeAt) : current);
      })
      .catch(() => setStatus({ elevenLabs: false, seedModels: false, openRouter: false, openAI: false, database: false, production: null, providers: null }));
  }, [addCharacterImage, character.galleryUrls, character.id, character.videoUrl, character.voiceId, setCharacterVideo, setCharacterVoice]);

  async function refreshHistory() {
    const response = await fetch(`/api/generate?characterId=${encodeURIComponent(character.id)}`, { cache: "no-store" });
    if (!response.ok) return;
    const data = (await response.json()) as ProviderStatus;
    setStatus(data);
    if (data.production) {
      const assets = data.production.assets ?? [];
      setAssetHistory((current) => mergeProductionAssets(current, assets));
      const latestGeneratedImage = latestSceneReference(assets);
      if (latestGeneratedImage) {
        const selectedVideoSeed = assets.find((asset) =>
          isSelectableVideoSeedAsset(asset) && asset.metadata?.selectedForVideo === true
        );
        setGeneratedImage(latestGeneratedImage);
        setSelectedVideoSeedId(selectedVideoSeed?.id ?? "");
        setSelectedVideoSeedUrl(latestGeneratedImage);
      }
      setCanonicalReferenceImage(data.production.visualReference?.url ?? "");
      if (data.production.voiceId) setLockedVoiceId(data.production.voiceId);
      if (data.production.voiceId && data.production.voiceId !== character.voiceId) {
        setCharacterVoice(character.id, data.production.voiceId);
      }
      if (data.production.latestDialogueUrl) setSpeechUrl(data.production.latestDialogueUrl);
      if (data.production.latestSfxUrl) setSfxUrl(data.production.latestSfxUrl);
      if (data.production.latestThemeUrl) setThemeUrl(data.production.latestThemeUrl);

      if (data.production.latestVideoUrl) setGeneratedVideo(data.production.latestVideoUrl);
    }
    window.dispatchEvent(new CustomEvent("chaplin:media-updated", { detail: { characterId: character.id } }));
  }

  async function selectProfileMedia(asset: ProductionAsset, slot: ProfileSlot) {
    setSelectingAsset(asset.id);
    setMessage("");
    try {
      const response = await fetch("/api/characters/profile-media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId: character.id, assetId: asset.id, slot }),
      });
      if (!response.ok) throw new Error(await errorFrom(response));
      await refreshHistory();
      const catalogueResponse = await fetch("/api/characters", { cache: "no-store" });
      if (catalogueResponse.ok) {
        const catalogue = await catalogueResponse.json() as { characters?: Character[] };
        if (Array.isArray(catalogue.characters)) mergePersistedCharacters(catalogue.characters);
      }
      const labels: Record<ProfileSlot, string> = {
        voice: "main profile voice",
        theme: "profile theme",
        video: "hero video",
        cover: "hero cover",
      };
      setMessage(`Selected as ${labels[slot]}. The public profile now uses this take.`);
    } catch (error) {
      setMessage(`Selection failed: ${error instanceof Error ? error.message : "Please try again."}`);
    } finally {
      setSelectingAsset("");
    }
  }

  async function ensureCharacterIsSaved() {
    const response = await fetch("/api/characters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ character, ensureOnly: true }),
    });
    if (!response.ok) throw new Error(await errorFrom(response));
  }

  async function quickWrite(
    field: QuickWriteField,
    currentText: string,
    update: (value: string) => void
  ) {
    const writingStep = QUICK_WRITE_TO_STEP[field];
    if (writingStep) jumpToStep(writingStep);
    setQuickWriting(field);
    setMessage("");
    quickWriteRevisionRef.current += 1;
    const variation = quickWriteRevisionRef.current;
    try {
      const response = await fetch("/api/write/quick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          field,
          currentText,
          variation,
          stream: true,
          character,
          // Rewriting an identity is a clean casting pass. Only scene and
          // motion prompts are allowed to inspect the approved actor image.
          referenceImage: field === "video"
            ? videoReferenceImage
            : field === "image"
              ? identityReferenceImage
              : undefined,
          context: {
            voiceDescription,
            voicePreview: previewText,
            dialogue: speechText,
            sfx: sfxPrompt,
            theme: themePrompt,
            image: imagePrompt,
            video: scenePrompt,
          },
        }),
      });
      if (!response.ok) throw new Error(await errorFrom(response));
      if (response.headers.get("content-type")?.includes("application/x-ndjson") && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let streamedText = "";
        let finalEvent: QuickWriteStreamEvent | null = null;
        update("");
        while (true) {
          const { value, done } = await reader.read();
          buffer += decoder.decode(value, { stream: !done });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            const event = JSON.parse(line) as QuickWriteStreamEvent;
            if (event.type === "delta" && event.text) {
              streamedText += event.text;
              update(streamedText);
            }
            if (event.type === "done") {
              finalEvent = event;
            }
          }
          if (done) break;
        }
        if (buffer.trim()) {
          const event = JSON.parse(buffer) as QuickWriteStreamEvent;
          if (event.type === "done") {
            finalEvent = event;
          }
        }
        if (!finalEvent?.text) throw new Error("Quick Write stream ended without a completed field.");
        if (streamedText) {
          update(finalEvent.text);
        } else {
          await revealTextProgressively(finalEvent.text, update);
        }
        setMessage(
          finalEvent.warning || (finalEvent.provider === "openai"
            ? "GPT-5.6 Terra rewrote this field using the actor's complete identity."
            : "Quick Write streamed a local fallback.")
        );
        return;
      }
      const data = await response.json() as { text?: string; provider?: string; warning?: string };
      if (!data.text) throw new Error("Quick Write returned no text.");
      await revealTextProgressively(data.text, update);
      setMessage(
        data.warning || (data.provider === "openai"
          ? "GPT-5.6 Terra rewrote this field using the actor's complete identity."
          : "Quick Write updated this field locally.")
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Quick Write failed.");
    } finally {
      setQuickWriting(null);
    }
  }

  async function writeField(field: QuickWriteField, currentText: string, referenceImage?: string) {
    const response = await fetch("/api/write/quick", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        field,
        currentText,
        character,
        referenceImage,
        context: {
          voiceDescription,
          voicePreview: previewText,
          dialogue: speechText,
          sfx: sfxPrompt,
          theme: themePrompt,
          image: imagePrompt,
          video: scenePrompt,
        },
      }),
    });
    if (!response.ok) throw new Error(await errorFrom(response));
    const data = await response.json() as { text?: string; warning?: string };
    if (!data.text) throw new Error("Chaplin returned no writing.");
    return data;
  }

  async function jsonAction(action: string, payload: Record<string, unknown>) {
    await ensureCharacterIsSaved();
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, characterId: character.id, character, ...payload }),
    });
    if (!response.ok) throw new Error(await errorFrom(response));
    return response.json();
  }

  async function audioAction(action: "speech" | "sfx" | "theme", payload: Record<string, unknown>) {
    await ensureCharacterIsSaved();
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, characterId: character.id, character, ...payload }),
    });
    if (!response.ok) throw new Error(await errorFrom(response));
    const persistentUrl = response.headers.get("X-Asset-Url");
    return persistentUrl ?? URL.createObjectURL(await response.blob());
  }

  async function run(label: string, task: () => Promise<void>) {
    const hasTimeline = label in GENERATION_TIMELINES;
    const taskStep = label === "magic-scene" ? activeStep : PRODUCTION_TASK_TO_STEP[label];
    if (taskStep) jumpToStep(taskStep);
    setBusy(label);
    setMessage("");
    if (hasTimeline) {
      setGenerationRun({
        key: label as GenerationKey,
        status: "running",
        elapsedSeconds: 0,
      });
    }
    try {
      await task();
      if (hasTimeline) {
        setGenerationRun((current) => current?.key === label
          ? { ...current, status: "complete", elapsedSeconds: Math.max(1, current.elapsedSeconds) }
          : current);
      }
    } catch (error) {
      const rawError = error instanceof Error ? error.message : "Generation failed.";
      const errorMessage = /string_too_short[\s\S]*100 characters/i.test(rawError)
        ? "The voice audition was shorter than ElevenLabs allows. Chaplin has expanded it safely; tap Build the complete voice to retry."
        : /text_too_long|maximum number of 450 characters|invalid_text_length/i.test(rawError)
          ? "The SFX direction exceeded ElevenLabs’ limit. Chaplin has shortened it safely; tap Generate short SFX takes to retry."
          : label === "video" && modelArkHasPausedModel(rawError)
            ? "Seedance is paused by BytePlus after this account reached its inference limit. Open ModelArk setup to adjust or turn off Safe Experience Mode, then retry this exact still."
          : rawError;
      if (label === "video" && modelArkHasPausedModel(rawError)) setSeedanceRetryArmed(false);
      if (label === "voice-build") setVoiceBuildStage(null);
      setMessage(errorMessage);
      if (hasTimeline) {
        setGenerationRun((current) => current?.key === label
          ? {
              ...current,
              status: "failed",
              elapsedSeconds: Math.max(1, current.elapsedSeconds),
              error: errorMessage,
            }
          : current);
      }
      // Persisted provider health can change during this run (for example a
      // ModelArk quota pause). Refresh it before the creator tries again.
      void refreshHistory();
    } finally {
      setBusy("");
    }
  }

  function buildVoice() {
    setVoiceBuildStage(0);
    void run("voice-build", async () => {
      setVoiceBuildStage(1);
      const [descriptionResult, auditionResult] = await Promise.all([
        writeField("voice-description", voiceDescription),
        writeField("voice-preview", previewText),
      ]);
      const directedVoice = (descriptionResult.text ?? voiceDescription).trim().slice(0, 1000);
      const auditionLine = auditionResult.text ?? previewText;
      setVoiceDescription(directedVoice);
      setVoiceBuildStage(2);
      setPreviewText(auditionLine);
      setVoiceBuildStage(3);
      const data = (await jsonAction("voice-design", {
        description: directedVoice,
        previewText: auditionLine,
      })) as { previews: VoicePreview[] };
      const nextPreviews = data.previews ?? [];
      if (!nextPreviews.length) throw new Error("No voice takes were returned.");
      setPreviews(nextPreviews);
      setSelectedVoicePreviewIndex(0);
      setVoiceBuildStage(4);
      setMessage(`Three voices for ${character.name} are ready. Play each take, then choose the one that feels true.`);
    });
  }

  function lockVoice(preview: VoicePreview) {
    void run("voice-save", async () => {
      const data = (await jsonAction("voice-save", {
        name: `${character.name} - Chaplin`,
        description: voiceDescription,
        generatedVoiceId: preview.generated_voice_id,
        characterId: character.id,
      })) as { voice_id: string; already_locked?: boolean; reclaimed_voice_count?: number };
      setLockedVoiceId(data.voice_id);
      setCharacterVoice(character.id, data.voice_id);
      setPreviews([]);
      setMessage(
        data.already_locked
          ? `${character.name}'s voice was already locked. It is ready for dialogue.`
          : data.reclaimed_voice_count
            ? `Voice locked to ${character.name}. Chaplin safely removed ${data.reclaimed_voice_count} superseded ${data.reclaimed_voice_count === 1 ? "voice" : "voices"} for this actor to free ElevenLabs capacity.`
          : `Voice locked to ${character.name}. Every future line can now use the same voice ID.`
      );
      advanceAfterCompletion(2);
    });
  }

  function generateSpeech() {
    if (!lockedVoiceId) {
      setMessage("Design and lock a voice before generating dialogue.");
      return;
    }
    void run("speech", async () => {
      setSpeechUrl(await audioAction("speech", { speechText }));
      await refreshHistory();
      setMessage("Dialogue generated from the server-verified locked voice in continuity mode.");
      advanceAfterCompletion(3);
    });
  }

  function generateSfx() {
    void run("sfx", async () => {
      setSfxCandidates([]);
      const eventCount = characterSignatureSfxEventCount(character);
      const signature = await jsonAction("signature-sfx", {}) as {
        url?: string;
        assetId?: string;
        events?: unknown[];
      };
      if (!signature.url) throw new Error("The assembled signature SFX returned no playable audio.");
      setSfxUrl(signature.url);
      await refreshHistory();
      setMessage(
        `${signature.events?.length ?? eventCount} high-resolution Foley events were generated separately and mixed into a polished five-second signature.`
      );
      advanceAfterCompletion(4);
    });
  }

  function selectSfxCandidate(candidate: SfxCandidate) {
    void run("sfx-select", async () => {
      await jsonAction("sfx-select", { assetId: candidate.assetId });
      setSfxUrl(candidate.url);
      await refreshHistory();
      window.dispatchEvent(new CustomEvent("chaplin:media-updated", { detail: { characterId: character.id } }));
      setMessage(`${candidate.label} is now ${character.name}'s reusable signature SFX.`);
      advanceAfterCompletion(4);
    });
  }

  function generateTheme() {
    void run("theme", async () => {
      setThemeUrl(await audioAction("theme", {
        prompt: themePrompt,
        durationSeconds: themePlanEnabled
          ? (themeKind === "scene_15s" ? 15 : 8)
          : themeDurationSeconds,
        themeKind,
        sceneBrief: initialScene.blueprint.musicalArc,
        grammarVersion: themePlanEnabled ? "plan-v2" : "v3-legacy",
      }));
      await refreshHistory();
      setMessage(
        themeUrl
          ? "A new theme was generated with the modern v3 production brief and Eleven Music v2. The earlier theme remains in the asset history."
          : "The actor theme was generated with the modern v3 production brief and Eleven Music v2, archived to the CDN, and added to the public Sound Profile."
      );
      advanceAfterCompletion(5);
    });
  }

  function generateImage() {
    void run("image", async () => {
      const requestedPurpose = imagePurpose;
      const identityVariationKey = requestedPurpose === "identity"
        ? crypto.randomUUID()
        : undefined;
      const imageRequest = (imagePreset: string) => ({
        prompt: imagePrompt,
        imagePurpose: requestedPurpose,
        // Fresh identity casting is prompt-only. Scene frames intentionally
        // inherit the currently approved identity.
        referenceImage: requestedPurpose === "scene" ? identityReferenceImage : undefined,
        identityVariationKey,
        imagePreset,
        // One of several options to compare; it reaches the feed only if chosen.
        comparisonCandidate: true,
      });
      setImageCandidates([]);
      setImageProviderErrors({});
      setSelectedImageAssetId("");
      const requests: Array<{ provider: ImageProviderKey; request: ReturnType<typeof imageRequest> }> = [];
      if (gptImageReady) {
        requests.push({ provider: "openai", request: imageRequest("gpt-image-2") });
      }
      if (nanoBananaReady) {
        requests.push({ provider: "openrouter", request: imageRequest("nano-banana-2") });
      }
      if (dolaImageReady) {
        requests.push({ provider: "byteplus", request: imageRequest("dola-seedream-5") });
      }
      if (!requests.length) throw new Error("Connect an image provider before generating a still.");
      /*
        Sequential fallback chain, first success wins: GPT → Nano Banana →
        Dola Seedream. Firing all three in parallel burned three rate-limit
        slots per casting attempt and stalled the studio on the slowest or
        broken lane. One provider is tried at a time and the first still that
        lands is the result; the remaining lanes are never called.
      */
      const results: ImageCandidate[] = [];
      const failures: Partial<Record<ImageProviderKey, string>> = {};
      for (const lane of requests) {
        try {
          const candidate = await (jsonAction("image", lane.request) as Promise<ImageCandidate>);
          results.push(candidate);
          setImageCandidates((current) => (
            current.some((existing) => existing.assetId === candidate.assetId)
              ? current
              : [...current, candidate]
          ));
          addCharacterImage(character.id, candidate.url);
          break;
        } catch (laneError) {
          failures[lane.provider] = laneError instanceof Error
            ? laneError.message
            : "This provider did not return an image.";
        }
      }
      setImageProviderErrors(failures);
      if (!results.length) {
        throw new Error(Object.values(failures).join(" ") || "No image provider returned a still.");
      }
      await refreshHistory();
      const providers = results.map((candidate) => imageProviderLabel(candidate.provider)).join(", ");
      const fallbackStatus = Object.keys(failures).length
        ? ` ${Object.keys(failures).length} earlier lane${Object.keys(failures).length === 1 ? "" : "s"} failed and ${providers} answered instead.`
        : "";
      setMessage((requestedPurpose === "identity"
        ? `${providers} is ready from a clean casting pass. The previous face was not sent to any image model. Choose it only if you want to replace the actor's canonical identity.`
        : `${providers} is ready. Choose it as Seedance's exact first frame.`) + fallbackStatus);
    });
  }

  function selectImageCandidate(candidate: ImageCandidate) {
    void run("image-select", async () => {
      const slot = imagePurpose === "identity" ? "cover" : "scene";
      const response = await fetch("/api/characters/profile-media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId: character.id, assetId: candidate.assetId, slot }),
      });
      if (!response.ok) throw new Error(await errorFrom(response));
      setSelectedImageAssetId(candidate.assetId);
      setSelectedVideoSeedId(candidate.assetId);
      setSelectedVideoSeedUrl(candidate.url);
      if (imagePurpose === "identity") {
        setCanonicalReferenceImage(candidate.url);
        setGeneratedImage("");
      } else {
        setGeneratedImage(candidate.url);
      }
      await refreshHistory();
      setMessage(imagePurpose === "identity"
        ? `${imageProviderLabel(candidate.provider)} is now the actor’s canonical identity cover. You can move on to video when ready.`
        : `${imageProviderLabel(candidate.provider)} is now Seedance’s exact first frame.`);
      advanceAfterCompletion(6);
    });
  }

  async function selectVideoSeed(seed: VideoSeedOption) {
    setSelectingAsset(seed.id);
    setMessage("");
    try {
      if (seed.assetId) {
        const response = await fetch("/api/characters/profile-media", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            characterId: character.id,
            assetId: seed.assetId,
            slot: "scene",
          }),
        });
        if (!response.ok) throw new Error(await errorFrom(response));
      }
      setSelectedVideoSeedId(seed.id);
      setSelectedVideoSeedUrl(seed.url);
      setGeneratedImage(seed.url);
      if (seed.assetId) await refreshHistory();
      setMessage(`${seed.label} is now the exact first frame for the next video.`);
    } catch (error) {
      setMessage(`Could not select this seed image: ${error instanceof Error ? error.message : "Please try again."}`);
    } finally {
      setSelectingAsset("");
    }
  }

  function uploadReferenceImage(file: File) {
    void run("upload", async () => {
      await ensureCharacterIsSaved();
      const form = new FormData();
      form.set("characterId", character.id);
      form.set("character", JSON.stringify(character));
      form.set("kind", "gallery");
      form.set("file", file);
      const response = await fetch("/api/admin/upload", { method: "POST", body: form });
      if (!response.ok) throw new Error(await errorFrom(response));
      const data = (await response.json()) as { id: string; url: string };
      const selectResponse = await fetch("/api/characters/profile-media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId: character.id, assetId: data.id, slot: "cover" }),
      });
      if (!selectResponse.ok) throw new Error(await errorFrom(selectResponse));

      setCanonicalReferenceImage(data.url);
      setGeneratedImage(data.url);
      setSelectedVideoSeedId(data.id);
      setSelectedVideoSeedUrl(data.url);
      if (!character.galleryUrls?.includes(data.url)) addCharacterImage(character.id, data.url);
      await refreshHistory();
      setMessage("Reference image uploaded. It is now the actor’s canonical visual seed and Seedance’s exact first frame.");
      advanceAfterCompletion(6);
      jumpToStep(6);
    });
  }

  function generateVideo() {
    void run("video", async () => {
      if (!videoReferenceImage) {
        throw new Error("Add or lock a reference image first. Chaplin will animate that exact image.");
      }
      const grounded = await writeField("video", scenePrompt, videoReferenceImage);
      const groundedPrompt = grounded.text ?? scenePrompt;
      setScenePrompt(groundedPrompt);
      const data = (await jsonAction("video", { prompt: groundedPrompt, referenceImage: videoReferenceImage })) as { url: string };
      setGeneratedVideo(data.url);
      setCharacterVideo(character.id, data.url);
      setSeedanceRetryArmed(false);
      await refreshHistory();
      setMessage("Five-second Seedance clip generated and attached to the actor profile.");
    });
  }

  function retrySeedanceAfterActivation() {
    setSeedanceRetryArmed(true);
    setMessage("Seedance is unlocked for one retry. Render the selected first frame when you are ready.");
  }

  function applyScenePackage(scene: ScenePackage) {
    setSpeechText(dialogueForEditor(scene.dialogue));
    setSfxPrompt(scene.sfx);
    setThemePrompt(scene.theme);
    setImagePrompt(scene.image);
    setImagePurpose("scene");
    setScenePrompt(scene.video);
    setSceneBlueprint(scene.blueprint);
    setImageCandidates([]);
    setSelectedImageAssetId("");
    setGeneratedImage("");
    setGeneratedVideo("");
  }

  function chooseImagePurpose(purpose: ImagePurpose) {
    setImagePurpose(purpose);
    setImageCandidates([]);
    setSelectedImageAssetId("");
    setImagePrompt(purpose === "identity"
      ? composeIdentityImagePrompt(character)
      : buildScenePackage(character, magicSceneIndex).image);
  }

  function applyMagicScene() {
    const nextIndex = magicSceneIndex + 1;
    setMagicSceneIndex(nextIndex);
    void run("magic-scene", async () => {
      const response = await fetch("/api/write/scene", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          character: { ...character, productionBible },
          variation: nextIndex,
          brief: magicSceneBrief,
        }),
      });
      if (!response.ok) throw new Error(await errorFrom(response));
      const data = await response.json() as { scene?: ScenePackage; provider?: string; warning?: string; fallback?: boolean };
      if (!data.scene) throw new Error("Magic Scene returned no directed scene.");
      applyScenePackage(data.scene);
      // A stock scene is a degraded result, not a success. Saying so plainly is
      // what stops the same built-in scene quietly spreading across every actor.
      setMessage(data.fallback
        ? `Stock scene used — not written for ${character.name}. ${data.warning ?? ""}`.trim()
        : `Magic Scene directed: ${data.scene.sceneName}. Each medium now has its own production instructions.`);
    });
  }

  const seedModelsConfigured = status?.seedModels ?? false;
  const seedModelsFailed = status?.providers?.seedModels?.status === "failed";
  const seedModelsError = status?.providers?.seedModels?.error ?? "";
  const seedModelsNeedActivation =
    seedModelsFailed && /not activated|activate the model/i.test(seedModelsError);
  const seedreamLimitPaused =
    seedModelsFailed && /dola-seedream|seedream/i.test(seedModelsError) &&
      modelArkHasPausedModel(seedModelsError);
  const seedanceLimitPaused =
    seedModelsFailed && /seedance|dreamina-seedance/i.test(seedModelsError) &&
      modelArkHasPausedModel(seedModelsError);
  // Provider health records the last error. Once the creator has restored
  // their ModelArk account, permit one fresh request instead of leaving a
  // historical pause permanently blocking the studio.
  const seedanceAccountPaused = seedanceLimitPaused && !seedanceRetryArmed;
  // Seedream and Seedance share the same credential but are independently
  // paused by ModelArk. Keep the still provider available if only Seedance is
  // paused, and vice versa.
  const seedModelsReady = seedModelsConfigured && !seedanceAccountPaused;
  const gptImageReady = status?.openAI ?? false;
  const nanoBananaReady = status?.openRouter ?? false;
  const dolaImageReady = seedModelsConfigured && !seedreamLimitPaused;
  const readyImageProviderLabels = [
    gptImageReady ? IMAGE_PROVIDER_LABELS.openai : null,
    nanoBananaReady ? IMAGE_PROVIDER_LABELS.openrouter : null,
    dolaImageReady ? IMAGE_PROVIDER_LABELS.byteplus : null,
  ].filter((label): label is string => Boolean(label));
  const imageGenerationReady = readyImageProviderLabels.length > 0;
  const imageProviderRunLabel = readyImageProviderLabels.join(" + ");
  const imageUnavailableReason = !status
      ? "Checking image providers…"
    : !imageGenerationReady
      ? "Connect GPT Image, OpenRouter Nano Banana, or Dola Seedream 5 to create a still."
      : readyImageProviderLabels.length === 1
        ? `${readyImageProviderLabels[0]} is the only image provider ready for this run.`
        : null;
  const videoUnavailableReason = !status
    ? "Checking the Seedance connection…"
    : seedanceAccountPaused
      ? "Seedance is paused by BytePlus after this account reached its inference limit. Adjust the ModelArk account before retrying."
    : !seedModelsReady
      ? "Seedance is not ready. Check the Video stage in Super Admin, then refresh this page."
      : !videoReferenceImage
        ? "Choose or generate a still first. Seedance needs an exact first frame before it can animate the actor."
        : null;
  const elevenReady = status?.elevenLabs ?? false;
  const dialogueUnavailableReason = !status
    ? "Checking the dialogue provider…"
    : !elevenReady
      ? "ElevenLabs is not ready. Check the Voice stage in Super Admin, then refresh this page."
      : !lockedVoiceId
        ? "Choose and lock one voice take before generating dialogue."
        : null;
  const configuredVideoModel = status?.pipeline?.stages?.video?.model ?? "dreamina-seedance-2-0-260128";
  const signatureSfxEventCount = characterSignatureSfxEventCount(character);
  const activeStepMeta = WORKFLOW_STEPS.find((step) => step.id === activeStep) ?? WORKFLOW_STEPS[0];
  const completedSteps = new Set<number>([
    ...(lockedVoiceId ? [1] : []),
    ...(speechUrl ? [2] : []),
    ...(sfxUrl ? [3] : []),
    ...(themeUrl ? [4] : []),
    ...(generatedImage || identityReferenceImage ? [5] : []),
    ...(generatedVideo || character.videoUrl ? [6] : []),
  ]);
  const activeStepComplete = completedSteps.has(activeStep);
  const reviewSteps = new Set<number>([
    ...(previews.length > 0 && !lockedVoiceId ? [1] : []),
    ...(sfxCandidates.length > 0 && !sfxUrl ? [3] : []),
    ...(imageCandidates.length > 0 && !selectedImageAssetId ? [5] : []),
  ]);
  const autoRunningSteps = new Set(
    Object.entries(autoStudioRun?.steps ?? {})
      .filter(([, step]) => step.state === "writing" || step.state === "generating")
      .map(([stepId]) => Number(stepId)),
  );

  function updateAutoStudioStep(stepId: number, state: AutoStudioStepState, detail: string) {
    setAutoStudioRun((current) => current
      ? {
          ...current,
          steps: {
            ...current.steps,
            [stepId]: { state, detail },
          },
        }
      : current);
  }

  async function runAutoStudio() {
    if (busy || autoStudioRun?.status === "running") return;

    const startingCompletedSteps = new Set(completedSteps);
    setAutoStudioRun({
      status: "running",
      steps: initialAutoStudioSteps(startingCompletedSteps),
    });
    setBusy("auto-studio");
    setMessage("Studio Auto is writing prompts and running every missing production lane. It will stop at final review.");
    jumpToStep(1);

    // An identity portrait is the seed, not the finished scene. For a new
    // automatic run, create a dedicated scene frame from that identity before
    // asking Seedance to animate it. Reuse the identity directly only when a
    // finished video already exists and no new render is required.
    let automaticFrame = generatedImage ||
      ((generatedVideo || character.videoUrl) ? identityReferenceImage : "");

    const runVoiceAndDialogue = async () => {
      let automaticVoiceId = lockedVoiceId;
      if (!automaticVoiceId) {
        updateAutoStudioStep(1, "writing", "Writing voice direction");
        try {
          if (!elevenReady) throw new Error("ElevenLabs is not ready for voice, dialogue, SFX, or theme generation.");
          const [descriptionResult, auditionResult] = await Promise.all([
            writeField("voice-description", voiceDescription),
            writeField("voice-preview", previewText),
          ]);
          const directedVoice = (descriptionResult.text ?? voiceDescription).trim().slice(0, 1000);
          const auditionLine = (auditionResult.text ?? previewText).trim();
          setVoiceDescription(directedVoice);
          setPreviewText(auditionLine);
          updateAutoStudioStep(1, "generating", "Creating and locking the strongest take");
          const voiceData = await jsonAction("voice-design", {
            description: directedVoice,
            previewText: auditionLine,
          }) as { previews?: VoicePreview[] };
          const firstVoice = voiceData.previews?.[0];
          if (!firstVoice) throw new Error("ElevenLabs returned no voice take to lock.");
          setPreviews(voiceData.previews ?? []);
          setSelectedVoicePreviewIndex(0);
          const savedVoice = await jsonAction("voice-save", {
            name: `${character.name} - Chaplin`,
            description: directedVoice,
            generatedVoiceId: firstVoice.generated_voice_id,
            characterId: character.id,
          }) as { voice_id?: string };
          if (!savedVoice.voice_id) throw new Error("The selected voice take could not be locked.");
          automaticVoiceId = savedVoice.voice_id;
          setLockedVoiceId(automaticVoiceId);
          setCharacterVoice(character.id, automaticVoiceId);
          setPreviews([]);
          updateAutoStudioStep(1, "complete", "Voice locked automatically");
        } catch (error) {
          updateAutoStudioStep(1, "failed", error instanceof Error ? error.message : "Voice generation failed");
          throw error;
        }
      } else {
        updateAutoStudioStep(1, "complete", "Existing locked voice reused");
      }

      if (speechUrl) {
        updateAutoStudioStep(2, "complete", "Existing dialogue reused");
        return;
      }

      updateAutoStudioStep(2, "writing", "Writing dialogue for the locked voice");
      try {
        const dialogueResult = await writeField("dialogue", speechText);
        const writtenDialogue = (dialogueResult.text ?? speechText).trim();
        setSpeechText(writtenDialogue);
        updateAutoStudioStep(2, "generating", "Performing dialogue");
        const automaticSpeechUrl = await audioAction("speech", { speechText: writtenDialogue });
        setSpeechUrl(automaticSpeechUrl);
        await refreshHistory();
        updateAutoStudioStep(2, "complete", "Dialogue ready");
      } catch (error) {
        updateAutoStudioStep(2, "failed", error instanceof Error ? error.message : "Dialogue generation failed");
        throw error;
      }
    };

    const runSignatureSound = async () => {
      if (sfxUrl) {
        updateAutoStudioStep(3, "complete", "Existing signature sound reused");
        return;
      }
      updateAutoStudioStep(3, "writing", "Writing distinct sound events");
      try {
        if (!elevenReady) throw new Error("ElevenLabs is not ready for signature sound generation.");
        const sfxResult = await writeField("sfx", sfxPrompt);
        setSfxPrompt((sfxResult.text ?? sfxPrompt).trim());
        updateAutoStudioStep(3, "generating", "Rendering and mixing signature sound");
        const signature = await jsonAction("signature-sfx", {}) as {
          url?: string;
          events?: unknown[];
        };
        if (!signature.url) throw new Error("The signature sound returned no playable asset.");
        setSfxUrl(signature.url);
        await refreshHistory();
        updateAutoStudioStep(3, "complete", `${signature.events?.length ?? signatureSfxEventCount} sound events mixed`);
      } catch (error) {
        updateAutoStudioStep(3, "failed", error instanceof Error ? error.message : "Signature sound generation failed");
        throw error;
      }
    };

    const runThemeScore = async () => {
      if (themeUrl) {
        updateAutoStudioStep(4, "complete", "Existing theme reused");
        return;
      }
      updateAutoStudioStep(4, "writing", "Writing the score direction");
      try {
        if (!elevenReady) throw new Error("ElevenLabs is not ready for theme generation.");
        const writtenTheme = themePlanEnabled
          ? themePrompt
          : (await writeField("theme", themePrompt)).text?.trim() ?? themePrompt;
        if (!themePlanEnabled) setThemePrompt(writtenTheme);
        const automaticDuration = themePlanEnabled
          ? (themeKind === "scene_15s" ? 15 : 8)
          : themeDurationSeconds;
        updateAutoStudioStep(4, "generating", `Composing ${automaticDuration}s theme`);
        const automaticThemeUrl = await audioAction("theme", {
          prompt: writtenTheme,
          durationSeconds: automaticDuration,
          themeKind,
          sceneBrief: initialScene.blueprint.musicalArc,
          grammarVersion: themePlanEnabled ? "plan-v2" : "v3-legacy",
        });
        setThemeUrl(automaticThemeUrl);
        await refreshHistory();
        updateAutoStudioStep(4, "complete", "Theme ready");
      } catch (error) {
        updateAutoStudioStep(4, "failed", error instanceof Error ? error.message : "Theme generation failed");
        throw error;
      }
    };

    const runVisualSeed = async () => {
      if (automaticFrame) {
        updateAutoStudioStep(5, "complete", "Existing visual seed reused");
        return automaticFrame;
      }

      const automaticPurpose: ImagePurpose = identityReferenceImage ? "scene" : "identity";
      setImagePurpose(automaticPurpose);
      updateAutoStudioStep(5, "writing", automaticPurpose === "identity" ? "Writing the identity frame" : "Writing the scene frame");
      try {
        if (!imageGenerationReady) throw new Error(imageUnavailableReason ?? "No image provider is ready.");
        const imageField: QuickWriteField = automaticPurpose === "identity" ? "identity-image" : "image";
        const automaticImagePrompt = automaticPurpose === "scene"
          ? (imagePurpose === "scene" ? imagePrompt : buildScenePackage(character, magicSceneIndex).image)
          : imagePrompt;
        const imageResult = await writeField(
          imageField,
          automaticImagePrompt,
          automaticPurpose === "scene" ? identityReferenceImage : undefined,
        );
        const writtenImagePrompt = (imageResult.text ?? automaticImagePrompt).trim();
        setImagePrompt(writtenImagePrompt);
        updateAutoStudioStep(5, "generating", `Rendering with ${imageProviderRunLabel}`);

        const identityVariationKey = automaticPurpose === "identity" ? crypto.randomUUID() : undefined;
        const imageRequest = (imagePreset: string) => ({
          prompt: writtenImagePrompt,
          imagePurpose: automaticPurpose,
          comparisonCandidate: true,
          referenceImage: automaticPurpose === "scene" ? identityReferenceImage : undefined,
          identityVariationKey,
          imagePreset,
        });
        /*
          Sequential chain, Dola Seedream FIRST: this still feeds Seedance
          video directly, and Seedance rejects a foreign photoreal face as a
          possible real person - a same-ModelArk still is trusted and goes
          straight to video with full lip-sync and motion. GPT and Nano are
          fallbacks only. One request at a time; the first still that lands
          wins and no further lane is called.
        */
        const lanes: Array<{ provider: ImageProviderKey; request: ReturnType<typeof imageRequest> }> = [];
        if (dolaImageReady) lanes.push({ provider: "byteplus", request: imageRequest("dola-seedream-5") });
        if (gptImageReady) lanes.push({ provider: "openai", request: imageRequest("gpt-image-2") });
        if (nanoBananaReady) lanes.push({ provider: "openrouter", request: imageRequest("nano-banana-2") });
        if (!lanes.length) throw new Error("Connect an image provider before generating a still.");
        let selected: ImageCandidate | null = null;
        const laneFailures: string[] = [];
        for (const lane of lanes) {
          try {
            selected = await (jsonAction("image", lane.request) as Promise<ImageCandidate>);
            break;
          } catch (laneError) {
            laneFailures.push(laneError instanceof Error ? laneError.message : "An image provider failed.");
          }
        }
        if (!selected) {
          throw new Error(laneFailures.join(" ") || "No image provider returned a visual.");
        }
        setImageCandidates((current) => (
          current.some((existing) => existing.assetId === selected.assetId)
            ? current
            : [...current, selected]
        ));
        addCharacterImage(character.id, selected.url);
        const selectResponse = await fetch("/api/characters/profile-media", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            characterId: character.id,
            assetId: selected.assetId,
            slot: automaticPurpose === "identity" ? "cover" : "scene",
          }),
        });
        if (!selectResponse.ok) throw new Error(await errorFrom(selectResponse));
        setSelectedImageAssetId(selected.assetId);
        automaticFrame = selected.url;
        if (automaticPurpose === "identity") {
          setCanonicalReferenceImage(selected.url);
          setGeneratedImage("");
        } else {
          setGeneratedImage(selected.url);
        }
        await refreshHistory();
        updateAutoStudioStep(5, "complete", `${imageProviderLabel(selected.provider)} frame selected`);
        return selected.url;
      } catch (error) {
        updateAutoStudioStep(5, "failed", error instanceof Error ? error.message : "Image generation failed");
        throw error;
      }
    };

    try {
      await ensureCharacterIsSaved();
      const parallelResults = await Promise.allSettled([
        runVoiceAndDialogue(),
        runSignatureSound(),
        runThemeScore(),
        runVisualSeed(),
      ]);
      const failures = parallelResults.flatMap((result) =>
        result.status === "rejected"
          ? [result.reason instanceof Error ? result.reason.message : "A production lane failed."]
          : [],
      );
      if (failures.length) throw new Error([...new Set(failures)].join(" "));

      if (generatedVideo || character.videoUrl) {
        updateAutoStudioStep(6, "complete", "Existing video reused");
      } else {
        try {
          updateAutoStudioStep(6, "writing", "Writing motion for the selected frame");
          if (!seedModelsReady) throw new Error(videoUnavailableReason ?? "Seedance is not ready.");
          if (!automaticFrame) throw new Error("Studio Auto could not find a first frame for video.");
          const videoResult = await writeField("video", scenePrompt, automaticFrame);
          const writtenVideoPrompt = (videoResult.text ?? scenePrompt).trim();
          setScenePrompt(writtenVideoPrompt);
          updateAutoStudioStep(6, "generating", "Rendering the five-second scene");
          const videoData = await jsonAction("video", {
            prompt: writtenVideoPrompt,
            referenceImage: automaticFrame,
          }) as { url?: string };
          if (!videoData.url) throw new Error("Seedance returned no playable video.");
          setGeneratedVideo(videoData.url);
          setCharacterVideo(character.id, videoData.url);
          updateAutoStudioStep(6, "complete", "Video ready");
        } catch (error) {
          updateAutoStudioStep(6, "failed", error instanceof Error ? error.message : "Video generation failed");
          throw error;
        }
      }

      await refreshHistory();
      jumpToStep(6);
      setAutoStudioRun((current) => current
        ? { ...current, status: "complete" }
        : current);
      setMessage("Studio Auto finished every available stage. Review the assets and finish the scene when you are ready.");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Studio Auto stopped because a production stage failed.";
      setAutoStudioRun((current) => current
        ? { ...current, status: "failed", error: errorMessage }
        : current);
      setStudioAutoMode(false);
      setMessage(`Studio Auto stopped: ${errorMessage}`);
      await refreshHistory();
    } finally {
      setBusy("");
    }
  }

  function toggleStudioAuto() {
    if (autoStudioRun?.status === "running") return;
    const next = !studioAutoMode;
    setStudioAutoMode(next);
    if (next) void runAutoStudio();
  }

  const processingStep = busy
    ? (busy === "magic-scene"
        ? activeStep
        : busy === "auto-studio"
          ? null
          : PRODUCTION_TASK_TO_STEP[busy] ?? activeStep)
    : quickWriting
      ? QUICK_WRITE_TO_STEP[quickWriting] ?? activeStep
      : null;

  function progressForStep(stepId: number) {
    const autoStep = autoStudioRun?.steps[stepId];
    if (autoStep?.state === "complete") return 100;
    if (autoStep?.state === "failed") return 72;
    if (autoStep?.state === "writing") return 34;
    if (autoStep?.state === "generating") return 68;
    if (processingStep === stepId) {
      if (stepId === 1 && voiceBuildStage !== null) {
        return VOICE_BUILD_STAGES[voiceBuildStage].progress;
      }
      if (generationRun?.status === "running") {
        const runStep = generationRun.key === "magic-scene"
          ? activeStep
          : PRODUCTION_TASK_TO_STEP[generationRun.key];
        if (runStep === stepId) return estimatedGenerationProgress(generationRun);
      }
      return 54;
    }
    if (reviewSteps.has(stepId)) return 100;
    return completedSteps.has(stepId) ? 100 : 0;
  }

  const activeStepRunning = processingStep === activeStep || autoRunningSteps.has(activeStep);
  const activeStepProgress = progressForStep(activeStep);
  const autoCompletedCount = Object.values(autoStudioRun?.steps ?? {})
    .filter((step) => step.state === "complete").length;
  const autoStatusLabel = autoStudioRun?.status === "running"
    ? `${autoCompletedCount}/${WORKFLOW_STEPS.length} ready`
    : autoStudioRun?.status === "complete"
      ? "Final review ready"
      : autoStudioRun?.status === "failed"
        ? "Stopped on error"
        : "Runs every missing stage";
  const activeStepHasOutput = activeStep === 1
    ? previews.length > 0 || Boolean(lockedVoiceId)
    : activeStep === 2
      ? Boolean(speechUrl)
      : activeStep === 3
        ? sfxCandidates.length > 0 || Boolean(sfxUrl)
        : activeStep === 4
          ? Boolean(themeUrl)
          : activeStep === 5
            ? imagePurpose === "identity"
              ? imageCandidates.length > 0
              : imageCandidates.length > 0 || Boolean(generatedImage || identityReferenceImage)
            : Boolean(generatedVideo || character.videoUrl);

  function renderActiveAssetPreview() {
    if (activeStep === 1) {
      const selectedVoicePreview = previews[selectedVoicePreviewIndex] ?? previews[0];
      const selectedVoiceTake = selectedVoicePreview ? previews.indexOf(selectedVoicePreview) + 1 : 0;
      return (
        <div className="space-y-2">
          {selectedVoicePreview && (
            <article className="rounded-md border border-line bg-black/15 p-2.5" data-asset-canvas-candidate="voice">
              <div className="mb-2.5">
                <span className="block text-[10px] font-semibold">Compare voice takes</span>
                <span className="mt-0.5 block text-[9px] text-grey">One audition line, three different voices.</span>
              </div>

              <div className="mb-2 grid grid-cols-3 gap-1.5" aria-label="Voice takes">
                {previews.map((preview, index) => {
                  const selected = preview.generated_voice_id === selectedVoicePreview.generated_voice_id;
                  return (
                    <button
                      key={preview.generated_voice_id}
                      type="button"
                      onClick={() => setSelectedVoicePreviewIndex(index)}
                      aria-pressed={selected}
                      className={`min-h-9 rounded-full border px-2 py-1.5 text-[10px] font-semibold transition ${
                        selected
                          ? "border-accent bg-accent text-paper"
                          : "border-line text-grey hover:border-accent/60 hover:text-ink"
                      }`}
                    >
                      Take {index + 1}
                    </button>
                  );
                })}
              </div>

              <MediaPlayer
                key={selectedVoicePreview.generated_voice_id}
                src={`data:${selectedVoicePreview.media_type ?? "audio/mpeg"};base64,${selectedVoicePreview.audio_base_64}`}
                label={`Voice take ${selectedVoiceTake}`}
                compact
                playbackLimitSeconds={7}
              />

              <button
                type="button"
                onClick={() => lockVoice(selectedVoicePreview)}
                disabled={Boolean(busy)}
                className="mt-2.5 min-h-9 w-full rounded-full border border-accent/60 px-3 py-1.5 text-[10px] font-semibold text-accent hover:bg-accent hover:text-paper disabled:opacity-40"
              >
                {busy === "voice-save" ? "Locking…" : `Choose take ${selectedVoiceTake}`}
              </button>
            </article>
          )}
          {lockedVoiceId && previews.length === 0 && (
            <article className="rounded-md border border-emerald-400/35 bg-emerald-400/[0.055] p-3" data-asset-canvas-ready="voice">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full border border-emerald-300/60 bg-emerald-400/10 text-[11px] text-emerald-200">✓</span>
                <span>
                  <span className="block text-[11px] font-semibold text-emerald-200">Voice identity locked</span>
                  <span className="mt-0.5 block text-[9px] uppercase tracking-[0.12em] text-emerald-400">Continuity ready · {lockedVoiceId.slice(-6)}</span>
                </span>
              </div>
              {status?.production?.voicePreviewUrl && (
                <div className="mt-3">
                  <MediaPlayer src={status.production.voicePreviewUrl} label={`${character.name} locked voice`} compact playbackLimitSeconds={7} />
                </div>
              )}
            </article>
          )}
        </div>
      );
    }

    if (activeStep === 2) {
      return speechUrl ? <MediaPlayer src={speechUrl} label={`${character.name} dialogue`} compact /> : null;
    }

    if (activeStep === 3) {
      if (sfxCandidates.length > 0) {
        return (
          <div className="space-y-2">
            {sfxCandidates.map((candidate, index) => {
              const selected = sfxUrl === candidate.url;
              return (
                <article key={candidate.assetId} className={`rounded-md border p-2.5 ${selected ? "border-emerald-400/40 bg-emerald-400/[0.05]" : "border-line bg-black/15"}`} data-asset-canvas-candidate="sfx">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="truncate text-[10px] font-semibold">Take {index + 1} · {candidate.label}</span>
                    <button type="button" onClick={() => selectSfxCandidate(candidate)} disabled={Boolean(busy)} className={`min-h-9 shrink-0 rounded-full border px-3 py-1.5 text-[10px] font-semibold ${selected ? "border-emerald-400/50 text-emerald-300" : "border-accent/50 text-accent"}`}>
                      {selected ? "Selected ✓" : "Use take"}
                    </button>
                  </div>
                  <MediaPlayer src={candidate.url} label={`${character.name} SFX take ${index + 1}`} compact />
                  <TakeVerdictControls assetId={candidate.assetId} />
                </article>
              );
            })}
          </div>
        );
      }
      return sfxUrl ? <MediaPlayer src={sfxUrl} label={`${character.name} signature SFX`} compact /> : null;
    }

    if (activeStep === 4) {
      return themeUrl ? <MediaPlayer src={themeUrl} label={`${character.name} theme`} compact /> : null;
    }

    if (activeStep === 5) {
      if (imageCandidates.length > 0) {
        return (
          <div className="space-y-3">
            {imageCandidates.map((candidate) => {
              const selected = selectedImageAssetId === candidate.assetId;
              return (
                <article key={candidate.assetId} className={`overflow-hidden rounded-md border ${selected ? "border-emerald-400/45 bg-emerald-400/[0.045]" : "border-line bg-black/15"}`} data-asset-canvas-candidate="image">
                  {/* eslint-disable-next-line @next/next/no-img-element -- generated provider URLs are dynamic */}
                  <img src={candidate.url} alt={`${character.name} ${imageProviderLabel(candidate.provider)} preview`} className="aspect-video w-full object-cover" />
                  <div className="flex items-center justify-between gap-2 p-2.5">
                    <span className="min-w-0">
                      <span className="block truncate text-[10px] font-semibold">{imageProviderLabel(candidate.provider)}</span>
                      <span className="block truncate text-[9px] text-grey">{candidate.model}</span>
                    </span>
                    <button type="button" onClick={() => selectImageCandidate(candidate)} disabled={Boolean(busy)} className={`min-h-9 shrink-0 rounded-full border px-3 py-1.5 text-[10px] font-semibold disabled:opacity-40 ${selected ? "border-emerald-400/60 text-emerald-300" : "border-accent/60 text-accent"}`}>
                      {selected ? "Chosen ✓" : imagePurpose === "identity" ? "Use as identity" : "Use frame"}
                    </button>
                  </div>
                  <div className="px-2.5 pb-2.5">
                    <TakeVerdictControls assetId={candidate.assetId} />
                  </div>
                </article>
              );
            })}
          </div>
        );
      }
      // Fresh casting is deliberately prompt-only. Never present an older
      // profile image or scene still as the current generation result.
      if (imagePurpose === "identity") return null;
      const still = generatedImage || identityReferenceImage;
      return still ? (
        <article className="overflow-hidden rounded-md border border-line bg-black/15" data-asset-canvas-ready="image">
          {/* eslint-disable-next-line @next/next/no-img-element -- generated and uploaded provider URLs are dynamic */}
          <img src={still} alt={`${character.name} selected visual`} className="aspect-video w-full object-cover" />
          <p className="px-3 py-2 text-[9px] uppercase tracking-[0.12em] text-emerald-300">
            {generatedImage ? "Selected scene frame" : "Approved identity reference"}
          </p>
        </article>
      ) : null;
    }

    const video = generatedVideo || character.videoUrl;
    return video ? <MediaPlayer src={video} label={`${character.name} scene`} kind="video" compact /> : null;
  }

  return (
    <section data-production-workflow className="character-production-room">
      <div
        className="studio-command-bar shrink-0 border-b border-white/10 bg-[#080c0a]/96 px-3 backdrop-blur-xl sm:px-4"
        data-studio-auto-dock
        data-studio-auto={studioAutoMode ? autoStudioRun?.status ?? "on" : "off"}
      >
        <div className="flex h-16 items-center gap-2.5 lg:gap-3" data-magic-scene-toolbar>
          <div className="studio-command-bar__identity hidden shrink-0 items-center gap-3 sm:flex">
            <BrandLogo priority className="[&>span]:hidden xl:[&>span]:inline" />
            <span className="hidden h-7 w-px bg-white/10 xl:block" />
            <div className="hidden min-w-0 xl:block">
              <p className="max-w-36 truncate text-[11px] font-semibold text-ink">{character.name}</p>
              <p className="text-[8px] font-semibold uppercase tracking-[0.16em] text-accent-secondary">
                Actor studio · autosaved
              </p>
            </div>
          </div>

          <div className="studio-command-bar__magic flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-accent/45 bg-accent/[0.07] p-1.5 shadow-[inset_0_0_24px_rgba(244,63,94,.04)]">
            <span className="hidden shrink-0 pl-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-accent md:block">
              ✦ Magic Scene
            </span>
            {magicSceneIndex > 0 && (
              <span className="shrink-0 rounded-full border border-accent/35 px-2 py-0.5 text-[8px] font-semibold text-accent">
                Take {magicSceneIndex + 1}
              </span>
            )}
            <input
              value={magicSceneBrief}
              onChange={(event) => setMagicSceneBrief(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !busy) {
                  event.preventDefault();
                  applyMagicScene();
                }
              }}
              maxLength={1600}
              aria-label="Describe the scene or change for Magic Scene"
              placeholder="Describe the whole scene or change anything…"
              className="min-w-0 flex-1 border-0 bg-transparent px-2 py-2 text-[11px] text-ink outline-none placeholder:text-grey/65"
            />
            <button
              type="button"
              onClick={applyMagicScene}
              disabled={Boolean(busy)}
              data-action="magic-scene"
              data-intelligence-action
              aria-busy={busy === "magic-scene"}
              className="magic-action shrink-0 rounded-lg px-3.5 py-2 text-[10px] font-semibold disabled:opacity-40"
            >
              {busy === "magic-scene" && generationRun?.key === "magic-scene"
                ? `Directing ${estimatedGenerationProgress(generationRun)}%`
                : magicSceneBrief.trim()
                  ? "Direct scene"
                  : "Magic"}
            </button>
          </div>

          <div className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.025] px-2 py-1.5">
            <span className={`hidden text-[9px] font-semibold md:block ${
              autoStudioRun?.status === "failed"
                ? "text-red-300"
                : autoStudioRun?.status === "complete"
                  ? "text-emerald-300"
                  : studioAutoMode
                    ? "text-accent-secondary"
                    : "text-grey"
            }`}>
              YOLO
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={studioAutoMode}
              aria-label="YOLO mode: run every missing stage automatically"
              title={`${autoStatusLabel}. YOLO runs every missing stage and stops only on an error or at final review.`}
              onClick={toggleStudioAuto}
              disabled={Boolean(busy) && autoStudioRun?.status !== "failed"}
              className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors disabled:opacity-45 ${
                studioAutoMode
                  ? "border-accent-secondary bg-accent-secondary/20"
                  : "border-white/20 bg-black/30"
              }`}
            >
              <span className={`absolute top-[3px] h-4 w-4 rounded-full transition-all ${
                studioAutoMode
                  ? "left-[26px] bg-accent-secondary shadow-[0_0_14px_rgba(45,212,191,.65)]"
                  : "left-1 bg-grey"
              }`} />
            </button>
          </div>

          {onOpenStyleSheet && (
            <button
              type="button"
              onClick={onOpenStyleSheet}
              className="shrink-0 rounded-lg border border-accent-secondary/40 px-2.5 py-2 text-[9px] font-semibold uppercase tracking-[0.1em] text-accent-secondary hover:bg-accent-secondary/10 lg:px-3"
              data-open-character-style-sheet
            >
              <span className="hidden xl:inline">Style sheet</span>
              <span className="xl:hidden">Style</span>
            </button>
          )}
          {onExit && (
            <button
              type="button"
              onClick={onExit}
              className="shrink-0 rounded-lg bg-accent px-3 py-2 text-[9px] font-semibold uppercase tracking-[0.1em] text-paper hover:bg-accent-light sm:px-4"
            >
              <span className="hidden sm:inline">View actor</span>
              <span className="sm:hidden">Exit</span>
            </button>
          )}
        </div>

        {autoStudioRun && (
          <div className="grid grid-cols-6 gap-1 pb-1.5" aria-label="YOLO mode stage progress">
            {WORKFLOW_STEPS.map((step) => {
              const state = autoStudioRun.steps[step.id]?.state ?? "queued";
              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => jumpToStep(step.id)}
                  title={`${step.label}: ${autoStudioRun.steps[step.id]?.detail ?? state}`}
                  className={`h-1 rounded-full transition-colors ${
                    state === "complete"
                      ? "bg-emerald-400"
                      : state === "failed"
                        ? "bg-red-400"
                        : state === "writing" || state === "generating"
                          ? "animate-pulse bg-accent"
                          : "bg-white/10"
                  }`}
                  aria-label={`${step.label}: ${autoStudioRun.steps[step.id]?.detail ?? state}`}
                />
              );
            })}
          </div>
        )}
      </div>
      <div className="studio-production-grid lg:grid lg:grid-cols-[12rem_minmax(0,1fr)_22rem] xl:grid-cols-[13rem_minmax(0,1fr)_25rem]">
      <aside
        className="studio-production-rail border-b border-line bg-[#0a0f0c] px-3 py-3 lg:border-b-0 lg:border-r"
        data-production-task-rail
        data-lenis-prevent
        tabIndex={0}
        onWheel={scrollWorkspacePanel}
        onKeyDown={scrollWorkspacePanelWithKeyboard}
      >
        <div className="flex items-center justify-between px-1">
          <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-grey">Stages</span>
          <span className="text-[9px] font-semibold text-accent">{completedSteps.size}/{WORKFLOW_STEPS.length}</span>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-1.5 lg:grid-cols-1" aria-label="Production workflow steps">
          {WORKFLOW_STEPS.map((step) => {
            const isActive = step.id === activeStep;
            const isComplete = completedSteps.has(step.id);
            const autoStep = autoStudioRun?.steps[step.id];
            const isProcessing = processingStep === step.id || autoRunningSteps.has(step.id);
            const isFailed = autoStep?.state === "failed";
            const showsComplete = isComplete && !isProcessing;
            const isReview = reviewSteps.has(step.id) && !isProcessing && !showsComplete;
            const progress = progressForStep(step.id);
            const statusLabel = isFailed
              ? "Error"
              : isProcessing
                ? autoStep?.detail ?? `${progress}%`
                : showsComplete
                  ? "Ready"
                  : isReview
                    ? "Review"
                    : isActive
                      ? "Current"
                      : "Queued";
            return (
              <button
                key={step.id}
                type="button"
                onClick={() => jumpToStep(step.id)}
                className={`group min-w-0 rounded-md border px-2.5 py-2.5 text-left transition-all ${
                  isFailed
                    ? "border-red-500/45 bg-red-500/[0.07]"
                    : isProcessing
                      ? "border-accent bg-accent/10 shadow-[0_0_24px_rgba(242,78,112,.12)]"
                    : showsComplete
                      ? "border-emerald-400/30 bg-emerald-400/[0.055]"
                      : isReview
                        ? "border-accent-secondary/45 bg-accent-secondary/[0.06]"
                      : isActive
                        ? "border-accent/50 bg-accent/[0.055]"
                        : "border-transparent hover:border-line hover:bg-white/[0.03]"
                }`}
                aria-current={isActive ? "step" : undefined}
                aria-label={`${step.id}. ${step.title}, ${statusLabel}`}
                data-production-step-jump={step.stage}
                data-production-process={isFailed ? "failed" : showsComplete ? "complete" : isProcessing ? "running" : isReview ? "review" : isActive ? "current" : "queued"}
              >
                <span className="flex items-center gap-2">
                  <span className="relative flex h-8 w-8 shrink-0 items-center justify-center">
                    {!showsComplete && (
                      <span className={`absolute inset-0 rounded-full border ${
                        isFailed
                          ? "border-red-400/55 shadow-[0_0_14px_rgba(248,113,113,.2)]"
                          : isProcessing
                            ? "animate-spin border-accent/20 border-t-accent border-r-accent-secondary shadow-[0_0_16px_rgba(242,78,112,.32)] [animation-duration:.9s]"
                          : isReview
                            ? "animate-pulse border-accent-secondary/40 border-t-accent-secondary shadow-[0_0_14px_rgba(45,212,191,.25)]"
                          : isActive
                            ? "animate-spin border-accent/15 border-t-accent/75 [animation-duration:1.8s]"
                            : "animate-spin border-white/[0.07] border-t-accent-secondary/45 [animation-duration:3.4s]"
                      }`} />
                    )}
                    {showsComplete && (
                      <span className="absolute inset-0 rounded-full border border-emerald-300 bg-emerald-400/15 shadow-[0_0_16px_rgba(52,211,153,.48)]" />
                    )}
                    <span className={`relative text-[9px] font-bold ${
                      showsComplete ? "text-emerald-200" : isFailed ? "text-red-300" : isProcessing ? "text-white" : isReview ? "text-accent-secondary" : isActive ? "text-accent" : "text-grey"
                    }`}>
                      {showsComplete ? "✓" : isFailed ? "!" : step.id}
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-[9px] font-semibold uppercase tracking-[0.08em] ${
                      showsComplete ? "text-emerald-200" : isFailed ? "text-red-300" : isProcessing ? "text-ink" : isReview ? "text-accent-secondary" : isActive ? "text-accent" : "text-grey"
                    }`}>
                      {step.label}
                    </span>
                    <span className={`mt-0.5 block text-[8px] ${
                      showsComplete ? "text-emerald-400" : isFailed ? "text-red-300" : isProcessing ? "text-accent" : isReview ? "text-accent-secondary" : "text-grey/60"
                    }`} title={statusLabel}>
                      {statusLabel}
                    </span>
                  </span>
                </span>
                <span className="relative mt-2 block h-1 overflow-hidden rounded-full bg-white/[0.07]">
                  {showsComplete || isProcessing || isReview || isFailed ? (
                    <span
                      className={`block h-full rounded-full transition-[width] duration-700 ${
                        isFailed
                          ? "bg-red-400 shadow-[0_0_10px_rgba(248,113,113,.65)]"
                          : showsComplete
                          ? "bg-emerald-300 shadow-[0_0_10px_rgba(52,211,153,.9)]"
                          : isReview
                            ? "bg-accent-secondary shadow-[0_0_10px_rgba(45,212,191,.7)]"
                          : "bg-gradient-to-r from-accent to-accent-secondary shadow-[0_0_10px_rgba(242,78,112,.7)]"
                      }`}
                      style={{ width: `${progress}%` }}
                    />
                  ) : (
                    <span className="studio-queued-timeline absolute inset-y-0 w-1/3 rounded-full bg-gradient-to-r from-transparent via-accent-secondary/55 to-transparent" />
                  )}
                </span>
              </button>
            );
          })}
        </div>
        {activeStep > 1 && (
          <div className="mt-3 grid grid-cols-2 gap-1.5 border-t border-line pt-3 lg:grid-cols-1">
            <button
              type="button"
              onClick={() => jumpToStep(Math.max(1, activeStep - 1))}
              className="w-full rounded-md border border-line px-2 py-2 text-[9px] font-semibold text-grey transition-colors hover:border-accent hover:text-ink"
            >
              ← Back
            </button>
            {activeStep < WORKFLOW_STEPS.length ? (
              <button
                type="button"
                onClick={() => {
                  if (!activeStepComplete) {
                    setMessage(`Complete ${activeStepMeta.label.toLowerCase()} before moving to the next production stage.`);
                    return;
                  }
                  jumpToStep(activeStep + 1);
                }}
                aria-disabled={!activeStepComplete}
                className={`flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-[9px] font-semibold transition-colors ${
                  activeStepComplete
                    ? "bg-accent text-paper hover:bg-accent-light"
                    : "border border-line bg-white/[0.025] text-grey hover:border-accent/60 hover:text-ink"
                }`}
              >
                <span>{activeStepComplete ? "Next" : `Complete ${activeStepMeta.label}`}</span>
                <span aria-hidden="true">→</span>
              </button>
            ) : onExit ? (
              <button
                type="button"
                onClick={onExit}
                className="flex w-full items-center justify-between rounded-md bg-accent px-2 py-2 text-left text-[9px] font-semibold text-paper transition-colors hover:bg-accent-light"
              >
                <span>Finish</span>
                <span aria-hidden="true">→</span>
              </button>
            ) : null}
          </div>
        )}
      </aside>

      <div
        ref={workflowContentRef}
        className="studio-production-content flex flex-col gap-5 p-4 sm:p-5"
        data-lenis-prevent
        tabIndex={0}
        aria-label={`${activeStepMeta.label} production controls`}
        onWheel={scrollWorkspacePanel}
        onKeyDown={scrollWorkspacePanelWithKeyboard}
      >
        {seedModelsNeedActivation && (
          <div className="rounded-md border border-amber-500/60 bg-amber-500/10 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-amber-500">{pipelineModelLabel(configuredVideoModel)} needs account activation</p>
              <p className="text-xs text-grey mt-1">
                The API key is valid, but BytePlus is refusing video jobs until this model is enabled for the account. Image, voice, SFX, and CDN uploads remain operational.
              </p>
            </div>
            <a
              href={SEEDANCE_SETUP_URL}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 rounded-full border border-amber-500 px-4 py-2 text-xs font-semibold text-amber-500 hover:bg-amber-500/10"
            >
              Open Seedance setup ↗
            </a>
          </div>
        )}
        {seedreamLimitPaused && (
          <div className="rounded-md border border-red-500/60 bg-red-500/10 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-red-400">Dola Seedream 5 Pro is paused by BytePlus</p>
              <p className="text-xs text-grey mt-1">
                BytePlus accepted the API key but stopped this image model after the account reached its inference limit. GPT Image remains available for stills; Seedance remains separately available for video.
              </p>
            </div>
            <a
              href={SEEDANCE_SETUP_URL}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 rounded-full border border-red-400 px-4 py-2 text-xs font-semibold text-red-300 hover:bg-red-500/10"
            >
              Open ModelArk setup ↗
            </a>
          </div>
        )}
        {seedanceAccountPaused && (
          <div className="rounded-md border border-red-500/60 bg-red-500/10 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-red-400">Seedance is paused by BytePlus</p>
              <p className="text-xs text-grey mt-1">This account reached the model&apos;s inference limit or has Safe Experience Mode enabled. Your selected still is safe and ready—adjust the ModelArk account, then retry the same frame.</p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <a href={SEEDANCE_SETUP_URL} target="_blank" rel="noreferrer" className="rounded-full border border-red-400 px-4 py-2 text-xs font-semibold text-red-300 hover:bg-red-500/10">
                Open ModelArk setup ↗
              </a>
              <button type="button" onClick={retrySeedanceAfterActivation} className="rounded-full border border-teal-400 px-4 py-2 text-xs font-semibold text-teal-200 hover:bg-teal-400/10">
                I&apos;ve reactivated it — try again
              </button>
            </div>
          </div>
        )}
        <details className="rounded-md border border-line bg-paper/20" data-production-blueprint>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2">
            <span className="truncate text-[10px] font-semibold text-grey">Scene locks · {sceneBlueprint.sceneName}</span>
            <span className="text-sm text-accent">＋</span>
          </summary>
          <div className="border-t border-line px-4 py-4">
            <section data-production-bible>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">Actor locks</p>
              <dl className="mt-2 divide-y divide-line text-xs">
                {[
                  ["Want", productionBible.dramatic.externalWant],
                  ["Contradiction", productionBible.dramatic.contradiction],
                  ["Under pressure", productionBible.performance.underPressure],
                  ["Movement", productionBible.performance.movementStyle],
                  ["Face locks", productionBible.visual.faceAnchors.join("; ")],
                  ["Story hook", productionBible.story.hookPattern],
                ].map(([label, value]) => (
                  <div key={label} className="py-2.5 first:pt-0 last:pb-0">
                    <dt className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-grey">{label}</dt>
                    <dd className="leading-relaxed text-ink">{value}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section className="mt-5 border-t border-line pt-4" data-scene-blueprint>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">Current scene</p>
                <span className="rounded-full border border-accent/40 px-2 py-0.5 text-[9px] uppercase tracking-wide text-accent">{sceneBlueprint.sceneName}</span>
              </div>
              <dl className="mt-2 divide-y divide-line text-xs">
                {[
                  ["Hook", sceneBlueprint.hook],
                  ["Dramatic beat", sceneBlueprint.dramaticBeat],
                  ["Angle / lens", `${sceneBlueprint.cameraAngle}; ${sceneBlueprint.lens}`],
                  ["Camera path", sceneBlueprint.cameraMovement],
                  ["Key light", sceneBlueprint.keyLight],
                  ["Final frame", sceneBlueprint.finalFrame],
                ].map(([label, value]) => (
                  <div key={label} className="py-2.5 first:pt-0 last:pb-0">
                    <dt className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-grey">{label}</dt>
                    <dd className="leading-relaxed text-ink">{value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          </div>
        </details>
        <div className="flex items-center justify-between gap-4 border-b border-line pb-3">
          <h3 className="text-sm font-semibold">{activeStepMeta.label}</h3>
          <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-accent">Step {activeStepMeta.id}/{WORKFLOW_STEPS.length}</span>
        </div>
        <div className="grid gap-5">
          <div data-production-stage="voice" className={`overflow-hidden rounded-md border border-line ${activeStep === 1 ? "" : "hidden"}`}>
            <div className="relative border-b border-line bg-[radial-gradient(circle_at_top_right,rgba(53,210,190,0.12),transparent_42%),linear-gradient(145deg,rgba(244,72,112,0.08),transparent_55%)] p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-accent">Audition · performance reference</p>
                  <h3 className="mt-1 text-base font-semibold">{character.name}&apos;s voice</h3>
                </div>
                {lockedVoiceId && (
                  <span className="shrink-0 rounded-full border border-emerald-600/50 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wide text-emerald-600">
                    Voice locked
                  </span>
                )}
              </div>

              {voiceBuildStage === null && previews.length === 0 && (
                <button
                  type="button"
                  onClick={buildVoice}
                  disabled={!elevenReady || Boolean(busy)}
                  className="magic-action mt-5 flex w-full items-center justify-between rounded-md px-4 py-3 text-left disabled:translate-y-0 disabled:opacity-40"
                  data-intelligence-action
                  aria-busy={busy === "voice"}
                >
                  <span className="block text-sm font-semibold">✦ Generate 2–3 audition takes</span>
                  <span className="text-lg" aria-hidden="true">→</span>
                </button>
              )}

              {voiceBuildStage !== null && (
                <div className="mt-5 rounded-md border border-accent/35 bg-paper/75 p-4 backdrop-blur-sm" aria-live="polite">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{VOICE_BUILD_STAGES[voiceBuildStage].label}</p>
                      <p className="mt-0.5 text-[11px] text-grey">{VOICE_BUILD_STAGES[voiceBuildStage].detail}</p>
                    </div>
                    <span className="text-lg font-semibold text-accent">{VOICE_BUILD_STAGES[voiceBuildStage].progress}%</span>
                  </div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line">
                    <span
                      className="block h-full rounded-full bg-gradient-to-r from-accent to-accent-secondary transition-[width] duration-500"
                      style={{ width: `${VOICE_BUILD_STAGES[voiceBuildStage].progress}%` }}
                    />
                  </div>
                  <div className="mt-3 grid grid-cols-5 gap-1">
                    {VOICE_BUILD_STAGES.map((stage, index) => (
                      <span
                        key={stage.label}
                        className={`h-1 rounded-full transition-colors ${
                          index <= voiceBuildStage ? "bg-accent" : "bg-line"
                        }`}
                        aria-hidden="true"
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3 p-3 sm:p-4">
              <details className="rounded-sm border border-line bg-paper/35 px-3 py-2.5">
                <summary className="cursor-pointer list-none text-xs font-semibold text-grey hover:text-ink">
                  Fine-tune the voice direction
                </summary>
                <div className="mt-3 flex flex-col gap-3 border-t border-line pt-3">
                  <label className="flex flex-col gap-1.5">
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-[10px] uppercase tracking-wide text-grey">Performance direction</span>
                      <QuickWriteButton
                        field="voice-description"
                        busy={Boolean(busy) || Boolean(quickWriting)}
                        writing={quickWriting === "voice-description"}
                        label="Suggest"
                        onClick={() => void quickWrite("voice-description", voiceDescription, (value) => setVoiceDescription(value.slice(0, 1000)))}
                      />
                    </span>
                    <textarea value={voiceDescription} onChange={(event) => setVoiceDescription(event.target.value)} rows={4} className="resize-none rounded-sm border border-line bg-paper p-3 text-xs focus:border-accent focus:outline-none" />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-[10px] uppercase tracking-wide text-grey">Audition line</span>
                      <QuickWriteButton
                        field="voice-preview"
                        busy={Boolean(busy) || Boolean(quickWriting)}
                        writing={quickWriting === "voice-preview"}
                        label="Suggest"
                        onClick={() => void quickWrite("voice-preview", previewText, setPreviewText)}
                      />
                    </span>
                    <textarea value={previewText} onChange={(event) => setPreviewText(event.target.value)} rows={3} className="resize-none rounded-sm border border-line bg-paper p-3 text-xs focus:border-accent focus:outline-none" />
                  </label>
                  <button
                    type="button"
                    onClick={buildVoice}
                    disabled={!elevenReady || Boolean(busy)}
                    className="magic-action rounded-sm px-3 py-2 text-xs font-semibold disabled:opacity-40"
                    data-intelligence-action
                    aria-busy={busy === "voice"}
                  >
                    Rebuild all three takes
                  </button>
                </div>
              </details>

              {previews.length > 0 && (
                <div className="rounded-sm border border-accent-secondary/35 bg-accent-secondary/[0.05] px-3 py-2.5">
                  <p className="text-xs font-semibold">Audition takes are ready in Generated.</p>
                  <p className="mt-1 text-[10px] text-grey">Choose the performance reference that will travel with this actor into future scenes.</p>
                </div>
              )}
              {lockedVoiceId && (
                <div className="mt-1 rounded-md border border-accent/50 bg-accent/10 p-4" data-voice-ready>
                  <div className="flex items-start gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-secondary text-sm font-bold text-paper" aria-hidden="true">✓</span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">Voice is ready</p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-grey">
                        {character.name}&apos;s voice is locked and will stay consistent in every line.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => jumpToStep(2)}
                    className="mt-4 flex w-full items-center justify-between rounded-md bg-accent px-4 py-3 text-left text-sm font-semibold text-paper shadow-[0_10px_24px_rgba(244,72,112,0.18)] hover:opacity-90"
                  >
                    <span>Continue to dialogue</span>
                    <span aria-hidden="true">→</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          <div data-production-stage="dialogue" className={`border border-line rounded-md p-4 flex flex-col gap-3 ${activeStep === 2 ? "" : "hidden"}`}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold text-sm">2. Dialogue in the locked voice</h3>
              <QuickWriteButton
                field="dialogue"
                busy={Boolean(busy) || Boolean(quickWriting)}
                writing={quickWriting === "dialogue"}
                onClick={() => void quickWrite("dialogue", speechText, setSpeechText)}
              />
            </div>
            <textarea aria-label={`${character.name} spoken dialogue`} data-scene-field="dialogue" value={speechText} onChange={(event) => setSpeechText(event.target.value)} rows={5} className="bg-paper border border-line rounded-sm p-3 text-xs resize-none focus:outline-none focus:border-accent" />
            <button onClick={generateSpeech} disabled={Boolean(dialogueUnavailableReason) || Boolean(busy)} className="magic-action rounded-sm px-4 py-2 text-sm font-semibold disabled:opacity-40" data-intelligence-action aria-busy={busy === "speech"}>
              {busy === "speech" ? "Performing line..." : "Generate dialogue"}
            </button>
            {dialogueUnavailableReason && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-amber-500/35 bg-amber-500/[0.08] px-3 py-2">
                <p className="text-[10px] leading-relaxed text-amber-200">{dialogueUnavailableReason}</p>
                {!lockedVoiceId && status && elevenReady && (
                  <button type="button" onClick={() => jumpToStep(1)} className="text-[10px] font-semibold text-accent hover:underline">
                    Open Voice
                  </button>
                )}
              </div>
            )}
            <GenerationTimeline generationKey="speech" run={generationRun} />
            {lockedVoiceId && (
              <p className="text-[10px] uppercase tracking-[0.12em] text-emerald-600">
                Locked voice · {lockedVoiceId.slice(-6)} · continuity mode
              </p>
            )}
            {speechUrl && <p className="text-[10px] text-emerald-300">Dialogue take ready on the Asset Canvas.</p>}
          </div>
        </div>

        <div data-production-stage="sfx" className={`border border-line rounded-md p-4 flex flex-col gap-3 ${activeStep === 3 ? "" : "hidden"}`}>
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold text-sm">3. Signature SFX</h3>
            <QuickWriteButton
              field="sfx"
              busy={Boolean(busy) || Boolean(quickWriting)}
              writing={quickWriting === "sfx"}
              onClick={() => void quickWrite("sfx", sfxPrompt, setSfxPrompt)}
            />
          </div>
          <input data-scene-field="sfx" value={sfxPrompt} onChange={(event) => setSfxPrompt(event.target.value)} className="bg-paper border border-line rounded-sm p-3 text-xs focus:outline-none focus:border-accent" />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button onClick={generateSfx} disabled={!elevenReady || Boolean(busy)} className="magic-action rounded-sm px-4 py-2 text-sm font-semibold disabled:opacity-40" data-intelligence-action aria-busy={busy === "sfx"}>
              {busy === "sfx"
                ? `Building ${signatureSfxEventCount}-layer signature...`
                : `Build polished ${signatureSfxEventCount}-layer signature`}
            </button>
            <span className="text-[10px] uppercase tracking-[0.14em] text-grey">
              {signatureSfxEventCount} high-resolution Foley events · 5s mastered mix
            </span>
          </div>
          <GenerationTimeline generationKey="sfx" run={generationRun} />
          {(sfxCandidates.length > 0 || sfxUrl) && <p className="text-[10px] text-emerald-300">Signature sound ready on the Asset Canvas.</p>}
        </div>

        <div data-production-stage="theme" className={`border border-line rounded-md p-4 flex flex-col gap-3 ${activeStep === 4 ? "" : "hidden"}`}>
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold text-sm">4. Theme score</h3>
            {!themePlanEnabled && (
              <QuickWriteButton
                field="theme"
                busy={Boolean(busy) || Boolean(quickWriting)}
                writing={quickWriting === "theme"}
                onClick={() => void quickWrite("theme", themePrompt, setThemePrompt)}
              />
            )}
          </div>
          {themePlanEnabled ? (
            <>
              <div className="grid gap-2 sm:grid-cols-2">
                {([
                  ["ident_8s", "8s ident", "Hook + identity hit"],
                  ["scene_15s", "15s scene cue", "Establish + turn + payoff"],
                ] as const).map(([kind, label, description]) => (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => {
                      setThemeKind(kind);
                      setThemeDurationSeconds(kind === "scene_15s" ? 15 : 8);
                    }}
                    disabled={Boolean(busy)}
                    className={`rounded-sm border p-3 text-left transition disabled:opacity-40 ${
                      themeKind === kind ? "border-accent bg-accent/10" : "border-line bg-paper"
                    }`}
                  >
                    <span className="block text-xs font-semibold text-ink">{label}</span>
                    <span className="mt-1 block text-[10px] text-grey">{description}</span>
                  </button>
                ))}
              </div>
              <div className="overflow-hidden rounded-sm border border-line bg-black/20">
                <div className="flex items-center justify-between border-b border-line px-3 py-2">
                  <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-cyan-300">
                    Eleven Music composition plan
                  </span>
                  <span className="text-[9px] text-grey">
                    {themePlan.sections.reduce((total, section) => total + section.duration_ms, 0) / 1000}s exact
                  </span>
                </div>
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap p-3 text-[10px] leading-5 text-grey branded-scrollbar">
                  {JSON.stringify(themePlan, null, 2)}
                </pre>
              </div>
            </>
          ) : (
            <input data-scene-field="theme" value={themePrompt} onChange={(event) => setThemePrompt(event.target.value)} className="bg-paper border border-line rounded-sm p-3 text-xs focus:outline-none focus:border-accent" />
          )}
          <div className="flex flex-wrap items-center gap-3">
            {!themePlanEnabled && (
              <label className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-grey">
                Duration
                <select
                  value={themeDurationSeconds}
                  onChange={(event) => setThemeDurationSeconds(themeDurationPreset(event.target.value))}
                  disabled={Boolean(busy)}
                  className="rounded-sm border border-line bg-paper px-2 py-2 text-xs font-semibold text-ink outline-none focus:border-accent disabled:opacity-40"
                  aria-label="Theme duration"
                >
                  {THEME_DURATION_PRESETS.map((seconds) => (
                    <option key={seconds} value={seconds}>{seconds}s</option>
                  ))}
                </select>
              </label>
            )}
            <button onClick={() => generateTheme()} disabled={!elevenReady || Boolean(busy)} className="magic-action rounded-sm px-4 py-2 text-sm font-semibold disabled:opacity-40" data-intelligence-action aria-busy={busy === "theme"}>
              {busy === "theme"
                ? "Composing theme..."
                : themePlanEnabled
                  ? themeUrl
                    ? "Regenerate with plan v2"
                    : `Generate ${themeKind === "scene_15s" ? 15 : 8}-second plan`
                  : themeUrl
                    ? "Regenerate legacy prompt"
                    : `Generate ${themeDurationSeconds}-second theme`}
            </button>
          </div>
          {themeUrl && (
            <p className="text-[10px] leading-4 text-grey">
              Regeneration is manual. The current theme stays selected until you create and approve a replacement.
            </p>
          )}
          <GenerationTimeline generationKey="theme" run={generationRun} />
        </div>

        <div className="grid gap-5">
          <div data-production-stage="image" className={`border border-line rounded-md p-4 flex flex-col gap-3 ${activeStep === 5 ? "" : "hidden"}`}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold text-sm">5. Define the actor on screen</h3>
              <QuickWriteButton
                field={imagePurpose === "identity" ? "identity-image" : "image"}
                busy={Boolean(busy) || Boolean(quickWriting)}
                writing={quickWriting === (imagePurpose === "identity" ? "identity-image" : "image")}
                onClick={() => void quickWrite(imagePurpose === "identity" ? "identity-image" : "image", imagePrompt, setImagePrompt)}
              />
            </div>
            <div className="grid grid-cols-2 rounded-md border border-line p-1" data-image-purpose>
              <button
                type="button"
                onClick={() => chooseImagePurpose("identity")}
                className={`rounded-sm px-3 py-2 text-left ${imagePurpose === "identity" ? "bg-accent text-paper" : "text-grey hover:text-ink"}`}
                data-image-purpose-option="identity"
              >
                <span className="block text-xs font-semibold">Fresh Identity</span>
                <span className="block text-[10px] opacity-75">Cast without the old face</span>
              </button>
              <button
                type="button"
                onClick={() => chooseImagePurpose("scene")}
                disabled={!identityReferenceImage}
                className={`rounded-sm px-3 py-2 text-left disabled:cursor-not-allowed disabled:opacity-40 ${imagePurpose === "scene" ? "bg-accent text-paper" : "text-grey hover:text-ink"}`}
                data-image-purpose-option="scene"
              >
                <span className="block text-xs font-semibold">Scene Frame</span>
                <span className="block text-[10px] opacity-75">What happens next</span>
              </button>
            </div>
            {imagePurpose === "scene" && identityReferenceImage && (
              <div className="flex items-center gap-3 rounded-sm border border-accent/50 bg-accent/5 p-2" data-identity-reference>
                {/* eslint-disable-next-line @next/next/no-img-element -- generated and uploaded provider URLs are dynamic */}
                <img src={identityReferenceImage} alt={`${character.name} canonical identity seed`} className="h-14 w-20 shrink-0 rounded-sm object-cover" />
                <span className="min-w-0">
                  <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">Feed seed locked</span>
                  <span className="mt-1 block text-[10px] text-grey">Used as the actor&apos;s visual identity.</span>
                </span>
              </div>
            )}
            {imagePurpose === "identity" && (
              <div className="rounded-sm border border-cyan-400/35 bg-cyan-400/5 px-3 py-2" data-fresh-identity-mode>
                <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-300">Fresh casting · no seed image</span>
                <span className="mt-1 block text-[10px] leading-4 text-grey">
                  The current profile image is not sent to GPT Image, Nano Banana, or Seedream. It stays unchanged until you explicitly choose a new result.
                </span>
              </div>
            )}
            <textarea data-scene-field="image" value={imagePrompt} onChange={(event) => setImagePrompt(event.target.value)} rows={7} className="bg-paper border border-line rounded-sm p-3 text-xs resize-none focus:outline-none focus:border-accent" />
            <button onClick={() => generateImage()} disabled={!imageGenerationReady || Boolean(busy)} className="magic-action rounded-sm px-4 py-2 text-sm font-semibold disabled:opacity-40" data-intelligence-action aria-busy={busy === "image"}>
              {busy === "image"
                ? `Generating ${readyImageProviderLabels.length === 1 ? "image" : `${readyImageProviderLabels.length} images`}...`
                : imagePurpose === "identity"
                  ? readyImageProviderLabels.length > 1 ? `Cast fresh identities with ${imageProviderRunLabel}` : "Cast a fresh identity"
                  : readyImageProviderLabels.length > 1 ? `Generate ${imageProviderRunLabel} scene stills` : "Generate scene still"}
            </button>
            {imageUnavailableReason && <p role="status" className="text-[11px] leading-relaxed text-amber-300">{imageUnavailableReason}</p>}
            <GenerationTimeline
              generationKey="image"
              run={generationRun}
              providerLabel={imageProviderRunLabel || "Image provider"}
              previewUrl={imagePurpose === "scene" ? identityReferenceImage || undefined : undefined}
            />
            {(imageCandidates.length > 0 || Object.keys(imageProviderErrors).length > 0) && (
              <section className="hidden" data-image-comparison>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold">Same prompt, {readyImageProviderLabels.length} image {readyImageProviderLabels.length === 1 ? "model" : "models"}</p>
                  <p className="text-[10px] uppercase tracking-[0.12em] text-grey">Compare, then choose one</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-image-candidates>
                {imageCandidates.map((candidate) => {
                  const selected = selectedImageAssetId === candidate.assetId;
                  const providerLabel = imageProviderLabel(candidate.provider);
                  return (
                    <article key={candidate.assetId} className={`overflow-hidden rounded-sm border ${selected ? "border-accent bg-accent/5" : "border-line"}`} data-image-candidate={candidate.provider}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- generated provider URLs are dynamic */}
                      <img src={candidate.url} alt={`${character.name} ${providerLabel} candidate`} className="aspect-video w-full object-cover" />
                      <div className="flex items-center justify-between gap-3 p-3">
                        <div>
                          <p className="text-xs font-semibold">{providerLabel}</p>
                          <p className="mt-0.5 text-[10px] text-grey">{candidate.model}</p>
                          <p className="mt-1 text-[9px] text-grey">
                            {imagePurpose === "identity" ? "Fresh casting · no previous image" : "Same prompt · approved identity reference"}
                          </p>
                        </div>
                        <button type="button" onClick={() => selectImageCandidate(candidate)} disabled={Boolean(busy)} className={`rounded-full border px-3 py-1.5 text-[10px] font-semibold disabled:opacity-40 ${selected ? "border-emerald-400/60 text-emerald-300" : "border-accent/60 text-accent hover:bg-accent/10"}`}>
                          {busy === "image-select" && !selected ? "Choosing..." : selected ? "Chosen ✓" : imagePurpose === "identity" ? "Replace identity" : "Use for video"}
                        </button>
                      </div>
                    </article>
                  );
                })}
                {(["openai", "openrouter", "byteplus"] as const).map((provider) => {
                  const error = imageProviderErrors[provider];
                  if (!error) return null;
                  const providerLabel = imageProviderLabel(provider);
                  return (
                    <article key={`${provider}-error`} className="rounded-sm border border-red-400/40 bg-red-500/5 p-4">
                      <p className="text-xs font-semibold text-red-300">{providerLabel} needs attention</p>
                      <p className="mt-2 text-[10px] leading-relaxed text-grey">{error}</p>
                    </article>
                  );
                })}
                </div>
              </section>
            )}
            <div className="flex items-center gap-2">
              <span className="h-px bg-line flex-1" />
              <span className="text-[10px] uppercase tracking-wide text-grey">or use your own</span>
              <span className="h-px bg-line flex-1" />
            </div>
            <label className={`border border-dashed border-line hover:border-accent rounded-sm px-4 py-3 text-center text-xs cursor-pointer ${busy ? "pointer-events-none opacity-40" : ""}`}>
              {busy === "upload" ? "Uploading to CDN..." : "Upload PNG, JPEG, or WebP reference"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) uploadReferenceImage(file);
                  event.target.value = "";
                }}
              />
            </label>
            <GenerationTimeline generationKey="upload" run={generationRun} />
            {generatedImage && <p className="text-[10px] text-emerald-300">Selected image ready on the Asset Canvas.</p>}
          </div>

          <div
            data-production-stage="video"
            className={`border border-line rounded-md p-3 sm:p-4 ${activeStep === 6 ? "video-production-workspace" : "hidden"}`}
          >
            <div className="flex items-center justify-between gap-2 xl:col-span-2">
              <h3 className="font-semibold text-sm">6. Animate a five-second scene</h3>
              <span className="text-[9px] uppercase tracking-[0.12em] text-grey">Seed + motion</span>
            </div>
            <section className="min-w-0 rounded-md border border-line bg-black/15 p-3" data-video-seed-picker>
                <div className="mb-2.5 flex items-end justify-between gap-3">
                  <span>
                    <span className="block text-xs font-semibold">Choose the seed image</span>
                    <span className="mt-0.5 block text-[10px] text-grey">Choose a small reference, then inspect the exact first frame beside it.</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => jumpToStep(5)}
                    className="shrink-0 text-[10px] font-semibold text-accent hover:underline"
                  >
                    Create another still →
                  </button>
                </div>
                <div className="video-seed-workspace">
                  {videoSeedOptions.length > 0 && (
                  <div className="video-seed-workspace__rail branded-scrollbar" data-lenis-prevent>
                      {videoSeedOptions.map((seed) => {
                        const selected = selectedVideoSeedId
                          ? selectedVideoSeedId === seed.id
                          : videoReferenceImage === seed.url;
                        return (
                          <button
                            key={seed.id}
                            type="button"
                            onClick={() => void selectVideoSeed(seed)}
                            disabled={Boolean(selectingAsset) || Boolean(busy)}
                            className={`group relative overflow-hidden rounded-sm border text-left transition-colors disabled:opacity-45 ${
                              selected
                                ? "border-accent shadow-[0_0_0_1px_rgba(242,78,112,.4)]"
                                : "border-line hover:border-accent/55"
                            }`}
                            aria-pressed={selected}
                            data-video-seed={seed.id}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element -- generated CDN URLs are dynamic */}
                            <img src={seed.url} alt={seed.label} className="aspect-video w-full object-cover" />
                            <span className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black via-black/85 to-transparent px-2 pb-1.5 pt-5">
                              <span className="truncate text-[9px] font-semibold text-white">{seed.label}</span>
                              <span className={`shrink-0 text-[8px] font-semibold uppercase tracking-[0.1em] ${selected ? "text-accent" : "text-white/55"}`}>
                                {selectingAsset === seed.id ? "Selecting" : selected ? "Selected" : "Use"}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                  </div>
                  )}

                  <div className="min-w-0">
                    {videoReferenceImage ? (
                      <div className="relative mx-auto w-full overflow-hidden rounded-sm border border-line bg-black/30" data-video-reference>
                        {/* eslint-disable-next-line @next/next/no-img-element -- generated and uploaded provider URLs are dynamic */}
                        <img src={videoReferenceImage} alt="Selected exact first frame" className="video-seed-workspace__preview w-full object-contain" />
                        <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-1 text-[9px] uppercase tracking-wide text-white">Exact first frame</span>
                      </div>
                    ) : (
                      <div className="video-seed-workspace__preview grid w-full place-items-center rounded-sm border border-dashed border-line bg-black/20 px-4 text-center text-[10px] text-grey">
                        Choose a thumbnail to preview the exact first frame.
                      </div>
                    )}
                  </div>
                </div>
              </section>

            <aside className="video-motion-panel rounded-md border border-line bg-paper/30 p-3" data-video-motion-panel>
            <div className="flex items-center justify-between gap-2">
              <span>
                <span className="block text-[10px] font-semibold text-ink">Motion direction</span>
                <span className="mt-0.5 block text-[9px] text-grey">The selected first frame remains locked.</span>
              </span>
              <QuickWriteButton
                field="video"
                busy={Boolean(busy) || Boolean(quickWriting)}
                writing={quickWriting === "video"}
                onClick={() => void quickWrite("video", scenePrompt, setScenePrompt)}
                label={generatedVideo || character.videoUrl ? "Rewrite" : "Quick Write"}
              />
            </div>
            <textarea data-scene-field="video" value={scenePrompt} onChange={(event) => setScenePrompt(event.target.value)} rows={8} className="min-h-32 bg-paper border border-line rounded-sm p-3 text-xs resize-none focus:outline-none focus:border-accent" />
            <button onClick={generateVideo} disabled={!seedModelsReady || !videoReferenceImage || Boolean(busy)} className="magic-action rounded-sm px-4 py-2 text-sm font-semibold disabled:opacity-40" data-intelligence-action aria-busy={busy === "video"}>
              {seedanceAccountPaused ? "Seedance paused by BytePlus" : busy === "video" ? "Seedance is rendering..." : "Generate 5-second video"}
            </button>
            {videoUnavailableReason && (
              <div role="status" className="rounded-sm border border-amber-400/30 bg-amber-400/5 px-3 py-2 text-[11px] leading-relaxed text-amber-200">
                <p>{videoUnavailableReason}</p>
                {!videoReferenceImage && (
                  <button type="button" onClick={() => jumpToStep(5)} className="mt-2 rounded-full border border-amber-300/50 px-3 py-1.5 text-[10px] font-semibold text-amber-100 hover:bg-amber-300/10">
                    Go to still generation →
                  </button>
                )}
                {seedanceAccountPaused && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <a href={SEEDANCE_SETUP_URL} target="_blank" rel="noreferrer" className="inline-flex rounded-full border border-amber-300/50 px-3 py-1.5 text-[10px] font-semibold text-amber-100 hover:bg-amber-300/10">
                      Open ModelArk setup ↗
                    </a>
                    <button type="button" onClick={retrySeedanceAfterActivation} className="inline-flex rounded-full border border-teal-300/50 px-3 py-1.5 text-[10px] font-semibold text-teal-100 hover:bg-teal-300/10">
                      I&apos;ve reactivated it — try again
                    </button>
                  </div>
                )}
              </div>
            )}
            <GenerationTimeline generationKey="video" run={generationRun} />
            {(generatedVideo || character.videoUrl) && <p className="text-[10px] text-emerald-300">Video ready on the Asset Canvas.</p>}
            </aside>
          </div>
        </div>

        <details id="generated-scene-log" data-generation-history className="hidden">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold hover:bg-white/[0.03]">Generated Scene Log · {assetHistory.length} saved assets</summary>
          <div className="px-4 py-3 border-b border-line flex flex-wrap items-center justify-between gap-2 bg-white/[0.02]">
            <div>
              <h3 className="font-semibold text-sm">Generated Scene Log</h3>
              <p className="text-[11px] text-grey mt-0.5">Persistent outputs from Supabase. Replay any take or reopen its original prompt.</p>
            </div>
            <span className="text-[10px] uppercase tracking-wide text-grey">{assetHistory.length} saved assets</span>
          </div>
          {assetHistory.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-grey">Generated dialogue, sounds, stills, and videos will appear here.</p>
          ) : (
            <div className="grid md:grid-cols-2 gap-3 p-3">
              {assetHistory.slice(0, 12).map((asset) => {
                const label = asset.kind === "dialogue"
                  ? "Dialogue take"
                  : asset.kind === "sfx"
                    ? "Signature SFX"
                    : asset.kind === "theme"
                      ? "Theme score"
                      : asset.kind === "video"
                        ? "Generated scene"
                        : "Scene still";
                const profileOption: { slot: ProfileSlot; label: string } | null = asset.kind === "dialogue"
                  ? { slot: "voice", label: "Use as main profile voice" }
                  : asset.kind === "theme"
                    ? { slot: "theme", label: "Use as profile theme" }
                    : asset.kind === "video"
                      ? { slot: "video", label: "Use as hero video" }
                      : ["gallery", "avatar", "banner"].includes(asset.kind)
                        ? { slot: "cover", label: "Use as hero cover" }
                        : null;
                const featuredIds = status?.production?.featured;
                const selectedAssetId = profileOption?.slot === "voice"
                  ? featuredIds?.voiceAssetId
                  : profileOption?.slot === "theme"
                    ? featuredIds?.themeAssetId
                    : profileOption?.slot === "video"
                      ? featuredIds?.videoAssetId
                      : profileOption?.slot === "cover"
                        ? featuredIds?.coverAssetId
                        : null;
                const isFeatured = selectedAssetId === asset.id;
                return (
                  <article key={asset.id} className={`rounded-md border bg-black/10 p-3 min-w-0 ${isFeatured ? "border-accent shadow-[0_0_0_1px_rgba(244,72,112,0.35)]" : "border-line"}`} data-media-asset={asset.kind} data-featured={isFeatured ? "true" : "false"}>
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold">{label}</p>
                        <p className="text-[10px] text-grey mt-0.5 truncate">
                          {asset.provider} · {new Date(asset.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                        </p>
                      </div>
                      <a href={asset.url} target="_blank" rel="noreferrer" className="text-[10px] text-accent hover:underline whitespace-nowrap">CDN ↗</a>
                    </div>
                    {asset.kind === "video" ? (
                      <MediaPlayer src={asset.url} label={label} kind="video" compact />
                    ) : ["dialogue", "sfx", "theme"].includes(asset.kind) ? (
                      <MediaPlayer src={asset.url} label={label} compact />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element -- generated CDN URLs are dynamic
                      <img src={asset.url} alt={`${character.name} generated still`} loading="lazy" className="w-full aspect-video object-cover rounded-sm border border-line" />
                    )}
                    {profileOption && (
                      <details className="relative mt-3" data-profile-media-menu>
                        <summary className="cursor-pointer list-none rounded-sm border border-accent/60 px-3 py-2 text-center text-[11px] font-semibold text-accent hover:bg-accent/10">
                          {isFeatured ? "On profile" : "Set as..."}
                        </summary>
                        <div className="mt-2 rounded-sm border border-line bg-paper p-2 shadow-xl">
                          <button
                            type="button"
                            onClick={() => void selectProfileMedia(asset, profileOption.slot)}
                            disabled={isFeatured || Boolean(selectingAsset)}
                            className="w-full rounded-sm bg-accent px-3 py-2 text-left text-xs font-semibold text-paper disabled:opacity-50"
                            data-select-profile-slot={profileOption.slot}
                          >
                            {selectingAsset === asset.id ? "Selecting..." : profileOption.label}
                          </button>
                          <p className="mt-2 px-1 text-[10px] leading-relaxed text-grey">
                            This becomes the default {profileOption.slot} shown on the public actor profile and connected hero surfaces.
                          </p>
                        </div>
                      </details>
                    )}
                    {asset.prompt && (
                      <details className="mt-3 border-t border-line pt-2">
                        <summary className="cursor-pointer text-[10px] uppercase tracking-wide text-grey hover:text-accent">Original prompt</summary>
                        <p className="text-[11px] leading-relaxed mt-2 text-grey break-words">{asset.prompt}</p>
                      </details>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </details>

        <section
          className="overflow-hidden rounded-md border border-line bg-[#090d0b] lg:hidden"
          data-mobile-asset-tray
          aria-live="polite"
        >
          <div className="flex items-center justify-between gap-3 border-b border-line bg-black/20 px-3 py-3">
            <span className="min-w-0">
              <span className="block text-[9px] font-semibold uppercase tracking-[0.18em] text-accent">Generated</span>
              <span className="mt-0.5 block truncate text-xs font-semibold">{activeStepMeta.label} preview</span>
            </span>
            <span className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9px] font-semibold ${
              activeStepRunning
                ? "border-accent/50 text-accent"
                : activeStepHasOutput
                  ? "border-emerald-400/40 text-emerald-300"
                  : "border-line text-grey"
            }`}>
              <span className={`h-1.5 w-1.5 rounded-full ${activeStepRunning ? "animate-pulse bg-accent" : activeStepHasOutput ? "bg-emerald-300" : "bg-grey/40"}`} />
              {activeStepRunning ? "Generating" : activeStepHasOutput ? "Ready" : "Waiting"}
            </span>
          </div>
          <div className="p-3">
            {(activeStepRunning || !activeStepHasOutput) && (
              activeStep === 5 && imagePurpose === "identity" && !activeStepRunning
                ? <FreshIdentityCanvasEmpty />
                : <AssetCanvasSkeleton stepId={activeStep} running={activeStepRunning} progress={activeStepProgress} />
            )}
            {activeStepHasOutput && (
              <div className={activeStepRunning ? "mt-3" : ""}>
                {renderActiveAssetPreview()}
              </div>
            )}
            {activeStep === 5 && Object.keys(imageProviderErrors).length > 0 && (
              <div className="mt-3 space-y-2">
                {Object.entries(imageProviderErrors).map(([provider, error]) => error ? (
                  <div key={provider} className="rounded-sm border border-red-400/35 bg-red-500/[0.05] px-3 py-2">
                    <p className="text-[10px] font-semibold text-red-300">{imageProviderLabel(provider as ImageProviderKey)} needs attention</p>
                    <p className="mt-1 text-[9px] leading-relaxed text-grey">{error}</p>
                  </div>
                ) : null)}
              </div>
            )}
          </div>
        </section>

        {message && (
          <div className={`flex flex-wrap items-center justify-between gap-3 rounded-sm px-3 py-2 text-xs ${message.toLowerCase().includes("failed") || message.includes("not configured") || /custom-voice limit/i.test(message) ? "bg-red-500/10 text-red-500" : "bg-accent/10 text-ink"}`}>
            <p>{message}</p>
            {/custom-voice limit|maximum amount of custom voices/i.test(message) && (
              <VoiceCapacityRecovery
                characterId={character.id}
                onDeleted={(result) => setMessage(result)}
                onContinue={buildVoice}
              />
            )}
          </div>
        )}
      </div>
      <aside
        className="studio-asset-panel hidden border-l border-line bg-[#090d0b] lg:flex lg:flex-col"
        data-asset-tray
        data-lenis-prevent
        tabIndex={0}
        onWheel={scrollWorkspacePanel}
        onKeyDown={scrollWorkspacePanelWithKeyboard}
      >
        <div className="sticky top-0 z-10 border-b border-line bg-[#090d0b]/95 px-4 py-3 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${activeStepRunning ? "border-accent/70 bg-accent/10 text-accent" : "border-accent-secondary/40 bg-accent-secondary/[0.07] text-accent-secondary"}`}>
                <span className="text-xs">◫</span>
                {activeStepRunning && <span className="absolute inset-[-4px] animate-spin rounded-full border border-transparent border-t-accent [animation-duration:1.2s]" />}
              </span>
              <span className="min-w-0">
                <span className="block text-[9px] font-semibold uppercase tracking-[0.18em] text-accent">Asset Canvas</span>
                <span className="mt-0.5 block truncate text-[11px] font-semibold">{activeStepMeta.label} preview</span>
              </span>
            </div>
            <span className="shrink-0 rounded-full border border-line px-2 py-1 text-[9px] font-semibold text-grey">
              {assetHistory.length + previews.length + sfxCandidates.length + imageCandidates.length} assets
            </span>
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-grey">
            New outputs appear here first. The placeholder becomes the finished asset without moving the canvas.
          </p>
        </div>

        <div className="space-y-5 p-4">
          <section data-asset-canvas-live>
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-grey">Live stage</p>
              <span className={`flex items-center gap-1.5 text-[9px] font-semibold ${activeStepRunning ? "text-accent" : activeStepHasOutput ? "text-emerald-300" : "text-grey"}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${activeStepRunning ? "animate-pulse bg-accent" : activeStepHasOutput ? "bg-emerald-300" : "bg-grey/40"}`} />
                {activeStepRunning ? "Generating" : activeStepHasOutput ? "Ready" : "Waiting"}
              </span>
            </div>
            {(activeStepRunning || !activeStepHasOutput) && (
              activeStep === 5 && imagePurpose === "identity" && !activeStepRunning
                ? <FreshIdentityCanvasEmpty />
                : <AssetCanvasSkeleton stepId={activeStep} running={activeStepRunning} progress={activeStepProgress} />
            )}
            {activeStepHasOutput && (
              <div className={activeStepRunning ? "mt-3" : ""}>
                {renderActiveAssetPreview()}
              </div>
            )}
            {activeStep === 5 && Object.keys(imageProviderErrors).length > 0 && (
              <div className="mt-3 space-y-2">
                {Object.entries(imageProviderErrors).map(([provider, error]) => error ? (
                  <div key={provider} className="rounded-sm border border-red-400/35 bg-red-500/[0.05] px-3 py-2">
                    <p className="text-[10px] font-semibold text-red-300">{imageProviderLabel(provider as ImageProviderKey)} needs attention</p>
                    <p className="mt-1 text-[9px] leading-relaxed text-grey">{error}</p>
                  </div>
                ) : null)}
              </div>
            )}
          </section>

          <section className="border-t border-line pt-4" data-asset-canvas-history>
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-grey">Recent outputs</p>
              <span className="text-[9px] text-grey">{assetHistory.length} saved</span>
            </div>
            {assetHistory.length === 0 ? (
              <p className="rounded-md border border-dashed border-line px-4 py-8 text-center text-[10px] leading-relaxed text-grey">
                Finished dialogue, sound, image, and video assets will collect here.
              </p>
            ) : (
              <div className="space-y-3">
                {assetHistory.slice(0, 8).map((asset) => {
                  const profileOption: { slot: ProfileSlot; label: string } | null = asset.kind === "dialogue"
                    ? { slot: "voice", label: "Use as profile voice" }
                    : asset.kind === "theme"
                      ? { slot: "theme", label: "Use as profile theme" }
                      : asset.kind === "video"
                        ? { slot: "video", label: "Use as hero video" }
                        : ["gallery", "avatar", "banner"].includes(asset.kind)
                          ? { slot: "cover", label: "Use as hero cover" }
                          : null;
                  const featured = status?.production?.featured;
                  const selectedAssetId = profileOption?.slot === "voice"
                    ? featured?.voiceAssetId
                    : profileOption?.slot === "theme"
                      ? featured?.themeAssetId
                      : profileOption?.slot === "video"
                        ? featured?.videoAssetId
                        : profileOption?.slot === "cover"
                          ? featured?.coverAssetId
                          : null;
                  const isFeatured = selectedAssetId === asset.id;
                  return (
                    <article key={asset.id} className={`overflow-hidden rounded-md border bg-black/15 ${isFeatured ? "border-emerald-400/40" : "border-line"}`} data-asset-canvas-history-item={asset.kind}>
                      <div className="flex items-center justify-between gap-3 px-3 py-2.5">
                        <span className="min-w-0">
                          <span className="block truncate text-[10px] font-semibold">{assetKindLabel(asset.kind)}</span>
                          <span className="mt-0.5 block truncate text-[9px] text-grey">{asset.provider}</span>
                        </span>
                        <a href={asset.url} target="_blank" rel="noreferrer" className="shrink-0 text-[9px] font-semibold text-accent hover:underline">Open ↗</a>
                      </div>
                      <div className="border-t border-line p-2.5">
                        {asset.kind === "video" ? (
                          <MediaPlayer src={asset.url} label={assetKindLabel(asset.kind)} kind="video" compact />
                        ) : ["dialogue", "sfx", "theme"].includes(asset.kind) ? (
                          <MediaPlayer src={asset.url} label={assetKindLabel(asset.kind)} compact />
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element -- generated CDN URLs are dynamic
                          <img src={asset.url} alt={`${character.name} ${assetKindLabel(asset.kind)}`} loading="lazy" className="aspect-video w-full rounded-sm object-cover" />
                        )}
                        {profileOption && (
                          <button
                            type="button"
                            onClick={() => void selectProfileMedia(asset, profileOption.slot)}
                            disabled={isFeatured || Boolean(selectingAsset)}
                            className={`mt-2.5 w-full rounded-sm border px-3 py-2 text-[9px] font-semibold disabled:opacity-50 ${isFeatured ? "border-emerald-400/45 text-emerald-300" : "border-accent/55 text-accent hover:bg-accent/10"}`}
                          >
                            {selectingAsset === asset.id ? "Selecting…" : isFeatured ? "On profile ✓" : profileOption.label}
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </aside>
      </div>
    </section>
  );
}
