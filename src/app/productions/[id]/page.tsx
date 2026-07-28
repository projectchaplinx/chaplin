"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import Avatar from "@/components/Avatar";
import SceneStudioAssets from "@/components/studio/SceneStudioAssets";
import SceneStudioRail, { type SceneStage } from "@/components/studio/SceneStudioRail";
import StudioWorkspaceHeader from "@/components/studio/StudioWorkspaceHeader";
import { useChaplinStore } from "@/lib/store";
import { castForStory, getStory } from "@/lib/selectors";
import {
  absentCastNegative,
  resolveSceneActors,
  sceneActorIdentity,
  sceneActorNames,
} from "@/lib/scene-cast";
import {
  PRODUCTION_FORMATS,
  normalizeProductionFormat,
  productionShotCount,
} from "@/lib/production-formats";
import type {
  MediaPipelineRun,
  MediaPipelineStep,
  PipelineScope,
  PipelineStepAction,
} from "@/lib/media-pipeline-types";
import {
  buildShotImagePrompt,
  buildShotVideoPrompt,
  cameraPlanForShot,
  validateShotSequence,
} from "@/lib/shot-director";
import { solveDirectionDurations } from "@/lib/direction-safety";

type ShotRenderStatus = "queued" | "designing" | "frame_ready" | "animating" | "ready" | "failed";

type ShotRenderState = {
  frameUrl?: string;
  frameAssetId?: string;
  videoUrl?: string;
  videoAssetId?: string;
  dialogueUrl?: string;
  dialogueAssetId?: string;
  sfxUrl?: string;
  sfxAssetId?: string;
  status: ShotRenderStatus;
  error?: string;
};

type VoiceCapacityCandidate = {
  voiceId: string;
  name: string;
  characterId: string | null;
  createdAtUnix: number | null;
};

/*
  Every scene in a production is independent - its own frame, its own sound, its
  own motion - yet each stage used to wait for the previous scene to finish. On
  the DOLA image model a still takes about 160 seconds, so four serial frames
  cost over ten minutes before the first video could even start. Running the
  scenes together costs roughly the slowest one instead of the sum of all four.

  The cap keeps a twelve-shot episode from firing twelve provider calls at once,
  which is what turns a burst into a throttle.
*/
/*
  A provider hiccup used to cost one scene. Now that scenes render together it
  costs the whole batch: three sibling videos are already in flight when a
  fourth fails, and aborting discards all of them. So a transient failure is
  retried rather than surfaced.

  Only transient failures. A safety rejection or an unactivated model returns
  the same answer however many times it is asked, so retrying one would just
  spend the creator's time and money to arrive at the same refusal.
*/
const TRANSIENT_PROVIDER_FAILURE = /\b(429|500|502|503|504)\b|inference limit|rate limit|timed out|interrupted before the provider/i;

async function withSceneRetry<T>(attempt: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let tryIndex = 0; tryIndex < attempts; tryIndex += 1) {
    try {
      return await attempt();
    } catch (error) {
      lastError = error;
      const detail = error instanceof Error ? error.message : "";
      if (!TRANSIENT_PROVIDER_FAILURE.test(detail) || tryIndex === attempts - 1) throw error;
      // Backing off matters most for an inference limit, where every concurrent
      // scene is being refused at once and retrying in step would refuse again.
      await new Promise((resolve) => { window.setTimeout(resolve, 2000 * (tryIndex + 1) * (1 + tryIndex)); });
    }
  }
  throw lastError;
}

const SCENE_CONCURRENCY = 4;

async function mapScenes<T>(count: number, task: (index: number) => Promise<T>): Promise<T[]> {
  const results = new Array<T>(count) as T[];
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(SCENE_CONCURRENCY, count) }, async () => {
      for (let index = cursor; index < count; index = cursor) {
        cursor += 1;
        results[index] = await task(index);
      }
    }),
  );
  return results;
}

function stepTone(status: string) {
  if (status === "ready") return "border-accent-secondary text-accent-secondary";
  if (status === "running") return "border-accent text-accent";
  if (status === "queued") return "border-accent-secondary/70 text-accent-secondary";
  if (status === "succeeded" || status === "approved") return "border-emerald-400 text-emerald-300";
  if (status === "needs_review") return "border-amber-300 text-amber-200";
  if (status === "failed") return "border-red-400 text-red-300";
  return "border-white/10 text-grey";
}

const LIVE_STEP_COPY: Record<string, string> = {
  "plan-lock": "Chaplin is checking the script, cast, duration, and shot requirements before generation begins.",
  "reference-frame": "Seedream is composing the actor, performance, camera, set, and motivated light into the first frame.",
  "reference-review": "The generated identity frame is ready for a human check of face, wardrobe, composition, and continuity.",
  "motion-plate": "Seedance is preserving the approved first frame while synchronizing performance to the locked voice and visible action.",
  dialogue: "ElevenLabs is performing the approved dialogue with the actor's locked voice identity.",
  sfx: "ElevenLabs is creating the scene's short physical sound effects.",
  "room-tone": "ElevenLabs is building the location's clean ambient room tone.",
  "shot-mix": "FFmpeg is aligning picture, dialogue, effects, and room tone into one playable shot.",
  "technical-qc": "Chaplin is checking duration, streams, sync, dimensions, and delivery readiness.",
  "creative-review": "The final shot is waiting for a human creative approval.",
};

const AUTOMATED_SHOT_STEPS = new Set([
  "motion-plate",
  "dialogue",
  "sfx",
  "room-tone",
  "shot-mix",
  "technical-qc",
  "creative-review",
]);

const OUTPUT_REQUIRED_STEPS = new Set([
  "shot-packages",
  "assembly",
  "mastering",
  "reference-frame",
  "motion-plate",
  "dialogue",
  "sfx",
  "room-tone",
  "shot-mix",
]);

function stepHasAttachedOutput(step: MediaPipelineStep) {
  return Boolean(
    step.outputAssetId
    || (typeof step.output.url === "string" && step.output.url.length > 0)
    || Object.keys(step.output).length > 0
  );
}

function liveStepCopy(step: MediaPipelineStep) {
  return LIVE_STEP_COPY[step.key] ?? `${step.executor} is working on ${step.label.toLowerCase()}.`;
}

function elapsedLabel(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

/**
 * A step is worth another attempt when the failure is transient: a provider
 * timeout, a rate limit, a 5xx, a dropped connection. Configuration and
 * validation failures are not - retrying those just burns the budget and the
 * creator's money on the same rejection.
 */
function isRetryableStepError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/not configured|is required|must be|invalid|paused by Super Admin|no longer exists/i.test(message)) return false;
  return /timed out|timeout|rate limit|429|50\d|temporarily|unavailable|network|fetch failed|ECONN|socket hang up|did not return/i.test(message);
}

/**
 * The production workspace.
 *
 * Rendering used to be reachable only by navigating to its own page, so
 * starting a production meant leaving the Scene Studio and scrolling a separate
 * screen to watch it. The story id is a prop now, which lets the studio host
 * this same workspace inline - one surface, no page change - while the route
 * below keeps working for a direct link.
 */
