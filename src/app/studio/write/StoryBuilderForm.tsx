"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useChaplinStore } from "@/lib/store";
import type { Character } from "@/lib/types";
import { getClientAuthIdentity } from "@/lib/client-auth";
import SceneStudioRail, { type SceneStage } from "@/components/studio/SceneStudioRail";
import SceneStudioAssets, { type SceneAsset } from "@/components/studio/SceneStudioAssets";
import SceneStudioTimeline from "@/components/studio/SceneStudioTimeline";
import StudioWorkspaceHeader from "@/components/studio/StudioWorkspaceHeader";
import { ProductionWorkspace } from "@/app/productions/[id]/page";
import Avatar from "@/components/Avatar";
import Chip from "@/components/Chip";
import {
  ARCHETYPE_HUE,
  ARCHETYPE_LABEL,
  LICENSE_HUE,
  LICENSE_LABEL,
  money,
} from "@/lib/format";
import {
  PRODUCTION_FORMATS,
  defaultFormatForRole,
  formatsForRole,
  normalizeProductionFormat,
  productionDuration,
  productionShotCount,
  type PunchGenerationMode,
  type ProductionFormat,
} from "@/lib/production-formats";
import {
  CAMERA_MOVEMENTS,
  planCameraForScene,
  type CameraMovementId,
} from "@/lib/camera-movements";
import { auditShotScene, buildShotImagePrompt, validateShotSequence } from "@/lib/shot-director";
import {
  cameraAllowedForEnergy,
  explicitShotCountFromBrief,
  type EnergyState,
  type FramingConstraint,
  type SceneProp,
} from "@/lib/direction-safety";

interface DraftLine {
  characterId: string;
  text: string;
}
interface DraftScene {
  slotId?: string;
  sourceSlotId?: string;
  setting: string;
  objective: string;
  action: string;
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
  lines: DraftLine[];
}

type MagicDraft = {
  title: string;
  logline: string;
  creativeDirection: string;
  castIds: string[];
  sceneProps?: SceneProp[];
  scenes: DraftScene[];
};

type StoredDraft = {
  id: string;
  format: ProductionFormat;
  title: string;
  logline: string;
  body?: {
    brief?: string;
    durationSeconds?: number;
    punchGenerationMode?: PunchGenerationMode;
    creativeDirection?: string;
    castIds?: string[];
    sceneProps?: SceneProp[];
    scenes?: DraftScene[];
    step?: 1 | 2 | 3;
    productImageUrl?: string;
    productImageName?: string;
  };
};

type DraftSaveState = "idle" | "loading" | "saving" | "saved" | "signed-out" | "error";
type MagicRunKind = "concept" | "draft";
type WritingStart = "magic" | "manual";

const MAGIC_TIMELINES: Record<MagicRunKind, Array<{ label: string; detail: string; startsAt: number }>> = {
  concept: [
    { label: "Read the idea", detail: "Finding the strongest promise in your brief", startsAt: 0 },
    { label: "Study the cast", detail: "Connecting the chosen actor's identity and range", startsAt: 3 },
    { label: "Find the hook", detail: "Building the opening image and dramatic angle", startsAt: 7 },
    { label: "Write the concept", detail: "Shaping title, logline, and creative direction", startsAt: 13 },
    { label: "Continuity check", detail: "Making the concept playable for the selected runtime", startsAt: 21 },
  ],
  draft: [
    { label: "Read the brief", detail: "Locking the idea, runtime, and output format", startsAt: 0 },
    { label: "Connect the cast", detail: "Loading identity, voice, look, and performance rules", startsAt: 3 },
    { label: "Build the hook", detail: "Finding the first visual interruption", startsAt: 8 },
    { label: "Shape scene beats", detail: "Writing objectives, action, pressure, and turns", startsAt: 15 },
    { label: "Check the cut", detail: "Testing duration, continuity, and playable output", startsAt: 27 },
  ],
};

