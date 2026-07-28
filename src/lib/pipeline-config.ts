export const PIPELINE_STAGE_IDS = ["writing", "voice", "sfx", "theme", "image", "video"] as const;

export type PipelineStageId = typeof PIPELINE_STAGE_IDS[number];

export type PipelineStageConfig = {
  enabled: boolean;
  provider: string;
  model: string;
  promptPrelude: string;
  temperature: number | null;
  maxTokens: number | null;
  settings: Record<string, string | number | boolean>;
};

export type PipelineConfig = {
  revision: number;
  updatedAt: string | null;
  updatedBy: string | null;
  stages: Record<PipelineStageId, PipelineStageConfig>;
};

export type PipelineModelOption = {
  value: string;
  label: string;
};

export const BYTEPLUS_IMAGE_MODELS: PipelineModelOption[] = [
  { value: "dola-seedream-5-0-pro-260628", label: "Dola Seedream 5.0 Pro" },
  { value: "seedream-5-0-lite-260128", label: "Dola Seedream 5.0 Lite" },
  { value: "seedream-5-0-260128", label: "Dola Seedream 5.0" },
  { value: "seedream-4-5-251128", label: "ByteDance Seedream 4.5" },
  { value: "seedream-4-0-250828", label: "ByteDance Seedream 4.0" },
];

export const BYTEPLUS_VIDEO_MODELS: PipelineModelOption[] = [
  { value: "dreamina-seedance-2-0-260128", label: "Dreamina Seedance 2.0" },
  { value: "dreamina-seedance-2-0-fast-260128", label: "Dreamina Seedance 2.0 Fast" },
  { value: "dreamina-seedance-2-0-mini-260615", label: "Dreamina Seedance 2.0 Mini" },
  { value: "seedance-1-5-pro-251215", label: "ByteDance Seedance 1.5 Pro" },
];

export function pipelineModelLabel(model: string) {
  return [...BYTEPLUS_IMAGE_MODELS, ...BYTEPLUS_VIDEO_MODELS]
    .find((option) => option.value === model)?.label ?? model;
}

export const PIPELINE_STAGE_META: Record<PipelineStageId, {
  label: string;
  owner: string;
  purpose: string;
  temperatureSupported: boolean;
}> = {
  writing: {
    label: "Writing & direction",
    owner: "Story editor",
    purpose: "Character expansion, Quick Write, scene hooks, shot blueprints, and production prompts.",
    temperatureSupported: false,
  },
  voice: {
    label: "Voice",
    owner: "Voice director",
    purpose: "Voice candidate design and repeatable locked-voice dialogue performance.",
    temperatureSupported: false,
  },
  sfx: {
    label: "Signature SFX",
    owner: "Sound engineer",
    purpose: "Layered, high-resolution cinematic Foley identities assembled from distinct physical events.",
    temperatureSupported: false,
  },
  theme: {
    label: "Theme score",
    owner: "Music supervisor",
    purpose: "Contemporary, fully arranged instrumental character themes with modern genre intelligence, a controlled motif, and an edit-ready ending.",
    temperatureSupported: false,
  },
  image: {
    label: "Image",
    owner: "Cinematographer",
    purpose: "Identity masters and scene stills grounded in the canonical character reference.",
    temperatureSupported: false,
  },
  video: {
    label: "Video",
    owner: "Motion director",
    purpose: "Identity-locked motion plates with resolved per-slot dialogue, ambience, and SFX ownership. Music always remains a board-level post-mix stem.",
    temperatureSupported: false,
  },
};

