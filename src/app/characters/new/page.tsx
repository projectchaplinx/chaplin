"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useChaplinStore } from "@/lib/store";
import Avatar from "@/components/Avatar";
import StudioWorkspaceHeader from "@/components/studio/StudioWorkspaceHeader";
import Chip from "@/components/Chip";
import { ARCHETYPES } from "@/data/seed";
import type { Archetype, CharacterProductionBible, LicenseType, VoiceGender } from "@/lib/types";
import { ARCHETYPE_HUE, ARCHETYPE_LABEL } from "@/lib/format";
import { alignVoiceDescription, explicitVoiceGender } from "@/lib/character-coherence";
import { completedJsonValue } from "@/lib/character-stream";
import { buildProductionBible } from "@/lib/production-prompting";

const VOICE_PRESETS = [
  "Warm, steady, a little old-fashioned",
  "Cold, clipped, a faint smile in every sentence",
  "Bright, fast, cracks on the high notes",
  "Smoky, deliberate, theatrical lilt",
  "Gravelly, unhurried, pauses before punchlines",
  "Layered whisper, echoes its own last word",
  "Custom, describe it myself",
];

const SFX_PRESETS = [
  "A coin flip, mid-heist sting",
  "A lock tumbler clicking into place",
  "A firecracker fuse hissing, then a pop",
  "A door creaking, then a whisper",
  "Armor plates clinking as they turn to leave",
  "A hand bell, rung twice",
  "Custom, describe it myself",
];

const SCORE_PRESETS = [
  "Moody sitar riff over a slow tabla pulse",
  "Warm santoor over a slow harmonium drone",
  "Bouncy dhol-driven brass, festival energy",
  "Slow ghazal strings, a single sarangi line",
  "Detuned harmonium drone with a distant bell",
  "Driving nagada drums under a defiant string line",
  "Custom, describe it myself",
];

const LICENSE_OPTIONS: Record<LicenseType, { label: string; icon: string; detail: string }> = {
  open: { label: "Open", icon: "∞", detail: "Free to cast." },
  paid: { label: "Paid", icon: "₹", detail: "Royalty on every casting." },
  approval: { label: "Approval", icon: "✓", detail: "You approve each story." },
};

const HUE_SWATCHES = [340, 30, 205, 45, 150, 265, 18, 300, 220, 95];

const CHARACTER_FORMATS = [
  {
    id: "live-action",
    icon: "◉",
    label: "Realistic",
    detail: "A believable screen performer",
    direction: "Live-action cinematic photography of an original fictional performer: natural skin texture, tactile materials, physical camera optics, and motivated light.",
    starter: "Create an original live-action fictional performer with a repeatable face, wardrobe, voice, and a dramatic contradiction.",
  },
  {
    id: "cartoon",
    icon: "✦",
    label: "Cartoon",
    detail: "A stylized animated original",
    direction: "Original 2D cartoon character design with expressive but repeatable proportions, clean shape language, and a consistent animated world.",
    starter: "Create an original cartoon character with a distinctive silhouette, expressive personality, and a world built for animation.",
  },
  {
    id: "anime",
    icon: "◈",
    label: "Anime",
    detail: "A cinematic anime actor",
    direction: "Original cinematic anime character design: deliberate linework, expressive eyes, coherent proportions, detailed wardrobe, and dramatic anime lighting.",
    starter: "Create an original anime character with a memorable visual motif, grounded emotional contradiction, and repeatable character design.",
  },
  {
    id: "manga",
    icon: "▤",
    label: "Manga",
    detail: "An ink-and-screentone identity",
    direction: "Original manga character design with confident ink linework, controlled screentone, readable black-and-white value design, and a signature silhouette.",
    starter: "Create an original manga character whose face, silhouette, and emotional pressure read clearly in ink and screentone.",
  },
  {
    id: "custom",
    icon: "＋",
    label: "Your own style",
    detail: "Describe any visual medium",
    direction: "Use the creator's explicitly described original visual medium and keep it consistent across every image and video.",
    starter: "Create an original fictional actor in a distinctive visual medium that I will describe. Preserve one repeatable identity across every scene.",
  },
] as const;

type CharacterFormat = typeof CHARACTER_FORMATS[number]["id"];

const CHARACTER_FORMAT_PREVIEWS: Record<CharacterFormat, string> = {
  "live-action": "/characters/actor-medium-live-action-v1.webp",
  cartoon: "/characters/actor-medium-cartoon-v1.webp",
  anime: "/characters/actor-medium-anime-v1.webp",
  manga: "/characters/actor-medium-manga-v1.webp",
  custom: "/characters/c-astra-banner.webp",
};

const QUICK_ACTOR_PRESETS = [
  {
    title: "Grounded hero",
    image: "/characters/actor-medium-live-action-v1.webp",
    brief: "A grounded protector whose discipline hides one dangerous tenderness.",
    archetype: "hero" as Archetype,
    format: "live-action" as CharacterFormat,
  },
  {
    title: "Quiet mentor",
    image: "/characters/c-rustam-avatar.webp",
    brief: "An ageing mentor whose warmth conceals one impossible promise.",
    archetype: "mentor" as Archetype,
    format: "live-action" as CharacterFormat,
  },
  {
    title: "Anime rival",
    image: "/characters/actor-medium-anime-v1.webp",
    brief: "A precise rival who remembers every betrayal but cannot abandon the person who caused the first one.",
    archetype: "antihero" as Archetype,
    format: "anime" as CharacterFormat,
  },
  {
    title: "Manga outsider",
    image: "/characters/actor-medium-manga-v1.webp",
    brief: "A watchful outsider whose perfect courtesy disguises a refusal to forgive.",
    archetype: "outsider" as Archetype,
    format: "manga" as CharacterFormat,
  },
] as const;

type SuggestionTarget = "all" | "tagline" | "personality" | "voice" | "sfx" | "theme";
type CharacterSuggestion = {
  name: string;
  archetypes: Archetype[];
  tagline: string;
  personality: string;
  voiceGender: VoiceGender;
  voiceDescription: string;
  signatureSfx: string;
  themeScore: string;
  productionBible: CharacterProductionBible;
};
type CharacterStreamPreview = {
  name?: string;
  archetypes?: Archetype[];
  tagline?: string;
  personality?: string;
};

type CharacterBuilderDraft = {
  version: 1;
  updatedAt: string;
  name: string;
  nameSource?: "creator" | "generated";
  archetypes: Archetype[];
  characterBrief: string;
  tagline: string;
  personality: string;
  appearanceBrief: string;
  worldBrief: string;
  voiceGender: VoiceGender;
  voicePreset: string;
  customVoice: string;
  sfxPreset: string;
  customSfx: string;
  scorePreset: string;
  customScore: string;
  licenseType: LicenseType;
  royaltyRate: number;
  hue: number;
  visualFormat?: CharacterFormat;
  productionBible?: CharacterProductionBible;
};

const IDENTITY_BUILD_STAGES = [
  {
    shortLabel: "Waiting",
    label: "Waiting for the first model output",
    detail: "No character fields are filled until the live response provides them.",
  },
  {
    shortLabel: "Role",
    label: "Choosing the role",
    detail: "The name arrived. The model is choosing the actor’s actual archetype.",
  },
  {
    shortLabel: "Promise",
    label: "Writing the character promise",
    detail: "The generated role is visible. The character promise is arriving next.",
  },
  {
    shortLabel: "Engine",
    label: "Writing the character engine",
    detail: "The promise is visible. Wants, contradictions, and pressure behavior are streaming.",
  },
  {
    shortLabel: "Bible",
    label: "Completing the production bible",
    detail: "The core identity is visible. Look, voice, sound, music, and continuity are finishing.",
  },
] as const;