function MagicWritingTimeline({ kind, elapsedSeconds }: { kind: MagicRunKind; elapsedSeconds: number }) {
  const stages = MAGIC_TIMELINES[kind];
  let currentIndex = stages.length - 1;
  for (let index = 0; index < stages.length - 1; index += 1) {
    if (elapsedSeconds < stages[index + 1].startsAt) {
      currentIndex = index;
      break;
    }
  }
  const current = stages[currentIndex];
  const next = stages[currentIndex + 1];
  const phaseProgress = next
    ? Math.min(1, Math.max(0, (elapsedSeconds - current.startsAt) / (next.startsAt - current.startsAt)))
    : Math.min(0.9, (elapsedSeconds - current.startsAt) / 18);
  const progress = Math.min(94, ((currentIndex + phaseProgress) / stages.length) * 100);

  return (
    <div
      className="overflow-hidden rounded-xl border border-accent/45 bg-black/25"
      aria-live="polite"
      aria-label="Chaplin writing progress"
      data-magic-timeline
    >
      <div className="flex items-center justify-between gap-4 border-b border-white/10 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-70" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-ink">{current.label}</p>
            <p className="truncate text-[9px] text-grey">{current.detail}</p>
          </div>
        </div>
        <span className="shrink-0 font-mono text-[10px] text-accent">{elapsedSeconds}s live</span>
      </div>
      <div className="h-1 bg-white/[0.06]">
        <div
          className="pipeline-flow-line h-full transition-[width] duration-700 ease-out"
          style={{ width: `${Math.max(4, progress)}%` }}
        />
      </div>
      <ol className="grid gap-0 px-3 py-3 sm:grid-cols-5">
        {stages.map((stage, index) => {
          const complete = index < currentIndex;
          const active = index === currentIndex;
          return (
            <li key={stage.label} className="relative flex items-center gap-2 py-1.5 sm:block sm:px-1.5 sm:py-0">
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border font-mono text-[8px] ${
                complete
                  ? "border-accent-secondary bg-accent-secondary/15 text-accent-secondary"
                  : active
                    ? "animate-pulse border-accent bg-accent/15 text-accent"
                    : "border-white/15 text-white/30"
              }`}>
                {complete ? "✓" : index + 1}
              </span>
              <span className={`text-[8px] font-semibold uppercase tracking-[0.08em] sm:mt-1.5 sm:block ${
                complete ? "text-accent-secondary" : active ? "text-ink" : "text-white/30"
              }`}>
                {stage.label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

const IDEA_STARTERS: Record<ProductionFormat, string[]> = {
  episode: [
    "A simple job becomes a moral choice before dawn",
    "Two rivals must protect the same secret",
    "A comic mistake exposes a dangerous truth",
  ],
  spot: [
    "Make one product benefit impossible to forget",
    "Show the problem and transformation in one visual move",
    "Turn a customer doubt into visible proof",
  ],
  punch: [
    "Open with a pattern-break and land one punchline",
    "Put the actor under pressure and reveal their signature choice",
    "One visual hook, one reversal, one unforgettable final look",
  ],
  spark: [
    "One look that tells us exactly who this actor is",
    "A five-second entrance with a visible point of view",
    "One prop, one gesture, one casting-defining choice",
  ],
};

function emptyScene(): DraftScene {
  return { setting: "", objective: "", action: "", durationSeconds: 4, lines: [] };
}

export default function StoryBuilderForm() {
  const searchParams = useSearchParams();
  const world = useChaplinStore((s) => s);
  const currentUserId = useChaplinStore((s) => s.currentUserId);
  const activeRole = useChaplinStore((s) => s.activeRole);
  const addStory = useChaplinStore((s) => s.addStory);
  const removeStory = useChaplinStore((s) => s.removeStory);

  const [format, setFormat] = useState<ProductionFormat>(() =>
    normalizeProductionFormat(searchParams.get("format"), "punch")
  );
  const [durationSeconds, setDurationSeconds] = useState<number>(() =>
    productionDuration(
      normalizeProductionFormat(searchParams.get("format"), "punch"),
      Number(searchParams.get("duration")),
    )
  );
  const [punchGenerationMode, setPunchGenerationMode] = useState<PunchGenerationMode>("scene-clips");
  const [brief, setBrief] = useState(() => searchParams.get("brief")?.trim() ?? "");
  const [title, setTitle] = useState("");
  const [logline, setLogline] = useState("");
  const [creativeDirection, setCreativeDirection] = useState("");
  const [productImageUrl, setProductImageUrl] = useState("");
  const [productImageName, setProductImageName] = useState("");
  const [productUploadBusy, setProductUploadBusy] = useState(false);
  const [castQuery, setCastQuery] = useState("");
  const [castIds, setCastIds] = useState<string[]>(() => {
    const preset = searchParams.getAll("cast");
    return preset.filter((id) => world.characters.some((c) => c.id === id));
  });
  const [scenes, setScenes] = useState<DraftScene[]>([emptyScene()]);
  const [sceneProps, setSceneProps] = useState<SceneProp[]>([]);
  const [error, setError] = useState("");
  const [magicBusy, setMagicBusy] = useState(false);
  const [magicRunKind, setMagicRunKind] = useState<MagicRunKind>("draft");
  const [magicElapsedSeconds, setMagicElapsedSeconds] = useState(0);
  const [magicMessage, setMagicMessage] = useState("");
  const [magicWriterOpen, setMagicWriterOpen] = useState(false);
  const [startChoiceOpen, setStartChoiceOpen] = useState(false);
  const [writingStart, setWritingStart] = useState<WritingStart | null>(null);
  const [outputChooserOpen, setOutputChooserOpen] = useState(
    () => !searchParams.get("draft") && !searchParams.get("format"),
  );
  const [sceneAssistBusy, setSceneAssistBusy] = useState<number | null>(null);
  const [sceneAssistMessage, setSceneAssistMessage] = useState<{ index: number; text: string } | null>(null);
  const [scenePreviewBusy, setScenePreviewBusy] = useState<number | null>(null);
  const [productionBusy, setProductionBusy] = useState(false);
  const [activeSceneIndex, setActiveSceneIndex] = useState(0);
  const [writingAIConfigured, setWritingAIConfigured] = useState<boolean | null>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [startingProduction, setStartingProduction] = useState(false);
  /*
    The cast a written script belongs to. Magic Write produces a title, logline
    and scenes about specific actors; swapping the cast afterwards left all of
    that naming someone who is no longer in the story, and the production shipped
    as "Ash Reaper: A Day in the Life" cast entirely with a different actor.
    Remembering the authored cast is what makes that drift detectable.
  */
  const [scriptCastIds, setScriptCastIds] = useState<string[]>([]);
  // Set once a production starts; the studio then renders the workspace inline.
  const [productionStoryId, setProductionStoryId] = useState<string | null>(null);
  const [draftId, setDraftId] = useState(() => searchParams.get("draft") ?? "");
  const [draftReady, setDraftReady] = useState(() => !searchParams.get("draft"));
  const [draftSaveState, setDraftSaveState] = useState<DraftSaveState>(
    searchParams.get("draft") ? "loading" : "idle",
  );
  const [draftAccountReady, setDraftAccountReady] = useState(false);
  const [draftAccountId, setDraftAccountId] = useState<string | null>(null);
  const pendingSceneFocusRef = useRef<number | null>(null);
  // Guards every scene render. State cannot do this job: setScenePreviewBusy is
  // async, so two calls in the same tick both read `null` and both proceed.
  const previewRunRef = useRef(false);
  const formatOptions = formatsForRole(activeRole);
  const formatDefinition = PRODUCTION_FORMATS[format];
  const expectedShotCount = explicitShotCountFromBrief(brief)
    ?? productionShotCount(format, durationSeconds);

  useEffect(() => {
    if (!startChoiceOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setStartChoiceOpen(false);
        setWritingStart(null);
        setOutputChooserOpen(true);
      }
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [startChoiceOpen]);

  useEffect(() => {
    if (!searchParams.get("format") || searchParams.get("draft")) return;
    const timer = window.setTimeout(() => {
      const input = document.querySelector<HTMLTextAreaElement>("[data-concept-magic-brief]");
      input?.scrollIntoView({ behavior: "smooth", block: "center" });
      input?.focus({ preventScroll: true });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [searchParams]);

  function returnToRuntimeChooser() {
    setStartChoiceOpen(false);
    setWritingStart(null);
    setOutputChooserOpen(true);
  }

  function chooseWritingStart(path: WritingStart) {
    setStartChoiceOpen(false);
    setWritingStart(path);
    if (path === "magic") {
      setStep(1);
      focusCreationArea();
      return;
    }
    setStep(1);
    window.setTimeout(() => {
      document.querySelector("[data-manual-writer]")?.scrollIntoView({ behavior: "smooth", block: "start" });
      document.querySelector<HTMLInputElement>("[data-manual-concept-title]")?.focus({ preventScroll: true });
    }, 0);
  }

  useEffect(() => {
    if (formatOptions.includes(format)) return;
    const nextFormat = defaultFormatForRole(activeRole);
    const timer = window.setTimeout(() => {
      setFormat(nextFormat);
      setDurationSeconds(productionDuration(nextFormat));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeRole, format, formatOptions]);

  useEffect(() => {
    let cancelled = false;
    void getClientAuthIdentity()
      .then((identity) => {
        if (cancelled) return;
        setDraftAccountId(identity?.id ?? null);
        setDraftAccountReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setDraftAccountId(null);
        setDraftAccountReady(true);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const requestedDraftId = searchParams.get("draft");
    if (!requestedDraftId) return;
    if (!draftAccountReady) return;
    if (!draftAccountId) {
      const signedOutTimer = window.setTimeout(() => {
        setDraftReady(true);
        setDraftSaveState("signed-out");
        setError("Sign in to open this private draft.");
      }, 0);
      return () => window.clearTimeout(signedOutTimer);
    }
    let cancelled = false;
    void fetch(`/api/drafts?id=${encodeURIComponent(requestedDraftId)}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json() as { draft?: StoredDraft; error?: string };
        if (!response.ok || !data.draft) throw new Error(data.error || "Could not open this draft.");
        return data.draft;
      })
      .then((stored) => {
        if (cancelled) return;
        const body = stored.body ?? {};
        setFormat(stored.format);
        setTitle(stored.title);
        setLogline(stored.logline);
        setBrief(body.brief ?? "");
        setDurationSeconds(productionDuration(stored.format, body.durationSeconds));
        setPunchGenerationMode(body.punchGenerationMode === "single-take" ? "single-take" : "scene-clips");
        setCreativeDirection(body.creativeDirection ?? "");
        setProductImageUrl(body.productImageUrl ?? "");
        setProductImageName(body.productImageName ?? "");
        setCastIds(Array.isArray(body.castIds) ? body.castIds : []);
        setSceneProps(Array.isArray(body.sceneProps) ? body.sceneProps : []);
        setScenes(
          Array.isArray(body.scenes) && body.scenes.length
            ? body.scenes.map((scene) => ({
                ...scene,
                durationSeconds: scene.durationSeconds ?? (scene.durationMs ? scene.durationMs / 1000 : 4),
              }))
            : [emptyScene()]
        );
        setActiveSceneIndex(0);
        setStep(body.step === 2 || body.step === 3 ? body.step : 1);
        setDraftId(stored.id);
        setDraftReady(true);
        setDraftSaveState("saved");
      })
      .catch((loadError) => {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : "Could not open this draft.");
        setDraftReady(true);
        setDraftSaveState("error");
      });
    return () => { cancelled = true; };
  }, [draftAccountId, draftAccountReady, searchParams]);

  useEffect(() => {
    if (!draftReady || !draftAccountReady) return;
    const hasWork = Boolean(
      brief.trim() ||
      title.trim() ||
      logline.trim() ||
      creativeDirection.trim() ||
      productImageUrl ||
      castIds.length ||
      scenes.some((scene) => scene.setting.trim() || scene.objective?.trim() || scene.action?.trim() || scene.lines.some((line) => line.text.trim())),
    );
    if (!hasWork) return;
    if (!draftAccountId) {
      const signedOutTimer = window.setTimeout(() => setDraftSaveState("signed-out"), 0);
      return () => window.clearTimeout(signedOutTimer);
    }

    const timer = window.setTimeout(() => {
      setDraftSaveState("saving");
      void fetch("/api/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: draftId || undefined,
          format,
          title,
          logline,
          body: {
            brief,
            durationSeconds,
            punchGenerationMode,
            creativeDirection,
            castIds,
            sceneProps,
            scenes,
            step,
            productImageUrl,
            productImageName,
          },
        }),
      })
        .then(async (response) => {
          const data = await response.json() as { draft?: StoredDraft; error?: string };
          if (response.status === 401) {
            setDraftSaveState("signed-out");
            return null;
          }
          if (!response.ok || !data.draft) throw new Error(data.error || "Draft could not be saved.");
          return data.draft;
        })
        .then((saved) => {
          if (!saved) return;
          if (!draftId) {
            setDraftId(saved.id);
            const params = new URLSearchParams(window.location.search);
            params.set("draft", saved.id);
            window.history.replaceState(window.history.state, "", `${window.location.pathname}?${params.toString()}`);
          }
          setDraftSaveState("saved");
        })
        .catch(() => setDraftSaveState("error"));
    }, 900);

    return () => window.clearTimeout(timer);
  }, [brief, castIds, creativeDirection, draftAccountId, draftAccountReady, draftId, draftReady, durationSeconds, format, logline, productImageName, productImageUrl, punchGenerationMode, sceneProps, scenes, step, title]);

  useEffect(() => {
    fetch("/api/write/magic", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { configured?: boolean }) => setWritingAIConfigured(Boolean(data.configured)))
      .catch(() => setWritingAIConfigured(false));
  }, []);

  useEffect(() => {
    if (!magicBusy) return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setMagicElapsedSeconds(Math.max(1, Math.floor((Date.now() - startedAt) / 1000)));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [magicBusy]);

  useEffect(() => {
    const sceneIndex = pendingSceneFocusRef.current;
    if (sceneIndex === null) return;
    pendingSceneFocusRef.current = null;
    const sceneCard = document.querySelector<HTMLElement>(`[data-scene-card="${sceneIndex}"]`);
    const settingInput = document.querySelector<HTMLInputElement>(`[data-scene-setting="${sceneIndex}"]`);
    sceneCard?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => settingInput?.focus(), 320);
  }, [scenes.length]);

  useEffect(() => {
    const applyVoiceDirection = (event: Event) => {
      const direction = (event as CustomEvent<{ brief?: string | null }>).detail?.brief?.trim();
      if (!direction) return;
      setBrief((current) => {
        if (!current.trim()) return direction;
        if (current.toLowerCase().includes(direction.toLowerCase())) return current;
        return `${current.trim()}\n${direction}`;
      });
      setMagicMessage("Voice direction added to this production.");
    };
    window.addEventListener("chaplin:story-assist", applyVoiceDirection);
    return () => window.removeEventListener("chaplin:story-assist", applyVoiceDirection);
  }, []);

  // Concierge hand-off: ?brief=…&auto=1 lands here with the draft already writing.
  const conciergeRan = useRef(false);

  const castCharacters = castIds
    .map((id) => world.characters.find((c) => c.id === id))
    .filter((c): c is NonNullable<typeof c> => Boolean(c));

  const totalFee = castCharacters.reduce(
    (sum, c) => sum + (c.licenseType === "open" ? 0 : c.royaltyRate),
    0
  );

  const searchResults = useMemo(() => {
    const q = castQuery.trim().toLowerCase();
    if (!q) return world.characters;
    return world.characters.filter(
      (c) => c.name.toLowerCase().includes(q) || c.tagline.toLowerCase().includes(q)
    );
  }, [world.characters, castQuery]);

  function toggleCast(id: string) {
    setCastIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      if (next.length === prev.length) return prev;
      // Every existing preview was framed around the previous cast, so it no
      // longer depicts this scene. Drop the stale stills and say so, rather than
      // leaving images of actors who are no longer in the story.
      setScenes((current) => current.map((scene) => (
        scene.previewImageUrl || scene.previewAssetId
          ? { ...scene, previewImageUrl: undefined, previewAssetId: undefined }
          : scene
      )));
      setSceneAssistMessage(null);
      const stranded = scriptCastIds
        .filter((id) => !next.includes(id))
        .map((id) => world.characters.find((character) => character.id === id)?.name)
        .filter(Boolean);
      setMagicMessage(stranded.length
        ? `Cast changed — scene stills were cleared, and the script is still written for ${stranded.join(", ")}. Rewrite it for the new cast before producing.`
        : "Cast changed — scene stills were cleared. Regenerate them so every shot shows the new cast.");
      return next;
    });
  }

  async function uploadProductImage(file: File) {
    setProductUploadBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch("/api/products/reference", { method: "POST", body: form });
      const data = await response.json() as { url?: string; name?: string; error?: string };
      if (!response.ok || !data.url) throw new Error(data.error || "Product image could not be uploaded.");
      setProductImageUrl(data.url);
      setProductImageName(data.name || file.name);
      setMagicMessage("Product reference locked. Chaplin will preserve this exact product in the ad.");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Product image could not be uploaded.");
    } finally {
      setProductUploadBusy(false);
    }
  }

  function addScene() {
    const nextIndex = scenes.length;
    pendingSceneFocusRef.current = nextIndex;
    setActiveSceneIndex(nextIndex);
    setScenes((prev) => [...prev, emptyScene()]);
  }
  function removeScene(i: number) {
    setScenes((prev) => prev.filter((_, idx) => idx !== i));
    setActiveSceneIndex((current) => {
      if (current > i) return current - 1;
      if (current === i) return Math.max(0, Math.min(i, scenes.length - 2));
      return current;
    });
  }
  function updateSceneSetting(i: number, value: string) {
    setScenes((prev) => prev.map((sc, idx) => (
      idx === i ? { ...sc, setting: value, previewImageUrl: undefined, previewAssetId: undefined } : sc
    )));
  }
  function updateScene(i: number, patch: Partial<DraftScene>) {
    const invalidatesPreview = patch.setting !== undefined
      || patch.objective !== undefined
      || patch.action !== undefined
      || patch.cameraMovementId !== undefined;
    const carriesGeneratedPreview = patch.previewImageUrl !== undefined || patch.previewAssetId !== undefined;
    setScenes((prev) => prev.map((scene, index) => (
      index === i
        ? {
            ...scene,
            ...patch,
            ...(invalidatesPreview && !carriesGeneratedPreview
              ? { previewImageUrl: undefined, previewAssetId: undefined }
              : {}),
          }
        : scene
    )));
  }
  function addLine(sceneIdx: number) {
    setScenes((prev) =>
      prev.map((sc, idx) =>
        idx === sceneIdx
          ? { ...sc, lines: [...sc.lines, { characterId: castIds[0] ?? "", text: "" }] }
          : sc
      )
    );
  }
  function removeLine(sceneIdx: number, lineIdx: number) {
    setScenes((prev) =>
      prev.map((sc, idx) =>
        idx === sceneIdx ? { ...sc, lines: sc.lines.filter((_, li) => li !== lineIdx) } : sc
      )
    );
  }
  function updateLine(sceneIdx: number, lineIdx: number, patch: Partial<DraftLine>) {
    setScenes((prev) =>
      prev.map((sc, idx) =>
        idx === sceneIdx
          ? {
              ...sc,
              lines: sc.lines.map((ln, li) => (li === lineIdx ? { ...ln, ...patch } : ln)),
            }
          : sc
      )
    );
  }

  async function createMagicDraft({ conceptOnly = false }: { conceptOnly?: boolean } = {}) {
    if (format === "spot" && !productImageUrl) {
      setError("Upload the product image first. It is the visual source of truth for this ad.");
      setStep(1);
      document.querySelector("[data-product-reference]")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setMagicRunKind(conceptOnly ? "concept" : "draft");
    setMagicElapsedSeconds(0);
    setMagicBusy(true);
    setError("");
    setMagicMessage("");
    try {
      const response = await fetch("/api/write/magic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format,
          durationSeconds,
          brief,
          title,
          logline,
          productImageUrl,
          productImageName,
          castIds,
          /*
            When a cast is already chosen, only those actors are offered.
            Sending the whole shelf alongside the chosen ids let the model write
            about someone else entirely - a Punch cast with one actor came back
            as a story about another - because the shelf reads as a menu.
            Narrowing the input makes the cast a constraint, not a suggestion.
          */
          characters: (castIds.length
            ? world.characters.filter((character) => castIds.includes(character.id))
            : world.characters
          ).map((character) => ({
            id: character.id,
            name: character.name,
            archetype: character.archetype,
            tagline: character.tagline,
            personality: character.personality,
            voiceGender: character.voiceGender,
            voiceDesc: character.voiceDesc,
            productionBible: character.productionBible,
            cardV2: character.cardV2,
          })),
        }),
      });
      const data = await response.json() as {
        draft?: MagicDraft;
        provider?: string;
        error?: string;
        configured?: boolean;
        warning?: string;
      };
      if (!response.ok || !data.draft) throw new Error(data.error || "Magic Writer could not build this draft.");
      const draft = data.draft;
      setTitle(draft.title);
      setLogline(draft.logline);
      setCreativeDirection(draft.creativeDirection);
      setSceneProps(draft.sceneProps ?? []);
      if (!conceptOnly) {
        /*
          A cast the creator already chose is the brief, not a suggestion.
          Magic Write used to replace it with whatever the model picked, so a
          Punch cast with Ash Reaper came back titled for Ash Reaper but cast
          with two other actors - the script and the performers disagreed from
          the moment it was written, and the creator's own choice was silently
          discarded. The model only picks when nothing is cast yet.
        */
        const suggestedCastIds = draft.castIds.filter((id) => world.characters.some((character) => character.id === id));
        const nextCastIds = castIds.length ? castIds : suggestedCastIds;
        setCastIds(nextCastIds);
        const lead = world.characters.find((character) => character.id === nextCastIds[0]) ?? castCharacters[0];
        const nextScenes = (draft.scenes.length ? draft.scenes : [{
          setting: "INT. CHARACTER WORLD - CONTINUOUS",
          objective: `Reveal ${lead?.name ?? "the actor"} through one visible, situation-changing choice.`,
          action: `${lead?.name ?? "The actor"} enters under immediate pressure, finds the detail everyone else missed, and makes one physical choice that changes the scene.`,
          lines: [],
        }]).map((scene) => ({
          ...scene,
          durationSeconds: scene.durationSeconds ?? (scene.durationMs ? scene.durationMs / 1000 : 4),
        }));
        setScenes(nextScenes);
        /*
          The script belongs to the actors it is about, which is not always the
          actors it cast. When nothing was chosen up front the model picks both,
          and it can pick them inconsistently - a Punch came back titled "Ash
          Reaper: Burn Slow" and cast with an entirely different actor, so the
          cover named someone the audience would never see.

          Any actor the concept names but did not cast is recorded here, which
          makes the mismatch the same detectable drift as swapping a cast out:
          production is refused until the script and its performers agree.
        */
        const conceptText = `${draft.title} ${draft.logline}`;
        const namedButUncast = world.characters
          .filter((character) => (
            !nextCastIds.includes(character.id)
            && character.name.trim().length > 2
            && new RegExp(`(?<![\\w])${character.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w])`, "i").test(conceptText)
          ))
          .map((character) => character.id);
        setScriptCastIds([...nextCastIds, ...namedButUncast]);
        if (namedButUncast.length) {
          const names = namedButUncast
            .map((id) => world.characters.find((character) => character.id === id)?.name)
            .filter(Boolean)
            .join(", ");
          setError(`This concept is written about ${names}, who ${namedButUncast.length === 1 ? "is" : "are"} not in the cast. Add ${namedButUncast.length === 1 ? "them" : "those actors"} or rewrite the concept for the cast you have.`);
        }
        setActiveSceneIndex(0);
        setStep(3);
        /*
          Magic writes the scenes; it does not spend on rendering them. This
          used to queue every first frame the moment the draft landed, so a
          writing action silently started paid image generation before the
          creator had read a single scene. Rendering now waits for an explicit
          Generate action.
        */
      }
      setWritingAIConfigured(Boolean(data.configured));
      setMagicMessage(
        data.warning || (conceptOnly
          ? data.provider === "openai"
            ? "Concept ready. GPT-5.6 Terra filled the title, logline, and creative direction; everything remains editable."
            : "Concept ready. The three fields are filled and still completely editable."
          : data.provider === "openai"
            ? "GPT-5.6 Terra expanded your input into a complete, editable production draft."
            : "A complete local draft is ready. Add your OpenAI key for deeper character-aware variations.")
      );
    } catch (magicError) {
      setError(magicError instanceof Error ? magicError.message : "Magic Writer failed.");
    } finally {
      setMagicBusy(false);
    }
  }

  useEffect(() => {
    if (conciergeRan.current) return;
    if (searchParams.get("auto") !== "1") return;
    if (brief.trim().length < 5 || world.characters.length === 0) return;
    conciergeRan.current = true;
    const timer = window.setTimeout(() => void createMagicDraft(), 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot hand-off once characters exist
  }, [world.characters.length]);

  function continueToScenes() {
    setStep(3);
    const hasScenePlan = scenes.some((scene) =>
      Boolean(scene.setting.trim() || scene.objective.trim() || scene.action.trim() || scene.lines.some((line) => line.text.trim()))
    );
    if (!hasScenePlan && castCharacters.length > 0) {
      void createMagicDraft();
    }
  }

  async function assistScene(sceneIndex: number) {
    const currentScene = scenes[sceneIndex];
    if (!currentScene) return;
    setSceneAssistBusy(sceneIndex);
    setSceneAssistMessage(null);
    setError("");
    try {
      const sceneBrief = [
        brief,
        title ? `Production title: ${title}.` : "",
        logline ? `Overall logline: ${logline}.` : "",
        creativeDirection ? `Creative direction: ${creativeDirection}.` : "",
        `Focus on scene ${sceneIndex + 1} only. Preserve the user's intent and turn it into one camera-playable beat. Dialogue is optional; use it only if spoken words genuinely improve the beat.`,
        currentScene.setting ? `Current setting: ${currentScene.setting}.` : "",
        currentScene.objective ? `Current objective: ${currentScene.objective}.` : "",
        currentScene.action ? `Current visible action: ${currentScene.action}.` : "",
        currentScene.lines.length
          ? `Current dialogue: ${currentScene.lines.map((line) => line.text).filter(Boolean).join(" / ")}.`
          : "The user has not requested dialogue.",
      ].filter(Boolean).join(" ");

      const response = await fetch("/api/write/magic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format,
          durationSeconds,
          brief: sceneBrief,
          title,
          logline,
          productImageUrl,
          productImageName,
          castIds,
          /*
            When a cast is already chosen, only those actors are offered.
            Sending the whole shelf alongside the chosen ids let the model write
            about someone else entirely - a Punch cast with one actor came back
            as a story about another - because the shelf reads as a menu.
            Narrowing the input makes the cast a constraint, not a suggestion.
          */
          characters: (castIds.length
            ? world.characters.filter((character) => castIds.includes(character.id))
            : world.characters
          ).map((character) => ({
            id: character.id,
            name: character.name,
            archetype: character.archetype,
            tagline: character.tagline,
            personality: character.personality,
            voiceGender: character.voiceGender,
            voiceDesc: character.voiceDesc,
            productionBible: character.productionBible,
            cardV2: character.cardV2,
          })),
        }),
      });
      const data = await response.json() as {
        draft?: MagicDraft;
        provider?: string;
        error?: string;
        warning?: string;
      };
      if (!response.ok || !data.draft) throw new Error(data.error || "Magic Scene could not shape this beat.");
      const returnedScenes = Array.isArray(data.draft.scenes) ? data.draft.scenes : [];
      const candidate = returnedScenes[Math.min(sceneIndex, returnedScenes.length - 1)] ?? returnedScenes[0];
      const lead = castCharacters[0];
      const playableScene = candidate ?? {
        setting: currentScene.setting || "INT. CHARACTER WORLD - CONTINUOUS",
        objective: currentScene.objective || `Reveal ${lead?.name ?? "the actor"} through one visible, situation-changing choice.`,
        action: currentScene.action || `${lead?.name ?? "The actor"} enters frame under immediate pressure, notices the one detail everyone else missed, and makes a physical choice that changes the balance of the scene.`,
        lines: currentScene.lines,
      };
      const validCastIds = new Set(castCharacters.map((character) => character.id));
      const shapedScene: DraftScene = {
        slotId: playableScene.slotId,
        sourceSlotId: playableScene.sourceSlotId,
        setting: playableScene.setting || currentScene.setting,
        objective: playableScene.objective || currentScene.objective,
        action: playableScene.action || currentScene.action,
        energyState: playableScene.energyState,
        lockedCharacterIds: playableScene.lockedCharacterIds,
        dressing: playableScene.dressing,
        behaviorTell: playableScene.behaviorTell,
        cameraMovementId: playableScene.cameraMovementId,
        durationMs: playableScene.durationMs,
        durationSeconds: playableScene.durationMs ? playableScene.durationMs / 1000 : currentScene.durationSeconds ?? 4,
        motionMode: playableScene.motionMode,
        motionFromSlotId: playableScene.motionFromSlotId,
        framingConstraint: playableScene.framingConstraint,
        sensitiveNegatives: playableScene.sensitiveNegatives,
        referencedProps: playableScene.referencedProps,
        dialogueFramingConstraint: playableScene.dialogueFramingConstraint,
        lines: playableScene.lines
          .filter((line) => validCastIds.has(line.characterId) && line.text.trim())
          .slice(0, 3),
      };
      setSceneProps(data.draft.sceneProps ?? sceneProps);
      updateScene(sceneIndex, shapedScene);
      await generateScenePreview(shapedScene, sceneIndex);
      setSceneAssistMessage({
        index: sceneIndex,
        text: data.warning || (!candidate
          ? `Scene ${sceneIndex + 1} was repaired locally and is ready to edit.`
          : data.provider === "openai"
          ? `Scene ${sceneIndex + 1} is shaped and still completely editable.`
          : `Scene ${sceneIndex + 1} was tightened locally and remains editable.`),
      });
    } catch (assistError) {
      setError(assistError instanceof Error ? assistError.message : "Magic Scene failed.");
    } finally {
      setSceneAssistBusy(null);
    }
  }

  /**
   * Single entry point, guarded against overlapping runs. Callers must go
   * through generateScenePreview or generateAllScenePreviews so that only one
   * render is ever in flight; this core is deliberately unguarded so the batch
   * can drive it in a loop.
   */
  async function runScenePreview(scene: DraftScene, sceneIndex: number, lead: Character) {
    setScenePreviewBusy(sceneIndex);
    setError("");
    try {
      const cameraPlan = planCameraForScene({
        movementId: scene.cameraMovementId,
        setting: scene.setting,
        objective: scene.objective,
        action: scene.action,
        format,
        sceneIndex,
        sceneCount: scenes.length,
      });
      // Only identities inside this slot's safety budget receive recognition
      // image N lines up with "ACTOR LOCK … matches reference image N".
      const lockedIds = scene.lockedCharacterIds?.length ? scene.lockedCharacterIds : [lead.id];
      const sceneCast = lockedIds
        .map((id) => castCharacters.find((actor) => actor.id === id))
        .filter((actor): actor is Character => Boolean(actor));
      if (!sceneCast.length) sceneCast.push(lead);
      const referenceImages = [
        ...sceneCast.map((actor) => actor.imageUrl ?? actor.galleryUrls?.[0] ?? actor.bannerUrl ?? ""),
        productImageUrl,
      ].filter(Boolean);
      const prompt = buildShotImagePrompt({
        productionTitle: title || "Untitled production",
        productionLogline: logline,
        scene: { ...scene, cameraMovementId: cameraPlan.movementId },
        sceneIndex,
        sceneCount: scenes.length,
        format,
        actorName: lead.name,
        actorIdentity: lead.personality,
        actors: sceneCast.map((actor) => ({ name: actor.name, identity: actor.personality })),
        productName: productImageName,
        hasProductReference: Boolean(productImageUrl),
      });
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "image",
          characterId: lead.id,
          castCharacterIds: sceneCast.map((actor) => actor.id),
          imagePurpose: "scene",
          referenceImages,
          prompt,
        }),
      });
      const data = await response.json() as { url?: string; assetId?: string; error?: string };
      if (!response.ok || !data.url || !data.assetId) {
        throw new Error(data.error || `Scene ${sceneIndex + 1} thumbnail was not created.`);
      }
      updateScene(sceneIndex, {
        durationSeconds: scene.durationSeconds ?? (scene.durationMs ? scene.durationMs / 1000 : 4),
        cameraMovementId: cameraPlan.movementId,
        previewImageUrl: data.url,
        previewAssetId: data.assetId,
      });
      return true;
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : `Scene ${sceneIndex + 1} thumbnail failed.`);
      return false;
    } finally {
      setScenePreviewBusy(null);
    }
  }

  async function generateScenePreview(scene: DraftScene, sceneIndex: number, lead = castCharacters[0]) {
    if (!lead || previewRunRef.current) return false;
    previewRunRef.current = true;
    try {
      return await runScenePreview(scene, sceneIndex, lead);
    } finally {
      previewRunRef.current = false;
    }
  }

  async function generateAllScenePreviews(nextScenes = scenes, lead = castCharacters[0]) {
    if (!lead || previewRunRef.current) return;
    previewRunRef.current = true;
    try {
      for (let index = 0; index < nextScenes.length; index += 1) {
        await runScenePreview(nextScenes[index], index, lead);
      }
    } finally {
      previewRunRef.current = false;
    }
  }

  async function handleStartProduction() {
    // Two buttons can start a production - the rail action and the step-3
    // submit - so both busy flags gate it and both are set together.
    if (startingProduction || productionBusy) return;
    if (format === "spot" && !productImageUrl) {
      setError("Upload the product image before starting an ad production.");
      setStep(1);
      document.querySelector("[data-product-reference]")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (!title.trim() || !logline.trim()) {
      setError(`Give the ${formatDefinition.label} a title and a logline first.`);
      setStep(1);
      return;
    }
    if (castCharacters.length === 0) {
      setError("Lock at least one actor before production.");
      setStep(2);
      return;
    }
    // Refuse rather than ship a cut whose title, logline and scenes name an
    // actor who is not in it.
    const stranded = scriptCastIds
      .filter((id) => !castIds.includes(id))
      .map((id) => world.characters.find((character) => character.id === id)?.name)
      .filter(Boolean);
    if (stranded.length) {
      setError(`This script was written for ${stranded.join(", ")}, who is no longer cast. Rewrite the concept and scenes for the current cast before producing.`);
      setStep(3);
      return;
    }
    const validScenes = scenes
      .map((sc, sceneIndex) => ({
        ...(() => {
          const cameraPlan = planCameraForScene({
            movementId: sc.cameraMovementId,
            setting: sc.setting,
            objective: sc.objective,
            action: sc.action,
            format,
            sceneIndex,
            sceneCount: scenes.length,
          });
          return { cameraMovementId: cameraPlan.movementId };
        })(),
        setting: sc.setting.trim() || "An unnamed scene",
        objective: sc.objective.trim() || undefined,
        action: sc.action.trim() || undefined,
        slotId: sc.slotId,
        sourceSlotId: sc.sourceSlotId,
        energyState: sc.energyState,
        lockedCharacterIds: sc.lockedCharacterIds,
        dressing: sc.dressing,
        behaviorTell: sc.behaviorTell,
        durationMs: sc.durationMs,
        durationSeconds: sc.durationSeconds ?? (sc.durationMs ? sc.durationMs / 1000 : 4),
        motionMode: sc.motionMode,
        motionFromSlotId: sc.motionFromSlotId,
        framingConstraint: sc.framingConstraint,
        sensitiveNegatives: sc.sensitiveNegatives,
        referencedProps: sc.referencedProps,
        dialogueFramingConstraint: sc.dialogueFramingConstraint,
        previewImageUrl: sc.previewImageUrl,
        previewAssetId: sc.previewAssetId,
        lines: sc.lines.filter((ln) => ln.characterId && ln.text.trim()),
      }))
      .filter((sc) => Boolean(sc.objective || sc.action || sc.lines.length > 0));

    if (validScenes.length === 0) {
      setError("Add a scene objective, visible action, or a line of dialogue.");
      setStep(3);
      return;
    }
    const expectedSceneCount = explicitShotCountFromBrief(brief)
      ?? productionShotCount(format, durationSeconds);
    const authoredSourceCount = new Set(validScenes.map((scene, index) => scene.sourceSlotId || String(index + 1))).size;
    if (authoredSourceCount !== expectedSceneCount) {
      setError(`This production needs exactly ${expectedSceneCount} authored beats before safety splits. It currently has ${authoredSourceCount}.`);
      setStep(3);
      return;
    }
    const sequenceValidation = validateShotSequence(validScenes, validScenes.length);
    if (!sequenceValidation.valid) {
      setError(sequenceValidation.error ?? "The scene sequence is incomplete.");
      setStep(3);
      document.querySelector("[data-scene-storyboard]")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    setError("");
    setStartingProduction(true);
    setProductionBusy(true);
    const story = addStory({
      title: title.trim(),
      logline: logline.trim(),
      format,
      durationSeconds,
      punchGenerationMode: format === "punch" ? punchGenerationMode : undefined,
      status: "production",
      creativeDirection: creativeDirection.trim() || undefined,
      sceneProps,
      productImageUrl: productImageUrl || undefined,
      productImageName: productImageName || undefined,
      authorId: currentUserId,
      coverHue: castCharacters[0]?.avatarHue ?? 205,
      castCharacterIds: castIds,
      scenes: validScenes,
    });
    /*
      Persist the story before anything references it. addStory only writes to
      the client store, so a pipeline run used to be created against a story id
      the database had never seen: the run existed with its full script, the
      story did not, and Productions listed nothing. Awaited so the row is in
      place before the production starts.
    */
    try {
      const storyResponse = await fetch("/api/stories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: story.id,
          title: story.title,
          logline: story.logline,
          format,
          durationSeconds,
          punchGenerationMode: format === "punch" ? punchGenerationMode : undefined,
          coverHue: story.coverHue,
          posterUrl: validScenes.find((scene) => scene.previewImageUrl)?.previewImageUrl ?? null,
        }),
      });
      const storyResult = await storyResponse.json().catch(() => null) as { error?: string } | null;
      if (!storyResponse.ok) {
        throw new Error(storyResult?.error ?? "The production could not be started.");
      }
      window.dispatchEvent(new Event("chaplin:credits-updated"));
    } catch (productionError) {
      removeStory(story.id);
      setStartingProduction(false);
      setProductionBusy(false);
      setError(productionError instanceof Error ? productionError.message : "The production could not be started.");
      return;
    }

    if (draftId) {
      void fetch(`/api/drafts?id=${encodeURIComponent(draftId)}`, { method: "DELETE" });
    }
    await fetch("/api/feed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        body: [
          `Script locked: ${story.title}`,
          `${validScenes.length} playable scene${validScenes.length === 1 ? "" : "s"} · ${durationSeconds}s ${formatDefinition.label} · ${
            format === "punch" && punchGenerationMode === "single-take"
              ? "one native 15-second take"
              : "separate scene clips"
          }`,
          `Cast: ${castCharacters.map((character) => character.name).join(", ")}`,
          story.logline,
        ].join("\n"),
      }),
    }).catch(() => undefined);
    /*
      Stay in the studio. Starting a production used to navigate to its own
      page, so the creator lost the canvas they had just built and had to scroll
      a separate screen to watch the render. The workspace is hosted here
      instead; the route still exists for a direct link.
    */
    setProductionStoryId(story.id);
  }

  // Scene Studio panels read the same state the form already owns, so the
  // canvas is a layout over the existing flow rather than a second source
  // of truth for the draft.
  const conceptLocked = Boolean(title.trim() && logline.trim());
  const castLocked = castCharacters.length > 0;
  const authoredScenes = scenes.filter((scene) => scene.setting.trim() || scene.action.trim()).length;
  const scriptLocked = authoredScenes === scenes.length && scenes.length > 0;
  const framesReady = scenes.filter((scene) => Boolean(scene.previewImageUrl)).length;
  const productionReady = conceptLocked && castLocked && scriptLocked;
  const sceneStages: SceneStage[] = [
    {
      id: 1, label: "Concept", hint: "Title, logline and format.",
      state: conceptLocked ? "done" : step === 1 ? "active" : "todo",
      detail: conceptLocked ? "Locked" : "Needs a title and logline",
    },
    {
      id: 2, label: "Cast", hint: "Who performs this story.",
      state: castLocked ? "done" : step === 2 ? "active" : "todo",
      detail: castLocked ? `${castCharacters.length} cast` : "No actors chosen",
    },
    {
      id: 3, label: `${formatDefinition.label} script`, hint: "Every scene's setting, objective and action.",
      state: scriptLocked ? "done" : step === 3 ? "active" : "todo",
      detail: `${authoredScenes} of ${scenes.length} written`,
    },
  ];
  /*
    Mirrors the guards at the top of handleStartProduction so the rail can say
    what is missing before the click instead of after it. Frames are deliberately
    absent: previews are a convenience, not a gate on production.
  */
  /*
    A script written for one cast and produced with another is the worst kind of
    incoherence: the title, logline and every scene still name an actor the
    audience never sees. It blocks production rather than warns, because the
    delivered cut would be wrong in a way no amount of regenerated stills fixes.
  */
  const departedScriptCast = scriptCastIds
    .filter((id) => !castIds.includes(id))
    .map((id) => world.characters.find((character) => character.id === id)?.name)
    .filter(Boolean) as string[];
  const productionBlockedReason =
    format === "spot" && !productImageUrl
      ? "Upload the product reference first"
      : sceneProps.some((prop) => !prop.approved)
        ? "Approve or remove every newly introduced scene prop"
      : !conceptLocked
        ? "Needs a title and logline"
        : !castLocked
          ? "Lock at least one actor"
          : !scriptLocked
            ? `${scenes.length - authoredScenes} scene${scenes.length - authoredScenes === 1 ? "" : "s"} still unwritten`
            : departedScriptCast.length
              ? `Script still written for ${departedScriptCast.join(", ")}`
              : undefined;
  const sceneAssets: SceneAsset[] = scenes.map((scene, index) => ({
    index,
    setting: scene.setting,
    action: scene.action,
    previewImageUrl: scene.previewImageUrl,
    lineCount: scene.lines.filter((line) => line.text.trim()).length,
    authored: Boolean(scene.setting.trim() || scene.action.trim()),
  }));
  const handleProductionFrames = useCallback((urls: string[]) => {
    setScenes((current) => {
      let changed = false;
      const next = current.map((scene, index) => {
        const url = urls[index];
        if (!url || scene.previewImageUrl === url) return scene;
        changed = true;
        return { ...scene, previewImageUrl: url };
      });
      return changed ? next : current;
    });
  }, []);

  /*
    Once production starts, keep the exact Scene Studio frame in place. Only
    the center authoring canvas changes into live production; the stage rail
    and asset canvas remain spatial anchors and receive generated frames.
  */
  if (productionStoryId) {
    return (
      <section className="unified-studio-shell" data-unified-studio-shell data-studio-mode="render">
        <StudioWorkspaceHeader
          mode="render"
          projectName={title.trim() || "Untitled scene"}
          status="Render studio · generation stays in this workspace"
          actions={<span className="studio-workspace-header__saved">Script locked</span>}
        />
        <div className="unified-studio-shell__body">
          <div className="scene-studio-shell" data-scene-studio-shell data-scene-production-active>
            <SceneStudioRail
              stages={sceneStages.map((stage) => ({ ...stage, state: "done" as const }))}
              step={3}
              onSelect={() => undefined}
              cast={castCharacters}
              formatLabel={formatDefinition.label}
              durationSeconds={durationSeconds}
              sceneCount={scenes.length}
              framesReady={framesReady}
              actionLabel="Production running"
              onStartProduction={() => undefined}
              productionMode
            />
            <div className="studio-production-content min-w-0">
              <ProductionWorkspace
                storyId={productionStoryId}
                embedded
                autoStart
                autoRender
                canvasOnly
                onFrameUrlsChange={handleProductionFrames}
              />
            </div>
            <SceneStudioAssets
              assets={sceneAssets}
              busyIndex={null}
              onSelect={() => undefined}
              onGenerateAll={() => undefined}
              canGenerate={false}
              productImageUrl={productImageUrl || undefined}
              productionMode
            />
          </div>
        </div>
      </section>
    );
  }

  function focusCreationArea() {
    window.setTimeout(() => {
      const input = document.querySelector<HTMLTextAreaElement>("[data-concept-magic-brief]");
      input?.scrollIntoView({ behavior: "smooth", block: "center" });
      input?.focus({ preventScroll: true });
    }, 0);
  }

  function chooseOutput(option: ProductionFormat) {
    setFormat(option);
    setDurationSeconds(productionDuration(option));
    setOutputChooserOpen(false);
    setWritingStart(null);
    setStep(1);
    setStartChoiceOpen(true);
  }

  return (
    <section className="unified-studio-shell" data-unified-studio-shell data-studio-mode="scene">
      <StudioWorkspaceHeader
        mode="scene"
        projectName={title.trim() || `Untitled ${formatDefinition.label}`}
        status={
          draftSaveState === "saving"
            ? "Scene studio · saving"
            : draftSaveState === "saved"
              ? "Scene studio · autosaved"
              : "Scene studio · private workspace"
        }
        actions={
          <Link href="/studio" className="studio-workspace-header__saved">
            All projects
          </Link>
        }
      />
      <div className="unified-studio-shell__body">
      <div className="scene-studio-shell" data-scene-studio-shell>
      {!outputChooserOpen && (
        <SceneStudioRail
          stages={sceneStages}
          step={step}
          onSelect={setStep}
          cast={castCharacters}
          formatLabel={formatDefinition.label}
          durationSeconds={durationSeconds}
          sceneCount={scenes.length}
          framesReady={framesReady}
          actionLabel="Generate in Studio"
          onStartProduction={() => void handleStartProduction()}
          blockedReason={productionBlockedReason}
          starting={startingProduction}
        />
      )}
      <div className="studio-production-content min-w-0">
        <div className="mx-auto w-full max-w-3xl px-6 py-8">
      {startChoiceOpen && createPortal(
        <div className="fixed inset-0 z-[210] flex items-end justify-center bg-black/72 p-0 backdrop-blur-xl sm:items-center sm:p-6">
          <button
            type="button"
            aria-label="Return to runtime choices"
            onClick={returnToRuntimeChooser}
            className="absolute inset-0 cursor-default"
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="writing-start-title"
            className="spark-start-dialog relative z-10 w-full max-w-xl rounded-t-[28px] border border-white/15 p-4 shadow-2xl sm:rounded-[28px] sm:p-5"
            data-writing-start-dialog
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-[0.24em] text-accent">{durationSeconds} seconds</p>
                <h2 id="writing-start-title" className="reel-title mt-1 text-2xl sm:text-3xl">What do you want?</h2>
                <p className="mt-1 text-[11px] leading-relaxed text-white/48">
                  Start with your own concept or let Chaplin shape the first editable draft.
                </p>
              </div>
              <button
                type="button"
                onClick={returnToRuntimeChooser}
                aria-label="Return to runtime choices"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/15 text-lg text-white/55 hover:border-accent hover:text-white"
              >
                ×
              </button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => chooseWritingStart("magic")}
                className="magic-action group rounded-[20px] p-4 text-left"
                data-writing-path="magic"
                data-intelligence-action
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-lg text-white shadow-[0_0_24px_rgba(242,78,112,0.28)]">✦</span>
                <span className="mt-4 block text-base font-semibold">Use Magic Assist</span>
                <span className="mt-1.5 block text-[11px] leading-5 text-white/58">
                  Give Chaplin one thought. It shapes the concept, cast, action, and optional dialogue for this runtime.
                </span>
                <span className="mt-4 flex items-center justify-between text-[9px] font-semibold uppercase tracking-[0.14em] text-accent">
                  Complete first draft <span aria-hidden="true">→</span>
                </span>
              </button>

              <button
                type="button"
                onClick={() => chooseWritingStart("manual")}
                className="group rounded-[20px] border border-white/14 bg-white/[0.035] p-4 text-left transition-all hover:-translate-y-0.5 hover:border-accent-secondary/55 hover:bg-white/[0.055]"
                data-writing-path="manual"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full border border-accent-secondary/45 bg-accent-secondary/10 text-sm font-bold text-accent-secondary">Aa</span>
                <span className="mt-4 block text-base font-semibold">Write your own</span>
                <span className="mt-1.5 block text-[11px] leading-5 text-white/58">
                  You lead Concept, Cast, and Script. Smaller assists can shape a field or scene without taking over the complete draft.
                </span>
                <span className="mt-4 flex items-center justify-between text-[9px] font-semibold uppercase tracking-[0.14em] text-accent-secondary">
                  Guided manual flow <span aria-hidden="true">→</span>
                </span>
              </button>
            </div>
          </section>
        </div>,
        document.body,
      )}

      <div className="mb-4 flex items-center justify-between gap-4">
        <Link href="/stories" className="text-xs text-grey hover:text-accent">
          ← Stories
        </Link>
        <div className="flex min-w-0 items-center justify-end gap-2 text-right">
          <Link href="/studio" className="shrink-0 text-[10px] font-semibold text-accent hover:text-accent-light">
            Drafts
          </Link>
          <span className="text-white/20" aria-hidden="true">·</span>
          <span className={`truncate text-[10px] ${
            draftSaveState === "error" ? "text-red-300" :
            draftSaveState === "saved" ? "text-accent-secondary" :
            "text-grey"
          }`}>
            {draftSaveState === "loading" && "Opening draft…"}
            {draftSaveState === "saving" && "Saving…"}
            {draftSaveState === "saved" && "Saved to your account"}
            {draftSaveState === "signed-out" && "Sign in to save drafts"}
            {draftSaveState === "error" && "Draft save needs attention"}
            {draftSaveState === "idle" && "Autosaves when you start"}
          </span>
        </div>
      </div>

      <h1 className="reel-title mb-5 text-2xl sm:text-3xl">Create a shootable story</h1>

      {step === 3 && (
        <div
          className="sticky top-0 z-40 -mx-2 mb-5 flex flex-col gap-3 rounded-xl border border-accent/45 bg-[#080c0a]/95 p-3 shadow-[0_18px_45px_rgba(0,0,0,0.38)] backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between"
          data-production-handoff
        >
          <div className="min-w-0">
            <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-accent">
              {productionReady ? "Script ready" : "Complete the scene plan"}
            </p>
            <p className="mt-1 text-sm font-semibold text-ink">
              {productionReady
                ? `${scenes.length} scenes are locked. Continue whenever you are ready.`
                : `${authoredScenes} of ${scenes.length} scenes are written.`}
            </p>
            <p className="mt-1 text-[10px] text-grey" aria-live="polite">
              {scenePreviewBusy !== null
                ? `Scene ${scenePreviewBusy + 1} is rendering in the background. You do not need to wait.`
                : framesReady > 0
                  ? `${framesReady} of ${scenes.length} preview frames ready. Missing frames can finish in production.`
                  : "Preview frames are optional here and can be generated in production."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleStartProduction()}
            disabled={!productionReady || productionBusy}
            className="shrink-0 rounded-full bg-accent px-5 py-3 text-xs font-semibold text-paper shadow-[0_0_28px_rgba(244,70,112,0.2)] transition hover:bg-accent-light disabled:cursor-not-allowed disabled:opacity-40"
            data-action="continue-to-production"
          >
            {productionBusy ? "Preparing render…" : "Generate in Studio →"}
          </button>
        </div>
      )}

      {format === "spot" && (
        <section
          className="mb-6 overflow-hidden rounded-2xl border border-accent/55 bg-[linear-gradient(135deg,rgba(244,63,105,0.12),rgba(255,255,255,0.025))]"
          data-product-reference
          aria-labelledby="product-reference-heading"
        >
          <div className="border-b border-white/10 p-4 sm:p-5">
            <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-accent">First question</p>
            <h2 id="product-reference-heading" className="reel-title mt-1 text-2xl">Show us the product</h2>
            <p className="mt-1 max-w-xl text-xs leading-5 text-grey">
              Upload the exact product image first. It becomes the product identity reference for the concept, frames, and final ad.
            </p>
          </div>
          <div className="p-4 sm:p-5">
            {productImageUrl ? (
              <div className="grid gap-4 sm:grid-cols-[150px_1fr] sm:items-center">
                {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded Supabase URL */}
                <img
                  src={productImageUrl}
                  alt={productImageName || "Product reference"}
                  className="aspect-square w-full rounded-xl border border-white/10 bg-white object-contain"
                />
                <div>
                  <p className="text-sm font-semibold">Product reference locked</p>
                  <p className="mt-1 truncate text-[10px] text-grey">{productImageName || "Uploaded product image"}</p>
                  <label className="mt-3 inline-flex cursor-pointer rounded-full border border-accent/60 px-4 py-2 text-[10px] font-semibold text-accent hover:bg-accent/10">
                    Replace image
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="sr-only"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void uploadProductImage(file);
                        event.target.value = "";
                      }}
                    />
                  </label>
                </div>
              </div>
            ) : (
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-accent/55 bg-black/15 px-5 py-8 text-center hover:bg-accent/[0.05]">
                <span className="text-3xl text-accent">+</span>
                <span className="mt-2 text-sm font-semibold">{productUploadBusy ? "Uploading product…" : "Upload product image"}</span>
                <span className="mt-1 text-[10px] text-grey">PNG, JPEG, or WebP · up to 12 MB</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={productUploadBusy}
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadProductImage(file);
                    event.target.value = "";
                  }}
                />
              </label>
            )}
          </div>
        </section>
      )}

      <section className={outputChooserOpen ? "mb-5" : "hidden"} aria-label="Output format" data-output-contract>
        {outputChooserOpen ? (
          <>
            <div className="mb-4">
              <h2 id="output-contract-heading" className="reel-title text-xl sm:text-2xl">How long is your scene?</h2>
              <p className="mt-1 text-[11px] text-grey">Choose a runtime. You&apos;ll decide how to write it next.</p>
            </div>
            <div className={`grid gap-2.5 ${formatOptions.length > 1 ? "grid-cols-3" : ""}`}>
              {formatOptions.map((option) => {
                const definition = PRODUCTION_FORMATS[option];
                const optionDuration = option === "spot" ? durationSeconds : definition.durationSeconds;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => chooseOutput(option)}
                    className="group relative flex aspect-[1.1/1] items-center justify-center overflow-hidden rounded-xl border border-line bg-white/[0.025] transition-all hover:-translate-y-0.5 hover:border-accent hover:bg-accent/[0.07] focus-visible:border-accent focus-visible:outline-none"
                    data-writing-format={option}
                    aria-label={`${optionDuration} seconds`}
                  >
                    <span className="font-mono text-3xl text-white/65 transition-colors group-hover:text-accent sm:text-5xl">
                      {optionDuration}
                    </span>
                    <span className="ml-1 mt-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-grey">sec</span>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <div className="hidden" aria-hidden="true">
            <div className="flex min-w-0 items-center gap-3">
              <span className="font-mono text-xl text-accent">{durationSeconds}s</span>
              <span className="text-sm font-semibold">{formatDefinition.label}</span>
              <span className="hidden text-[9px] uppercase tracking-wide text-grey sm:inline">
                Output selected
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setOutputChooserOpen(true)}
                className="text-[10px] font-semibold text-accent hover:text-accent-light"
              >
                Change output
              </button>
              <Link href="/studio/pipelines" className="text-[10px] text-grey hover:text-accent">Pipeline map →</Link>
            </div>
          </div>
        )}
      </section>

      {!outputChooserOpen && (
      <>
      <details
        open={magicWriterOpen}
        onToggle={(event) => setMagicWriterOpen(event.currentTarget.open)}
        className="hidden"
        data-magic-writer
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 hover:bg-accent/[0.05]">
          <span>
            <span className="block text-sm font-semibold">✦ Magic assist</span>
            <span className="mt-0.5 block text-[11px] text-grey">Optional: expand one thought into a complete draft.</span>
          </span>
          <span className="shrink-0 rounded-full border border-accent/50 px-3 py-1 text-[10px] font-semibold text-accent">Open</span>
        </summary>
        <div className="flex flex-col gap-4 border-t border-line p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <p className="max-w-xl text-xs leading-relaxed text-grey">
              Give Chaplin one thought. It expands into cast, structure, visible action, and optional dialogue.
            </p>
            <div className="flex items-center gap-2">
              <span className={`rounded-full border px-2 py-0.5 text-[9px] ${
                writingAIConfigured ? "border-emerald-500/50 text-emerald-500" : "border-line text-grey"
              }`}>
                {writingAIConfigured === null ? "Checking AI" : writingAIConfigured ? "GPT-5.6 Terra connected" : "Local mode"}
              </span>
            <div className="rounded-full border border-accent/40 bg-accent/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
              {formatDefinition.label} · {durationSeconds}s · {expectedShotCount} shots
            </div>
            </div>
          </div>

          <textarea
            value={brief}
            onChange={(event) => setBrief(event.target.value)}
            rows={3}
            placeholder={format === "episode"
              ? "e.g. Lightning Raju loses his powers during the one rescue that matters most..."
              : format === "spot"
                ? "e.g. A launch spot for a fast delivery app, funny but premium..."
                : `e.g. A ${durationSeconds}-second performance that makes this actor impossible to miscast...`}
            className="w-full border border-line rounded-sm bg-paper px-3 py-2.5 text-sm resize-none focus:outline-none focus:border-accent"
            data-magic-brief
          />

          <div className="flex flex-wrap gap-2" aria-label="Idea starters">
            {IDEA_STARTERS[format].map((idea) => (
              <button
                key={idea}
                type="button"
                onClick={() => setBrief((current) => current ? `${current} ${idea}.` : idea)}
                className="rounded-full border border-line px-3 py-1.5 text-[10px] text-grey hover:border-accent hover:text-accent"
              >
                + {idea}
              </button>
            ))}
          </div>

          {/* Cast right here — Magic writes FOR the actors you pick. Empty = Magic picks. */}
          <div data-magic-cast>
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-grey">
                Cast {castIds.length > 0 ? `(${castIds.length} picked)` : "(optional — Magic picks if you don't)"}
              </span>
              <button type="button" onClick={() => setStep(2)} className="text-[10px] text-accent hover:underline">
                Full cast search →
              </button>
            </div>
            <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {world.characters.map((character) => {
                const selected = castIds.includes(character.id);
                const thumb = character.imageUrl ?? character.bannerUrl ?? character.galleryUrls?.[0];
                return (
                  <button
                    key={character.id}
                    type="button"
                    onClick={() => toggleCast(character.id)}
                    aria-pressed={selected}
                    className={`relative w-16 shrink-0 overflow-hidden rounded-md border transition-all ${
                      selected ? "border-accent shadow-[0_0_0_1px_var(--accent),0_0_14px_rgba(244,70,112,0.35)]" : "border-line opacity-80 hover:opacity-100"
                    }`}
                  >
                    <span className="block aspect-[3/4] w-full">
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element -- tiny thumb strip, dynamic CDN URLs
                        <img src={thumb} alt={character.name} loading="lazy" className="h-full w-full object-cover" />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center bg-paper text-lg font-semibold text-grey">
                          {character.name.slice(0, 1)}
                        </span>
                      )}
                    </span>
                    {selected && (
                      <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[9px] font-bold text-paper">✓</span>
                    )}
                    <span className="block truncate bg-black/60 px-1 py-0.5 text-center text-[8px] font-semibold uppercase text-white">
                      {character.name.split(" ")[0]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-xs text-grey">
              Runtime
              <select
                value={durationSeconds}
                onChange={(event) => setDurationSeconds(Number(event.target.value))}
                className="rounded-sm border border-line bg-paper px-2 py-1.5 text-ink"
              >
                {[5, 10, 15, 30, 60, 90, 120].map((seconds) => (
                  <option key={seconds} value={seconds}>{seconds} sec</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => createMagicDraft()}
              disabled={magicBusy || world.characters.length === 0}
              className="magic-action rounded-full px-5 py-2.5 text-sm font-semibold disabled:opacity-50"
              data-action="magic-script"
              data-intelligence-action
              aria-busy={magicBusy}
            >
              {magicBusy ? "Writing the draft..." : "✦ Magic: write everything"}
            </button>
            <button
              type="button"
              onClick={() => void generateAllScenePreviews()}
              disabled={scenePreviewBusy !== null || castCharacters.length === 0 || !scenes.some((scene) => scene.setting || scene.action)}
              className="magic-action shrink-0 rounded-full px-4 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40"
              data-intelligence-action
              aria-busy={scenePreviewBusy !== null}
            >
              {scenePreviewBusy !== null ? `Framing scene ${scenePreviewBusy + 1}…` : "Generate all thumbnails"}
            </button>
          </div>
          {magicBusy && magicRunKind === "draft" && (
            <MagicWritingTimeline kind="draft" elapsedSeconds={magicElapsedSeconds} />
          )}
          {magicMessage && <p className="text-xs text-emerald-500">{magicMessage}</p>}
        </div>
      </details>

      <div className="mb-4 h-px scroll-mt-24 bg-line" aria-hidden="true" data-manual-writer />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex gap-2">
          {(
            [
              [1, "Concept"],
              [2, "Cast"],
              [3, `${formatDefinition.label} script`],
            ] as const
          ).map(([n, label]) => (
            <button
              key={n}
              onClick={() => setStep(n)}
              className={`px-3 py-1.5 rounded-full border ${
                step === n ? "border-accent text-ink font-semibold bg-accent/10" : "border-line text-grey"
              }`}
            >
              {n}. {label}
            </button>
          ))}
        </div>
        {!outputChooserOpen && (
          <button
            type="button"
            onClick={() => {
              setWritingStart(null);
              setOutputChooserOpen(true);
            }}
            className="flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-[10px] text-grey hover:border-accent hover:text-accent"
            data-action="change-output"
          >
            <span className="font-mono text-accent">{durationSeconds}s</span>
            <span>{formatDefinition.label}</span>
            <span aria-hidden="true">Change</span>
          </button>
        )}
      </div>

      {step === 1 && (
        <div className="poster-card rounded-md p-6 flex flex-col gap-4">
          {writingStart !== "manual" && (
          <div className="magic-surface rounded-xl p-3.5 sm:p-4" data-concept-magic>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink">✦ Magic</p>
                <p className="mt-0.5 text-[10px] leading-relaxed text-grey">
                  Give Chaplin one thought. It fills the concept, chooses cast when needed, and writes the complete editable scene plan.
                </p>
              </div>
              <span className="shrink-0 rounded-full border border-accent-secondary/35 bg-accent-secondary/10 px-2 py-1 text-[8px] font-semibold uppercase tracking-wide text-accent-secondary">
                Editable
              </span>
            </div>

            <textarea
              value={brief}
              onChange={(event) => setBrief(event.target.value)}
              rows={2}
              placeholder={`e.g. A ${durationSeconds}-second ${formatDefinition.label.toLowerCase()} where one small choice reveals who the actor really is…`}
              className="mt-3 w-full resize-none rounded-lg border border-white/12 bg-black/20 px-3 py-2.5 text-xs text-ink placeholder:text-white/30 focus:border-accent focus:outline-none"
              data-concept-magic-brief
            />

            <div className="mt-2 no-scrollbar flex gap-1.5 overflow-x-auto pb-1" aria-label="Concept idea starters">
              {IDEA_STARTERS[format].slice(0, 3).map((idea) => (
                <button
                  key={idea}
                  type="button"
                  onClick={() => setBrief((current) => current ? `${current} ${idea}.` : idea)}
                  className="shrink-0 rounded-full border border-white/12 bg-white/[0.035] px-2.5 py-1.5 text-[9px] text-white/55 hover:border-accent hover:text-white"
                >
                  + {idea}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => createMagicDraft()}
              disabled={magicBusy || world.characters.length === 0}
              className="magic-action mt-3 flex w-full items-center justify-between rounded-lg px-4 py-2.5 text-left text-sm font-semibold disabled:opacity-50"
              data-action="magic-script"
              data-intelligence-action
              aria-busy={magicBusy}
            >
              <span>{magicBusy ? "Writing everything..." : "✦ Magic: write everything"}</span>
              <span className="text-[10px] font-medium opacity-70">{formatDefinition.label} · {durationSeconds}s</span>
            </button>
            {magicBusy && magicRunKind === "draft" && (
              <div className="mt-3">
                <MagicWritingTimeline kind="draft" elapsedSeconds={magicElapsedSeconds} />
              </div>
            )}
            {magicMessage && <p className="mt-2 text-[10px] leading-relaxed text-accent-secondary">{magicMessage}</p>}
          </div>
          )}

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Title</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={format === "episode" ? "e.g. The Last Reel at Midnight" : format === "spot" ? "e.g. One Tap Ahead" : `e.g. ${formatDefinition.label}: First Impression`}
              className="border border-line rounded-sm px-3 py-2 focus:outline-none focus:border-accent"
              data-script-field="title"
              data-manual-concept-title
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Logline</span>
            <textarea
              value={logline}
              onChange={(e) => setLogline(e.target.value)}
              rows={2}
              placeholder={format === "episode" ? "One or two sentences that sell the episode" : "The performance promise and dramatic idea in one sentence"}
              className="border border-line rounded-sm px-3 py-2 focus:outline-none focus:border-accent resize-none"
              data-script-field="logline"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Creative direction</span>
            <textarea
              value={creativeDirection}
              onChange={(event) => setCreativeDirection(event.target.value)}
              rows={3}
              placeholder="Tone, visual language, structure, and what the audience should feel"
              className="border border-line rounded-sm px-3 py-2 focus:outline-none focus:border-accent resize-none"
              data-script-field="creative-direction"
            />
          </label>
          <button
            onClick={() => setStep(2)}
            className="self-end bg-accent text-paper font-semibold px-4 py-2 rounded-sm hover:bg-accent-light transition-colors"
          >
            Next: lock the cast →
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-4">
          {castCharacters.length > 0 && (
            <div className="poster-card rounded-md p-4">
              <p className="text-[11px] uppercase tracking-wide text-grey mb-2">
                Your cast ({castCharacters.length})
              </p>
              <div className="flex flex-wrap gap-2 mb-2">
                {castCharacters.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => toggleCast(c.id)}
                    className="flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-full border border-accent bg-accent/10 text-xs"
                  >
                    <Avatar hue={c.avatarHue} label={c.name} src={c.imageUrl} size={20} />
                    {c.name}
                    <span className="text-grey">✕</span>
                  </button>
                ))}
              </div>
              <p className="text-xs text-grey">
                Total casting fee: {totalFee > 0 ? money(totalFee) : "free, all open license"}
              </p>
            </div>
          )}

          <div className="poster-card rounded-md p-4">
            <input
              value={castQuery}
              onChange={(e) => setCastQuery(e.target.value)}
              placeholder="Search the shelf…"
              className="w-full bg-paper border border-line rounded-sm px-3 py-2 text-sm mb-3 focus:outline-none focus:border-accent"
            />
            <div className="flex flex-col gap-2 max-h-96 overflow-y-auto scrollbar-thin pr-1">
              {searchResults.map((c) => {
                const selected = castIds.includes(c.id);
                return (
                  <button
                    key={c.id}
                    onClick={() => toggleCast(c.id)}
                    className={`flex items-center gap-3 p-2.5 rounded-md border text-left transition-colors ${
                      selected ? "border-accent bg-accent/10" : "border-line hover:border-accent"
                    }`}
                  >
                    <Avatar hue={c.avatarHue} label={c.name} src={c.imageUrl} size={36} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{c.name}</p>
                      <p className="text-xs text-grey truncate italic">&ldquo;{c.tagline}&rdquo;</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        <Chip label={ARCHETYPE_LABEL[c.archetype]} hue={ARCHETYPE_HUE[c.archetype]} />
                        <Chip label={LICENSE_LABEL[c.licenseType]} hue={LICENSE_HUE[c.licenseType]} />
                      </div>
                    </div>
                    <div className="text-xs text-right shrink-0 text-grey">
                      {c.licenseType === "open" && "free"}
                      {c.licenseType === "paid" && money(c.royaltyRate)}
                      {c.licenseType === "approval" && (
                        <span>
                          {money(c.royaltyRate)}
                          <br />
                          <span className="text-accent">once approved</span>
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/*
            The cast shelf scrolls for as long as the shelf is deep, so a CTA in
            normal flow sat below every actor and read as "there is no button".
            It sticks to the bottom of the scroller instead.
          */}
          <div className="sticky bottom-0 -mx-6 flex items-center justify-between gap-3 border-t border-line/70 bg-[#070a08]/95 px-6 py-3 backdrop-blur lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:px-0 lg:backdrop-blur-none">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="text-sm text-grey hover:text-accent px-4 py-2"
            >
              ← Back
            </button>
            <button
              type="button"
              onClick={continueToScenes}
              disabled={magicBusy || castCharacters.length === 0}
              className="shrink-0 whitespace-nowrap bg-accent text-paper font-semibold px-4 py-2 rounded-sm hover:bg-accent-light transition-colors disabled:cursor-not-allowed disabled:opacity-45"
            >
              {magicBusy ? "Building scenes…" : "Next: generate scenes →"}
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-col gap-6">
          {format === "punch" && (
            <section
              className="rounded-xl border border-white/12 bg-black/20 p-4"
              aria-labelledby="punch-generation-heading"
              data-punch-generation-mode
            >
              <div className="mb-3">
                <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-accent">Generation method</p>
                <h2 id="punch-generation-heading" className="mt-1 text-base font-semibold">How should Chaplin make this 15-second Punch?</h2>
                <p className="mt-1 text-[10px] leading-4 text-grey">The script keeps the same four authored beats. This choice changes how Seedance renders them.</p>
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setPunchGenerationMode("scene-clips")}
                  aria-pressed={punchGenerationMode === "scene-clips"}
                  className={`rounded-xl border p-4 text-left transition ${
                    punchGenerationMode === "scene-clips"
                      ? "border-accent bg-accent/[0.08]"
                      : "border-white/10 bg-white/[0.025] hover:border-white/25"
                  }`}
                  data-generation-mode="scene-clips"
                >
                  <span className="flex items-center justify-between gap-3">
                    <strong className="text-sm">Four scene clips</strong>
                    <span className="font-mono text-[10px] text-accent">4 × 4s source</span>
                  </span>
                  <span className="mt-2 block text-[10px] leading-4 text-grey">
                    Generate each beat independently, then trim and assemble the exact 15-second master with locked dialogue and mixed sound.
                  </span>
                  <span className="mt-3 block text-[8px] font-semibold uppercase tracking-[0.16em] text-accent-secondary">More control per scene</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPunchGenerationMode("single-take")}
                  aria-pressed={punchGenerationMode === "single-take"}
                  className={`rounded-xl border p-4 text-left transition ${
                    punchGenerationMode === "single-take"
                      ? "border-accent bg-accent/[0.08]"
                      : "border-white/10 bg-white/[0.025] hover:border-white/25"
                  }`}
                  data-generation-mode="single-take"
                >
                  <span className="flex items-center justify-between gap-3">
                    <strong className="text-sm">One complete take</strong>
                    <span className="font-mono text-[10px] text-accent">1 × 15s</span>
                  </span>
                  <span className="mt-2 block text-[10px] leading-4 text-grey">
                    Ask Seedance for one four-shot video with synchronized dialogue, background noise, physical effects, ambience, and score.
                  </span>
                  <span className="mt-3 block text-[8px] font-semibold uppercase tracking-[0.16em] text-accent-secondary">Native audiovisual generation</span>
                </button>
              </div>
            </section>
          )}
          {castCharacters.length === 0 && (
            <div className="poster-card rounded-md p-4 text-sm text-grey">
              You haven&apos;t cast anyone yet,{" "}
              <button onClick={() => setStep(2)} className="text-accent hover:underline">
                go back and pick your cast
              </button>
              .
            </div>
          )}

          {castCharacters.length > 0 && (
            <div className="poster-card rounded-md p-4" data-cast-board>
              <div className="mb-3 flex items-baseline justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-grey">
                  The cast, together ({castCharacters.length})
                </p>
                <button onClick={() => setStep(2)} className="text-[11px] text-accent hover:underline">
                  Change cast
                </button>
              </div>
              <div className="no-scrollbar -mx-1 flex gap-2.5 overflow-x-auto px-1">
                {castCharacters.map((character) => {
                  const thumb = character.imageUrl ?? character.bannerUrl ?? character.galleryUrls?.[0];
                  return (
                    <Link
                      key={character.id}
                      href={`/characters/${character.id}`}
                      className="group w-24 shrink-0 overflow-hidden rounded-md border border-line transition-colors hover:border-accent sm:w-28"
                    >
                      <span className="block aspect-[3/4] w-full overflow-hidden">
                        {thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element -- cast board thumbs, dynamic CDN URLs
                          <img src={thumb} alt={character.name} loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center bg-paper text-2xl font-semibold text-grey">
                            {character.name.slice(0, 1)}
                          </span>
                        )}
                      </span>
                      <span className="block truncate px-1.5 py-1 text-center text-[9px] font-semibold uppercase">
                        {character.name}
                      </span>
                      <span className="-mt-0.5 block truncate px-1.5 pb-1.5 text-center text-[8px] text-grey">
                        {ARCHETYPE_LABEL[character.archetype]}
                      </span>
                    </Link>
                  );
                })}
              </div>
              <p className="mt-2 text-[10px] text-grey">
                These locked identities feed every reference frame, voice line, and shot package for this {formatDefinition.label}.
              </p>
            </div>
          )}

          <SceneStudioTimeline
            scenes={scenes.map((scene, index) => ({
              index,
              setting: scene.setting,
              objective: scene.objective,
              action: scene.action,
              durationSeconds: scene.durationSeconds ?? 4,
              lineCount: scene.lines.filter((line) => line.text.trim()).length,
              rendered: Boolean(scene.previewImageUrl),
            }))}
            totalSeconds={durationSeconds}
            activeIndex={activeSceneIndex}
            onSelect={(index) => {
              setActiveSceneIndex(index);
              document.querySelector(`[data-scene-card="${index}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
            }}
          />

          <div className="border-y border-line py-4">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="font-mono text-2xl text-accent">{durationSeconds}s</p>
                <p className="text-[9px] uppercase tracking-wide text-grey">Final runtime</p>
              </div>
              <div>
                <p className="font-mono text-2xl text-accent-secondary">{expectedShotCount}</p>
                <p className="text-[9px] uppercase tracking-wide text-grey">Required shots</p>
              </div>
              <div>
                <p className="font-mono text-2xl text-ink">{scenes.length}</p>
                <p className="text-[9px] uppercase tracking-wide text-grey">Script beats</p>
              </div>
            </div>
            <p className="mt-3 text-center text-[10px] text-grey">
              Locking the script shares a production update with the creator feed. Every generated still, video, dialogue, effect, and theme joins the feed automatically.
            </p>
          </div>

          <div className="poster-card flex flex-col gap-3 rounded-md border-accent/35 bg-accent/[0.035] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold">
                {magicBusy ? "Chaplin is building the scene beats…" : "Build the scenes from this concept"}
              </p>
              <p className="mt-1 text-[10px] leading-relaxed text-grey">
                Generate the complete editable scene plan from the concept, cast, and locked product reference.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void createMagicDraft()}
              disabled={magicBusy || castCharacters.length === 0}
              className="magic-action shrink-0 rounded-full px-4 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-45"
              data-action="generate-scenes"
              data-intelligence-action
              aria-busy={magicBusy}
            >
              {magicBusy ? "Building scenes…" : scenes.some((scene) => scene.setting || scene.objective || scene.action) ? "Regenerate all scenes" : "✦ Generate scenes"}
            </button>
          </div>
          {magicBusy && magicRunKind === "draft" && (
            <MagicWritingTimeline kind="draft" elapsedSeconds={magicElapsedSeconds} />
          )}

          {sceneProps.length > 0 && (
            <section className="mb-3 rounded-xl border border-amber-300/25 bg-amber-300/[0.045] p-3" data-scene-props>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-amber-200">Scene props requiring approval</p>
                  <p className="mt-1 text-[10px] text-grey">Objects outside actor-card props cannot enter production until you approve them.</p>
                </div>
                <span className="font-mono text-[9px] text-grey">{sceneProps.filter((prop) => prop.approved).length}/{sceneProps.length} approved</span>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {sceneProps.map((prop, propIndex) => (
                  <div key={`${prop.name}-${propIndex}`} className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold">{prop.name}</p>
                        <p className="mt-1 text-[9px] leading-4 text-grey">{prop.reason}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSceneProps((current) => current.map((item, index) => index === propIndex ? { ...item, approved: !item.approved } : item))}
                        className={`shrink-0 rounded-full border px-2.5 py-1 text-[9px] font-semibold ${prop.approved ? "border-emerald-400/50 text-emerald-300" : "border-amber-300/50 text-amber-200"}`}
                      >
                        {prop.approved ? "Approved" : "Approve"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="rounded-xl border border-line bg-black/15 p-3" data-scene-storyboard>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-accent-secondary">Scene timeline</p>
                <p className="mt-0.5 text-[10px] text-grey">Choose a frame to open its complete direction below.</p>
              </div>
              <span className="shrink-0 font-mono text-[10px] text-grey">
                {scenes.length} slots · {(scenes.reduce((total, scene) => total + (scene.durationMs ?? (scene.durationSeconds ?? 4) * 1000), 0) / 1000).toFixed(1)}s
              </span>
            </div>
            <div className="no-scrollbar grid auto-cols-[minmax(9rem,1fr)] grid-flow-col gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Scene timeline">
              {scenes.map((scene, si) => {
                const active = activeSceneIndex === si;
                const previewFallback = castCharacters[0]?.imageUrl
                  ?? castCharacters[0]?.bannerUrl
                  ?? castCharacters[0]?.galleryUrls?.[0];
                const status = scenePreviewBusy === si
                  ? "Framing"
                  : scene.previewImageUrl
                    ? "Frame ready"
                    : scene.setting || scene.objective || scene.action
                      ? "Planned"
                      : "Empty";
                return (
                  <button
                    key={si}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setActiveSceneIndex(si)}
                    className={`group min-w-0 overflow-hidden rounded-lg border text-left transition ${
                      active
                        ? "border-accent bg-accent/[0.08] shadow-[0_0_0_1px_rgba(244,70,112,0.35)]"
                        : "border-white/10 bg-black/25 hover:border-white/25"
                    }`}
                    data-scene-thumbnail={si}
                  >
                    <span className="relative block aspect-video overflow-hidden bg-black">
                      {scene.previewImageUrl || previewFallback ? (
                        // eslint-disable-next-line @next/next/no-img-element -- generated and actor CDN thumbnails are dynamic
                        <img
                          src={scene.previewImageUrl || previewFallback}
                          alt=""
                          className={`h-full w-full object-cover transition duration-300 group-hover:scale-[1.025] ${scene.previewImageUrl ? "" : "opacity-35 grayscale"}`}
                        />
                      ) : (
                        <span className="flex h-full items-center justify-center bg-white/[0.025] font-mono text-lg text-white/20">
                          {String(si + 1).padStart(2, "0")}
                        </span>
                      )}
                      <span className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-black/10" />
                      <span className="absolute left-2 top-2 rounded-full bg-black/65 px-1.5 py-0.5 font-mono text-[8px] text-white">
                        {String(si + 1).padStart(2, "0")}
                      </span>
                      <span className={`absolute right-2 top-2 h-1.5 w-1.5 rounded-full ${
                        scenePreviewBusy === si
                          ? "animate-pulse bg-accent"
                          : scene.previewImageUrl
                            ? "bg-emerald-400"
                            : "bg-amber-300"
                      }`} />
                      <span className="absolute inset-x-2 bottom-2 truncate text-[9px] font-semibold uppercase text-white">
                        {scene.setting || `Scene ${si + 1}`}
                      </span>
                    </span>
                    <span className="flex items-center justify-between gap-2 px-2 py-1.5">
                      <span className={`truncate text-[8px] font-semibold uppercase tracking-[0.12em] ${active ? "text-accent" : "text-grey"}`}>
                        {status}
                      </span>
                      <span className="font-mono text-[8px] text-grey">{((scene.durationMs ?? (scene.durationSeconds ?? 4) * 1000) / 1000).toFixed(1)}s</span>
                    </span>
                    <span className={`block h-0.5 transition-colors ${active ? "bg-accent" : scene.previewImageUrl ? "bg-emerald-400/60" : "bg-white/10"}`} />
                  </button>
                );
              })}
            </div>
          </section>

          {scenes.map((scene, si) => {
            if (si !== activeSceneIndex) return null;
            return (
            <div key={si} className="poster-card scroll-mt-24 rounded-md p-5" data-scene-card={si}>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="accent-rule w-6" />
                {scene.energyState && <span className="rounded-full border border-white/10 px-2 py-1 text-[8px] uppercase tracking-wide text-grey">{scene.energyState}</span>}
                {scene.motionMode && <span className="rounded-full border border-white/10 px-2 py-1 text-[8px] uppercase tracking-wide text-accent-secondary">{scene.motionMode}</span>}
                {scene.lockedCharacterIds?.length ? <span className="rounded-full border border-white/10 px-2 py-1 text-[8px] text-grey">{scene.lockedCharacterIds.length} identity lock{scene.lockedCharacterIds.length === 1 ? "" : "s"}</span> : null}
                <input
                  value={scene.setting}
                  onChange={(e) => updateSceneSetting(si, e.target.value)}
                  placeholder={`Scene ${si + 1} setting: e.g. A rain-slicked rooftop`}
                  className="min-w-[12rem] flex-1 border-b border-line bg-transparent px-1 py-1 text-xs uppercase tracking-wide focus:border-accent focus:outline-none"
                  data-scene-setting={si}
                />
                <button
                  type="button"
                  onClick={() => assistScene(si)}
                  disabled={sceneAssistBusy !== null || castCharacters.length === 0}
                  className="magic-action shrink-0 rounded-full px-3 py-1.5 text-[10px] font-semibold disabled:opacity-40"
                  data-action="magic-scene"
                  data-intelligence-action
                  aria-busy={sceneAssistBusy === si}
                  data-scene-index={si}
                >
                  {sceneAssistBusy === si ? "Shaping…" : "✦ Magic scene"}
                </button>
                {scenes.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeScene(si)}
                    className="text-xs text-grey hover:text-red-600"
                  >
                    Remove scene
                  </button>
                )}
              </div>
              {sceneAssistMessage?.index === si && sceneAssistBusy === null && (
                <p className="mb-3 rounded-lg border border-accent-secondary/25 bg-accent-secondary/[0.06] px-3 py-2 text-[10px] text-accent-secondary">
                  {sceneAssistMessage.text}
                </p>
              )}

              <div className="mb-4 overflow-hidden rounded-xl border border-white/10 bg-black/30">
                <div className="relative aspect-video overflow-hidden bg-black">
                  {scene.previewImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- generated scene frames use dynamic provider URLs
                    <img
                      src={scene.previewImageUrl}
                      alt={`Scene ${si + 1} starting frame`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="relative flex h-full items-center justify-center">
                      {castCharacters[0] && (castCharacters[0].imageUrl ?? castCharacters[0].bannerUrl ?? castCharacters[0].galleryUrls?.[0]) ? (
                        // eslint-disable-next-line @next/next/no-img-element -- dynamic actor seed URL
                        <img
                          src={castCharacters[0].imageUrl ?? castCharacters[0].bannerUrl ?? castCharacters[0].galleryUrls?.[0]}
                          alt=""
                          className="absolute inset-0 h-full w-full scale-105 object-cover opacity-25 blur-[2px]"
                        />
                      ) : null}
                      <div className="relative z-10 text-center">
                        <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-grey">No starting frame yet</p>
                        <p className="mt-1 text-xs text-white/60">Generate the visual before animation.</p>
                      </div>
                    </div>
                  )}
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/20" />
                  <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-3">
                    <div>
                      <p className="text-[8px] font-bold uppercase tracking-[0.16em] text-accent-secondary">Scene {String(si + 1).padStart(2, "0")}</p>
                      <p className="mt-0.5 text-xs font-semibold text-white">{scene.setting || "Untitled scene"}</p>
                    </div>
                    <span className="rounded-full border border-white/25 bg-black/55 px-2.5 py-1 font-mono text-[9px] text-white backdrop-blur">
                      {((scene.durationMs ?? (scene.durationSeconds ?? 4) * 1000) / 1000).toFixed(1)} SEC
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-white/10 px-3 py-2.5">
                  <p className="text-[9px] text-grey">
                    {scene.previewImageUrl ? "This frame becomes the video’s visual starting point." : "Actor, setting, action, light, and product will be composed here."}
                  </p>
                  <button
                    type="button"
                    onClick={() => void generateScenePreview(scene, si)}
                    disabled={scenePreviewBusy !== null || castCharacters.length === 0}
                    className="magic-action shrink-0 rounded-full px-3 py-1.5 text-[9px] font-semibold disabled:opacity-40"
                    data-intelligence-action
                    aria-busy={scenePreviewBusy === si}
                  >
                    {scenePreviewBusy === si ? "Generating…" : scene.previewImageUrl ? "Regenerate frame" : "Generate frame"}
                  </button>
                </div>
              </div>

              <div className="grid gap-3 mb-4 sm:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-wide text-grey">Scene objective</span>
                  <input
                    value={scene.objective}
                    onChange={(event) => updateScene(si, { objective: event.target.value })}
                    placeholder="What must change in this scene?"
                    className="border border-line rounded-sm bg-paper px-3 py-2 text-xs focus:outline-none focus:border-accent"
                    data-scene-objective={si}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-wide text-grey">Visible action</span>
                  <textarea
                    value={scene.action}
                    onChange={(event) => updateScene(si, { action: event.target.value })}
                    rows={2}
                    placeholder="Only what the camera and microphone can capture"
                    className="border border-line rounded-sm bg-paper px-3 py-2 text-xs resize-none focus:outline-none focus:border-accent"
                    data-scene-action={si}
                  />
                </label>
              </div>

              {(() => {
                const cameraPlan = planCameraForScene({
                  movementId: scene.cameraMovementId,
                  setting: scene.setting,
                  objective: scene.objective,
                  action: scene.action,
                  format,
                  sceneIndex: si,
                  sceneCount: scenes.length,
                });
                const shotRisks = auditShotScene(scene);
                return (
                  <div className="mb-4 rounded-xl border border-accent-secondary/20 bg-accent-secondary/[0.045] p-3" data-camera-plan={si}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                      <label className="min-w-0 flex-1">
                        <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-accent-secondary">Camera movement</span>
                        <select
                          value={cameraPlan.movementId}
                          onChange={(event) => updateScene(si, { cameraMovementId: event.target.value as CameraMovementId })}
                          className="mt-1.5 w-full rounded-lg border border-white/10 bg-paper px-3 py-2 text-xs focus:border-accent-secondary focus:outline-none"
                          data-camera-movement={si}
                        >
                          {CAMERA_MOVEMENTS
                            .filter((movement) => !scene.energyState || cameraAllowedForEnergy(scene.energyState, movement.id))
                            .map((movement) => (
                            <option key={movement.id} value={movement.id}>
                              {movement.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="min-w-0 flex-[1.4] text-[10px] leading-4 text-grey">
                        <p><span className="text-ink">Angle:</span> {cameraPlan.angle}</p>
                        <p><span className="text-ink">Lens:</span> {cameraPlan.lens}</p>
                        <p className="mt-1 text-accent-secondary">{cameraPlan.rationale}</p>
                      </div>
                    </div>
                    {shotRisks.length > 0 && (
                      <div className="mt-3 border-t border-amber-300/15 pt-2.5">
                        <p className="text-[8px] font-semibold uppercase tracking-[0.16em] text-amber-200">Director checks before render</p>
                        <ul className="mt-1.5 grid gap-1 text-[9px] leading-4 text-amber-100/70">
                          {shotRisks.map((risk) => <li key={risk.code}>- {risk.message}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })()}

              <div className="flex flex-col gap-3">
                {scene.lines.map((line, li) => (
                  <div key={li} className="flex flex-col gap-2 items-stretch sm:flex-row sm:items-start">
                    <select
                      value={line.characterId}
                      onChange={(e) => updateLine(si, li, { characterId: e.target.value })}
                      className="w-full border border-line rounded-sm px-2 py-2 text-sm bg-paper focus:outline-none focus:border-accent shrink-0 sm:w-36"
                    >
                      <option value="">Who speaks?</option>
                      {castCharacters.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <input
                      value={line.text}
                      onChange={(e) => updateLine(si, li, { text: e.target.value })}
                      placeholder="Their line…"
                      className="w-full min-w-0 flex-1 border border-line rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-accent"
                    />
                    <button
                      type="button"
                      onClick={() => removeLine(si, li)}
                      className="self-end text-grey hover:text-red-600 px-2 py-2 sm:self-auto"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => addLine(si)}
                    disabled={castCharacters.length === 0}
                    className="self-start text-xs text-accent hover:underline disabled:text-grey disabled:no-underline"
                  >
                    + Add a line
                  </button>
                  <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.14em] text-grey">
                    Dialogue optional
                  </span>
                </div>
              </div>
            </div>
            );
          })}

          <button
            type="button"
            onClick={addScene}
            className="border border-dashed border-line rounded-md py-3 text-sm text-grey hover:border-accent hover:text-accent transition-colors"
          >
            + Add another scene
          </button>

          {error && <p className="text-xs text-red-600">{error}</p>}

          {/*
            On the canvas the rail carries the pinned action; below 1023px the rail
            is hidden, so this row stays reachable on its own by sticking to the
            bottom of the scroller rather than sitting under every scene card.
          */}
          <div className="sticky bottom-0 -mx-6 flex items-center justify-between border-t border-line/70 bg-[#070a08]/95 px-6 py-3 backdrop-blur lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:px-0 lg:backdrop-blur-none">
            <button
              onClick={() => setStep(2)}
              className="text-sm text-grey hover:text-accent px-4 py-2"
            >
              ← Back
            </button>
            <button
              onClick={() => void handleStartProduction()}
              disabled={startingProduction || productionBusy}
              className="bg-accent text-paper font-semibold px-6 py-2.5 rounded-sm hover:bg-accent-light transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              {startingProduction ? "Preparing render…" : "Generate in Studio →"}
            </button>
          </div>
        </div>
      )}
      </>
      )}
        </div>
      </div>
      {!outputChooserOpen && (
        <SceneStudioAssets
          assets={sceneAssets}
          busyIndex={scenePreviewBusy}
          onSelect={(index) => { setStep(3); setActiveSceneIndex(index); }}
          onGenerateAll={() => void generateAllScenePreviews()}
          canGenerate={castCharacters.length > 0 && scenes.some((scene) => scene.setting || scene.action)}
          productImageUrl={productImageUrl || undefined}
        />
      )}
      </div>
      </div>
    </section>
  );
}