export const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  revision: 1,
  updatedAt: null,
  updatedBy: null,
  stages: {
    writing: {
      enabled: true,
      provider: "anthropic",
      model: "claude-sonnet-5",
      promptPrelude: "Preserve character canon, visible causality, production constraints, and useful user intent. Return only the requested production artifact.",
      temperature: null,
      maxTokens: 8000,
      settings: {
        sceneVariations: 3,
        requireVisibleHook: true,
        requireCliffhanger: true,
      },
    },
    voice: {
      enabled: true,
      provider: "elevenlabs",
      model: "eleven_ttv_v3",
      promptPrelude: "Create an original, repeatable performance identity. Never imitate a real person.",
      temperature: null,
      maxTokens: null,
      settings: {
        guidanceScale: 4,
        dialogueModel: "eleven_multilingual_v2",
        stability: 0.78,
        similarityBoost: 0.9,
        style: 0,
        speakerBoost: true,
      },
    },
    sfx: {
      enabled: true,
      provider: "elevenlabs",
      model: "eleven_text_to_sound_v2",
      promptPrelude: "Premium high-resolution cinematic Foley. Render one physical event with a clean transient, weighty material body, microscopic texture, blended close and room perspective, full-spectrum polish, and a controlled tail.",
      temperature: null,
      maxTokens: null,
      settings: {
        durationSeconds: 1.5,
        minimumDurationSeconds: 0.5,
        maximumDurationSeconds: 3,
        promptInfluence: 0.55,
        loop: false,
        candidateCount: 4,
      },
    },
    theme: {
      enabled: true,
      provider: "elevenlabs",
      model: "music_v2",
      promptPrelude: "Studio-grade contemporary character theme: fully arranged, richly layered, dynamically shaped, and mastered. Use a memorable foreground motif, developed rhythm, moving bass, harmonic progression, detailed transients, controlled sub, dimensional stereo depth, and an edit-ready ending. Never return sparse single-chord noodling or a placeholder demo loop.",
      temperature: null,
      maxTokens: null,
      settings: {
        durationSeconds: 8,
        compositionPlanEnabled: true,
        forceInstrumental: true,
        signWithC2pa: false,
      },
    },
    image: {
      enabled: true,
      provider: "byteplus",
      model: "dola-seedream-5-0-pro-260628",
      promptPrelude: "Use the canonical reference as identity truth. Default to a visually striking live-action cinematic photograph of a real human with natural skin, tactile fabric, optical depth, physically plausible light, and restrained film grain. Change medium only when the user explicitly requests cartoon, anime, illustration, painting, CGI, or another stylized form.",
      temperature: null,
      maxTokens: null,
      settings: {
        size: "2560x1440",
        resolution: "2K",
        aspectRatio: "16:9",
        quality: "medium",
        outputFormat: "png",
        watermark: false,
        sequentialImageGeneration: "disabled",
        characterSheetTemplate: "Create one clean 16:9 character consistency contact sheet from the supplied identity seed. Use a neutral low-detail studio background and one soft, physically plausible lighting setup across every panel. Lay out twelve distinct panels: extreme close-up face, close-up face, medium close-up, left three-quarter face, right three-quarter face, left profile, right profile, full-body front, full-body back, relaxed standing pose, seated pose, and one character-specific action pose. Repeat the exact same fictional actor in every panel. Preserve facial geometry, apparent age, skin tone, hair construction, body proportions, wardrobe materials, palette, and signature recognition details. This is a visual continuity seed, not a story scene. No additional people, environment changes, labels, text, logos, borders, or watermark.",
        negativePrompt: "multiple people, duplicate face, celebrity likeness, generic pose, plastic skin, distorted anatomy, extra fingers, text, logo, UI, border, watermark, cartoon, anime, illustration, digital painting, concept art, 3D render, CGI character, game art, doll-like face, wax figure, airbrushed skin, synthetic skin",
      },
    },
    video: {
      enabled: true,
      provider: "byteplus",
      model: "dreamina-seedance-2-0-260128",
      promptPrelude: "Treat the supplied image as the exact first frame. Animate performance and camera only; never redesign identity, wardrobe, set, or lighting.",
      temperature: null,
      maxTokens: null,
      settings: {
        durationSeconds: 5,
        resolution: "720p",
        ratio: "16:9",
        // Seedance receives locked dialogue as a timing/lip-performance
        // reference and supplies diegetic location sound. Chaplin still masters
        // the exact voice, scene effects, and theme stems into delivery.
        generateAudio: true,
        watermark: false,
        // Seedance finishes well inside one of these, so a five-second gap meant
        // a finished shot sat unnoticed for most of it. Checked more often now
        // that polling no longer wastes an interval before its first look.
        pollIntervalSeconds: 2,
        // Raised alongside the shorter interval so the overall wait budget is
        // unchanged (2s x 140 = 280s, previously 5s x 55 = 275s). Polling more
        // often must not shorten how long a slow render is allowed to take.
        maximumPolls: 140,
      },
    },
  },
};