function CharacterBuildPopup({
  target,
  progress,
  buildStage,
  elapsedSeconds,
  preview,
}: {
  target: SuggestionTarget | null;
  progress: number;
  buildStage: number;
  elapsedSeconds: number;
  preview: CharacterStreamPreview;
}) {
  if (!target) return null;
  const buildingAll = target === "all";
  const stage = IDENTITY_BUILD_STAGES[buildStage];
  const roleLabels = preview.archetypes?.map((item) => ARCHETYPE_LABEL[item]).join(" + ");
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 px-4 backdrop-blur-[5px]">
      <section
        className="magic-surface w-full max-w-lg overflow-hidden rounded-2xl border border-accent/45 bg-[#090d0b]/95 shadow-[0_32px_100px_rgba(0,0,0,0.72)]"
        data-suggest-progress
        role="status"
        aria-live="polite"
        aria-label={buildingAll ? "Building the actor identity" : `Writing ${target}`}
      >
        <div className="border-b border-white/10 px-6 py-5">
          <div className="flex items-start justify-between gap-5">
            <div className="flex min-w-0 items-center gap-3">
              <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-accent/45 bg-accent/10">
                <span className="absolute inset-1 animate-ping rounded-full bg-accent/15" />
                <span className="relative h-2.5 w-2.5 rounded-full bg-accent shadow-[0_0_16px_var(--accent)]" />
              </span>
              <div className="min-w-0">
                <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-accent">
                  Chaplin is writing
                </p>
                <h2 className="mt-1 text-lg font-semibold text-ink">
                  {buildingAll ? stage.label : `Writing ${target}`}
                </h2>
              </div>
            </div>
            <div className="text-right">
              <span className="block font-mono text-2xl font-bold leading-none text-accent">
                {buildingAll ? `${progress}%` : "LIVE"}
              </span>
              <span className="mt-1.5 block text-[9px] tabular-nums text-grey">{elapsedSeconds}s elapsed</span>
            </div>
          </div>

          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className={`h-full rounded-full bg-gradient-to-r from-accent to-[#26d7c5] ${
                buildingAll ? "transition-[width] duration-500" : "w-1/2 animate-pulse"
              }`}
              style={buildingAll ? { width: `${progress}%` } : undefined}
            />
          </div>
          <p className="mt-3 text-[11px] leading-5 text-grey">
            {buildingAll ? stage.detail : "The finished value will move into the editor when it is ready."}
          </p>
        </div>

        {buildingAll && (
          <div className="space-y-2.5 px-6 py-5">
            {[
              ["Name", preview.name],
              ["Role", roleLabels],
              ["Promise", preview.tagline],
              ["Engine", preview.personality],
            ].map(([label, value]) => (
              <div key={label} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3 rounded-lg border border-white/[0.07] bg-black/20 px-3 py-2.5">
                <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-grey">{label}</span>
                <span className={`line-clamp-2 text-[10px] leading-4 ${value ? "text-ink" : "text-grey/45"}`}>
                  {value || "Waiting for model output…"}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-white/10 px-6 py-3 text-[9px] text-grey">
          <span>{buildingAll ? `Step ${buildStage + 1} of ${IDENTITY_BUILD_STAGES.length}` : "One field"}</span>
          <span>The right-side editor updates when complete</span>
        </div>
      </section>
    </div>
  );
}

function appearanceDirectionFromBible(bible: CharacterProductionBible) {
  return [
    bible.visual.medium,
    bible.visual.perceivedAge,
    bible.visual.faceAnchors.join("; "),
    bible.visual.hair,
    bible.visual.wardrobe,
    bible.visual.silhouette,
    ...(bible.visual.recognitionLocks ?? []),
  ].filter(Boolean).join(". ");
}

function worldDirectionFromBible(bible: CharacterProductionBible) {
  return [
    bible.cinematography.worldTexture,
    `Palette: ${bible.visual.palette.join(", ")}`,
    `Lighting: ${bible.cinematography.keyLight}; ${bible.cinematography.fillLight}; ${bible.cinematography.edgeLight}`,
  ].filter(Boolean).join(". ");
}

function SuggestButton({
  target,
  activeTarget,
  onClick,
}: {
  target: SuggestionTarget;
  activeTarget: SuggestionTarget | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={Boolean(activeTarget)}
      data-suggest-character={target}
      data-intelligence-action
      aria-busy={activeTarget === target}
      className="magic-action rounded-full px-2.5 py-1 text-[10px] font-semibold disabled:opacity-40"
    >
      {activeTarget === target ? "Writing..." : target === "all" ? "✦ Magic Write actor" : "✦ Magic Write"}
    </button>
  );
}

export default function NewCharacterPage() {
  const router = useRouter();
  const currentUserId = useChaplinStore((s) => s.currentUserId);
  const addCharacter = useChaplinStore((s) => s.addCharacter);
  const removeCharacter = useChaplinStore((s) => s.removeCharacter);

  const [name, setName] = useState("");
  const [archetypes, setArchetypes] = useState<Archetype[]>([]);
  const [characterBrief, setCharacterBrief] = useState("");
  const [tagline, setTagline] = useState("");
  const [personality, setPersonality] = useState("");
  const [appearanceBrief, setAppearanceBrief] = useState("");
  const [worldBrief, setWorldBrief] = useState("");
  const [voiceGender, setVoiceGender] = useState<VoiceGender>("androgynous");
  const [voicePreset, setVoicePreset] = useState(VOICE_PRESETS[VOICE_PRESETS.length - 1]);
  const [customVoice, setCustomVoice] = useState("");
  const [sfxPreset, setSfxPreset] = useState(SFX_PRESETS[SFX_PRESETS.length - 1]);
  const [customSfx, setCustomSfx] = useState("");
  const [scorePreset, setScorePreset] = useState(SCORE_PRESETS[SCORE_PRESETS.length - 1]);
  const [customScore, setCustomScore] = useState("");
  const [licenseType, setLicenseType] = useState<LicenseType>("paid");
  const [royaltyRate, setRoyaltyRate] = useState(30);
  const [hue, setHue] = useState(205);
  const [visualFormat, setVisualFormat] = useState<CharacterFormat | null>(null);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [suggestingTarget, setSuggestingTarget] = useState<SuggestionTarget | null>(null);
  const [suggestionMessage, setSuggestionMessage] = useState("");
  const [productionBible, setProductionBible] = useState<CharacterProductionBible | undefined>();
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [streamedFieldCount, setStreamedFieldCount] = useState(0);
  const [streamPreview, setStreamPreview] = useState<CharacterStreamPreview>({});
  const [revealingField, setRevealingField] = useState("");
  const suggestStartedAt = useRef<number | null>(null);
  const magicWriteRunRef = useRef(0);
  const creatorNamedRef = useRef(false);
  const [recoverableDraft, setRecoverableDraft] = useState<Partial<CharacterBuilderDraft> | null>(null);
  const restoredDraftKey = useRef<string | null>(null);
  const draftStorageKey = `chaplin-character-builder:${currentUserId}`;
  const progress = suggestingTarget === "all" ? streamedFieldCount * 20 : 0;
  const buildStage = Math.min(streamedFieldCount, IDENTITY_BUILD_STAGES.length - 1);

  useEffect(() => {
    if (!suggestingTarget) {
      suggestStartedAt.current = null;
      return;
    }
    suggestStartedAt.current = Date.now();
    const interval = setInterval(() => {
      if (suggestStartedAt.current) {
        setElapsedSeconds(Math.floor((Date.now() - suggestStartedAt.current) / 1000));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [suggestingTarget]);

  function applyDraft(draft: Partial<CharacterBuilderDraft>) {
    const restoredVoiceGender = explicitVoiceGender(
      `${draft.characterBrief ?? ""} ${draft.personality ?? ""}`,
    ) ?? draft.voiceGender ?? "androgynous";
    const restoredAppearanceBrief = draft.appearanceBrief?.trim() ||
      (draft.productionBible ? appearanceDirectionFromBible(draft.productionBible) : "");
    const restoredWorldBrief = draft.worldBrief?.trim() ||
      (draft.productionBible ? worldDirectionFromBible(draft.productionBible) : "");
    creatorNamedRef.current = draft.nameSource === "creator";
    setName(draft.name ?? "");
    setArchetypes(
      Array.isArray(draft.archetypes) && draft.archetypes.length
        ? draft.archetypes.filter((value): value is Archetype => (ARCHETYPES as readonly string[]).includes(value))
        : [],
    );
    setCharacterBrief(draft.characterBrief ?? "");
    setTagline(draft.tagline ?? "");
    setPersonality(draft.personality ?? "");
    setAppearanceBrief(restoredAppearanceBrief);
    setWorldBrief(restoredWorldBrief);
    setVoiceGender(restoredVoiceGender);
    setVoicePreset(draft.voicePreset ?? VOICE_PRESETS[VOICE_PRESETS.length - 1]);
    setCustomVoice(alignVoiceDescription(draft.customVoice ?? "", restoredVoiceGender));
    setSfxPreset(draft.sfxPreset ?? SFX_PRESETS[SFX_PRESETS.length - 1]);
    setCustomSfx(draft.customSfx ?? "");
    setScorePreset(draft.scorePreset ?? SCORE_PRESETS[SCORE_PRESETS.length - 1]);
    setCustomScore(draft.customScore ?? "");
    setLicenseType(draft.licenseType ?? "paid");
    setRoyaltyRate(typeof draft.royaltyRate === "number" ? draft.royaltyRate : 30);
    setHue(typeof draft.hue === "number" ? draft.hue : 205);
    setVisualFormat(draft.visualFormat ?? null);
    setProductionBible(draft.productionBible);
  }

  /*
    Opening /characters/new must start blank. This used to auto-apply the last
    autosaved draft, so a fresh actor arrived pre-filled with the previous one's
    name, brief, archetype, and bible. The draft is still kept — losing work on
    a refresh mid-build would be worse — but it is now offered rather than
    imposed, and only when it actually contains something.
  */
  useEffect(() => {
    if (restoredDraftKey.current === draftStorageKey) return;
    restoredDraftKey.current = draftStorageKey;
    const stored = window.localStorage.getItem(draftStorageKey);
    if (!stored) return;
    try {
      const draft = JSON.parse(stored) as Partial<CharacterBuilderDraft>;
      if (draft.version !== 1) return;
      if (!draft.name && !draft.characterBrief && !draft.tagline) return;
      // Deferred so the read does not set state synchronously inside the effect.
      const timer = window.setTimeout(() => setRecoverableDraft(draft), 0);
      return () => window.clearTimeout(timer);
    } catch {
      window.localStorage.removeItem(draftStorageKey);
    }
  }, [draftStorageKey]);

  useEffect(() => {
    if (restoredDraftKey.current !== draftStorageKey) return;
    const timer = window.setTimeout(() => {
      const draft: CharacterBuilderDraft = {
        version: 1,
        updatedAt: new Date().toISOString(),
        name,
        nameSource: creatorNamedRef.current ? "creator" : "generated",
        archetypes,
        characterBrief,
        tagline,
        personality,
        appearanceBrief,
        worldBrief,
        voiceGender,
        voicePreset,
        customVoice,
        sfxPreset,
        customSfx,
        scorePreset,
        customScore,
        licenseType,
        royaltyRate,
        hue,
        visualFormat: visualFormat ?? undefined,
        productionBible,
      };
      window.localStorage.setItem(draftStorageKey, JSON.stringify(draft));
    }, 350);
    return () => window.clearTimeout(timer);
  }, [
    appearanceBrief,
    archetypes,
    characterBrief,
    customScore,
    customSfx,
    customVoice,
    draftStorageKey,
    hue,
    licenseType,
    name,
    personality,
    productionBible,
    royaltyRate,
    scorePreset,
    sfxPreset,
    tagline,
    voiceGender,
    voicePreset,
    visualFormat,
    worldBrief,
  ]);

  // Concierge hand-off prefills the editable builder but never starts a paid
  // generation automatically. The creator stays in control of every action.
  const conciergeRan = useRef(false);
  useEffect(() => {
    if (conciergeRan.current) return;
    const params = new URLSearchParams(window.location.search);
    const cname = params.get("cname")?.trim() ?? "";
    const cbrief = params.get("cbrief")?.trim() ?? "";
    const carchetypes = (params.get("carchetypes") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter((value): value is Archetype => (ARCHETYPES as readonly string[]).includes(value));
    if (!cname && !cbrief && carchetypes.length === 0) return;
    conciergeRan.current = true;
    const timer = window.setTimeout(() => {
      if (cname) {
        creatorNamedRef.current = true;
        setName(cname);
      }
      if (cbrief) setCharacterBrief(cbrief);
      if (carchetypes.length) setArchetypes(carchetypes);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const applyVoiceDirection = (event: Event) => {
      const detail = (event as CustomEvent<{
        name?: string | null;
        brief?: string | null;
        archetypes?: string[];
      }>).detail;
      const direction = detail?.brief?.trim();
      if (detail?.name?.trim()) {
        creatorNamedRef.current = true;
        setName((current) => current.trim() ? current : detail.name!.trim());
      }
      if (direction) {
        setCharacterBrief((current) => {
          if (!current.trim()) return direction;
          if (current.toLowerCase().includes(direction.toLowerCase())) return current;
          return `${current.trim()}\n${direction}`;
        });
      }
      const incomingArchetypes = (detail?.archetypes ?? [])
        .filter((value): value is Archetype => (ARCHETYPES as readonly string[]).includes(value));
      if (incomingArchetypes.length) {
        setArchetypes((current) => [...new Set([...current, ...incomingArchetypes])]);
      }
      setSuggestionMessage("Voice direction added. Review it, then run Magic Write.");
    };
    window.addEventListener("chaplin:character-assist", applyVoiceDirection);
    return () => window.removeEventListener("chaplin:character-assist", applyVoiceDirection);
  }, []);

  const archetype = archetypes[0] ?? "hero";

  function updateCreatorName(nextName: string) {
    creatorNamedRef.current = Boolean(nextName.trim());
    setName(nextName);
  }

  function toggleArchetype(a: Archetype) {
    setArchetypes((current) => {
      if (current.includes(a)) {
        return current.filter((item) => item !== a);
      }
      return [...current, a];
    });
  }

  const isCustomVoice = voicePreset === VOICE_PRESETS[VOICE_PRESETS.length - 1];
  const voiceDesc = isCustomVoice ? customVoice : voicePreset;
  const isCustomSfx = sfxPreset === SFX_PRESETS[SFX_PRESETS.length - 1];
  const sfxDesc = isCustomSfx ? customSfx : sfxPreset;
  const isCustomScore = scorePreset === SCORE_PRESETS[SCORE_PRESETS.length - 1];
  const themeDesc = isCustomScore ? customScore : scorePreset;
  const showCustomVoice = isCustomVoice || Boolean(customVoice.trim());
  const showCustomSfx = isCustomSfx || Boolean(customSfx.trim());
  const showCustomScore = isCustomScore || Boolean(customScore.trim());
  const requiredCreationFields = [
    ["role / archetype", archetypes[0] ?? ""],
    ["name", name],
    ["character promise", tagline],
    ["character engine", personality],
    ["voice direction", voiceDesc],
    ["signature SFX", sfxDesc],
    ["theme direction", themeDesc],
  ] as const;
  const missingCreationFields = requiredCreationFields
    .filter(([, value]) => !value.trim())
    .map(([label]) => label);
  const canCreateActor = missingCreationFields.length === 0;
  const selectedVisualFormat = CHARACTER_FORMATS.find((format) => format.id === visualFormat);
  // Every medium shows the same example actor, which is the whole point of the
  // picker ("The same example actor is shown in four mediums"). Live-action used
  // to substitute an unrelated character's gallery, so choosing Realistic showed
  // a different face than the Realistic thumbnail beside it.
  const previewImages = [CHARACTER_FORMAT_PREVIEWS[visualFormat ?? "live-action"]];
  const activePreviewImage = previewImages[previewIndex] ?? previewImages[0];

  function selectVisualFormat(format: typeof CHARACTER_FORMATS[number]) {
    setVisualFormat(format.id);
    setPreviewIndex(0);
    setSuggestionMessage(`${format.label} selected as the rendering medium. Your character idea has not changed.`);
  }

  function applyQuickPreset(preset: typeof QUICK_ACTOR_PRESETS[number]) {
    setCharacterBrief(preset.brief);
    setArchetypes([preset.archetype]);
    setVisualFormat(preset.format);
    setPreviewIndex(0);
    setSuggestionMessage(`${preset.title} loaded as an editable starting point. Magic Write will create an original actor from it.`);
  }

  async function suggestCharacter(
    target: SuggestionTarget,
    overrides?: { name?: string; characterBrief?: string; archetypes?: Archetype[] }
  ) {
    const overrideName = overrides?.name?.trim() ?? "";
    const effectiveName = overrideName ||
      (target === "all" && !creatorNamedRef.current ? "" : name);
    const effectiveBrief = overrides?.characterBrief ?? characterBrief;
    const effectiveArchetypes = overrides?.archetypes ?? archetypes;
    if (target !== "all" && !effectiveName.trim()) {
      setError("Name the AI actor first, then Magic Write can build this part of the identity.");
      return;
    }
    if (target === "all" && effectiveBrief.trim().length < 20) {
      setError("Give Magic Write one clear sentence about who this actor is — that thought drives the complete identity.");
      return;
    }
    setElapsedSeconds(0);
    setStreamedFieldCount(0);
    setStreamPreview(effectiveName.trim() ? { name: effectiveName.trim() } : {});
    setSuggestingTarget(target);
    setError("");
    setSuggestionMessage("");
    const magicWriteRun = ++magicWriteRunRef.current;
    const requestPayload = {
      target,
      name: effectiveName,
      archetype: effectiveArchetypes[0] ?? "",
      archetypes: effectiveArchetypes,
      characterBrief: effectiveBrief,
      tagline,
      personality,
      appearanceBrief,
      worldBrief,
      voiceGender,
      voiceDescription: voiceDesc,
      signatureSfx: sfxDesc,
      themeScore: themeDesc,
      visualFormat: selectedVisualFormat?.direction,
    };
    try {
      const response = await fetch("/api/write/character", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...requestPayload, stream: target === "all" }),
      });
      let data: {
        suggestion?: CharacterSuggestion;
        provider?: string;
        warning?: string;
        error?: string;
      };
      if (
        target === "all" &&
        response.ok &&
        response.body &&
        response.headers.get("content-type")?.includes("application/x-ndjson")
      ) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let lineBuffer = "";
        let generatedJson = "";
        let completeEvent: typeof data | null = null;
        const revealed = new Set<string>();
        const revealCompletedFields = () => {
          const streamedName = completedJsonValue(generatedJson, "name");
          if (!effectiveName.trim() && typeof streamedName === "string" && !revealed.has("name")) {
            setStreamPreview((current) => ({ ...current, name: streamedName }));
            revealed.add("name");
          }
          const streamedArchetypes = completedJsonValue(generatedJson, "archetypes");
          const validStreamedArchetypes = Array.isArray(streamedArchetypes)
            ? streamedArchetypes.filter((item): item is Archetype =>
                typeof item === "string" && (ARCHETYPES as readonly string[]).includes(item))
            : [];
          if (validStreamedArchetypes.length && !revealed.has("archetypes")) {
            setStreamPreview((current) => ({ ...current, archetypes: validStreamedArchetypes }));
            revealed.add("archetypes");
          }
          const streamedTagline = completedJsonValue(generatedJson, "tagline");
          if (typeof streamedTagline === "string" && !revealed.has("tagline")) {
            setStreamPreview((current) => ({ ...current, tagline: streamedTagline }));
            revealed.add("tagline");
          }
          const streamedPersonality = completedJsonValue(generatedJson, "personality");
          if (typeof streamedPersonality === "string" && !revealed.has("personality")) {
            setStreamPreview((current) => ({ ...current, personality: streamedPersonality }));
            revealed.add("personality");
          }
          if (revealed.size) {
            setStreamedFieldCount(Math.min(4, revealed.size));
          }
        };
        while (true) {
          const { done, value } = await reader.read();
          lineBuffer += decoder.decode(value, { stream: !done });
          const lines = lineBuffer.split("\n");
          lineBuffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            const event = JSON.parse(line) as {
              type?: "delta" | "complete" | "error";
              delta?: string;
              suggestion?: CharacterSuggestion;
              error?: string;
              provider?: string;
            };
            if (event.type === "delta" && event.delta) {
              generatedJson += event.delta;
              revealCompletedFields();
            }
            if (event.type === "complete" && event.suggestion) {
              setStreamedFieldCount(5);
              completeEvent = { suggestion: event.suggestion, provider: event.provider };
            }
            if (event.type === "error") throw new Error(event.error || "Character streaming failed.");
          }
          if (done) break;
        }
        if (!completeEvent) throw new Error("Magic Write ended before the actor was complete.");
        data = completeEvent;
      } else {
        data = await response.json() as typeof data;
      }
      if (!response.ok || !data.suggestion) throw new Error(data.error || "Character suggestions failed.");
      const suggestion = data.suggestion;
      const suggestedName = effectiveName.trim() || suggestion.name.trim();
      if (!suggestedName) throw new Error("Magic Write did not return a character name. Please try again.");
      const generatedAppearanceBrief = appearanceBrief.trim() ||
        appearanceDirectionFromBible(suggestion.productionBible);
      const generatedWorldBrief = worldBrief.trim() ||
        worldDirectionFromBible(suggestion.productionBible);
      const coherentVoiceGender = explicitVoiceGender(
        `${effectiveBrief} ${suggestion.personality}`,
      ) ?? suggestion.voiceGender;
      const coherentVoiceDescription = alignVoiceDescription(
        suggestion.voiceDescription,
        coherentVoiceGender,
      );
      if (target === "all") {
        // Save the authoritative complete result after the live provider stream
        // finishes so a refresh can restore the same generated actor.
        const recoveredDraft: CharacterBuilderDraft = {
          version: 1,
          updatedAt: new Date().toISOString(),
          name: suggestedName,
          nameSource: creatorNamedRef.current ? "creator" : "generated",
          archetypes: suggestion.archetypes,
          characterBrief: effectiveBrief,
          tagline: suggestion.tagline,
          personality: suggestion.personality,
          appearanceBrief: generatedAppearanceBrief,
          worldBrief: generatedWorldBrief,
          voiceGender: coherentVoiceGender,
          voicePreset: VOICE_PRESETS[VOICE_PRESETS.length - 1],
          customVoice: coherentVoiceDescription,
          sfxPreset: SFX_PRESETS[SFX_PRESETS.length - 1],
          customSfx: suggestion.signatureSfx,
          scorePreset: SCORE_PRESETS[SCORE_PRESETS.length - 1],
          customScore: suggestion.themeScore,
          licenseType,
          royaltyRate,
          hue,
          visualFormat: visualFormat ?? undefined,
          productionBible: suggestion.productionBible,
        };
        window.localStorage.setItem(draftStorageKey, JSON.stringify(recoveredDraft));

        if (magicWriteRunRef.current !== magicWriteRun) return;
        setName(suggestedName);
        setArchetypes(suggestion.archetypes);
        setTagline(suggestion.tagline);
        setPersonality(suggestion.personality);
        setAppearanceBrief(generatedAppearanceBrief);
        setWorldBrief(generatedWorldBrief);
        setVoiceGender(coherentVoiceGender);
        setVoicePreset(VOICE_PRESETS[VOICE_PRESETS.length - 1]);
        setCustomVoice(coherentVoiceDescription);
        setSfxPreset(SFX_PRESETS[SFX_PRESETS.length - 1]);
        setCustomSfx(suggestion.signatureSfx);
        setScorePreset(SCORE_PRESETS[SCORE_PRESETS.length - 1]);
        setCustomScore(suggestion.themeScore);
        setProductionBible(suggestion.productionBible);
        setRevealingField("");
        setSuggestionMessage("");
      } else {
        setProductionBible(suggestion.productionBible);
        if (target === "tagline") setTagline(suggestion.tagline);
        if (target === "personality") setPersonality(suggestion.personality);
        if (target === "voice") {
          setVoiceGender(coherentVoiceGender);
          setVoicePreset(VOICE_PRESETS[VOICE_PRESETS.length - 1]);
          setCustomVoice(coherentVoiceDescription);
        }
        if (target === "sfx") {
          setSfxPreset(SFX_PRESETS[SFX_PRESETS.length - 1]);
          setCustomSfx(suggestion.signatureSfx);
        }
        if (target === "theme") {
          setScorePreset(SCORE_PRESETS[SCORE_PRESETS.length - 1]);
          setCustomScore(suggestion.themeScore);
        }
        setSuggestionMessage("");
      }
    } catch (suggestionError) {
      console.error("Character suggestion failed", suggestionError);
      /*
        Show the provider's actual failure. The generic "try again" hid an
        out-of-credit account for a full debugging cycle; error codes like
        [CLAUDE-400] or an OpenAI quota message tell us what broke instantly.
      */
      setError(
        suggestionError instanceof Error && suggestionError.message
          ? `Magic Write failed: ${suggestionError.message}`
          : "Magic Write could not finish. Please try again.",
      );
    } finally {
      setSuggestingTarget(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (
      !name.trim() ||
      archetypes.length === 0 ||
      !tagline.trim() ||
      !personality.trim() ||
      !voiceDesc.trim() ||
      !sfxDesc.trim() ||
      !themeDesc.trim()
    ) {
      setError("Every field earns this AI actor a place on the shelf, fill them all in.");
      return;
    }
    setSaving(true);
    setError("");
    // Preserve the exact creator-entered fields alongside the derived canon so
    // My Characters can later export the complete original brief.
    const resolvedProductionBible = {
      ...(productionBible ?? buildProductionBible({
        name: name.trim(),
        archetype,
        tagline: tagline.trim(),
        personality: personality.trim(),
        voiceGender,
        voiceDesc: voiceDesc.trim(),
        sfxDesc: sfxDesc.trim(),
        themeDesc: themeDesc.trim(),
        appearanceBrief: [selectedVisualFormat?.direction, appearanceBrief.trim()].filter(Boolean).join("\n"),
        worldBrief: worldBrief.trim(),
      })),
      creationInputs: {
        characterBrief: characterBrief.trim(),
        visualFormat: visualFormat ?? "live-action",
        appearanceBrief: appearanceBrief.trim(),
        worldBrief: worldBrief.trim(),
        archetypes,
        voiceDirection: voiceDesc.trim(),
        signatureSfxDirection: sfxDesc.trim(),
        themeDirection: themeDesc.trim(),
        licenseType,
        royaltyRate,
      },
    };
    const character = addCharacter({
      makerId: currentUserId,
      name: name.trim(),
      archetype,
      archetypeMix: archetypes,
      tagline: tagline.trim(),
      personality: personality.trim(),
      voiceGender,
      voiceDesc: voiceDesc.trim(),
      sfxDesc: sfxDesc.trim(),
      themeDesc: themeDesc.trim(),
      productionBible: resolvedProductionBible,
      avatarHue: hue,
      licenseType,
      royaltyRate,
    });
    try {
      const response = await fetch("/api/characters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(character),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        console.error("Saving the AI actor failed", { status: response.status, error: data?.error });
        throw new Error(data?.error ?? "We could not save this actor. Please try again.");
      }
      window.localStorage.removeItem(draftStorageKey);
      window.dispatchEvent(new Event("chaplin:credits-updated"));
      window.dispatchEvent(new CustomEvent("chaplin:catalogue-updated", { detail: { characterId: character.id } }));
      // Creating the database actor is the first Studio stage, not an exit.
      // Continue into the same actor workspace for voice, still, theme, and
      // scene generation; the public profile is the result, not the editor.
      router.push(`/characters/${character.id}/studio`);
    } catch (submitError) {
      removeCharacter(character.id);
      setError(submitError instanceof Error ? submitError.message : "The AI actor could not be saved.");
      setSaving(false);
    }
  }

  return (
    <>
      <CharacterBuildPopup
        target={suggestingTarget}
        progress={progress}
        buildStage={buildStage}
        elapsedSeconds={elapsedSeconds}
        preview={streamPreview}
      />
      <div
        data-character-creation-shell
        className="hidden h-[100dvh] min-h-0 flex-col overflow-hidden bg-[#070a09] lg:flex"
      >
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <StudioWorkspaceHeader
            mode="actor"
            projectName={name.trim() || "Untitled actor"}
            status="Actor studio · autosaved"
            backHref="/studio"
            actions={
              <>
              <button
                type="button"
                onClick={() => setSuggestionMessage("Draft saved. Chaplin will keep restoring it on this device.")}
                className="rounded-lg border border-white/10 px-4 py-2.5 text-xs font-semibold text-grey hover:border-white/25 hover:text-ink"
              >
                Save draft
              </button>
              <button
                type="submit"
                data-create-actor-submit
                disabled={!canCreateActor || saving || Boolean(suggestingTarget)}
                title={canCreateActor ? "Create this AI actor" : `Still needed: ${missingCreationFields.join(", ")}`}
                className="rounded-lg bg-accent px-5 py-2.5 text-xs font-semibold text-white shadow-[0_10px_30px_rgba(242,78,112,0.22)] hover:bg-accent-light disabled:opacity-45"
              >
                {saving ? "Creating actor…" : canCreateActor ? "Create actor →" : `Still needed · ${missingCreationFields[0] ?? "identity"}`}
              </button>
              </>
            }
          />

          <div className="studio-workspace-grid grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] overflow-hidden">
            <aside
              data-lenis-prevent
              className="chaplin-scrollbar h-full min-h-0 touch-pan-y overflow-y-auto overscroll-contain border-r border-white/10 bg-[#0a0e0c] p-5"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-lg font-semibold">Create AI Actor</p>
                  <p className="mt-0.5 text-[10px] text-grey">Step 1 of 5 · Identity</p>
                </div>
                <span className="rounded-full border border-accent/35 px-2.5 py-1 text-[9px] font-semibold text-accent">LIVE PREVIEW</span>
              </div>

              {recoverableDraft && (
                <div className="mt-4 rounded-lg border border-accent/35 bg-accent/[0.07] p-3">
                  <p className="text-[10px] font-semibold text-accent">Unsaved draft found</p>
                  <p className="mt-1 text-[10px] leading-4 text-grey">
                    You were building{" "}
                    <strong className="text-ink">{recoverableDraft.name?.trim() || "an unnamed actor"}</strong>.
                    This new actor starts blank.
                  </p>
                  <div className="mt-2.5 flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        applyDraft(recoverableDraft);
                        setRecoverableDraft(null);
                        setSuggestionMessage("Draft restored. Your earlier character work is back.");
                      }}
                      className="rounded-md bg-accent px-2.5 py-1.5 text-[10px] font-semibold text-paper"
                    >
                      Restore it
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        window.localStorage.removeItem(draftStorageKey);
                        setRecoverableDraft(null);
                      }}
                      className="rounded-md border border-white/15 px-2.5 py-1.5 text-[10px] font-semibold text-grey hover:border-accent hover:text-accent"
                    >
                      Discard
                    </button>
                  </div>
                </div>
              )}

              <div className="mt-5 border-t border-white/10 pt-5">
                <p className="text-xs font-semibold">Choose how the actor looks on screen</p>
                <p className="mt-1 text-[10px] leading-4 text-grey">The same example actor is shown in four mediums. This changes rendering style—not your character idea.</p>
                <div className="mt-3 grid grid-cols-2 gap-2" data-character-format-options>
                  {CHARACTER_FORMATS.map((format) => {
                    const selected = visualFormat === format.id;
                    return (
                      <button
                        key={format.id}
                        type="button"
                        onClick={() => selectVisualFormat(format)}
                        aria-pressed={selected}
                        className={`group overflow-hidden rounded-lg border text-left transition ${
                          selected ? "border-accent bg-accent/10" : "border-white/10 bg-white/[0.025] hover:border-white/25"
                        }`}
                      >
                        <span className="relative block h-[4.6rem] overflow-hidden bg-[#111713]">
                          <Image
                            src={CHARACTER_FORMAT_PREVIEWS[format.id]}
                            alt={`${format.label} actor example`}
                            fill
                            sizes="145px"
                            className={`object-cover transition duration-300 group-hover:scale-105 ${format.id === "manga" ? "grayscale" : ""}`}
                          />
                          <span className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent" />
                          {selected && <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[10px] text-white">✓</span>}
                        </span>
                        <span className="block px-2.5 pt-2 text-[10px] font-semibold">{format.label}</span>
                        <span className="block px-2.5 pb-2 pt-0.5 text-[8px] leading-3 text-grey">{format.detail}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-5 border-t border-white/10 pt-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold">Quick starting points</p>
                  <span className="text-[9px] text-accent">Ideas, not copied actors</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {QUICK_ACTOR_PRESETS.map((preset) => (
                    <button
                      key={preset.title}
                      type="button"
                      onClick={() => applyQuickPreset(preset)}
                      title={`Start with ${preset.title}`}
                      className="flex min-w-0 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.025] p-2 text-left hover:border-accent"
                    >
                      <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-md">
                        <Image src={preset.image} alt="" fill sizes="36px" className="object-cover" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[9px] font-semibold">{preset.title}</span>
                        <span className="mt-0.5 block truncate text-[8px] text-grey">{ARCHETYPE_LABEL[preset.archetype]}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>

            </aside>

            <main className="relative flex min-h-0 flex-col overflow-hidden bg-[#060908] p-4">
              <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-white/10 bg-[#0c110f]">
                <Image
                  src={activePreviewImage}
                  alt={name ? `${name} identity preview` : "AI actor identity preview"}
                  fill
                  priority
                  sizes="(min-width: 1024px) 55vw, 100vw"
                  className={`object-cover transition duration-500 ${visualFormat === "manga" ? "grayscale contrast-125" : ""}`}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-transparent to-black/20" />
                <div className="absolute left-4 top-4 flex items-center gap-2">
                  <span className="rounded-full border border-white/20 bg-black/45 px-2.5 py-1 text-[9px] font-semibold backdrop-blur">IDENTITY PREVIEW</span>
                  <span className="rounded-full border border-white/20 bg-black/45 px-2.5 py-1 text-[9px] text-grey backdrop-blur">4K</span>
                </div>
                <div className="absolute bottom-5 left-5 max-w-lg">
                  <p className="reel-title text-3xl text-white">{name.trim() || "Your new actor"}</p>
                  <p className="mt-1 text-xs text-white/65">
                    {tagline.trim() || selectedVisualFormat?.detail || "Choose a visual identity, then describe who they are."}
                  </p>
                </div>
                {!visualFormat && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/35 backdrop-blur-[2px]">
                    <div className="max-w-xs rounded-xl border border-white/15 bg-black/55 p-5 text-center backdrop-blur-xl">
                      <p className="text-sm font-semibold">Start with a visual identity</p>
                      <p className="mt-1 text-[10px] leading-4 text-grey">Choose Realistic, Cartoon, Anime, Manga, or your own style on the left.</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-3 flex h-[5.4rem] shrink-0 items-stretch gap-2">
                {previewImages.map((image, index) => (
                  <button
                    key={`${image}-${index}`}
                    type="button"
                    onClick={() => setPreviewIndex(index)}
                    className={`relative aspect-[4/3] overflow-hidden rounded-lg border ${
                      previewIndex === index ? "border-accent shadow-[0_0_0_1px_var(--accent)]" : "border-white/10 opacity-65 hover:opacity-100"
                    }`}
                  >
                    <Image src={image} alt={`Preview variation ${index + 1}`} fill sizes="110px" className="object-cover" />
                  </button>
                ))}
                <div className="flex min-w-0 flex-1 items-center justify-between rounded-lg border border-white/10 bg-white/[0.02] px-4">
                  <div>
                    <p className="text-[10px] font-semibold">Visual direction</p>
                    <p className="mt-1 truncate text-[9px] text-grey">{selectedVisualFormat?.label ?? "Not selected"} · {archetypes.map((item) => ARCHETYPE_LABEL[item]).join(" + ")}</p>
                  </div>
                  <span className="text-[9px] text-grey">Choose a frame</span>
                </div>
              </div>
            </main>

            <aside
              data-lenis-prevent
              data-write-panel
              className="chaplin-scrollbar h-full min-h-0 touch-pan-y overflow-y-auto overscroll-contain border-l border-white/10 bg-[#0a0e0c] p-5"
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">Actor identity</p>
              <h1 className="reel-title mt-1 text-2xl">Define the core</h1>
              <p className="mt-1 text-[10px] leading-4 text-grey">Make the decisions that should survive every scene. Chaplin builds the rest.</p>

              <section
                data-magic-character-assist
                className="magic-surface mt-4 rounded-xl p-4"
                aria-labelledby="desktop-magic-write-title"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p id="desktop-magic-write-title" className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">
                      ✦ Magic Write
                    </p>
                    <p className="mt-1 text-[10px] leading-4 text-grey">
                      Start with one thought. Chaplin writes the complete editable identity.
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full border border-white/10 px-2 py-1 text-[8px] font-semibold text-grey">
                    20+ characters
                  </span>
                </div>

                <textarea
                  id="desktop-magic-character-brief"
                  data-character-field="brief"
                  value={characterBrief}
                  onChange={(event) => {
                    setCharacterBrief(event.target.value);
                    if (error) setError("");
                  }}
                  rows={3}
                  placeholder="e.g. A disgraced Russian cosmonaut who hears messages from a mission that never launched."
                  className="mt-3 w-full resize-y rounded-lg border border-white/10 bg-black/25 px-3 py-2.5 text-xs leading-5 outline-none placeholder:text-grey/60 focus:border-accent"
                />

                <div className="mt-2.5 flex items-center justify-between gap-3">
                  <span className={`text-[9px] ${characterBrief.trim().length >= 20 ? "text-[#36dbbe]" : "text-grey"}`}>
                    {characterBrief.trim().length} characters
                  </span>
                  <button
                    type="button"
                    onClick={() => void suggestCharacter("all")}
                    disabled={Boolean(suggestingTarget)}
                    data-intelligence-action
                    aria-busy={suggestingTarget === "all"}
                    className="magic-action min-w-36 rounded-full px-5 py-2.5 text-[11px] font-semibold disabled:opacity-45"
                  >
                    {suggestingTarget === "all"
                      ? `Writing everything · ${progress}%`
                      : productionBible
                        ? "Rewrite everything"
                        : "Write everything →"}
                  </button>
                </div>

              </section>

              <label className="mt-5 block text-[10px] font-semibold">
                Name
                <div className="relative mt-2">
                  <input
                    data-character-field="name"
                    value={name}
                    onChange={(event) => updateCreatorName(event.target.value)}
                    placeholder="Magic can name the actor"
                    maxLength={50}
                    className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 pr-12 text-xs outline-none focus:border-accent"
                  />
                  <span className="absolute right-3 top-2.5 text-[9px] text-grey">{name.length}/50</span>
                </div>
              </label>

              <div className="mt-5">
                <p className="text-[10px] font-semibold">Role / archetype</p>
                <div className="mt-2 flex flex-wrap gap-2" data-character-archetypes>
                  {ARCHETYPES.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => toggleArchetype(item)}
                      className={`rounded-md border px-3 py-2 text-[9px] font-semibold ${
                        archetypes.includes(item) ? "border-accent bg-accent text-white" : "border-white/10 bg-white/[0.02] text-grey hover:text-ink"
                      }`}
                    >
                      {ARCHETYPE_LABEL[item]}
                    </button>
                  ))}
                </div>
              </div>

              <label className="mt-5 block text-[10px] font-semibold">
                <span className="flex items-center justify-between gap-3">
                  Character promise
                  <SuggestButton
                    target="tagline"
                    activeTarget={suggestingTarget}
                    onClick={() => void suggestCharacter("tagline")}
                  />
                </span>
                <input
                  value={tagline}
                  onChange={(event) => setTagline(event.target.value)}
                  placeholder="The one line that sells the actor"
                  className="mt-2 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-xs outline-none focus:border-accent"
                />
              </label>

              <label className="mt-5 block text-[10px] font-semibold">
                <span className="flex items-center justify-between gap-3">
                  Character engine
                  <SuggestButton
                    target="personality"
                    activeTarget={suggestingTarget}
                    onClick={() => void suggestCharacter("personality")}
                  />
                </span>
                <textarea
                  value={personality}
                  onChange={(event) => setPersonality(event.target.value)}
                  rows={4}
                  placeholder="What do they want? What do they hide? How do they behave under pressure?"
                  className="mt-2 w-full resize-none rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-xs leading-5 outline-none focus:border-accent"
                />
              </label>

              <details className="mt-4 rounded-lg border border-white/10 bg-white/[0.02]">
                <summary className="cursor-pointer list-none px-3.5 py-3 text-[10px] font-semibold">Advanced identity controls <span className="float-right text-grey">＋</span></summary>
                <div className="space-y-3 border-t border-white/10 p-3.5">
                  <label className="block text-[9px] text-grey">
                    Face, age & wardrobe
                    <textarea value={appearanceBrief} onChange={(event) => setAppearanceBrief(event.target.value)} rows={3} className="mt-1 w-full resize-none rounded-md border border-white/10 bg-black/20 px-2.5 py-2 text-[10px] text-ink outline-none focus:border-accent" />
                  </label>
                  <label className="block text-[9px] text-grey">
                    World, lighting & palette
                    <textarea value={worldBrief} onChange={(event) => setWorldBrief(event.target.value)} rows={3} className="mt-1 w-full resize-none rounded-md border border-white/10 bg-black/20 px-2.5 py-2 text-[10px] text-ink outline-none focus:border-accent" />
                  </label>
                  <label className="block text-[9px] text-grey">
                    Voice
                    <select value={voicePreset} onChange={(event) => setVoicePreset(event.target.value)} className="mt-1 w-full rounded-md border border-white/10 bg-[#0b100e] px-2.5 py-2 text-[10px] text-ink outline-none">
                      {VOICE_PRESETS.map((preset) => <option key={preset}>{preset}</option>)}
                    </select>
                    {showCustomVoice && (
                      <span className="mt-2 block">
                        <span className="mb-1 block text-[8px] font-semibold uppercase tracking-[0.14em] text-accent">Custom voice direction</span>
                        <textarea
                          data-character-field="voice"
                          value={customVoice}
                          onChange={(event) => setCustomVoice(event.target.value)}
                          rows={5}
                          placeholder="Magic Write will place the complete language, accent, timbre, and performance direction here."
                          className="w-full resize-y rounded-md border border-accent/35 bg-black/30 px-2.5 py-2 text-[10px] leading-4 text-ink outline-none focus:border-accent"
                        />
                      </span>
                    )}
                  </label>
                  <label className="block text-[9px] text-grey">
                    Signature SFX
                    <select value={sfxPreset} onChange={(event) => setSfxPreset(event.target.value)} className="mt-1 w-full rounded-md border border-white/10 bg-[#0b100e] px-2.5 py-2 text-[10px] text-ink outline-none">
                      {SFX_PRESETS.map((preset) => <option key={preset}>{preset}</option>)}
                    </select>
                    {showCustomSfx && (
                      <span className="mt-2 block">
                        <span className="mb-1 block text-[8px] font-semibold uppercase tracking-[0.14em] text-accent">Custom sound identity</span>
                        <textarea
                          data-character-field="sfx"
                          value={customSfx}
                          onChange={(event) => setCustomSfx(event.target.value)}
                          rows={3}
                          placeholder="The generated physical sound identity appears here."
                          className="w-full resize-y rounded-md border border-accent/35 bg-black/30 px-2.5 py-2 text-[10px] leading-4 text-ink outline-none focus:border-accent"
                        />
                      </span>
                    )}
                  </label>
                  <label className="block text-[9px] text-grey">
                    Theme
                    <select value={scorePreset} onChange={(event) => setScorePreset(event.target.value)} className="mt-1 w-full rounded-md border border-white/10 bg-[#0b100e] px-2.5 py-2 text-[10px] text-ink outline-none">
                      {SCORE_PRESETS.map((preset) => <option key={preset}>{preset}</option>)}
                    </select>
                    {showCustomScore && (
                      <span className="mt-2 block">
                        <span className="mb-1 block text-[8px] font-semibold uppercase tracking-[0.14em] text-accent">Custom musical identity</span>
                        <textarea
                          data-character-field="theme"
                          value={customScore}
                          onChange={(event) => setCustomScore(event.target.value)}
                          rows={3}
                          placeholder="The generated musical identity appears here."
                          className="w-full resize-y rounded-md border border-accent/35 bg-black/30 px-2.5 py-2 text-[10px] leading-4 text-ink outline-none focus:border-accent"
                        />
                      </span>
                    )}
                  </label>
                </div>
              </details>

              {!canCreateActor && (
                <p className="mt-3 text-[9px] leading-4 text-grey">
                  Still needed: {missingCreationFields.join(", ")}.
                </p>
              )}
              {error && (
                <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[10px] leading-4 text-red-300" role="alert">
                  Could not create actor: {error}
                </p>
              )}

              <button
                type="submit"
                data-create-actor-submit
                disabled={!canCreateActor || saving || Boolean(suggestingTarget)}
                title={canCreateActor ? "Create this AI actor" : `Still needed: ${missingCreationFields.join(", ")}`}
                className="mt-4 w-full rounded-lg bg-accent px-4 py-3 text-xs font-semibold text-white hover:bg-accent-light disabled:opacity-45"
              >
                {saving ? "Creating actor…" : canCreateActor ? `Create ${name || "actor"} →` : `Still needed · ${missingCreationFields[0] ?? "identity"}`}
              </button>
            </aside>
          </div>
        </form>
      </div>

      <div className="mx-auto w-full max-w-2xl px-4 pb-36 pt-5 sm:px-6 sm:py-10 lg:hidden">
      <Link href="/characters" className="inline-flex items-center gap-1.5 text-xs text-grey hover:text-accent">
        <span aria-hidden="true">←</span> Actors
      </Link>

      <div className="mb-5 mt-4">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-accent">New actor</p>
        <h1 className="reel-title text-3xl sm:text-4xl">Create an AI actor</h1>
        <p className="mt-1 text-sm text-grey">Choose the visual format, add a name or a one-line idea, and let Chaplin build the complete actor.</p>
      </div>

      <section
        className="sticky top-12 z-[55] -mx-4 mb-6 border-y border-line/70 bg-paper/95 px-4 py-3 shadow-[0_10px_24px_rgba(0,0,0,0.18)] backdrop-blur-xl sm:-mx-6 sm:px-6"
        aria-label="Actor production pipeline"
      >
        <div className="grid grid-cols-5 gap-1.5">
          {[
            ["01", "Identity"],
            ["02", "Look"],
            ["03", "Voice"],
            ["04", "Spark"],
            ["05", "Publish"],
          ].map(([number, label], index) => (
            <div key={number} className="min-w-0">
              <span className={`block h-1 rounded-full ${index === 0 ? "bg-accent" : "bg-line"}`} />
              <p className={`mt-2 truncate text-[9px] font-semibold uppercase tracking-[0.08em] ${index === 0 ? "text-ink" : "text-grey"}`}>
                {label}
              </p>
            </div>
          ))}
        </div>
      </section>

      <form onSubmit={handleSubmit} className="poster-card flex flex-col gap-5 rounded-2xl p-4 sm:rounded-md sm:p-6">
        <section aria-labelledby="character-format-heading">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">Start here</p>
              <h2 id="character-format-heading" className="mt-1 text-base font-semibold">How should this actor look on screen?</h2>
            </div>
            {selectedVisualFormat && <span className="text-[10px] font-semibold text-accent">{selectedVisualFormat.label} selected</span>}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3" data-character-format-options>
            {CHARACTER_FORMATS.map((format) => {
              const selected = visualFormat === format.id;
              return (
                <button
                  key={format.id}
                  type="button"
                  onClick={() => selectVisualFormat(format)}
                  aria-pressed={selected}
                  className={`overflow-hidden rounded-md border text-left transition-colors ${selected ? "border-accent bg-accent/10 shadow-[inset_0_0_0_1px_rgba(242,78,112,0.2)]" : "border-line bg-paper/40 hover:border-accent/60 hover:bg-accent/[0.04]"}`}
                >
                  <span className="relative block aspect-[4/3] overflow-hidden bg-black/20">
                    <Image
                      src={CHARACTER_FORMAT_PREVIEWS[format.id]}
                      alt={`${format.label} actor example`}
                      fill
                      sizes="(max-width: 640px) 45vw, 14rem"
                      className="object-cover"
                    />
                    {selected && <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-xs text-white">✓</span>}
                  </span>
                  <span className="block p-3">
                    <span className="block text-xs font-semibold">{format.label}</span>
                    <span className="mt-1 block text-[10px] leading-4 text-grey">{format.detail}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[10px] leading-4 text-grey">The examples keep one identity constant so you can compare only the medium. Choosing one will not rewrite your actor idea.</p>
        </section>

        <div className="flex items-center gap-4">
          <Avatar hue={hue} label={name || "?"} size={56} />
          <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
            {HUE_SWATCHES.map((h) => (
              <button
                type="button"
                key={h}
                onClick={() => setHue(h)}
                className="h-5 w-5 rounded-full border-2 sm:h-6 sm:w-6"
                style={{
                  background: `hsl(${h} 55% 55%)`,
                  borderColor: h === hue ? "var(--ink)" : "transparent",
                }}
                aria-label={`Pick color ${h}`}
              />
            ))}
          </div>
        </div>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Name <span className="font-normal text-grey">(or let Magic suggest one)</span></span>
          <input
            data-character-field="name"
            value={name}
            onChange={(e) => updateCreatorName(e.target.value)}
            placeholder="Optional — Magic will suggest one from your brief"
            className="border border-line rounded-sm px-3 py-2 focus:outline-none focus:border-accent"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Pick the vibe</span>
          <div className="flex flex-wrap gap-1.5" data-character-archetypes>
            {ARCHETYPES.map((a) => (
              <button type="button" key={a} onClick={() => toggleArchetype(a)}>
                <Chip
                  label={a === archetype ? `★ ${ARCHETYPE_LABEL[a]}` : ARCHETYPE_LABEL[a]}
                  hue={ARCHETYPE_HUE[a]}
                  filled={archetypes.includes(a)}
                />
              </button>
            ))}
          </div>
        </label>

        <details open className="magic-surface overflow-hidden rounded-md" data-magic-character-assist>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 hover:bg-accent/[0.05]">
            <span>
              <span className="block text-sm font-semibold">✦ Magic Write</span>
              <span className="mt-0.5 block text-[11px] text-grey">One sentence → a name and full identity</span>
            </span>
            <span className="shrink-0 rounded-full border border-accent/50 px-3 py-1 text-[10px] font-semibold text-accent">Open</span>
          </summary>
          <div className="border-t border-line p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-grey">Describe the actor in one or two lines. We&apos;ll name them if you leave the name blank.</p>
              <div className="shrink-0">
                <SuggestButton
                  target="all"
                  activeTarget={suggestingTarget}
                  onClick={() => void suggestCharacter("all")}
                />
              </div>
            </div>
            <textarea
              data-character-field="brief"
              value={characterBrief}
              onChange={(event) => setCharacterBrief(event.target.value)}
              rows={2}
              placeholder="e.g. A retired railway detective—kind in public, ruthless at chess."
              className="mt-3 w-full resize-none rounded-sm border border-line bg-paper px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
            <p className="mt-1 text-[10px] text-grey">Autosaved · Everything stays editable</p>
          {suggestionMessage && (
            <p className="mt-3 text-[11px] text-grey" data-suggestion-message>
              {suggestionMessage}
            </p>
          )}
          </div>
        </details>

        <div className="flex items-center gap-3" aria-hidden="true">
          <span className="h-px flex-1 bg-line" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-grey">or craft it manually</span>
          <span className="h-px flex-1 bg-line" />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Face, age & wardrobe direction</span>
            <textarea
              value={appearanceBrief}
              onChange={(event) => setAppearanceBrief(event.target.value)}
              rows={3}
              placeholder="Optional: late 30s, angular face, cropped hair, weathered khaki jacket"
              className="border border-line rounded-sm px-3 py-2 focus:outline-none focus:border-accent resize-none"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">World, lighting & palette</span>
            <textarea
              value={worldBrief}
              onChange={(event) => setWorldBrief(event.target.value)}
              rows={3}
              placeholder="Optional: rain-dark railway world, tungsten practicals, deep green and brass"
              className="border border-line rounded-sm px-3 py-2 focus:outline-none focus:border-accent resize-none"
            />
          </label>
        </div>

        <div className="flex flex-col gap-1 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">Tagline</span>
            <SuggestButton target="tagline" activeTarget={suggestingTarget} onClick={() => void suggestCharacter("tagline")} />
          </div>
          <input
            data-character-field="tagline"
            data-revealing={revealingField === "tagline" || undefined}
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
            placeholder="One line that sells the pitch"
            className="border border-line rounded-sm px-3 py-2 focus:outline-none focus:border-accent"
          />
        </div>

        <div className="flex flex-col gap-1 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">Personality</span>
            <SuggestButton target="personality" activeTarget={suggestingTarget} onClick={() => void suggestCharacter("personality")} />
          </div>
          <textarea
            data-character-field="personality"
            data-revealing={revealingField === "personality" || undefined}
            value={personality}
            onChange={(e) => setPersonality(e.target.value)}
            rows={3}
            placeholder="How they talk, what they want, what sets them off"
            className="border border-line rounded-sm px-3 py-2 focus:outline-none focus:border-accent resize-none"
          />
        </div>

        <div className="flex flex-col gap-1 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">Voice</span>
            <SuggestButton target="voice" activeTarget={suggestingTarget} onClick={() => void suggestCharacter("voice")} />
          </div>
          <select
            value={voiceGender}
            onChange={(e) => setVoiceGender(e.target.value as VoiceGender)}
            className="border border-line rounded-sm px-3 py-2 bg-paper focus:outline-none focus:border-accent"
          >
            <option value="feminine">Feminine voice</option>
            <option value="masculine">Masculine voice</option>
            <option value="androgynous">Androgynous voice</option>
          </select>
          <select
            value={voicePreset}
            onChange={(e) => setVoicePreset(e.target.value)}
            className="border border-line rounded-sm px-3 py-2 bg-paper focus:outline-none focus:border-accent"
          >
            {VOICE_PRESETS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
          {showCustomVoice && (
            <input
              data-character-field="voice"
              value={customVoice}
              onChange={(e) => setCustomVoice(e.target.value)}
              placeholder="Describe the voice yourself"
              className="border border-line rounded-sm px-3 py-2 mt-1 focus:outline-none focus:border-accent"
            />
          )}
          <span className="text-[11px] text-grey">
            Voice presentation is sent explicitly to ElevenLabs with the performance description.
          </span>
        </div>

        <div className="flex flex-col gap-1 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">Signature SFX</span>
            <SuggestButton target="sfx" activeTarget={suggestingTarget} onClick={() => void suggestCharacter("sfx")} />
          </div>
          <select
            value={sfxPreset}
            onChange={(e) => setSfxPreset(e.target.value)}
            className="border border-line rounded-sm px-3 py-2 bg-paper focus:outline-none focus:border-accent"
          >
            {SFX_PRESETS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
          {showCustomSfx && (
            <input
              data-character-field="sfx"
              value={customSfx}
              onChange={(e) => setCustomSfx(e.target.value)}
              placeholder="Describe the signature sound yourself"
              className="border border-line rounded-sm px-3 py-2 mt-1 focus:outline-none focus:border-accent"
            />
          )}
        </div>

        <div className="flex flex-col gap-1 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">Theme score</span>
            <SuggestButton target="theme" activeTarget={suggestingTarget} onClick={() => void suggestCharacter("theme")} />
          </div>
          <select
            value={scorePreset}
            onChange={(e) => setScorePreset(e.target.value)}
            className="border border-line rounded-sm px-3 py-2 bg-paper focus:outline-none focus:border-accent"
          >
            {SCORE_PRESETS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
          {showCustomScore && (
            <input
              data-character-field="theme"
              value={customScore}
              onChange={(e) => setCustomScore(e.target.value)}
              placeholder="Describe the theme yourself"
              className="border border-line rounded-sm px-3 py-2 mt-1 focus:outline-none focus:border-accent"
            />
          )}
          <span className="text-[11px] text-grey">
            Real music generation wires in later, this describes it for now.
          </span>
        </div>

        <div className="flex flex-col gap-2.5 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium">License</span>
            <span className="text-[10px] text-grey">{LICENSE_OPTIONS[licenseType].detail}</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Actor license">
            {(["open", "paid", "approval"] as LicenseType[]).map((option) => (
              <button
                type="button"
                key={option}
                onClick={() => setLicenseType(option)}
                aria-pressed={licenseType === option}
                className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold transition ${
                  licenseType === option
                    ? "bg-accent text-paper shadow-[0_8px_24px_rgba(244,63,105,0.2)]"
                    : "bg-white/[0.04] text-grey hover:bg-white/[0.08] hover:text-ink"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-sm ${
                    licenseType === option ? "bg-paper/15" : "bg-white/[0.06] text-ink"
                  }`}
                >
                  {LICENSE_OPTIONS[option].icon}
                </span>
                {LICENSE_OPTIONS[option].label}
              </button>
            ))}
          </div>
          {licenseType !== "open" && (
            <label className="mt-0.5 flex items-center gap-2">
              <span className="text-xs text-grey">Casting fee</span>
              <input
                type="number"
                min={5}
                max={200}
                value={royaltyRate}
                onChange={(e) => setRoyaltyRate(Number(e.target.value))}
                className="w-20 rounded-full border border-line bg-transparent px-3 py-1.5 focus:border-accent focus:outline-none"
              />
              <span className="text-[10px] text-grey">reels</span>
            </label>
          )}
        </div>

        {productionBible && (
          <details className="rounded-md border border-line bg-paper/40 p-4" data-character-bible>
            <summary className="cursor-pointer text-sm font-semibold">Actor Direction Bible</summary>
            <p className="mt-1 text-[11px] text-grey">Saved with the actor and reused by stills, motion, voice, sound, music, and stories.</p>
            <div className="mt-4 grid grid-cols-1 gap-4 text-xs sm:grid-cols-2">
              <div>
                <p className="font-semibold text-accent">Dramatic engine</p>
                <p className="mt-1"><span className="text-grey">Want:</span> {productionBible.dramatic.externalWant}</p>
                <p className="mt-1"><span className="text-grey">Contradiction:</span> {productionBible.dramatic.contradiction}</p>
                <p className="mt-1"><span className="text-grey">Vulnerability:</span> {productionBible.dramatic.vulnerability}</p>
              </div>
              <div>
                <p className="font-semibold text-accent">Performance tells</p>
                <p className="mt-1"><span className="text-grey">Face:</span> {productionBible.performance.restingExpression}</p>
                <p className="mt-1"><span className="text-grey">Pressure:</span> {productionBible.performance.underPressure}</p>
                <p className="mt-1"><span className="text-grey">Movement:</span> {productionBible.performance.movementStyle}</p>
              </div>
              <div>
                <p className="font-semibold text-accent">Identity hero image</p>
                <p className="mt-1"><span className="text-grey">Face anchors:</span> {productionBible.visual.faceAnchors.join("; ")}</p>
                <p className="mt-1"><span className="text-grey">Wardrobe:</span> {productionBible.visual.wardrobe}</p>
                <p className="mt-1"><span className="text-grey">Frame:</span> {productionBible.cinematography.heroFraming}; {productionBible.cinematography.cameraHeight}; {productionBible.cinematography.lens}</p>
                <p className="mt-1"><span className="text-grey">Light:</span> {productionBible.cinematography.keyLight}</p>
                <p className="mt-1"><span className="text-grey">World:</span> {productionBible.cinematography.worldTexture}</p>
              </div>
              <div>
                <p className="font-semibold text-accent">Story engine</p>
                <p className="mt-1"><span className="text-grey">Hook:</span> {productionBible.story.hookPattern}</p>
                <p className="mt-1"><span className="text-grey">Cliffhanger:</span> {productionBible.story.cliffhangerPattern}</p>
              </div>
            </div>
          </details>
        )}

        {error && <p className="text-xs text-red-600">{error}</p>}

        <button
          type="submit"
          data-create-actor-submit
          disabled={saving}
          className="bg-accent text-paper font-semibold px-4 py-3 rounded-sm hover:bg-accent-light transition-colors disabled:opacity-50"
        >
          {saving ? "Saving AI actor…" : `Put ${name.trim() || "this AI actor"} on the shelf`}
        </button>
      </form>
      </div>
    </>
  );
}