export function ProductionWorkspace({
  storyId,
  embedded = false,
  autoStart = false,
  autoRender = false,
  canvasOnly = false,
  onFrameUrlsChange,
}: {
  storyId: string;
  embedded?: boolean;
  autoStart?: boolean;
  autoRender?: boolean;
  canvasOnly?: boolean;
  onFrameUrlsChange?: (urls: string[]) => void;
}) {
  const id = storyId;
  const world = useChaplinStore((state) => state);
  const hydrated = useChaplinStore((state) => state.hydrated);
  const story = getStory(world, id);
  const cast = useMemo(
    () => story ? castForStory(world, story.id).map((item) => item.character) : [],
    [story, world],
  );
  const [run, setRun] = useState<MediaPipelineRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [voiceRecoveryOpen, setVoiceRecoveryOpen] = useState(false);
  const [voiceRecoveryBusy, setVoiceRecoveryBusy] = useState(false);
  const [voiceRecoveryCandidates, setVoiceRecoveryCandidates] = useState<VoiceCapacityCandidate[]>([]);
  const [selectedRecoveryVoiceId, setSelectedRecoveryVoiceId] = useState("");
  const [voiceRecoveryMessage, setVoiceRecoveryMessage] = useState("");
  const [renderProgress, setRenderProgress] = useState("");
  const [renderFrameUrl, setRenderFrameUrl] = useState<string | null>(null);
  const [renderShots, setRenderShots] = useState<ShotRenderState[]>([]);
  const [selectedShotIndex, setSelectedShotIndex] = useState(0);
  const [clock, setClock] = useState(() => Date.now());
  const autoInitializeRef = useRef(false);
  const autoRenderRef = useRef(false);
  const referenceStep = run?.steps.find((step) => step.key === "reference-frame");
  const referenceImageUrl = typeof referenceStep?.output.url === "string"
    ? referenceStep.output.url
    : null;
  const finalVideoStep = run
    ? [...run.steps].reverse().find((step) => (
      ["mastering", "assembly", "shot-mix"].includes(step.key)
      && typeof step.output.url === "string"
    ))
    : undefined;
  const finalVideoUrl = typeof finalVideoStep?.output.url === "string"
    ? finalVideoStep.output.url
    : null;
  const shotPackageStep = run?.steps.find((step) => step.key === "shot-packages");
  const { persistedShotUrls, persistedFrameUrls } = useMemo(() => {
    const shotSource = Array.isArray(finalVideoStep?.output.shotUrls) && finalVideoStep.output.shotUrls.length > 0
      ? finalVideoStep.output.shotUrls
      : shotPackageStep?.output.shotUrls;
    const frameSource = Array.isArray(finalVideoStep?.output.frameUrls) && finalVideoStep.output.frameUrls.length > 0
      ? finalVideoStep.output.frameUrls
      : shotPackageStep?.output.frameUrls;
    return {
      persistedShotUrls: Array.isArray(shotSource)
        ? shotSource.filter((value): value is string => typeof value === "string")
        : [],
      persistedFrameUrls: Array.isArray(frameSource)
        ? frameSource.filter((value): value is string => typeof value === "string")
        : [],
    };
  }, [finalVideoStep, shotPackageStep]);
  const motionPreviewStep = run
    ? [...run.steps].reverse().find((step) => (
      ["motion-plate", "shot-mix", "assembly", "mastering"].includes(step.key)
      && typeof step.output.url === "string"
    ))
    : undefined;
  const previewVideoUrl = busy && renderFrameUrl
    ? null
    : finalVideoUrl
      ?? (typeof motionPreviewStep?.output.url === "string" ? motionPreviewStep.output.url : null);
  const castPreviewImageUrl = cast[0]?.imageUrl
    ?? cast[0]?.galleryUrls?.[0]
    ?? cast[0]?.bannerUrl
    ?? null;
  const previewImageUrl = renderFrameUrl ?? referenceImageUrl ?? castPreviewImageUrl;
  const completedStepCount = run?.steps.filter((step) => {
    if (!["succeeded", "approved", "skipped"].includes(step.status)) return false;
    if (!OUTPUT_REQUIRED_STEPS.has(step.key)) return true;
    return stepHasAttachedOutput(step);
  }).length ?? 0;
  const pipelineProgress = run?.steps.length
    ? Math.round((completedStepCount / run.steps.length) * 100)
    : 0;
  const mediaProgress = finalVideoUrl
    ? 100
    : previewVideoUrl
      ? 75
      : referenceImageUrl
        ? 25
        : renderFrameUrl
          ? 15
          : 0;
  const autoStepRef = useRef("");
  const liveStep = run?.steps.find((step) => step.status === "running")
    ?? run?.steps.find((step) => step.status === "queued")
    ?? null;
  const failedStep = run?.steps.find((step) => step.status === "failed") ?? null;
  const reviewStep = run?.steps.find((step) => step.status === "needs_review") ?? null;
  const readyStep = run?.steps.find((step) => step.status === "ready") ?? null;
  const reviewHasNoMedia = reviewStep?.key === "creative-review" && !finalVideoUrl;
  const productionState = busy || liveStep
    ? {
        tone: "live",
        eyebrow: `Live now · ${(liveStep?.executor ?? "Chaplin").toUpperCase()}`,
        title: renderProgress || liveStep?.label || "Generating production media",
        detail: liveStep ? liveStepCopy(liveStep) : "The production canvas will update as each generated asset is attached.",
      }
    : error
      ? {
          tone: "failed",
          eyebrow: "Generation stopped",
          title: "The production needs attention",
          detail: error,
        }
      : failedStep
      ? {
          tone: "failed",
          eyebrow: `Stopped at step ${failedStep.position}`,
          title: failedStep.label,
          detail: failedStep.errorMessage || "This step failed. Review the error and retry it before the production can continue.",
        }
      : reviewHasNoMedia
        ? {
            tone: "failed",
            eyebrow: `Blocked before step ${reviewStep?.position ?? run?.steps.length ?? 0}`,
            title: "The preview was never rendered",
            detail: "The workflow reached approval without attaching any scene clips or master video. Generate the real preview before approving anything.",
          }
        : reviewStep
          ? {
              tone: "review",
              eyebrow: `Waiting for approval · step ${reviewStep.position}`,
              title: reviewStep.label,
              detail: "Nothing is running in the background. Review the generated media and approve or regenerate it to continue.",
            }
          : !referenceImageUrl && !previewVideoUrl
            ? {
                tone: "idle",
                eyebrow: "Not live · no media generated",
                title: "The first preview has not started",
                detail: "The production plan exists, but no image or video provider is currently running.",
              }
            : readyStep
              ? {
                  tone: "idle",
                  eyebrow: `Ready · step ${readyStep.position}`,
                  title: readyStep.label,
                  detail: "This step is ready but has not started. Use the action below to continue.",
                }
              : {
                  tone: "idle",
                  eyebrow: "Production paused",
                  title: "No generation is running",
                  detail: "The canvas is waiting for the next production action.",
                };
  const liveElapsedSeconds = liveStep
    ? Math.max(0, Math.floor((clock - Date.parse(run?.updatedAt ?? new Date().toISOString())) / 1000))
    : 0;

  const contract = useMemo(() => {
    if (!story) return null;
    const format = normalizeProductionFormat(story.format);
    const definition = PRODUCTION_FORMATS[format];
    const duration = story.durationSeconds ?? definition.durationSeconds;
    const scopeType: PipelineScope = format === "spark" || format === "punch"
      ? "actor"
      : format === "episode"
        ? "episode"
        : "spot";
    const scopeId = scopeType === "actor" ? cast[0]?.id : story.id;
    return {
      format,
      definition,
      duration,
      shotCount: format === "punch" && story.scenes.length
        ? story.scenes.length
        : productionShotCount(format, duration),
      scopeType,
      scopeId,
    };
  }, [cast, story]);

  const shotTimeline = useMemo(() => {
    if (!contract || !story) return [];
    return Array.from({ length: contract.shotCount }, (_, index) => {
      const scene = story.scenes[index];
      const liveShot = renderShots[index];
      const videoUrl = liveShot?.videoUrl ?? persistedShotUrls[index];
      const frameUrl = liveShot?.frameUrl ?? persistedFrameUrls[index] ?? scene?.previewImageUrl;
      const status: ShotRenderStatus = liveShot?.status
        ?? (videoUrl ? "ready" : frameUrl ? "frame_ready" : "queued");
      return {
        index,
        title: scene?.setting?.trim() || `Scene ${index + 1}`,
        objective: scene?.objective?.trim() || scene?.action?.trim() || "Shot direction is ready.",
        durationSeconds: scene?.durationMs
          ? scene.durationMs / 1000
          : scene?.durationSeconds ?? (contract.format === "punch" ? 4 : 5),
        frameUrl,
        videoUrl,
        status,
        error: liveShot?.error,
      };
    });
  }, [contract, persistedFrameUrls, persistedShotUrls, renderShots, story]);

  const selectedShot = shotTimeline[Math.min(selectedShotIndex, Math.max(shotTimeline.length - 1, 0))];
  const canvasVideoUrl = contract?.format === "punch"
    ? selectedShot?.videoUrl ?? null
    : previewVideoUrl;
  const canvasImageUrl = selectedShot?.frameUrl ?? previewImageUrl;
  const framesReadyCount = shotTimeline.filter((shot) => Boolean(shot.frameUrl)).length;
  const clipsReadyCount = shotTimeline.filter((shot) => Boolean(shot.videoUrl)).length;
  const productionPhases = [
    { label: "Plan", complete: Boolean(run), live: false },
    {
      label: "Frames",
      complete: shotTimeline.length > 0 && framesReadyCount === shotTimeline.length,
      live: renderShots.some((shot) => shot.status === "designing"),
    },
    {
      label: "Motion",
      complete: shotTimeline.length > 0 && clipsReadyCount === shotTimeline.length,
      live: renderShots.some((shot) => shot.status === "animating"),
    },
    { label: "Master", complete: Boolean(finalVideoUrl), live: busy && clipsReadyCount === shotTimeline.length && !finalVideoUrl },
    {
      label: "Approval",
      complete: run?.steps.some((step) => step.key === "creative-review" && step.status === "approved") ?? false,
      live: reviewStep?.key === "creative-review",
    },
  ];

  useEffect(() => {
    if (!contract?.scopeId) return;
    let active = true;
    fetch(`/api/pipeline?scopeType=${contract.scopeType}&scopeId=${encodeURIComponent(contract.scopeId)}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Could not load production.");
        const matching = (data.runs as MediaPipelineRun[] | undefined)?.find(
          (candidate) => candidate.spec.productionId === story?.id
        );
        if (active) setRun(matching ?? null);
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Could not load production.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [contract?.scopeId, contract?.scopeType, story?.id]);

  useEffect(() => {
    if (!liveStep) return;
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [liveStep, run?.updatedAt]);

  useEffect(() => {
    if (!liveStep || !contract?.scopeId || !story?.id) return;
    let active = true;
    const refresh = async () => {
      const response = await fetch(`/api/pipeline?scopeType=${contract.scopeType}&scopeId=${encodeURIComponent(contract.scopeId)}`, { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json() as { runs?: MediaPipelineRun[] };
      const matching = data.runs?.find((candidate) => candidate.spec.productionId === story.id);
      if (active && matching) setRun(matching);
    };
    const timer = window.setInterval(() => void refresh(), 2500);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [contract?.scopeId, contract?.scopeType, liveStep, story?.id]);

  async function initializeProduction() {
    if (!story || !contract?.scopeId) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scopeType: contract.scopeType,
          scopeId: contract.scopeId,
          outputType: contract.format,
          createdBy: world.currentUserId,
          idempotencyKey: `production:${story.id}:${contract.format}:v2-direction-safety`,
          spec: {
            productionId: story.id,
            title: story.title,
            logline: story.logline,
            durationSeconds: contract.duration,
            shotCount: contract.shotCount,
            castCharacterIds: cast.map((character) => character.id),
            creativeDirection: story.creativeDirection ?? null,
            sceneProps: story.sceneProps ?? [],
            productImageUrl: story.productImageUrl ?? null,
            productImageName: story.productImageName ?? null,
            script: story.scenes.map((scene, index) => ({
              beat: index + 1,
              slotId: scene.slotId ?? String(index + 1),
              sourceSlotId: scene.sourceSlotId ?? String(index + 1),
              setting: scene.setting,
              objective: scene.objective ?? null,
              action: scene.action ?? null,
              energyState: scene.energyState ?? null,
              lockedCharacterIds: scene.lockedCharacterIds ?? [],
              dressing: scene.dressing ?? null,
              behaviorTell: scene.behaviorTell ?? null,
              cameraMovementId: scene.cameraMovementId ?? null,
              durationMs: scene.durationMs ?? Math.round((scene.durationSeconds ?? 4) * 1000),
              durationSeconds: scene.durationSeconds ?? 4,
              motionMode: scene.motionMode ?? "forward",
              motionFromSlotId: scene.motionFromSlotId ?? null,
              framingConstraint: scene.framingConstraint ?? "readable",
              sensitiveNegatives: scene.sensitiveNegatives ?? [],
              referencedProps: scene.referencedProps ?? [],
              dialogueFramingConstraint: scene.dialogueFramingConstraint ?? null,
              previewImageUrl: scene.previewImageUrl ?? null,
              previewAssetId: scene.previewAssetId ?? null,
              lines: scene.lines.map((line) => ({ characterId: line.characterId, text: line.text })),
            })),
          },
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not initialize production.");
      setRun(data.run);
    } catch (initializeError) {
      setError(initializeError instanceof Error ? initializeError.message : "Could not initialize production.");
    } finally {
      setBusy(false);
    }
  }

  async function transitionStep(
    activeRun: MediaPipelineRun,
    stepKey: string,
    action: PipelineStepAction,
    extra?: { output?: Record<string, unknown>; outputAssetId?: string; errorMessage?: string },
  ) {
    const response = await fetch(`/api/pipeline/${activeRun.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stepKey, action, ...extra }),
    });
    const data = await response.json() as { run?: MediaPipelineRun; error?: string };
    if (!response.ok || !data.run) throw new Error(data.error ?? `Could not ${action} ${stepKey}.`);
    setRun(data.run);
    return data.run;
  }

  async function runInstantStep(activeRun: MediaPipelineRun, step: MediaPipelineStep) {
    let nextRun = activeRun;
    if (step.status === "failed") nextRun = await transitionStep(nextRun, step.key, "retry");
    const refreshed = nextRun.steps.find((candidate) => candidate.key === step.key);
    if (refreshed?.status === "ready") nextRun = await transitionStep(nextRun, step.key, "queue");
    const queued = nextRun.steps.find((candidate) => candidate.key === step.key);
    if (queued?.status === "queued") nextRun = await transitionStep(nextRun, step.key, "start");
    return transitionStep(nextRun, step.key, "complete", {
      output: { lockedAt: new Date().toISOString(), productionId: story?.id },
    });
  }

  async function generateReferenceFrame() {
    if (!run || !story || !cast[0]) return;
    setBusy(true);
    setError("");
    let activeRun = run;
    let providerStepStarted = false;
    try {
      const planStep = activeRun.steps.find((step) => step.key === "plan-lock");
      if (planStep && ["ready", "queued", "failed"].includes(planStep.status)) {
        activeRun = await runInstantStep(activeRun, planStep);
      }

      let imageStep = activeRun.steps.find((step) => step.key === "reference-frame");
      if (!imageStep) throw new Error("This production does not have a reference-frame step.");
      if (imageStep.status === "failed") {
        activeRun = await transitionStep(activeRun, imageStep.key, "retry");
        imageStep = activeRun.steps.find((step) => step.key === "reference-frame") ?? imageStep;
      }
      if (imageStep.status === "ready") {
        activeRun = await transitionStep(activeRun, imageStep.key, "queue");
        imageStep = activeRun.steps.find((step) => step.key === "reference-frame") ?? imageStep;
      }
      if (imageStep.status === "queued") {
        activeRun = await transitionStep(activeRun, imageStep.key, "start");
        providerStepStarted = true;
      } else if (imageStep.status === "running") {
        providerStepStarted = true;
      } else {
        throw new Error(`The reference frame is ${imageStep.status}, so it cannot be generated now.`);
      }

      const firstScene = story.scenes[0];
      const prompt = buildShotImagePrompt({
        productionTitle: story.title,
        productionLogline: story.logline,
        scene: firstScene ?? {},
        sceneIndex: 0,
        sceneCount: story.scenes.length,
        format: story.format,
        actorName: cast[0].name,
        actorIdentity: cast[0].personality,
        productName: story.productImageName,
        hasProductReference: Boolean(story.productImageUrl),
        continuityNote: "Preserve the actor's canonical face, age, hair, proportions, wardrobe materials, palette, product, and location geography exactly.",
      });
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "image",
          characterId: cast[0].id,
          character: cast[0],
          prompt,
          imagePurpose: "scene",
          referenceImages: [
            cast[0].imageUrl ?? cast[0].galleryUrls?.[0] ?? cast[0].bannerUrl ?? "",
            story.productImageUrl ?? "",
          ].filter(Boolean),
        }),
      });
      const data = await response.json() as { url?: string; assetId?: string; error?: string };
      if (!response.ok || !data.url || !data.assetId) {
        throw new Error(data.error ?? "Seedream completed without a saved reference frame.");
      }
      activeRun = await transitionStep(activeRun, "reference-frame", "complete", {
        outputAssetId: data.assetId,
        output: { url: data.url, imagePrompt: prompt, characterId: cast[0].id },
      });
      setRun(activeRun);
    } catch (generationError) {
      if (providerStepStarted) {
        await transitionStep(activeRun, "reference-frame", "fail", {
          errorMessage: generationError instanceof Error ? generationError.message : "Reference-frame generation failed.",
        }).catch(() => undefined);
      }
      setError(generationError instanceof Error ? generationError.message : "Reference-frame generation failed.");
    } finally {
      setBusy(false);
    }
  }

  async function approveReferenceFrame() {
    if (!run || !referenceImageUrl) return;
    setBusy(true);
    setError("");
    try {
      let activeRun = run;
      let reviewStep = activeRun.steps.find((step) => step.key === "reference-review");
      if (!reviewStep) throw new Error("This production does not have an identity review gate.");
      if (reviewStep.status === "approved" || reviewStep.status === "succeeded") return;
      if (reviewStep.status === "ready") {
        activeRun = await transitionStep(activeRun, reviewStep.key, "queue");
        reviewStep = activeRun.steps.find((step) => step.key === "reference-review") ?? reviewStep;
      }
      if (reviewStep.status === "queued") {
        activeRun = await transitionStep(activeRun, reviewStep.key, "start");
        reviewStep = activeRun.steps.find((step) => step.key === "reference-review") ?? reviewStep;
      }
      if (reviewStep.status === "running") {
        activeRun = await transitionStep(activeRun, reviewStep.key, "complete", {
          output: {
            approvedReferenceUrl: referenceImageUrl,
            approvedAt: new Date().toISOString(),
            productionId: story?.id,
          },
        });
        reviewStep = activeRun.steps.find((step) => step.key === "reference-review") ?? reviewStep;
      }
      if (reviewStep.status === "needs_review") {
        activeRun = await transitionStep(activeRun, reviewStep.key, "approve", {
          output: {
            approvedReferenceUrl: referenceImageUrl,
            approvedAt: new Date().toISOString(),
            productionId: story?.id,
          },
        });
      }
      setRun(activeRun);
    } catch (approvalError) {
      setError(approvalError instanceof Error ? approvalError.message : "The reference frame could not be approved.");
    } finally {
      setBusy(false);
    }
  }

  async function generatePipelineAudio(input: Record<string, unknown>) {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: "Audio generation failed." })) as { error?: string };
      throw new Error(data.error ?? "Audio generation failed.");
    }
    const url = response.headers.get("X-Asset-Url");
    const assetId = response.headers.get("X-Asset-Id");
    const measuredDurationMs = Number(response.headers.get("X-Audio-Duration-Ms")) || null;
    if (!url || !assetId) throw new Error("Generated audio was not attached to the production.");
    return { url, assetId, measuredDurationMs };
  }

  async function openVoiceCapacityRecovery() {
    if (!cast[0]) return;
    setVoiceRecoveryBusy(true);
    setVoiceRecoveryMessage("");
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "voice-capacity-list",
          characterId: cast[0].id,
        }),
      });
      const data = await response.json() as { candidates?: VoiceCapacityCandidate[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not inspect safe voice capacity.");
      const candidates = data.candidates ?? [];
      setVoiceRecoveryCandidates(candidates);
      setSelectedRecoveryVoiceId(candidates[0]?.voiceId ?? "");
      setVoiceRecoveryOpen(true);
      if (!candidates.length) {
        setVoiceRecoveryMessage("No inactive Chaplin-generated voice is safe to delete. Open the actor studio to lock a voice, or manage capacity directly in ElevenLabs.");
      }
    } catch (recoveryError) {
      setVoiceRecoveryMessage(recoveryError instanceof Error ? recoveryError.message : "Could not inspect voice capacity.");
      setVoiceRecoveryOpen(true);
    } finally {
      setVoiceRecoveryBusy(false);
    }
  }

  async function deleteRecoveryVoice() {
    if (!cast[0] || !selectedRecoveryVoiceId) return;
    const selected = voiceRecoveryCandidates.find((candidate) => candidate.voiceId === selectedRecoveryVoiceId);
    if (!selected) return;
    if (!window.confirm(`Delete the inactive voice "${selected.name}" from ElevenLabs? This cannot be undone.`)) return;
    setVoiceRecoveryBusy(true);
    setVoiceRecoveryMessage("");
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "voice-capacity-delete",
          characterId: cast[0].id,
          voiceId: selected.voiceId,
          confirmedVoiceId: selected.voiceId,
        }),
      });
      const data = await response.json() as { deleted?: boolean; message?: string; error?: string };
      if (!response.ok || !data.deleted) throw new Error(data.error ?? "The selected voice could not be deleted.");
      const remaining = voiceRecoveryCandidates.filter((candidate) => candidate.voiceId !== selected.voiceId);
      setVoiceRecoveryCandidates(remaining);
      setSelectedRecoveryVoiceId(remaining[0]?.voiceId ?? "");
      setVoiceRecoveryMessage(data.message ?? "Voice slot freed. Lock this actor's voice, then retry production.");
    } catch (recoveryError) {
      setVoiceRecoveryMessage(recoveryError instanceof Error ? recoveryError.message : "The selected voice could not be deleted.");
    } finally {
      setVoiceRecoveryBusy(false);
    }
  }

  async function continueProduction(startingRun: MediaPipelineRun) {
    if (!story || !cast[0]) return;
    setBusy(true);
    setError("");
    let activeRun = startingRun;
    let activeStepKey = "";
    try {
      while (true) {
        let step = activeRun.steps.find((candidate) => candidate.status === "ready");
        if (!step) break;
        if (step.requiresReview && step.key !== "creative-review") break;
        activeStepKey = step.key;
        activeRun = await transitionStep(activeRun, step.key, "queue");
        activeRun = await transitionStep(activeRun, step.key, "start");
        step = activeRun.steps.find((candidate) => candidate.key === activeStepKey) ?? step;

        /*
          Steps carry max_attempts of 3 and the server already supports a
          retry transition, but a failure used to break the run immediately,
          so the budget was never spent and one transient provider hiccup
          blocked every remaining step. Transient failures now retry through
          the real state machine; configuration and validation failures still
          fail fast rather than burning attempts on the same rejection.
        */
        let output: Record<string, unknown> = {};
        let outputAssetId: string | undefined;
        const stepMaxAttempts = Math.max(1, step.maxAttempts || 3);
        let stepError: unknown = null;
        for (let attempt = 1; attempt <= stepMaxAttempts; attempt += 1) {
          try {
            output = { completedAt: new Date().toISOString() };
            outputAssetId = undefined;
            const firstScene = story.scenes[0];
            if (step.key === "motion-plate") {
              const dialogueStep = activeRun.steps.find((candidate) => candidate.key === "dialogue");
              const referenceAudio = typeof dialogueStep?.output.url === "string" ? dialogueStep.output.url : "";
              const dialogueText = typeof dialogueStep?.output.text === "string" ? dialogueStep.output.text : "";
              const response = await fetch("/api/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  action: "video",
                  characterId: cast[0].id,
                  referenceImage: referenceImageUrl,
                  referenceAudio,
                  dialogueText,
                  prompt: buildShotVideoPrompt({
                    productionTitle: story.title, productionLogline: story.logline, scene: firstScene ?? {},
                    sceneIndex: 0, sceneCount: story.scenes.length || 1, format: story.format,
                    actorName: cast[0].name, actorIdentity: cast[0].personality,
                    productName: story.productImageName, hasProductReference: Boolean(story.productImageUrl),
                    continuityNote: "Preserve the approved frame's actor, wardrobe, location, product, light, object positions, and direction of travel.",
                  }),
                }),
              });
              const data = await response.json() as { url?: string; assetId?: string; error?: string };
              if (!response.ok || !data.url || !data.assetId) throw new Error(data.error ?? "Seedance did not return a motion plate.");
              output = { ...output, url: data.url, referenceImageUrl };
              outputAssetId = data.assetId;
            } else if (step.key === "dialogue") {
              const line = story.scenes.flatMap((scene) => scene.lines).find((candidate) => candidate.characterId === cast[0].id)?.text
                ?? story.scenes.flatMap((scene) => scene.lines)[0]?.text
                ?? cast[0].tagline;
              const asset = await generatePipelineAudio({ action: "speech", characterId: cast[0].id, speechText: line });
              output = { ...output, url: asset.url, text: line };
              outputAssetId = asset.assetId;
            } else if (step.key === "sfx") {
              const prompt = `A clean 1.5-second non-musical physical sound for ${story.title}: ${cast[0].sfxDesc}. One foreground event, no speech, no melody, no ambience tail.`;
              const asset = await generatePipelineAudio({ action: "sfx", characterId: cast[0].id, prompt, durationSeconds: 1.5 });
              output = { ...output, url: asset.url, prompt };
              outputAssetId = asset.assetId;
            } else if (step.key === "room-tone") {
              const prompt = `Two seconds of clean room tone for ${firstScene?.setting ?? "the scene location"}. Stable low-level environmental ambience only, no distinct event, speech, music, melody, or dramatic rise.`;
              const asset = await generatePipelineAudio({ action: "sfx", characterId: cast[0].id, prompt, durationSeconds: 2 });
              output = { ...output, url: asset.url, prompt };
              outputAssetId = asset.assetId;
            } else if (step.key === "shot-mix") {
              const response = await fetch("/api/pipeline/mix", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ runId: activeRun.id, characterId: cast[0].id }),
              });
              const data = await response.json() as { url?: string; assetId?: string; error?: string };
              if (!response.ok || !data.url || !data.assetId) throw new Error(data.error ?? "The shot could not be mixed.");
              output = { ...output, url: data.url, durationSeconds: 5 };
              outputAssetId = data.assetId;
            } else if (step.key === "technical-qc") {
              const mixedUrl = activeRun.steps.find((candidate) => candidate.key === "shot-mix")?.output.url;
              if (typeof mixedUrl !== "string") throw new Error("Technical QC needs a mixed shot.");
              output = { ...output, url: mixedUrl, checks: ["picture", "audio", "duration", "delivery"] };
              outputAssetId = activeRun.steps.find((candidate) => candidate.key === "shot-mix")?.outputAssetId ?? undefined;
            } else if (step.key === "creative-review") {
              const mixedUrl = activeRun.steps.find((candidate) => candidate.key === "shot-mix")?.output.url;
              output = { ...output, url: mixedUrl, review: "human" };
              outputAssetId = activeRun.steps.find((candidate) => candidate.key === "shot-mix")?.outputAssetId ?? undefined;
            }

            stepError = null;
            break;
          } catch (attemptError) {
            stepError = attemptError;
            if (!isRetryableStepError(attemptError) || attempt >= stepMaxAttempts) break;
            const retryMessage = attemptError instanceof Error ? attemptError.message : "Step failed.";
            activeRun = await transitionStep(activeRun, activeStepKey, "fail", { errorMessage: retryMessage });
            activeRun = await transitionStep(activeRun, activeStepKey, "retry");
            activeRun = await transitionStep(activeRun, activeStepKey, "queue");
            activeRun = await transitionStep(activeRun, activeStepKey, "start");
          }
        }
        if (stepError) throw stepError;

        activeRun = await transitionStep(activeRun, step.key, "complete", { output, outputAssetId });
        if (step.key === "creative-review") break;
      }
      setRun(activeRun);
    } catch (pipelineError) {
      if (activeStepKey) {
        await transitionStep(activeRun, activeStepKey, "fail", {
          errorMessage: pipelineError instanceof Error ? pipelineError.message : "Production generation failed.",
        }).catch(() => undefined);
      }
      setError(pipelineError instanceof Error ? pipelineError.message : "Production generation failed.");
    } finally {
      setBusy(false);
    }
  }

  async function renderPunchOutput() {
    if (!run || !story || !cast[0] || contract?.format !== "punch") return;
    const lockedReference = referenceImageUrl ?? castPreviewImageUrl;
    const lockedCastReferences = cast
      .map((character) => character.imageUrl ?? character.galleryUrls?.[0] ?? character.bannerUrl ?? "")
      .filter(Boolean);
    if (!lockedReference) {
      setError("Approve or attach one actor identity frame before rendering the Punch.");
      return;
    }
    // Bounds the variable parts of provider briefs so fixed constraints survive
    // the downstream clamp.
    const clamp = (value: string, limit: number) => value.replace(/\s+/g, " ").trim().slice(0, limit);
    const authoredScenes = story.scenes.slice(0, contract.shotCount);
    const sequenceValidation = validateShotSequence(authoredScenes, contract.shotCount);
    if (!sequenceValidation.valid) {
      setError(sequenceValidation.error ?? "The four-scene storyboard is incomplete.");
      return;
    }
    setBusy(true);
    setError("");
    setRenderProgress("Preparing the locked actor reference");
    setRenderFrameUrl(null);
    setSelectedShotIndex(0);
    setRenderShots(Array.from({ length: contract.shotCount }, () => ({ status: "queued" })));
    let activeShotIndex = 0;
    let activeRun = run;
    let activePipelineStepKey = "";
    try {
      const promiseStep = activeRun.steps.find((step) => step.key === "promise-lock");
      if (promiseStep && ["ready", "queued", "failed"].includes(promiseStep.status)) {
        setRenderProgress("Locking the personality promise");
        activeRun = await runInstantStep(activeRun, promiseStep);
      }

      let packageStep = activeRun.steps.find((step) => step.key === "shot-packages");
      if (!packageStep) throw new Error("This Punch does not have a scene-package step.");
      if (packageStep.status === "failed") {
        activeRun = await transitionStep(activeRun, packageStep.key, "retry");
        packageStep = activeRun.steps.find((step) => step.key === "shot-packages") ?? packageStep;
      }
      if (packageStep.status === "ready") {
        activeRun = await transitionStep(activeRun, packageStep.key, "queue");
        packageStep = activeRun.steps.find((step) => step.key === "shot-packages") ?? packageStep;
      }
      if (packageStep.status === "queued") {
        activeRun = await transitionStep(activeRun, packageStep.key, "start");
        packageStep = activeRun.steps.find((step) => step.key === "shot-packages") ?? packageStep;
      }
      if (packageStep.status !== "running") {
        throw new Error(`The scene package is ${packageStep.status}, so it cannot render new clips.`);
      }
      activePipelineStepKey = "shot-packages";

      // Build the complete storyboard before asking the video model to move any frame.
      // This keeps the four authored scene starts visible and reviewable as one sequence.
      let framesDesigned = 0;
      let scenesRecorded = 0;
      setRenderShots((shots) => shots.map((shot) => ({ ...shot, status: "designing", error: undefined })));
      setRenderProgress(`Parallel generation · 0/${contract.shotCount} frames · 0/${contract.shotCount} soundtracks`);
      const frameResultsPromise = mapScenes(contract.shotCount, async (index) => {
        const directedScene = authoredScenes[index];
        /*
          Only this scene's actors. Rendering every shot against the whole cast
          is what let one actor appear holding another's weapon.
        */
        const sceneActors = resolveSceneActors(directedScene, cast).present;
        const framePrompt = buildShotImagePrompt({
          productionTitle: story.title, productionLogline: story.logline, scene: directedScene,
          sceneIndex: index, sceneCount: contract.shotCount, format: story.format,
          actorName: sceneActorNames(sceneActors),
          actorIdentity: `${sceneActorIdentity(sceneActors)}\n${absentCastNegative(sceneActors, cast)}`.trim(),
          actors: sceneActors.map((actor) => ({ name: actor.name, identity: actor.personality })),
          productName: story.productImageName, hasProductReference: Boolean(story.productImageUrl),
          continuityNote: "Keep every locked actor visually distinct and consistent, but obey this scene's own authored location, blocking, action, and camera. Carry geography or screen direction only when adjacent scenes explicitly remain continuous.",
        });
        let frameData: { url?: string; assetId?: string; error?: string } = {
          url: directedScene.previewImageUrl,
          assetId: directedScene.previewAssetId,
        };
        if (!frameData.url) {
          frameData = await withSceneRetry(async () => {
            const frameResponse = await fetch("/api/generate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "image",
                characterId: cast[0].id,
                imagePurpose: "scene",
                referenceImages: [...lockedCastReferences, story.productImageUrl ?? ""].filter(
                  (value, referenceIndex, references) => references.indexOf(value) === referenceIndex,
                ),
                prompt: framePrompt,
              }),
            });
            const payload = await frameResponse.json() as { url?: string; assetId?: string; error?: string };
            if (!frameResponse.ok || !payload.url) {
              throw new Error(payload.error ?? `Scene frame ${index + 1} was not created.`);
            }
            return payload;
          }).catch((error: unknown) => {
            /*
              Concurrent scenes mean the loop counter no longer identifies the
              failure, so each scene records its own index before it throws.
            */
            activeShotIndex = index;
            throw error;
          });
        }
        const frameUrl = frameData.url;
        if (!frameUrl) {
          activeShotIndex = index;
          throw new Error(frameData.error ?? `Scene frame ${index + 1} was not created.`);
        }
        framesDesigned += 1;
        setRenderFrameUrl(frameUrl);
        setSelectedShotIndex(index);
        setRenderProgress(`Parallel generation · ${framesDesigned}/${contract.shotCount} frames · ${scenesRecorded}/${contract.shotCount} soundtracks`);
        setRenderShots((shots) => shots.map((shot, shotIndex) => (
          shotIndex === index
            ? { ...shot, frameUrl, frameAssetId: frameData.assetId, status: "frame_ready" }
            : shot
        )));
        return { frameUrl, frameAssetId: frameData.assetId };
      });

      /*
        Build every authored scene's soundtrack before motion. Seedance 2.0 can
        use the locked-voice file as a multimodal timing reference, but the same
        original ElevenLabs asset is still mastered into the final cut so actor
        identity never depends on a model's re-performance.
      */
      const audioResultsPromise = mapScenes(contract.shotCount, async (index) => {
        const directedScene = authoredScenes[index];
        const dialogueLine = directedScene.lines.find((line) => line.text.trim());
        const dialogueSpeaker = cast.find((character) => character.id === dialogueLine?.characterId) ?? cast[0];
        const dialogueText = dialogueLine?.text.trim() ?? "";
        /*
          The provider brief is clamped to 450 characters downstream, and the
          negatives sit at the end - so an unbounded scene action pushed them
          off the edge and the effect model stopped being told to avoid speech
          and score. The variable parts are bounded here so the constraints
          always survive the clamp.
        */
        const sfxPrompt = [
          `One distinctive non-musical foreground sound for scene ${index + 1}.`,
          "Create one physically plausible event caused by the visible action, different from the other scene sounds. No speech, melody, score, generic cinematic boom, or ambience bed.",
          `Location: ${clamp(directedScene.setting || "the established scene", 90)}.`,
          `Visible action: ${clamp(directedScene.action || directedScene.objective || "one concise physical action", 140)}.`,
          `Character sound identity: ${clamp(resolveSceneActors(directedScene, cast).lead.sfxDesc ?? "", 90)}.`,
        ].join(" ");
        const [dialogueAsset, sfxAsset] = await Promise.all([
          dialogueText
            ? generatePipelineAudio({
                action: "speech",
                characterId: dialogueSpeaker.id,
                speechText: dialogueText,
              }).catch((error: unknown) => {
                /*
                  A voice orphaned by an API-key change must not cost the whole
                  production. Losing one line is recoverable - the shot still
                  renders and the line can be mixed in once the voice is
                  re-locked - whereas failing here loses every scene.
                */
                const detail = error instanceof Error ? error.message : "";
                if (!/ORPHANED_VOICE/.test(detail)) {
                  activeShotIndex = index;
                  throw error;
                }
                setError(`${dialogueSpeaker.name}'s locked voice is missing on the current ElevenLabs account, so this scene renders without their line. Re-lock their voice and regenerate the dialogue.`);
                return null;
              })
            : Promise.resolve(null),
          generatePipelineAudio({
            action: "sfx",
            characterId: cast[0].id,
            prompt: sfxPrompt,
            durationSeconds: Math.min(3, Math.max(1, directedScene.durationSeconds ?? 2)),
          }),
        ]);
        scenesRecorded += 1;
        setRenderProgress(`Parallel generation · ${framesDesigned}/${contract.shotCount} frames · ${scenesRecorded}/${contract.shotCount} soundtracks`);
        setRenderShots((shots) => shots.map((shot, shotIndex) => (
          shotIndex === index
            ? {
                ...shot,
                dialogueUrl: dialogueAsset?.url,
                dialogueAssetId: dialogueAsset?.assetId,
                sfxUrl: sfxAsset.url,
                sfxAssetId: sfxAsset.assetId,
              }
            : shot
        )));
        return {
          dialogueText,
          dialogueUrl: dialogueAsset?.url,
          dialogueAssetId: dialogueAsset?.assetId,
          dialogueDurationMs: dialogueAsset?.measuredDurationMs ?? null,
          sfxUrl: sfxAsset.url,
          sfxAssetId: sfxAsset.assetId,
        };
      });
      const [frameResults, audioResults] = await Promise.all([
        frameResultsPromise,
        audioResultsPromise,
      ]);

      const solvedSlotDurations = solveDirectionDurations(
        authoredScenes.map((scene, index) => ({
          slotId: scene.slotId ?? String(index + 1),
          energyState: scene.energyState ?? (scene.lines.length ? "sustained" : "static"),
          lines: scene.lines.map((line) => ({ characterId: line.characterId, text: line.text })),
          dialogueDurationMs: audioResults[index]?.dialogueDurationMs,
        })),
        contract.duration * 1000,
      );
      const renderedDurationMs = (sceneIndex: number) => (
        solvedSlotDurations[authoredScenes[sceneIndex].slotId ?? String(sceneIndex + 1)]
      );

      let scenesAnimated = 0;
      setRenderShots((shots) => shots.map((shot) => ({ ...shot, status: "animating", error: undefined })));
      setRenderProgress(`Animating ${contract.shotCount} timed scenes`);
      type RenderedShot = {
        frameUrl: string;
        frameAssetId?: string;
        url: string;
        assetId: string;
      };
      const shotPromises: Array<Promise<RenderedShot>> = [];
      for (let index = 0; index < contract.shotCount; index += 1) {
        shotPromises[index] = (async (): Promise<RenderedShot> => {
          const directedScene = authoredScenes[index];
          let frameData = frameResults[index];
          if (directedScene.motionMode === "chain" && directedScene.motionFromSlotId) {
            const sourceIndex = authoredScenes.findIndex((scene) => scene.slotId === directedScene.motionFromSlotId);
            const sourcePromise = sourceIndex >= 0 && sourceIndex < index ? shotPromises[sourceIndex] : undefined;
            if (!sourcePromise) {
              throw new Error(`Scene ${index + 1} needs earlier rendered slot ${directedScene.motionFromSlotId} before its chain can continue.`);
            }
            const sourceShot = await sourcePromise;
            const chainResponse = await fetch("/api/media/chain-frame", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                characterId: resolveSceneActors(directedScene, cast).lead.id,
                runId: activeRun.id,
                sourceUrl: sourceShot.url,
                sourceAssetId: sourceShot.assetId,
                sourceSlotId: directedScene.motionFromSlotId,
                targetSlotId: directedScene.slotId ?? String(index + 1),
              }),
            });
            const chainData = await chainResponse.json() as { url?: string; assetId?: string; error?: string };
            if (!chainResponse.ok || !chainData.url || !chainData.assetId) {
              throw new Error(chainData.error ?? `Scene ${index + 1} could not extract its chain frame.`);
            }
            frameData = { frameUrl: chainData.url, frameAssetId: chainData.assetId };
          }
          const motionActors = resolveSceneActors(directedScene, cast).present;
          const motionPrompt = buildShotVideoPrompt({
            productionTitle: story.title, productionLogline: story.logline,
            scene: { ...directedScene, durationMs: renderedDurationMs(index) },
            sceneIndex: index, sceneCount: contract.shotCount, format: story.format,
            actorName: sceneActorNames(motionActors),
            actorIdentity: `${sceneActorIdentity(motionActors)}\n${absentCastNegative(motionActors, cast)}`.trim(),
            actors: motionActors.map((actor) => ({ name: actor.name, identity: actor.personality })),
            productName: story.productImageName, hasProductReference: Boolean(story.productImageUrl),
            continuityNote: "Animate only this scene's exact starting frame. Preserve every visible identity, object, spatial relationship, and screen direction inside the shot; do not borrow staging or action from another scene.",
          });
          const videoData = await withSceneRetry(async () => {
            const videoResponse = await fetch("/api/generate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "video",
                // The scene's own lead, so the actor context matches who is on screen.
                characterId: resolveSceneActors(directedScene, cast).lead.id,
                referenceImage: frameData.frameUrl,
                durationSeconds: renderedDurationMs(index) / 1000,
                /*
                  The audio plan is what engages the AUDIO SCENE grammar. Without it
                  the shot rendered mute: the locked line and the location sound had
                  nowhere to be declared, so a scene with a speaking actor came back
                  silent. Ambience is the location, the effect is the visible action,
                  and the spoken line rides the locked recording below.
                */
                audioPlan: {
                  ambience: clamp(directedScene.setting || "the established location", 110),
                  sfxMoments: directedScene.action
                    ? [{ description: clamp(directedScene.action, 90), atSeconds: 2 }]
                    : [],
                },
                referenceAudio: audioResults[index]?.dialogueUrl,
                dialogueText: audioResults[index]?.dialogueText,
                prompt: motionPrompt,
              }),
            });
            const payload = await videoResponse.json() as { url?: string; assetId?: string; error?: string };
            if (!videoResponse.ok || !payload.url || !payload.assetId) {
              throw new Error(payload.error ?? `Scene ${index + 1} did not produce a saved video.`);
            }
            return payload as { url: string; assetId: string };
          }).catch((error: unknown) => {
            activeShotIndex = index;
            throw error;
          });
          scenesAnimated += 1;
          setSelectedShotIndex(index);
          setRenderFrameUrl(frameData.frameUrl);
          setRenderProgress(`Animated ${scenesAnimated} of ${contract.shotCount} scenes`);
          setRenderShots((shots) => shots.map((shot, shotIndex) => (
            shotIndex === index
              ? {
                  ...shot,
                  frameUrl: frameData.frameUrl,
                  frameAssetId: frameData.frameAssetId,
                  videoUrl: videoData.url,
                  videoAssetId: videoData.assetId,
                  status: "ready",
                }
              : shot
          )));
          return {
            frameUrl: frameData.frameUrl,
            frameAssetId: frameData.frameAssetId,
            url: videoData.url,
            assetId: videoData.assetId,
          };
        })();
      }
      const shotResults = await Promise.all(shotPromises);

      activeRun = await transitionStep(activeRun, "shot-packages", "complete", {
        output: {
          shotUrls: shotResults.map((shot) => shot.url),
          shotAssetIds: shotResults.map((shot) => shot.assetId),
          frameUrls: shotResults.map((shot) => shot.frameUrl),
          frameAssetIds: shotResults.map((shot) => shot.frameAssetId).filter(Boolean),
          dialogueUrls: audioResults.map((audio) => audio.dialogueUrl ?? ""),
          dialogueAssetIds: audioResults.map((audio) => audio.dialogueAssetId).filter(Boolean),
          sfxUrls: audioResults.map((audio) => audio.sfxUrl),
          sfxAssetIds: audioResults.map((audio) => audio.sfxAssetId),
          sceneDurationsSeconds: authoredScenes.map((_, index) => renderedDurationMs(index) / 1000),
          completedAt: new Date().toISOString(),
        },
      });

      let assemblyStep = activeRun.steps.find((step) => step.key === "assembly");
      if (!assemblyStep) throw new Error("This Punch does not have an assembly step.");
      if (assemblyStep.status === "failed") {
        activeRun = await transitionStep(activeRun, assemblyStep.key, "retry");
        assemblyStep = activeRun.steps.find((step) => step.key === "assembly") ?? assemblyStep;
      }
      if (assemblyStep.status === "ready") {
        activeRun = await transitionStep(activeRun, assemblyStep.key, "queue");
        assemblyStep = activeRun.steps.find((step) => step.key === "assembly") ?? assemblyStep;
      }
      if (assemblyStep.status === "queued") {
        activeRun = await transitionStep(activeRun, assemblyStep.key, "start");
        assemblyStep = activeRun.steps.find((step) => step.key === "assembly") ?? assemblyStep;
      }
      if (assemblyStep.status !== "running") {
        throw new Error(`The master assembly is ${assemblyStep.status}, so it cannot run now.`);
      }
      activePipelineStepKey = "assembly";
      setRenderProgress(`Assembling the ${contract.duration}-second master`);
      const response = await fetch("/api/pipeline/assemble", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId: activeRun.id,
          characterId: cast[0].id,
          shotUrls: shotResults.map((shot) => shot.url),
          frameUrls: shotResults.map((shot) => shot.frameUrl),
          dialogueUrls: audioResults.map((audio) => audio.dialogueUrl ?? ""),
          sfxUrls: audioResults.map((audio) => audio.sfxUrl),
          sceneDurationsSeconds: authoredScenes.map((_, index) => renderedDurationMs(index) / 1000),
          finalDurationSeconds: contract.duration,
        }),
      });
      const data = await response.json() as { run?: MediaPipelineRun; url?: string; assetId?: string; error?: string };
      if (!response.ok || !data.run || !data.url || !data.assetId) {
        throw new Error(data.error ?? "The Punch master could not be assembled.");
      }
      activeRun = await transitionStep(data.run, "assembly", "complete", {
        outputAssetId: data.assetId,
        output: {
          url: data.url,
          shotUrls: shotResults.map((shot) => shot.url),
          frameUrls: shotResults.map((shot) => shot.frameUrl),
          durationSeconds: contract.duration,
          completedAt: new Date().toISOString(),
        },
      });

      const captionsStep = activeRun.steps.find((step) => step.key === "captions");
      if (captionsStep && ["ready", "queued", "failed"].includes(captionsStep.status)) {
        activeRun = await transitionStep(activeRun, captionsStep.key, "skip", {
          output: {
            skippedAt: new Date().toISOString(),
            reason: "No burned-in or sidecar captions were requested for this preview.",
          },
        });
      }

      const masteringStep = activeRun.steps.find((step) => step.key === "mastering");
      if (masteringStep?.status === "ready") {
        activePipelineStepKey = "mastering";
        activeRun = await transitionStep(activeRun, masteringStep.key, "queue");
        activeRun = await transitionStep(activeRun, masteringStep.key, "start");
        activeRun = await transitionStep(activeRun, masteringStep.key, "complete", {
          outputAssetId: data.assetId,
          output: {
            url: data.url,
            durationSeconds: contract.duration,
            codec: "h264",
            fastStart: true,
            completedAt: new Date().toISOString(),
          },
        });
      }

      const creativeReviewStep = activeRun.steps.find((step) => step.key === "creative-review");
      if (creativeReviewStep?.status === "ready") {
        activePipelineStepKey = "creative-review";
        activeRun = await transitionStep(activeRun, creativeReviewStep.key, "queue");
        activeRun = await transitionStep(activeRun, creativeReviewStep.key, "start");
        activeRun = await transitionStep(activeRun, creativeReviewStep.key, "complete", {
          outputAssetId: data.assetId,
          output: {
            url: data.url,
            durationSeconds: contract.duration,
            review: "human",
            completedAt: new Date().toISOString(),
          },
        });
      }
      setRun(activeRun);
      setRenderProgress("");
      window.setTimeout(() => {
        document.querySelector("[data-human-review]")?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
    } catch (renderError) {
      const message = renderError instanceof Error ? renderError.message : "The Punch output could not be rendered.";
      const failedPipelineStep = activeRun.steps.find((step) => step.key === activePipelineStepKey);
      if (failedPipelineStep && ["queued", "running"].includes(failedPipelineStep.status)) {
        activeRun = await transitionStep(activeRun, activePipelineStepKey, "fail", {
          errorMessage: message,
        }).catch(() => activeRun);
      }
      setRenderShots((shots) => shots.map((shot, shotIndex) => (
        shotIndex === activeShotIndex ? { ...shot, status: "failed", error: message } : shot
      )));
      setError(message);
      setRenderProgress("");
    } finally {
      setBusy(false);
    }
  }

  async function approveFinalShot() {
    if (!run) return;
    const step = run.steps.find((candidate) => candidate.key === "creative-review");
    if (!step || step.status !== "needs_review") return;
    if (!finalVideoUrl) {
      setError("There is no playable master to approve yet. Generate the review cut first.");
      document.querySelector("[data-human-review]")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setBusy(true);
    setError("");
    try {
      const activeRun = await transitionStep(run, step.key, "approve", {
        output: { ...step.output, approvedAt: new Date().toISOString() },
        outputAssetId: step.outputAssetId ?? undefined,
      });
      setRun(activeRun);
    } catch (approvalError) {
      setError(approvalError instanceof Error ? approvalError.message : "The final shot could not be approved.");
    } finally {
      setBusy(false);
    }
  }

  const nextAutomaticStep = run?.steps.find((step) => (
    step.status === "ready"
    && !step.requiresReview
    && AUTOMATED_SHOT_STEPS.has(step.key)
  ));
  useEffect(() => {
    if (!run || !nextAutomaticStep || busy) return;
    const key = `${run.id}:${nextAutomaticStep.id}:${nextAutomaticStep.attempt}`;
    if (autoStepRef.current === key) return;
    autoStepRef.current = key;
    void continueProduction(run);
    // continueProduction intentionally follows the persisted run state, not function identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, nextAutomaticStep?.attempt, nextAutomaticStep?.id, run?.id]);

  /*
    Entering Render mode is already the creator's decision to begin production.
    Requiring another "Continue to production" click inside the old detail page
    made the Studio feel like a chain of separate products. The shared Studio
    initializes its plan once, in place; provider generation still follows the
    visible pipeline and its review gates.
  */
  useEffect(() => {
    if (
      !autoStart
      || autoInitializeRef.current
      || !hydrated
      || loading
      || busy
      || run
      || !story
      || !contract?.scopeId
    ) return;
    autoInitializeRef.current = true;
    void initializeProduction();
    // initializeProduction follows the currently persisted story and contract.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, busy, contract?.scopeId, hydrated, loading, run?.id, story?.id]);

  useEffect(() => {
    if (
      !autoRender
      || autoRenderRef.current
      || !run
      || busy
      || contract?.format !== "punch"
      || finalVideoUrl
    ) return;
    autoRenderRef.current = true;
    void renderPunchOutput();
    // The Generate in Studio click authorizes this one render attempt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRender, busy, contract?.format, finalVideoUrl, run?.id]);

  useEffect(() => {
    if (!onFrameUrlsChange) return;
    const count = Math.max(persistedFrameUrls.length, renderShots.length);
    const urls = Array.from({ length: count }, (_, index) => (
      renderShots[index]?.frameUrl ?? persistedFrameUrls[index] ?? ""
    ));
    if (urls.some(Boolean)) onFrameUrlsChange(urls);
  }, [onFrameUrlsChange, persistedFrameUrls, renderShots]);

  if (!hydrated) {
    return <main className={embedded ? "studio-embedded-production p-6 text-sm text-grey" : "mx-auto max-w-5xl px-6 py-16 text-sm text-grey"}>Opening production...</main>;
  }

  if (!story || !contract) {
    return (
      <main className={embedded ? "studio-embedded-production p-6 text-center" : "mx-auto max-w-3xl px-6 py-16 text-center"}>
        <p className="text-grey">This production draft is not available on this device.</p>
        <Link href="/studio" className="mt-4 inline-block text-accent">Back to My Studio</Link>
      </main>
    );
  }

  return (
    <main
      className={embedded
        ? `studio-embedded-production${canvasOnly ? " studio-production-canvas" : ""}`
        : "app-width px-5 py-10 sm:px-8"}
      data-embedded-production={embedded || undefined}
      data-production-canvas={canvasOnly || undefined}
    >
      <div className={embedded ? "hidden" : "flex items-center justify-between gap-4"}>
        <Link href="/studio" className="text-xs text-grey hover:text-accent">Back to My Studio</Link>
        <span className="rounded-full border border-amber-300/30 px-3 py-1 text-[9px] uppercase tracking-[0.18em] text-amber-200">
          Private production · not published
        </span>
      </div>

      {!canvasOnly && <header className={embedded ? "studio-embedded-production__summary" : "mt-8 border-b border-line pb-8"}>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-3xl">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-accent">{contract.definition.label} production</p>
            <h1 className="reel-title mt-2 text-4xl sm:text-6xl">{story.title}</h1>
            <p className="mt-4 text-sm leading-6 text-grey">{story.logline}</p>
          </div>
          <div className="flex items-end gap-5">
            <div><p className="font-mono text-4xl text-accent">{contract.duration}s</p><p className="text-[9px] uppercase text-grey">Runtime</p></div>
            <div><p className="font-mono text-4xl text-accent-secondary">{contract.shotCount}</p><p className="text-[9px] uppercase text-grey">Shot packages</p></div>
          </div>
        </div>
      </header>}

      {embedded && run && contract.format === "punch" && !finalVideoUrl && (
        <section className="studio-embedded-production__actionbar" data-studio-render-action>
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-accent">Generate here</p>
            <p className="mt-1 text-xs text-grey">
              {busy
                ? renderProgress || "The Studio is preparing the production."
                : "Create the four scene clips and assemble the 15-second master without leaving this canvas."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void renderPunchOutput()}
            disabled={busy}
            className="rounded-full bg-accent px-5 py-2.5 text-xs font-bold text-white disabled:opacity-40"
          >
            {busy ? "Working…" : "Generate 15-second master"}
          </button>
        </section>
      )}

      <section className={canvasOnly ? "hidden" : "hidden gap-3 border-b border-line py-6 sm:grid sm:grid-cols-3"}>
        {[
          ["01", "Script locked", `${story.scenes.length} playable beat${story.scenes.length === 1 ? "" : "s"}`],
          ["02", "Cast locked", `${cast.length} production identit${cast.length === 1 ? "y" : "ies"}`],
          ["03", run ? "Production plan created" : "Ready to initialize", run ? `Current gate: ${run.currentStep ?? "complete"}` : "Start the production pipeline"],
        ].map(([number, label, detail]) => (
          <div key={number} className="flex items-start gap-3">
            <span className="font-mono text-xs text-accent">{number}</span>
            <div><p className="text-sm font-semibold">{label}</p><p className="mt-1 text-[10px] text-grey">{detail}</p></div>
          </div>
        ))}
      </section>

      {!run && (
        <section className="mt-6 flex flex-col gap-4 rounded-2xl border border-line bg-white/[0.03] p-5 sm:flex-row sm:items-center sm:justify-between" aria-live="polite">
          <div>
            <p className="text-sm font-semibold">{autoStart ? "Preparing the render workspace…" : "Your script and cast are ready."}</p>
            <p className="mt-1 text-xs text-grey">
              {autoStart
                ? "The shot plan is opening here. You will not be sent to another page."
                : "Create the shot plan, then review the first frame before anything else is generated."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void initializeProduction()}
            disabled={busy || loading || !contract.scopeId}
            className="accent-btn min-h-12 shrink-0 rounded-full px-7 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Preparing render…" : autoStart ? "Retry preparation" : "Continue to production"}
          </button>
        </section>
      )}
      {!run && error && <p className="mt-3 text-xs text-red-300">{error}</p>}

      {run && (
      <section className="hidden">
        <div className="flex min-w-0 items-start gap-3">
          <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
            finalVideoUrl || referenceImageUrl ? "bg-emerald-400" : busy ? "animate-pulse bg-accent" : "bg-amber-300"
          }`} />
          <div className="min-w-0">
            <p className="text-sm font-semibold">
              {referenceImageUrl
                ? "First frame created"
                : busy
                  ? "Seedream is creating the first frame"
                  : run
                    ? "Production plan only · no media yet"
                    : "Script ready · production not initialized"}
            </p>
            <p className="mt-1 text-[10px] leading-4 text-grey">
              Script: My Studio on this device
              <span className="px-1.5 text-white/20">·</span>
              Plan: {run ? `Supabase ${run.id.slice(0, 8)}` : "not created"}
              <span className="px-1.5 text-white/20">·</span>
              Media: {referenceImageUrl ? "actor library + this production" : "nothing generated"}
            </p>
          </div>
        </div>
        {!referenceImageUrl && run.steps.some((step) => step.key === "reference-frame") ? (
          <button
            type="button"
            onClick={() => void generateReferenceFrame()}
            disabled={busy}
            className="magic-action rounded-full px-4 py-2 text-xs font-semibold disabled:opacity-40"
            data-intelligence-action
            aria-busy={busy}
          >
            {busy ? "Creating..." : "Create first frame"}
          </button>
        ) : null}
      </section>
      )}

      {run && (
        <section
          className={`mt-4 overflow-hidden rounded-[1.75rem] border shadow-[0_24px_80px_rgba(0,0,0,0.3)] ${
            finalVideoUrl ? "border-emerald-400/45" : "border-amber-300/45"
          }`}
          data-production-preview-primary
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-black/35 px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                {productionState.tone === "live" && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-70" />}
                <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                  finalVideoUrl
                    ? "bg-emerald-400"
                    : productionState.tone === "live"
                      ? "bg-accent"
                      : productionState.tone === "failed"
                        ? "bg-red-400"
                        : "bg-amber-300"
                }`} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[9px] font-bold uppercase tracking-[0.2em] text-white/75">
                  {finalVideoUrl ? "Final preview · ready to review" : productionState.eyebrow}
                </p>
                <p className="mt-0.5 truncate text-[10px] text-grey">
                  {finalVideoUrl
                    ? `${contract.duration}s master · ${contract.shotCount} shots`
                    : productionState.detail}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {finalVideoUrl && contract.format === "punch" && (
                <button
                  type="button"
                  onClick={() => void renderPunchOutput()}
                  disabled={busy}
                  className="rounded-full border border-accent/55 px-3 py-1.5 text-[9px] font-semibold text-accent disabled:opacity-40"
                >
                  {busy ? renderProgress || "Rebuilding…" : "Rebuild scenes"}
                </button>
              )}
              <div className="text-right">
                <p className="font-mono text-[10px] text-white">{mediaProgress}% media</p>
                <p className="text-[8px] uppercase tracking-[0.12em] text-grey">
                  {completedStepCount}/{run.steps.length} workflow steps
                </p>
              </div>
            </div>
          </div>

          <div className="border-b border-white/10 bg-[#090d07] px-3 py-3 sm:px-4">
            <div className="mb-4 grid grid-cols-5 gap-1" aria-label="Production phase progress">
              {productionPhases.map((phase) => (
                <div key={phase.label} className="min-w-0">
                  <span className={`block h-1 rounded-full ${
                    phase.complete
                      ? "bg-emerald-400"
                      : phase.live
                        ? "animate-pulse bg-accent"
                        : "bg-white/10"
                  }`} />
                  <p className={`mt-1.5 truncate text-center text-[7px] font-bold uppercase tracking-[0.1em] ${
                    phase.complete ? "text-emerald-300" : phase.live ? "text-accent" : "text-white/30"
                  }`}>
                    {phase.label}
                  </p>
                </div>
              ))}
            </div>
            <div className="mb-2.5 flex items-center justify-between gap-3">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-accent-secondary">
                  Four starting frames · {framesReadyCount}/{shotTimeline.length || contract.shotCount} ready
                </p>
                <p className="mt-0.5 text-[9px] text-grey">
                  These are the exact authored frames Seedance will animate. Select one to inspect its frame or clip.
                </p>
              </div>
              {finalVideoUrl && (
                <button
                  type="button"
                  onClick={() => document.querySelector("#production-output video")?.scrollIntoView({ behavior: "smooth", block: "center" })}
                  className="shrink-0 rounded-full border border-emerald-400/45 px-3 py-1.5 text-[9px] font-semibold text-emerald-300"
                >
                  Play master
                </button>
              )}
            </div>
            <div className="chaplin-scrollbar flex snap-x gap-2 overflow-x-auto pb-2" aria-label="Production scene timeline">
              {shotTimeline.map((shot) => {
                const selected = shot.index === selectedShotIndex;
                const isLive = shot.status === "designing" || shot.status === "animating";
                return (
                  <button
                    type="button"
                    key={`${shot.index}-${shot.title}`}
                    onClick={() => setSelectedShotIndex(shot.index)}
                    className={`group relative min-w-[9.5rem] max-w-[9.5rem] snap-start overflow-hidden rounded-xl border text-left transition ${
                      selected
                        ? "border-accent shadow-[0_0_0_1px_rgba(244,63,105,0.35),0_10px_30px_rgba(0,0,0,0.32)]"
                        : shot.status === "failed"
                          ? "border-red-400/55"
                          : "border-white/10 hover:border-white/25"
                    }`}
                    aria-current={selected ? "true" : undefined}
                  >
                    <div className="relative aspect-video overflow-hidden bg-white/[0.04]">
                      {shot.frameUrl ? (
                        <div
                          className="h-full w-full bg-cover bg-center transition-transform duration-500 group-hover:scale-[1.03]"
                          style={{ backgroundImage: `url("${shot.frameUrl.replaceAll('"', "%22")}")` }}
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center font-mono text-lg text-white/20">
                          {String(shot.index + 1).padStart(2, "0")}
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/15" />
                      {shot.videoUrl && (
                        <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-white text-[10px] text-black">▶</span>
                      )}
                      {isLive && (
                        <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-black/70 px-2 py-1 text-[7px] font-bold uppercase tracking-[0.12em] text-accent">
                          <span className="relative flex h-1.5 w-1.5">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-70" />
                            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
                          </span>
                          Live
                        </span>
                      )}
                      <span className="absolute bottom-1.5 left-2 font-mono text-[8px] text-white/70">{shot.durationSeconds}s</span>
                    </div>
                    <div className="min-h-[3.8rem] px-2.5 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[8px] font-bold uppercase tracking-[0.14em] text-white/45">
                          Scene {String(shot.index + 1).padStart(2, "0")}
                        </p>
                        <span className={`h-1.5 w-1.5 rounded-full ${
                          shot.status === "ready"
                            ? "bg-emerald-400"
                            : shot.status === "failed"
                              ? "bg-red-400"
                              : isLive
                                ? "animate-pulse bg-accent"
                                : shot.frameUrl
                                  ? "bg-amber-300"
                                  : "bg-white/15"
                        }`} />
                      </div>
                      <p className="mt-1 truncate text-[10px] font-semibold text-white">{shot.title}</p>
                      <p className={`mt-1 truncate text-[8px] ${shot.status === "failed" ? "text-red-300" : isLive ? "text-accent" : "text-grey"}`}>
                        {shot.status === "ready"
                          ? "Clip ready"
                          : shot.status === "animating"
                            ? "Animating motion"
                            : shot.status === "designing"
                              ? "Designing frame"
                              : shot.status === "frame_ready"
                                ? "Frame ready"
                              : shot.status === "failed"
                                ? shot.error ?? "Generation stopped"
                                : "Queued"}
                      </p>
                    </div>
                    <span className={`block h-0.5 w-full ${
                      shot.status === "ready"
                        ? "bg-emerald-400"
                        : shot.status === "failed"
                          ? "bg-red-400"
                          : isLive
                            ? "animate-pulse bg-accent"
                            : shot.frameUrl
                              ? "bg-amber-300"
                              : "bg-white/10"
                    }`} />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="relative aspect-video overflow-hidden bg-black">
            {canvasVideoUrl ? (
              <video
                key={canvasVideoUrl}
                src={canvasVideoUrl}
                autoPlay
                muted
                loop
                controls
                playsInline
                className="h-full w-full object-contain"
                aria-label={`Scene ${selectedShotIndex + 1} preview for ${story.title}`}
              />
            ) : canvasImageUrl ? (
              <div
                className={`h-full w-full bg-cover bg-center transition duration-700 ${busy ? "scale-[1.02] opacity-75" : ""}`}
                style={{ backgroundImage: `url("${canvasImageUrl.replaceAll('"', "%22")}")` }}
                role="img"
                aria-label={`Scene ${selectedShotIndex + 1} frame for ${story.title}`}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-center">
                <div>
                  <span className="reel-title text-7xl text-white/15">{cast[0]?.name.slice(0, 1) ?? "C"}</span>
                  <p className="mt-2 text-xs text-grey">No actor image or rendered media is attached.</p>
                </div>
              </div>
            )}

            {!canvasVideoUrl && <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black via-black/10 to-black/35" />}
            {(busy || liveStep) && !canvasVideoUrl && (
              <div className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 animate-[pipeline-live-sweep_2.2s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/15 to-transparent blur-xl" />
            )}
            {!canvasVideoUrl && (
              <div className="absolute inset-x-0 bottom-0 flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-end sm:justify-between">
                <div className="max-w-lg">
                  <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-amber-200">
                    Scene {selectedShotIndex + 1} of {contract.shotCount}
                  </p>
                  <h2 className="reel-title mt-1 text-3xl text-white">
                    {selectedShot?.title ?? productionState.title}
                  </h2>
                  <p className="mt-1 text-xs leading-5 text-white/65">
                    {selectedShot?.error ?? selectedShot?.objective ?? productionState.detail}
                  </p>
                  {canvasImageUrl && !selectedShot?.frameUrl && (
                    <p className="mt-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/45">
                      Identity reference only · this is not generated production media
                    </p>
                  )}
                </div>
                {contract.format === "punch" && (
                  <button
                    type="button"
                    onClick={() => void renderPunchOutput()}
                    disabled={busy}
                    className="magic-action shrink-0 rounded-full px-5 py-3 text-xs font-bold disabled:opacity-40"
                    data-intelligence-action
                    aria-busy={busy}
                  >
                    {busy ? renderProgress || "Rendering…" : reviewHasNoMedia ? "Generate missing preview →" : "Generate preview →"}
                  </button>
                )}
              </div>
            )}
          </div>
          <div className={`flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${
            productionState.tone === "failed"
              ? "border-red-400/30 bg-red-400/[0.07]"
              : productionState.tone === "live"
                ? "border-accent/30 bg-accent/[0.06]"
                : "border-amber-300/25 bg-amber-300/[0.05]"
          }`}>
            <div className="flex min-w-0 items-start gap-3">
              <span className="relative mt-1 flex h-2.5 w-2.5 shrink-0">
                {productionState.tone === "live" && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-70" />
                )}
                <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                  productionState.tone === "live"
                    ? "animate-pulse bg-accent"
                    : productionState.tone === "failed"
                      ? "bg-red-400"
                      : "bg-amber-300"
                }`} />
              </span>
              <div className="min-w-0">
                <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/55">{productionState.eyebrow}</p>
                <p className="mt-1 text-sm font-semibold text-white">{productionState.title}</p>
                <p className="mt-1 text-[10px] leading-4 text-grey">{productionState.detail}</p>
              </div>
            </div>
            {!busy && !finalVideoUrl && contract.format === "punch" && (
              <button
                type="button"
                onClick={() => void renderPunchOutput()}
                className="magic-action shrink-0 rounded-full px-4 py-2 text-[10px] font-bold"
                data-intelligence-action
              >
                {error ? "Retry preview" : "Generate preview"}
              </button>
            )}
            {!busy && reviewStep && finalVideoUrl && (
              <button
                type="button"
                onClick={() => document.querySelector("[data-human-review]")?.scrollIntoView({ behavior: "smooth", block: "center" })}
                className="shrink-0 rounded-full border border-amber-300/60 px-4 py-2 text-[10px] font-bold text-amber-200 hover:bg-amber-300/10"
              >
                Open approval
              </button>
            )}
            {!busy && !referenceImageUrl && contract.format !== "punch" && run.steps.some((step) => step.key === "reference-frame") && (
              <button
                type="button"
                onClick={() => void generateReferenceFrame()}
                className="magic-action shrink-0 rounded-full px-4 py-2 text-[10px] font-bold"
                data-intelligence-action
              >
                Create first frame
              </button>
            )}
          </div>
        </section>
      )}

      {canvasOnly && run && (error || (reviewStep?.key === "creative-review" && finalVideoUrl)) && (
        <section
          className={`mt-4 rounded-2xl border p-4 ${
            error
              ? "border-red-400/35 bg-red-400/[0.06]"
              : "border-amber-300/45 bg-amber-300/[0.06]"
          }`}
          data-studio-production-decision
        >
          {error ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-red-300">Production needs attention</p>
                <p className="mt-1 text-xs leading-5 text-grey">{error}</p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void renderPunchOutput()}
                  disabled={busy}
                  className="magic-action rounded-full px-4 py-2 text-[10px] font-bold disabled:opacity-40"
                  data-intelligence-action
                >
                  Retry generation
                </button>
                {/no active locked voice|custom-voice limit|maximum amount of custom voices/i.test(error) && cast[0] && (
                  <Link
                    href={`/characters/${cast[0].id}/studio`}
                    className="rounded-full border border-red-300/55 px-4 py-2 text-[10px] font-semibold text-red-200"
                  >
                    Open voice lock
                  </Link>
                )}
              </div>
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-amber-200">Human approval</p>
                <h2 className="mt-1 text-sm font-semibold">Review the exact 15-second cut</h2>
                <p className="mt-1 text-[10px] leading-4 text-grey">
                  Approve this master here, or regenerate it without leaving the Scene Studio.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void approveFinalShot()}
                  disabled={busy}
                  className="rounded-full bg-emerald-400 px-4 py-2 text-[10px] font-bold text-[#07160a] disabled:opacity-40"
                >
                  {busy ? "Approving…" : "Approve this cut"}
                </button>
                <button
                  type="button"
                  onClick={() => void renderPunchOutput()}
                  disabled={busy}
                  className="magic-action rounded-full px-4 py-2 text-[10px] font-semibold disabled:opacity-40"
                  data-intelligence-action
                >
                  Regenerate
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {!canvasOnly && <div className={`mt-8 grid gap-8 ${run ? "lg:grid-cols-[0.72fr_1.28fr]" : ""}`}>
        <aside>
          <p className="text-[10px] uppercase tracking-[0.2em] text-grey">Locked cast</p>
          <div className="mt-3 flex flex-wrap gap-3">
            {cast.map((character) => (
              <Link key={character.id} href={`/characters/${character.id}`} className="flex items-center gap-2 rounded-full border border-line pr-3 hover:border-accent">
                <Avatar hue={character.avatarHue} label={character.name} src={character.imageUrl} size={34} />
                <span className="text-xs font-semibold">{character.name}</span>
              </Link>
            ))}
          </div>
          <div className="mt-8 border-l border-accent pl-4">
            <p className="text-[10px] uppercase tracking-[0.18em] text-accent">Output promise</p>
            <p className="mt-2 text-sm leading-6">{contract.definition.promise}</p>
            <p className="mt-2 text-xs text-grey">{contract.definition.structure}</p>
          </div>

          <div
            className="hidden"
            data-production-preview
          >
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-3.5 py-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className="relative flex h-2 w-2 shrink-0">
                  {(liveStep || busy) && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-70" />}
                  <span className={`relative inline-flex h-2 w-2 rounded-full ${
                    finalVideoUrl ? "bg-emerald-400" : liveStep || busy ? "bg-accent" : "bg-amber-300"
                  }`} />
                </span>
                <p className="truncate text-[9px] font-bold uppercase tracking-[0.18em] text-white/75">
                  {finalVideoUrl ? "Master preview" : previewVideoUrl ? "Motion preview" : referenceImageUrl ? "Frame preview" : "Production canvas"}
                </p>
              </div>
              <span className="shrink-0 font-mono text-[9px] text-grey">{pipelineProgress}%</span>
            </div>

            <div className="relative aspect-video overflow-hidden bg-[radial-gradient(circle_at_50%_35%,rgba(244,63,105,0.13),transparent_45%),#050805]">
              {previewVideoUrl ? (
                <video
                  key={previewVideoUrl}
                  src={previewVideoUrl}
                  autoPlay
                  muted
                  loop
                  playsInline
                  controls
                  className="h-full w-full object-cover"
                  aria-label={`Live production preview for ${story.title}`}
                />
              ) : previewImageUrl ? (
                <div
                  className={`h-full w-full bg-cover bg-center transition-all duration-700 ${
                    busy || liveStep ? "scale-[1.03] opacity-80" : ""
                  }`}
                  style={{ backgroundImage: `url("${previewImageUrl.replaceAll('"', "%22")}")` }}
                  role="img"
                  aria-label={referenceImageUrl
                    ? `Generated frame preview for ${story.title}`
                    : `Locked actor preview for ${story.title}`}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <span className="reel-title text-6xl text-white/15">{cast[0]?.name.slice(0, 1) ?? "C"}</span>
                </div>
              )}

              {!previewVideoUrl && <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/25" />}
              {(busy || liveStep) && !previewVideoUrl && (
                <div className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 animate-[pipeline-live-sweep_2.2s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/12 to-transparent blur-xl" />
              )}

              {!previewVideoUrl && (
                <div className="absolute inset-x-0 bottom-0 p-3">
                  <p className="text-[8px] font-bold uppercase tracking-[0.16em] text-accent-secondary">
                    {referenceImageUrl ? "Generated frame locked" : "Using actor identity seed"}
                  </p>
                  <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-white/75">
                    {liveStep
                      ? liveStepCopy(liveStep)
                      : referenceImageUrl
                        ? "This frame becomes the visual source for motion and continuity."
                        : "The canvas will update here as soon as the first production frame is generated."}
                  </p>
                </div>
              )}
            </div>

            <div className="px-3.5 py-3">
              <div className="flex items-center justify-between gap-3">
                <p className="truncate text-[10px] font-semibold">
                  {liveStep?.label ?? (finalVideoUrl ? "Final output ready" : referenceImageUrl ? "Reference frame ready" : "Waiting for first frame")}
                </p>
                <span className="shrink-0 text-[8px] uppercase tracking-[0.12em] text-grey">
                  {liveStep ? `${elapsedLabel(liveElapsedSeconds)} live` : `${completedStepCount}/${run?.steps.length ?? 0} stages`}
                </span>
              </div>
              <div className="mt-2 flex gap-1">
                {(run?.steps ?? []).map((step) => (
                  <span
                    key={step.id}
                    className={`h-1 min-w-0 flex-1 rounded-full ${
                      step.status === "succeeded" || step.status === "approved"
                        ? "bg-emerald-400"
                        : step.status === "needs_review"
                          ? "bg-amber-300"
                          : step.status === "running" || step.status === "queued"
                            ? "animate-pulse bg-accent"
                            : "bg-white/10"
                    }`}
                    title={`${step.label}: ${step.status.replaceAll("_", " ")}`}
                  />
                ))}
              </div>
            </div>
          </div>
        </aside>

        {run && <section>
          <div
            id="production-output"
            className={`mb-5 overflow-hidden rounded-2xl border ${
              finalVideoUrl ? "border-emerald-400/40 bg-emerald-400/[0.05]" : "border-amber-300/35 bg-amber-300/[0.05]"
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-4 p-5">
              <div className="max-w-xl">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${finalVideoUrl ? "bg-emerald-400" : busy ? "animate-pulse bg-accent" : "bg-amber-300"}`} />
                  <p className={`text-[9px] font-bold uppercase tracking-[0.2em] ${finalVideoUrl ? "text-emerald-300" : "text-amber-200"}`}>
                    {finalVideoUrl ? "Output ready" : busy ? "Rendering output" : "Output missing"}
                  </p>
                </div>
                <h2 className="reel-title mt-2 text-3xl">
                  {finalVideoUrl ? `${contract.duration}-second ${contract.definition.label} master` : "There is no video file yet"}
                </h2>
                <p className="mt-2 text-xs leading-5 text-grey">
                  {finalVideoUrl
                    ? "This is the actual rendered deliverable attached to the production—not the workflow timeline."
                    : contract.format === "punch"
                      ? "The checklist advanced, but it never created or attached the four scene clips. Render them now to create the real 15-second output."
                      : "The pipeline has not attached a playable deliverable to this production yet."}
                </p>
              </div>
              {!finalVideoUrl && contract.format === "punch" && (
                <button
                  type="button"
                  onClick={() => void renderPunchOutput()}
                  disabled={busy}
                  className="rounded-full bg-accent px-5 py-3 text-xs font-bold text-white shadow-[0_12px_34px_rgba(244,63,105,0.28)] disabled:opacity-40"
                >
                  {busy ? renderProgress || "Rendering…" : "Render 15-second output →"}
                </button>
              )}
            </div>
            {finalVideoUrl && (
              <div className="border-t border-emerald-400/20 bg-black p-3">
                <video
                  src={finalVideoUrl}
                  controls
                  playsInline
                  className="aspect-video w-full rounded-xl bg-black object-contain"
                  aria-label={`Final output for ${story.title}`}
                />
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-[9px] uppercase tracking-[0.16em] text-emerald-300">
                    {contract.duration}s · {contract.shotCount} shots · locked voice · scene effects · character theme
                  </p>
                  <a
                    href={finalVideoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full border border-white/20 px-3 py-1.5 text-[10px] font-semibold hover:border-accent hover:text-accent"
                  >
                    Open output ↗
                  </a>
                </div>
              </div>
            )}
          </div>
          <div className={`${contract.format === "punch" ? "hidden" : ""} mb-8 overflow-hidden rounded-2xl border border-line`}>
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line p-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${referenceImageUrl ? "bg-emerald-400" : "bg-amber-300"}`} />
                  <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-grey">
                    {referenceImageUrl ? "First output ready" : "No media generated yet"}
                  </p>
                </div>
                <h2 className="reel-title mt-2 text-2xl">
                  {referenceImageUrl ? "Your reference frame is here" : "The script created a production plan"}
                </h2>
                <p className="mt-1 max-w-xl text-xs leading-5 text-grey">
                  {referenceImageUrl
                    ? "The image provider saved this frame to the actor's media library and attached it to this production run."
                    : "Nothing is rendering in the background. Start the first frame here when you are ready to call Seedream."}
                </p>
              </div>
              {!referenceImageUrl && run?.steps.some((step) => step.key === "reference-frame") && (
                <button
                  type="button"
                  onClick={() => void generateReferenceFrame()}
                  disabled={busy}
                  className="magic-action rounded-full px-5 py-2.5 text-xs font-semibold disabled:opacity-40"
                  data-intelligence-action
                  aria-busy={busy}
                >
                  {busy ? "Creating first frame..." : "Create first frame"}
                </button>
              )}
            </div>

            <div className="grid gap-px bg-line sm:grid-cols-3">
              <div className="bg-paper p-3.5">
                <p className="text-[8px] uppercase tracking-[0.16em] text-grey">Script</p>
                <p className="mt-1 text-xs font-semibold">My Studio · this device</p>
              </div>
              <div className="bg-paper p-3.5">
                <p className="text-[8px] uppercase tracking-[0.16em] text-grey">Production plan</p>
                <p className="mt-1 truncate text-xs font-semibold">{run ? `Supabase · ${run.id.slice(0, 8)}` : "Not initialized"}</p>
              </div>
              <div className="bg-paper p-3.5">
                <p className="text-[8px] uppercase tracking-[0.16em] text-grey">Media</p>
                <p className="mt-1 text-xs font-semibold">{referenceImageUrl ? "1 Seedream frame" : "Nothing generated"}</p>
              </div>
            </div>

            {finalVideoUrl && contract.format !== "punch" && (
              <div className="border-t border-line bg-black p-3">
                <video
                  src={finalVideoUrl}
                  controls
                  playsInline
                  className="aspect-video w-full rounded-xl bg-black object-contain"
                  aria-label={`Final mixed shot for ${story.title}`}
                />
                <p className="mt-2 text-[9px] uppercase tracking-[0.16em] text-emerald-300">Final picture, locked voice, effects, room tone, and character theme</p>
              </div>
            )}

            {referenceImageUrl && (
              <>
                <div
                  className="aspect-video w-full bg-black bg-cover bg-center"
                  style={{ backgroundImage: `url("${referenceImageUrl.replaceAll('"', "%22")}")` }}
                  role="img"
                  aria-label={`Generated reference frame for ${story.title}`}
                />
                {(() => {
                  const reviewStep = run.steps.find((step) => step.key === "reference-review");
                  const approved = reviewStep?.status === "approved" || reviewStep?.status === "succeeded";
                  return (
                    <div className={`flex flex-col gap-4 border-t p-4 sm:flex-row sm:items-center sm:justify-between ${
                      approved ? "border-emerald-400/30 bg-emerald-400/[0.07]" : "border-amber-300/30 bg-amber-300/[0.07]"
                    }`}>
                      <div>
                        <p className={`text-[9px] font-semibold uppercase tracking-[0.18em] ${approved ? "text-emerald-300" : "text-amber-200"}`}>
                          {approved ? "Identity and composition approved" : "Human approval required"}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-grey">
                          {approved
                            ? "This frame is locked as the visual source for motion. Seedance is now unlocked."
                            : "Check the actor's face, wardrobe, composition, and lighting. Approve this exact frame to unlock motion generation."}
                        </p>
                      </div>
                      {!approved && (
                        <button
                          type="button"
                          onClick={() => void approveReferenceFrame()}
                          disabled={busy}
                          className="shrink-0 rounded-full bg-emerald-400 px-5 py-2.5 text-xs font-bold text-[#07160a] shadow-[0_10px_30px_rgba(52,211,153,0.2)] disabled:opacity-40"
                        >
                          {busy ? "Approving..." : "Approve frame and continue"}
                        </button>
                      )}
                    </div>
                  );
                })()}
              </>
            )}
          </div>

          <div className="flex items-end justify-between gap-4">
            <div><p className="text-[10px] uppercase tracking-[0.2em] text-grey">Production state</p><h2 className="reel-title mt-1 text-3xl">From script to approved output</h2></div>
          </div>

          {liveStep && (
            <div className="relative mt-5 overflow-hidden rounded-2xl border border-accent/60 bg-accent/[0.08] p-4 shadow-[0_0_38px_rgba(244,63,105,0.12)]" data-live-pipeline-step aria-live="polite">
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 overflow-hidden bg-white/10">
                <span className="block h-full w-1/3 animate-[pipeline-live-sweep_1.8s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-accent to-transparent" />
              </div>
              <div className="flex items-start gap-3">
                <span className="relative mt-1 flex h-3 w-3 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-70" />
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-accent shadow-[0_0_16px_rgba(244,63,105,0.9)]" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-accent">Live now · {liveStep.executor}</p>
                    <span className="font-mono text-[9px] text-accent">{elapsedLabel(liveElapsedSeconds)} elapsed</span>
                  </div>
                  <h3 className="mt-1 text-base font-semibold">{liveStep.label}</h3>
                  <p className="mt-1 text-[11px] leading-5 text-grey">{liveStepCopy(liveStep)}</p>
                </div>
              </div>
            </div>
          )}

          <ol className="relative mt-6 border-l border-line pl-7">
            {run.steps.map((step, index) => {
              const isLive = step.status === "running" || step.status === "queued";
              const displayStatus = step.status === "succeeded"
                && OUTPUT_REQUIRED_STEPS.has(step.key)
                && !stepHasAttachedOutput(step)
                ? "planned"
                : step.status;
              return (
              <li key={step.id} className={`relative pb-7 last:pb-0 ${isLive ? "rounded-r-xl bg-accent/[0.035] py-2 pr-2" : ""}`}>
                <span className={`absolute -left-[2.14rem] top-0 flex h-4 w-4 items-center justify-center rounded-full border bg-paper ${stepTone(displayStatus)} ${isLive ? "shadow-[0_0_18px_rgba(244,63,105,0.55)]" : ""}`}>
                  {isLive && <span className="absolute inset-0 animate-ping rounded-full bg-current opacity-40" />}
                  <span className={`relative h-1.5 w-1.5 rounded-full bg-current ${isLive ? "animate-pulse" : ""}`} />
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[9px] text-grey">{String(index + 1).padStart(2, "0")}</span>
                  <span className="text-[9px] uppercase tracking-wide text-accent-secondary">{step.executor}</span>
                  <span className={`rounded-full border px-2 py-0.5 text-[8px] uppercase ${stepTone(displayStatus)} ${isLive ? "animate-pulse" : ""}`}>
                    {isLive ? `live · ${step.status}` : displayStatus}
                  </span>
                  {step.requiresReview && <span className="text-[8px] uppercase text-amber-200">human approval</span>}
                </div>
                <h3 className="mt-1 text-sm font-semibold">{step.label}</h3>
                {displayStatus === "planned" && (
                  <p className="mt-1 text-[10px] leading-4 text-grey">
                    Planned only · no generated asset is attached to this step.
                  </p>
                )}
                {isLive && <p className="mt-1 text-[10px] leading-4 text-grey">{liveStepCopy(step)}</p>}
                {step.key === "reference-review" && referenceImageUrl && !["approved", "succeeded"].includes(step.status) && (
                  <button
                    type="button"
                    onClick={() => void approveReferenceFrame()}
                    disabled={busy}
                    className="mt-3 rounded-full border border-emerald-400/70 px-4 py-2 text-[10px] font-semibold text-emerald-300 disabled:opacity-40"
                  >
                    {busy ? "Approving..." : "Review frame above · Approve"}
                  </button>
                )}
                {step.key === "creative-review" && step.status === "needs_review" && (
                  <div
                    className="mt-4 overflow-hidden rounded-2xl border border-amber-300/45 bg-amber-300/[0.06]"
                    data-human-review
                  >
                    <div className="grid gap-0 sm:grid-cols-[minmax(0,1fr)_150px]">
                      <div className="bg-black">
                        {finalVideoUrl ? (
                          <video
                            src={finalVideoUrl}
                            controls
                            playsInline
                            className="aspect-video w-full bg-black object-contain"
                            aria-label={`Punch review cut for ${story.title}`}
                          />
                        ) : previewImageUrl ? (
                          <div
                            className="relative aspect-video w-full bg-cover bg-center"
                            style={{ backgroundImage: `url("${previewImageUrl.replaceAll('"', "%22")}")` }}
                            role="img"
                            aria-label={`Locked identity for ${cast[0]?.name ?? story.title}`}
                          >
                            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
                            <div className="absolute inset-x-0 bottom-0 p-4">
                              <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-amber-200">Review cut not rendered</p>
                              <p className="mt-1 text-xs text-white/75">Generate the four identity-locked scene clips before approval.</p>
                            </div>
                          </div>
                        ) : (
                          <div className="flex aspect-video items-center justify-center p-6 text-center text-xs text-grey">
                            No actor identity frame is available for review.
                          </div>
                        )}
                      </div>

                      <div className="border-t border-amber-300/20 p-3 sm:border-l sm:border-t-0">
                        <p className="text-[8px] font-bold uppercase tracking-[0.16em] text-amber-200">Identity lock</p>
                        {previewImageUrl && (
                          <div
                            className="mt-2 aspect-square w-14 rounded-full border-2 border-amber-200/55 bg-cover bg-center"
                            style={{ backgroundImage: `url("${previewImageUrl.replaceAll('"', "%22")}")` }}
                            role="img"
                            aria-label={`${cast[0]?.name ?? "Actor"} identity reference`}
                          />
                        )}
                        <p className="mt-2 text-xs font-semibold">{cast[0]?.name ?? "Locked actor"}</p>
                        <p className="mt-1 text-[9px] leading-4 text-grey">
                          Every shot must match this exact face, age, hair, wardrobe, and silhouette.
                        </p>
                      </div>
                    </div>

                    <div className="border-t border-amber-300/20 p-4">
                      <p className="text-xs font-semibold">
                        {finalVideoUrl ? "Watch the exact cut before approving it." : "There is nothing playable to approve yet."}
                      </p>
                      <p className="mt-1 text-[10px] leading-4 text-grey">
                        {finalVideoUrl
                          ? "If any shot shows a different person, regenerate the cut. Approval locks this exact media."
                          : "The yellow review state is a gate, not a completion. Generate a review cut to continue."}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {!finalVideoUrl && (
                          <button
                            type="button"
                            onClick={() => void renderPunchOutput()}
                            disabled={busy || contract.format !== "punch"}
                            className="magic-action rounded-full px-4 py-2 text-[10px] font-bold disabled:opacity-40"
                            data-intelligence-action
                            aria-busy={busy}
                          >
                            {busy ? renderProgress || "Generating review cut…" : "Generate 4 scene clips →"}
                          </button>
                        )}
                        {finalVideoUrl && (
                          <>
                          <button
                    type="button"
                    onClick={() => void approveFinalShot()}
                    disabled={busy}
                    className="rounded-full bg-emerald-400 px-4 py-2 text-[10px] font-bold text-[#07160a] disabled:opacity-40"
                  >
                    {busy ? "Approving…" : "Approve this exact cut"}
                  </button>
                            <button
                              type="button"
                              onClick={() => void renderPunchOutput()}
                              disabled={busy || contract.format !== "punch"}
                              className="magic-action rounded-full px-4 py-2 text-[10px] font-semibold disabled:opacity-40"
                              data-intelligence-action
                              aria-busy={busy}
                            >
                              Regenerate mismatched shots
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </li>
            )})}
          </ol>
          {error && (
            <div className="mt-4 rounded-xl border border-red-400/35 bg-red-400/[0.06] p-4">
              <p className="text-xs text-red-300">{error}</p>
              {/no active locked voice|custom-voice limit|maximum amount of custom voices/i.test(error) && cast[0] && (
                <div className="mt-3">
                  <p className="text-[10px] leading-4 text-grey">
                    Chaplin will never invent this actor&apos;s speech. Free one confirmed inactive voice slot, lock this actor&apos;s chosen voice, and retry the failed production step.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void openVoiceCapacityRecovery()}
                      disabled={voiceRecoveryBusy}
                      className="rounded-full border border-red-300/60 px-4 py-2 text-[10px] font-semibold text-red-200 disabled:opacity-40"
                    >
                      {voiceRecoveryBusy ? "Checking voices…" : "Free a voice slot"}
                    </button>
                    <Link
                      href={`/characters/${cast[0].id}/studio`}
                      className="magic-action rounded-full px-4 py-2 text-[10px] font-semibold"
                      data-intelligence-action
                    >
                      Open voice lock
                    </Link>
                  </div>
                  {voiceRecoveryOpen && (
                    <div className="mt-3 rounded-lg border border-line bg-black/20 p-3">
                      {voiceRecoveryCandidates.length > 0 && (
                        <>
                          <label className="block text-[9px] font-semibold uppercase tracking-wider text-grey">
                            Confirm an inactive voice
                            <select
                              value={selectedRecoveryVoiceId}
                              onChange={(event) => setSelectedRecoveryVoiceId(event.target.value)}
                              className="mt-2 block w-full rounded-sm border border-line bg-paper px-3 py-2 text-xs normal-case tracking-normal text-ink"
                            >
                              {voiceRecoveryCandidates.map((candidate) => (
                                <option key={candidate.voiceId} value={candidate.voiceId}>
                                  {candidate.name}{candidate.characterId ? ` · ${candidate.characterId.slice(0, 8)}` : ""}
                                </option>
                              ))}
                            </select>
                          </label>
                          <button
                            type="button"
                            onClick={() => void deleteRecoveryVoice()}
                            disabled={voiceRecoveryBusy || !selectedRecoveryVoiceId}
                            className="mt-3 rounded-full border border-red-300/60 px-4 py-2 text-[10px] font-semibold text-red-200 disabled:opacity-40"
                          >
                            {voiceRecoveryBusy ? "Deleting…" : "Delete selected inactive voice"}
                          </button>
                        </>
                      )}
                      {voiceRecoveryMessage && <p className="mt-2 text-[10px] leading-4 text-grey">{voiceRecoveryMessage}</p>}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </section>}
      </div>}

      {!canvasOnly && <section className="mt-10 border-t border-line pt-8">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="reel-title text-3xl">Locked script</h2>
          <span className="text-[9px] uppercase tracking-wide text-grey">{story.scenes.length} beats · expands to {contract.shotCount} shots</span>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {story.scenes.map((scene, index) => {
            const camera = cameraPlanForShot({
              productionTitle: story.title, productionLogline: story.logline, scene,
              sceneIndex: index, sceneCount: story.scenes.length, format: story.format,
              actorName: cast[0].name, actorIdentity: cast[0].personality,
              productName: story.productImageName, hasProductReference: Boolean(story.productImageUrl),
            });
            return (
              <article key={scene.id} className="border-t border-line pt-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-mono text-[9px] text-accent">Beat {String(index + 1).padStart(2, "0")}</p>
                  <span className="rounded-full border border-accent-secondary/40 px-2 py-1 text-[8px] uppercase tracking-wide text-accent-secondary">{camera.movementName}</span>
                </div>
                <h3 className="mt-1 text-xs font-semibold uppercase tracking-wide">{scene.setting}</h3>
                {scene.objective && <p className="mt-2 text-xs text-grey">{scene.objective}</p>}
                {scene.action && <p className="mt-2 text-sm leading-5">{scene.action}</p>}
                <p className="mt-3 text-[10px] leading-4 text-grey">{camera.angle} / {camera.lens}</p>
              </article>
            );
          })}
        </div>
      </section>}
    </main>
  );
}

export default function ProductionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const world = useChaplinStore((state) => state);
  const hydrated = useChaplinStore((state) => state.hydrated);
  const story = getStory(world, id);
  const cast = useMemo(
    () => story ? castForStory(world, story.id).map((item) => item.character) : [],
    [story, world],
  );
  const [frameUrls, setFrameUrls] = useState<string[]>([]);
  const handleFrameUrls = useCallback((urls: string[]) => {
    setFrameUrls((current) => (
      current.length === urls.length && current.every((url, index) => url === urls[index])
        ? current
        : urls
    ));
  }, []);
  const format = normalizeProductionFormat(story?.format);
  const definition = PRODUCTION_FORMATS[format];
  const durationSeconds = story?.durationSeconds ?? definition.durationSeconds;
  const sceneCount = story?.scenes.length ?? productionShotCount(format, durationSeconds);
  const sceneStages: SceneStage[] = [
    {
      id: 1,
      label: "Concept",
      hint: "Title, logline and format.",
      state: "done",
      detail: "Locked",
    },
    {
      id: 2,
      label: "Cast",
      hint: "Who performs this story.",
      state: "done",
      detail: `${cast.length} cast`,
    },
    {
      id: 3,
      label: `${definition.label} production`,
      hint: "Frames, motion, master and approval.",
      state: "active",
      detail: "Open in center canvas",
    },
  ];
  const assets = (story?.scenes ?? []).map((scene, index) => ({
    index,
    setting: scene.setting,
    action: scene.action ?? "",
    previewImageUrl: frameUrls[index] || scene.previewImageUrl,
    lineCount: scene.lines.filter((line) => line.text.trim()).length,
    authored: true,
  }));

  return (
    <section className="unified-studio-shell" data-unified-studio-shell data-studio-mode="render">
      <StudioWorkspaceHeader
        mode="render"
        projectName={story?.title ?? "Production"}
        status="Render studio · private workspace"
        actions={<span className="studio-workspace-header__saved">Autosaved</span>}
      />
      <div className="unified-studio-shell__body">
        {!hydrated || !story ? (
          <div className="flex h-full items-center justify-center text-sm text-grey">
            {hydrated ? "This production is not available in this Studio." : "Opening production…"}
          </div>
        ) : (
          <div className="scene-studio-shell" data-scene-studio-shell data-scene-production-active>
            <SceneStudioRail
              stages={sceneStages}
              step={3}
              onSelect={() => undefined}
              cast={cast}
              formatLabel={definition.label}
              durationSeconds={durationSeconds}
              sceneCount={sceneCount}
              framesReady={assets.filter((asset) => Boolean(asset.previewImageUrl)).length}
              actionLabel="Production open"
              onStartProduction={() => undefined}
              productionMode
            />
            <div className="studio-production-content min-w-0">
              <ProductionWorkspace
                storyId={id}
                embedded
                autoStart
                canvasOnly
                onFrameUrlsChange={handleFrameUrls}
              />
            </div>
            <SceneStudioAssets
              assets={assets}
              busyIndex={null}
              onSelect={() => undefined}
              onGenerateAll={() => undefined}
              canGenerate={false}
              productImageUrl={story.productImageUrl}
              productionMode
            />
          </div>
        )}
      </div>
    </section>
  );
}