function finiteNumber(value: unknown, fallback: number, minimum: number, maximum: number) {
  if (value == null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

export function normalizePipelineConfig(input: unknown, metadata?: {
  revision?: number;
  updatedAt?: string | null;
  updatedBy?: string | null;
}): PipelineConfig {
  const candidate = input && typeof input === "object" ? input as Partial<PipelineConfig> : {};
  const candidateStages: Partial<Record<PipelineStageId, Partial<PipelineStageConfig>>> =
    candidate.stages && typeof candidate.stages === "object" ? candidate.stages : {};
  const stages = {} as PipelineConfig["stages"];

  for (const id of PIPELINE_STAGE_IDS) {
    const defaults = DEFAULT_PIPELINE_CONFIG.stages[id];
    const raw = candidateStages[id] && typeof candidateStages[id] === "object"
      ? candidateStages[id] as Partial<PipelineStageConfig>
      : {};
    const settings = raw.settings && typeof raw.settings === "object" && !Array.isArray(raw.settings)
      ? { ...defaults.settings, ...raw.settings }
      : { ...defaults.settings };
    if (id === "theme") {
      const duration = Number(settings.durationSeconds);
      settings.durationSeconds = [5, 8, 15].includes(duration) ? duration : 8;
      settings.compositionPlanEnabled = typeof settings.compositionPlanEnabled === "boolean"
        ? settings.compositionPlanEnabled
        : true;
    }
    if (id === "sfx") {
      const influence = finiteNumber(settings.promptInfluence, 0.55, 0, 1);
      // Upgrade the previous thin-sounding default while preserving every
      // deliberately customized value.
      settings.promptInfluence = influence === 0.35 ? 0.55 : influence;
      settings.loop = typeof settings.loop === "boolean" ? settings.loop : false;
    }
    const requestedModel = typeof raw.model === "string" && raw.model.trim()
      ? raw.model.trim().slice(0, 120)
      : defaults.model;
    /*
      music_v1 used to be rewritten to music_v2 here, on the assumption that v2
      superseded it. It does not for this purpose: composition plans are a
      music_v1 feature, so the coercion made a valid configuration impossible to
      express and every plan request was refused.
    */
    const model = requestedModel;
    stages[id] = {
      enabled: typeof raw.enabled === "boolean" ? raw.enabled : defaults.enabled,
      provider: typeof raw.provider === "string" && raw.provider.trim() ? raw.provider.trim().slice(0, 80) : defaults.provider,
      model,
      promptPrelude: typeof raw.promptPrelude === "string" ? raw.promptPrelude.trim().slice(0, 4000) : defaults.promptPrelude,
      temperature: PIPELINE_STAGE_META[id].temperatureSupported
        ? finiteNumber(raw.temperature, defaults.temperature ?? 0.65, 0, 1)
        : null,
      maxTokens: id === "writing"
        ? Math.round(finiteNumber(raw.maxTokens, defaults.maxTokens ?? 8000, 256, 12000))
        : null,
      settings,
    };
  }

  return {
    revision: metadata?.revision ?? Math.max(1, Number(candidate.revision) || 1),
    updatedAt: metadata?.updatedAt ?? candidate.updatedAt ?? null,
    updatedBy: metadata?.updatedBy ?? candidate.updatedBy ?? null,
    stages,
  };
}

export function settingNumber(stage: PipelineStageConfig, key: string, fallback: number) {
  const value = Number(stage.settings[key]);
  return Number.isFinite(value) ? value : fallback;
}

export function settingBoolean(stage: PipelineStageConfig, key: string, fallback: boolean) {
  return typeof stage.settings[key] === "boolean" ? stage.settings[key] as boolean : fallback;
}

export function settingString(stage: PipelineStageConfig, key: string, fallback: string) {
  return typeof stage.settings[key] === "string" && stage.settings[key] ? stage.settings[key] as string : fallback;
}
