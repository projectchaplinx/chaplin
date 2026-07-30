import {
  buildProductionBible,
  composeSfxPrompt,
  composeThemePrompt,
  composeVoiceDesignPrompt,
} from "@/lib/production-prompting";
import type { Archetype, CharacterProductionBible, VoiceGender } from "@/lib/types";
import {
  alignVoiceDescription,
  coherentGeneratedCharacterName,
  explicitVoiceGender,
  suggestedCharacterName,
} from "@/lib/character-coherence";
import { getPipelineConfig } from "@/lib/server/pipeline-config";
import { calculateGenerationBilling } from "@/lib/server/billing";
import { beginGeneration, completeGeneration, failGeneration } from "@/lib/server/supabase-admin";
import { requireRequestIdentity } from "@/lib/server/auth";
import { assertRequestBodySize, enforceRateLimit, securityErrorStatus } from "@/lib/server/request-security";
import {
  openAIOutputText,
  openAIWritingModel,
  requestOpenAIFromLegacyMessages,
  requestOpenAIResponse,
  type OpenAIResponseData,
} from "@/lib/server/openai-responses";

export const runtime = "nodejs";
export const maxDuration = 120; // json_schema output on this bible runs 35-55s; give real headroom over the wall clock

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

const TARGETS = ["all", "tagline", "personality", "voice", "sfx", "theme"] as const;
type SuggestionTarget = typeof TARGETS[number];
const CHARACTER_ARCHETYPES = [
  "villain",
  "mentor",
  "love-interest",
  "comic-relief",
  "hero",
  "superhero",
  "horror",
  "rebel",
  "sidekick",
  "outsider",
] as const satisfies readonly Archetype[];
const CHARACTER_ARCHETYPE_SET = new Set<string>(CHARACTER_ARCHETYPES);

function clean(value: unknown, max = 2000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function validArchetypes(value: unknown) {
  if (!Array.isArray(value)) return [] as Archetype[];
  return [...new Set(
    value
      .filter((item): item is string => typeof item === "string")
      .map((item) => clean(item, 40))
      .filter((item): item is Archetype => CHARACTER_ARCHETYPE_SET.has(item)),
  )].slice(0, 3);
}

function inferLocalArchetype(brief: string): Archetype {
  const value = brief.toLowerCase();
  if (/\b(?:villain|antagonist|crime boss|tyrant|manipulat)/.test(value)) return "villain";
  if (/\b(?:mentor|teacher|guide|master|elder)/.test(value)) return "mentor";
  if (/\b(?:romance|lover|love interest|beloved)/.test(value)) return "love-interest";
  if (/\b(?:comic|comedian|funny|joke|clown)/.test(value)) return "comic-relief";
  if (/\b(?:superhero|superpower|powered|metahuman)/.test(value)) return "superhero";
  if (/\b(?:horror|ghost|haunt|monster|occult)/.test(value)) return "horror";
  if (/\b(?:rebel|revolution|defy|insurgent|renegade)/.test(value)) return "rebel";
  if (/\b(?:sidekick|assistant|partner|second-in-command)/.test(value)) return "sidekick";
  if (/\b(?:outsider|stranger|exile|loner|outcast)/.test(value)) return "outsider";
  return "hero";
}

function suggestedName(input: {
  name: string;
  archetype: Archetype;
  characterBrief?: string;
  voiceGender?: VoiceGender;
}) {
  if (input.name.trim()) return input.name.trim();
  const brief = input.characterBrief ?? "";
  return suggestedCharacterName({
    archetype: input.archetype,
    characterBrief: brief,
    voiceGender: explicitVoiceGender(brief) ?? input.voiceGender ?? "androgynous",
  });
}

function enforceVoiceCoherence(suggestion: CharacterSuggestion, characterBrief: string) {
  const voiceGender = explicitVoiceGender(`${characterBrief} ${suggestion.personality}`) ?? suggestion.voiceGender;
  if (voiceGender === suggestion.voiceGender) return suggestion;
  return {
    ...suggestion,
    voiceGender,
    voiceDescription: alignVoiceDescription(suggestion.voiceDescription, voiceGender),
  };
}

function replaceGeneratedName(value: unknown, previousName: string, nextName: string): unknown {
  if (typeof value === "string") {
    const fullName = previousName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const firstName = previousName.split(/\s+/)[0]?.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return value
      .replace(new RegExp(`\\b${fullName}\\b`, "g"), nextName)
      .replace(firstName ? new RegExp(`\\b${firstName}\\b`, "g") : /$^/, nextName.split(/\s+/)[0]);
  }
  if (Array.isArray(value)) {
    return value.map((item) => replaceGeneratedName(item, previousName, nextName));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        replaceGeneratedName(item, previousName, nextName),
      ]),
    );
  }
  return value;
}

function enforceGeneratedNameCoherence(
  suggestion: CharacterSuggestion,
  nextName: string,
): CharacterSuggestion {
  const previousName = clean(suggestion.name, 120);
  if (!previousName || previousName === nextName) return { ...suggestion, name: nextName };
  return {
    ...(replaceGeneratedName(suggestion, previousName, nextName) as CharacterSuggestion),
    name: nextName,
  };
}

function enforceModernAudioDirection(
  suggestion: CharacterSuggestion,
  input: Parameters<typeof localSuggestion>[0],
) {
  const character = {
    ...input,
    ...suggestion,
    voiceDesc: suggestion.voiceDescription,
    sfxDesc: suggestion.signatureSfx,
    themeDesc: suggestion.themeScore,
    productionBible: suggestion.productionBible,
  };
  return {
    ...suggestion,
    voiceDescription: composeVoiceDesignPrompt(character),
    signatureSfx: composeSfxPrompt(character),
    themeScore: composeThemePrompt(character),
  };
}

const STYLE_MEDIUM = /\b(manga|anime|illustration|illustrated|cel[- ]?shad(?:ed|ing)|screentone|ink(?:ed|work)?|graphic novel|comic(?: book)?|watercolou?r|gouache|oil painting|stop[- ]motion|claymation|pixel art|2d animation|3d animation)\b/i;

function enforceVisualIdentity(suggestion: CharacterSuggestion, appearanceBrief: string, worldBrief: string) {
  const visual = suggestion.productionBible.visual;
  const requestedDirection = `${appearanceBrief} ${worldBrief}`.trim();
  const requestedMedium = requestedDirection
    .split(/[.\n]/)
    .map((value) => value.trim())
    .find((value) => STYLE_MEDIUM.test(value));
  const medium = clean(requestedMedium, 180) || clean(visual.medium, 180) ||
    "live-action cinematic photograph with natural human texture and physically motivated light";
  const candidates = [
    ...(visual.recognitionLocks ?? []),
    ...visual.faceAnchors,
    visual.hair,
    visual.wardrobe,
    ...visual.continuityRules,
  ].map((value) => clean(value, 90)).filter(Boolean);
  const seen = new Set<string>();
  const recognitionLocks = candidates.filter((value) => {
    const key = value.toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 4);
  const fallbacks = [
    "the same face geometry and most distinctive facial asymmetry",
    "the same hairline, part, length, texture, and signature colour detail",
    "the same hero garment, opening, material, and fastening",
    "the same single signature accessory or prop in its exact position",
  ];
  for (const fallback of fallbacks) {
    if (recognitionLocks.length === 4) break;
    recognitionLocks.push(fallback);
  }
  return {
    ...suggestion,
    productionBible: {
      ...suggestion.productionBible,
      visual: { ...visual, medium, recognitionLocks },
    },
  };
}

function localSuggestion(input: {
  name: string;
  archetype: Archetype;
  archetypeMix?: Archetype[];
  characterBrief?: string;
  voiceGender: VoiceGender;
  tagline: string;
  personality: string;
  voiceDirection?: string;
  appearanceBrief?: string;
  worldBrief?: string;
}): CharacterSuggestion {
  const name = suggestedName(input);
  const resolvedVoiceGender = explicitVoiceGender(`${input.characterBrief ?? ""} ${input.personality}`) ?? input.voiceGender;
  const identity: Record<string, { hook: string; want: string; edge: string; sound: string; score: string }> = {
    villain: { hook: "makes every threat sound like an invitation", want: "control the room before anyone notices the trap", edge: "polite until resistance becomes interesting", sound: "a signet ring tapping once against cut glass", score: "low sarangi tension over a restrained ticking pulse" },
    mentor: { hook: "has already survived the mistake you are about to make", want: "prepare others without stealing their choice", edge: "patient, observant, and unexpectedly severe when truth is avoided", sound: "prayer beads clicking around one measured breath", score: "warm santoor phrases over a deep, steady drone" },
    "love-interest": { hook: "steals secrets, never scenes", want: "be chosen without surrendering independence", edge: "magnetic, composed, and more dangerous when amused", sound: "a hidden latch releasing beneath soft room tone", score: "intimate ghazal strings with one unresolved sarangi phrase" },
    "comic-relief": { hook: "finds the joke one second before the danger", want: "prove the fool is often the only person paying attention", edge: "fast, warm, and fearless when everyone else freezes", sound: "a quick metallic fumble resolving into a perfect click", score: "playful dhol and brass with an unexpectedly heroic finish" },
    hero: { hook: "never throws the first punch, only the one that matters", want: "keep ordinary people safe without needing their applause", edge: "grounded, protective, dryly funny, and decisive under pressure", sound: "a taut glove pull followed by one controlled impact", score: "driving percussion beneath a rising brass-and-strings motif" },
    superhero: { hook: "arrives late enough to make an entrance and early enough to save everyone", want: "turn impossible power into practical help", edge: "bold, funny, compassionate, and privately afraid of failing in public", sound: "a rising energy charge resolving into one clean pulse", score: "uplifting orchestral rhythm with bright Indian percussion and a signature three-note ascent" },
    horror: { hook: "is always visible in the frame you forgot to check", want: "make the living acknowledge what the house remembers", edge: "quiet, ritualistic, and terrifyingly patient", sound: "a film reel slowing as an empty seat folds shut", score: "detuned harmonium, bowed metal, and a distant pulse that stops too early" },
    rebel: { hook: "breaks rules only after learning who they protect", want: "expose the bargain everyone else agreed not to mention", edge: "defiant, strategic, and loyal beneath the provocation", sound: "a match strike under a snapping banner in hard wind", score: "defiant nagada drums beneath a cutting electric-string motif" },
    sidekick: { hook: "keeps the plan alive after the hero ruins it", want: "be trusted with more than cleaning up someone else's legend", edge: "resourceful, loyal, candid, and quietly ambitious", sound: "tools clicking into place in one rapid sequence", score: "nimble hand percussion with a bright ascending woodwind hook" },
    outsider: { hook: "notices the rule because nobody explained it to them", want: "belong without becoming harmless", edge: "watchful, self-contained, and startlingly direct", sound: "a distant train brake followed by one approaching footstep", score: "sparse plucked strings over a widening atmospheric bass note" },
  };
  const profile = identity[input.archetype] ?? identity.hero;
  const secondary = (input.archetypeMix ?? [])
    .filter((a) => a !== input.archetype)
    .map((a) => identity[a])
    .filter(Boolean);
  const blendEdge = secondary.length
    ? ` Under the surface, ${name} also ${secondary[0].hook}.`
    : "";
  const briefLine = input.characterBrief ? ` ${input.characterBrief.trim().replace(/\.?$/, ".")}` : "";
  const suggestion = {
    tagline: input.tagline || `${name} ${profile.hook}.`,
    personality: input.personality || `${briefLine ? briefLine.trim() + " " : ""}${name} wants to ${profile.want}. ${name} is ${profile.edge}.${blendEdge} In conversation, ${name} listens for the detail everyone skips, answers with concise wit, and becomes completely still before making a difficult decision. The contradiction is the engine: confidence in action, vulnerability around the people who matter.`,
    voiceGender: resolvedVoiceGender,
    voiceDescription: input.voiceDirection ||
      `Confident mid-register resonance, conversational pacing, dry comic timing, and controlled authority that intensifies without shouting. Distinctive and repeatable; never an imitation of a real person.`,
    signatureSfx: `${profile.sound}; a distinctive five-second identity sting with clean foreground detail, subtle cinematic room tone, and no speech or music.`,
    themeScore: `${profile.score}; natural-language production direction for an approximately eight-second instrumental cue that opens clearly, builds once, turns emotionally, and ends cleanly without a fade. No vocals.`,
  };
  const productionBible = buildProductionBible({
      name,
      archetype: input.archetype,
      tagline: suggestion.tagline,
      personality: suggestion.personality,
      voiceGender: resolvedVoiceGender,
      voiceDesc: suggestion.voiceDescription,
      sfxDesc: suggestion.signatureSfx,
      themeDesc: suggestion.themeScore,
      appearanceBrief: input.appearanceBrief,
      worldBrief: input.worldBrief,
  });
  const character = { ...input, name, ...suggestion, productionBible, voiceDesc: suggestion.voiceDescription, sfxDesc: suggestion.signatureSfx, themeDesc: suggestion.themeScore };
  return {
    name,
    archetypes: input.archetypeMix?.length ? input.archetypeMix : [input.archetype],
    ...suggestion,
    voiceDescription: composeVoiceDesignPrompt(character),
    signatureSfx: composeSfxPrompt(character),
    themeScore: composeThemePrompt(character),
    productionBible,
  };
}

const STRING = { type: "string" } as const;
const STRING_ARRAY = { type: "array", items: STRING } as const;
const PRODUCTION_BIBLE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["version", "dramatic", "performance", "visual", "cinematography", "story"],
  properties: {
    version: { type: "integer", enum: [1] },
    dramatic: {
      type: "object", additionalProperties: false,
      required: ["externalWant", "innerNeed", "contradiction", "stakes", "vulnerability", "moralBoundary"],
      properties: { externalWant: STRING, innerNeed: STRING, contradiction: STRING, stakes: STRING, vulnerability: STRING, moralBoundary: STRING },
    },
    performance: {
      type: "object", additionalProperties: false,
      required: ["restingExpression", "underPressure", "signatureGesture", "movementStyle", "eyeline", "tempo"],
      properties: { restingExpression: STRING, underPressure: STRING, signatureGesture: STRING, movementStyle: STRING, eyeline: STRING, tempo: STRING },
    },
    visual: {
      type: "object", additionalProperties: false,
      required: ["medium", "perceivedAge", "faceAnchors", "hair", "wardrobe", "silhouette", "palette", "recognitionLocks", "continuityRules"],
      properties: { medium: STRING, perceivedAge: STRING, faceAnchors: STRING_ARRAY, hair: STRING, wardrobe: STRING, silhouette: STRING, palette: STRING_ARRAY, recognitionLocks: STRING_ARRAY, continuityRules: STRING_ARRAY },
    },
    cinematography: {
      type: "object", additionalProperties: false,
      required: ["heroFraming", "cameraHeight", "lens", "keyLight", "fillLight", "edgeLight", "worldTexture"],
      properties: { heroFraming: STRING, cameraHeight: STRING, lens: STRING, keyLight: STRING, fillLight: STRING, edgeLight: STRING, worldTexture: STRING },
    },
    story: {
      type: "object", additionalProperties: false,
      required: ["hookPattern", "escalationPattern", "cliffhangerPattern", "payoffPattern", "recurringMotifs", "avoid"],
      properties: { hookPattern: STRING, escalationPattern: STRING, cliffhangerPattern: STRING, payoffPattern: STRING, recurringMotifs: STRING_ARRAY, avoid: STRING_ARRAY },
    },
  },
} as const;

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["name", "archetypes", "tagline", "personality", "voiceGender", "voiceDescription", "signatureSfx", "themeScore", "productionBible"],
  properties: {
    name: STRING,
    archetypes: {
      type: "array",
      minItems: 1,
      maxItems: 3,
      items: { type: "string", enum: CHARACTER_ARCHETYPES },
    },
    tagline: { type: "string" },
    personality: { type: "string" },
    voiceGender: { type: "string", enum: ["feminine", "masculine", "androgynous"] },
    voiceDescription: { type: "string" },
    signatureSfx: { type: "string" },
    themeScore: { type: "string" },
    productionBible: PRODUCTION_BIBLE_SCHEMA,
  },
} as const;

function finalizeCharacterSuggestion(
  parsed: CharacterSuggestion,
  input: Parameters<typeof localSuggestion>[0],
  creatorName: string,
) {
  const resolvedArchetypes = validArchetypes(parsed.archetypes);
  const archetypes = resolvedArchetypes.length
    ? resolvedArchetypes
    : input.archetypeMix?.length
      ? input.archetypeMix
      : [input.archetype];
  const resolvedInput = {
    ...input,
    archetype: archetypes[0],
    archetypeMix: archetypes,
  };
  const coherentName = coherentGeneratedCharacterName({
    creatorName,
    modelName: clean(parsed.name, 120),
    archetype: resolvedInput.archetype,
    characterBrief: input.characterBrief ?? "",
    voiceGender: input.voiceGender,
  });
  const coherentSuggestion = enforceGeneratedNameCoherence(
    enforceVoiceCoherence({ ...parsed, archetypes }, input.characterBrief ?? ""),
    coherentName,
  );
  return {
    coherentName,
    suggestion: {
      ...enforceModernAudioDirection(
        enforceVisualIdentity(coherentSuggestion, input.appearanceBrief ?? "", input.worldBrief ?? ""),
        resolvedInput,
      ),
      archetypes,
    },
  };
}

function parseOpenAIStreamEvent(rawEvent: string) {
  const data = rawEvent
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .join("");
  if (!data || data === "[DONE]") return null;
  return JSON.parse(data) as {
    type?: string;
    delta?: string;
    error?: { message?: string };
    response?: OpenAIResponseData;
  };
}

function streamLine(value: object) {
  return `${JSON.stringify(value)}\n`;
}

export async function POST(request: Request) {
  let fallbackInput: Parameters<typeof localSuggestion>[0] | null = null;
  let jobId: string | null = null;
  try {
    assertRequestBodySize(request, 256 * 1024);
    const identity = await requireRequestIdentity(request);
    if (identity.role !== "admin") {
      await enforceRateLimit({ request, bucket: "write-character", limit: 30, windowSeconds: 86400, identityId: identity.id });
    }
    const body = await request.json() as Record<string, unknown>;
    const targetValue = clean(body.target, 30) as SuggestionTarget;
    const target = TARGETS.includes(targetValue) ? targetValue : "all";
    const name = clean(body.name, 120);
    if (!name && target !== "all") return Response.json({ error: "Name the AI actor first." }, { status: 400 });
    if (target === "all" && clean(body.characterBrief, 1500).length < 20) {
      return Response.json(
        { error: "Write at least a line or two about who this actor is — the brief drives the whole identity. (If you don't see the brief box, refresh the page.)" },
        { status: 400 }
      );
    }
    const archetypeMix = validArchetypes(body.archetypes);
    const characterBrief = clean(body.characterBrief, 1500);
    const visualFormat = clean(body.visualFormat, 500);
    const requestedVoiceGender = clean(body.voiceGender, 30) as VoiceGender;
    const input = {
      name,
      archetype: archetypeMix[0] || inferLocalArchetype(characterBrief),
      archetypeMix,
      characterBrief,
      voiceGender: explicitVoiceGender(characterBrief) ??
        (["feminine", "masculine", "androgynous"].includes(requestedVoiceGender) ? requestedVoiceGender : "androgynous"),
      tagline: clean(body.tagline, 500),
      personality: clean(body.personality, 2000),
      voiceDirection: clean(body.voiceDescription, 1000),
      // The format card is a binding visual instruction even if the creator
      // has not yet written a separate appearance note.
      appearanceBrief: [visualFormat, clean(body.appearanceBrief, 1200)]
        .filter((value, index, values) => Boolean(value) && values.indexOf(value) === index)
        .join("\n"),
      worldBrief: clean(body.worldBrief, 1200),
    };
    // Full actor generation must never masquerade a canned local draft as
    // model output. Partial single-field helpers retain their local fallback.
    fallbackInput = target === "all" ? null : input;
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      if (target === "all") {
        return Response.json({ error: "OpenAI actor generation is not configured." }, { status: 503 });
      }
      return Response.json({ suggestion: localSuggestion(input), provider: "chaplin-local", configured: false });
    }

    const writingConfig = (await getPipelineConfig()).stages.writing;
    if (!writingConfig.enabled) throw new Error("AI writing is paused by Super Admin.");
    const model = openAIWritingModel(writingConfig.model);
    jobId = await beginGeneration({
      kind: "prompt-character",
      provider: "openai",
      model,
      prompt: characterBrief || `${target} actor identity`,
      metadata: {
        userId: identity.id,
        creditActionCode: "writing.magic",
        creditAllocation: 1,
        creditBilling: "included",
        suggestionTarget: target,
      },
    });
    if (body.stream === true && target === "all") {
      const providerResponse = await requestOpenAIResponse({
        model,
        maxOutputTokens: Math.max(4000, writingConfig.maxTokens ?? 8000),
        stream: true,
        schema: OUTPUT_SCHEMA,
        schemaName: "chaplin_character",
        instructions: `${writingConfig.promptPrelude} You are Chaplin's casting director and production designer. Build one original, production-ready fictional actor from the maker's brief. Return every schema field. Choose one to three role archetypes from the allowed schema values; put the dominant role first and derive the choice from the actual character brief rather than defaulting to hero. Preserve a creator-supplied name exactly, otherwise invent one plausible culturally grounded name. Make every dramatic, performance, visual, cinematography, voice, sound, music, and story value concrete and usable in production. Keep explicit creator direction binding. Never imitate a celebrity, public figure, copyrighted character, existing composition, or generic archetype costume. Voice language and accent must come from explicit canon; otherwise use neutral international English. Visual face anchors, hair, wardrobe, silhouette, light, and recognition locks must be specific and repeatable.`,
        messages: [{
          role: "user",
          content: JSON.stringify({
            target,
            instruction: "Write the complete actor now. Emit name and archetypes first, followed by the remaining identity fields.",
            archetypeGuidance: input.archetypeMix.length
              ? `The creator selected ${input.archetypeMix.join(", ")}. Preserve the dominant choice first and add only genuinely supported secondary roles.`
              : "No role was selected. Infer one to three archetypes from the character brief and never silently default to hero.",
            briefGuidance: "The characterBrief is binding creator canon.",
            nameCoherenceGuidance: "Infer presentation from explicit words in the brief. Keep name, pronouns, voice, and appearance coherent.",
            currentCharacter: input,
            visualIdentityGuidance: "Return exactly four concise recognition locks spanning the most distinctive face, hair, wardrobe, or signature prop invariants.",
          }),
        }],
      });
      if (!providerResponse.ok || !providerResponse.body) {
        const failure = await providerResponse.text();
        throw new Error(failure || `OpenAI returned ${providerResponse.status}.`);
      }
      const generationJobId = jobId;
      const providerRequestId = providerResponse.headers.get("request-id");
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          let providerBuffer = "";
          let generatedText = "";
          let completedResponse: OpenAIResponseData | undefined;
          try {
            const reader = providerResponse.body!.getReader();
            const decoder = new TextDecoder();
            while (true) {
              const { done, value } = await reader.read();
              providerBuffer += decoder.decode(value, { stream: !done });
              providerBuffer = providerBuffer.replace(/\r\n/g, "\n");
              let boundary = providerBuffer.indexOf("\n\n");
              while (boundary >= 0) {
                const rawEvent = providerBuffer.slice(0, boundary);
                providerBuffer = providerBuffer.slice(boundary + 2);
                const event = parseOpenAIStreamEvent(rawEvent);
                if (event?.type === "response.output_text.delta" && typeof event.delta === "string") {
                  generatedText += event.delta;
                  controller.enqueue(encoder.encode(streamLine({ type: "delta", delta: event.delta })));
                } else if (event?.type === "response.completed" && event.response) {
                  completedResponse = event.response;
                } else if (
                  event?.type === "error" ||
                  event?.type === "response.failed" ||
                  event?.type === "response.incomplete"
                ) {
                  throw new Error(event.error?.message || event.response?.error?.message || "OpenAI could not finish the actor.");
                }
                boundary = providerBuffer.indexOf("\n\n");
              }
              if (done) break;
            }
            generatedText ||= completedResponse ? openAIOutputText(completedResponse) : "";
            if (!generatedText) throw new Error("OpenAI returned no character suggestion.");
            const parsed = JSON.parse(generatedText) as CharacterSuggestion;
            const finalized = finalizeCharacterSuggestion(parsed, input, name);
            const providerUsage = completedResponse?.usage ?? {};
            const usage = {
              inputTokens: Number(providerUsage.input_tokens ?? 0),
              outputTokens: Number(providerUsage.output_tokens ?? 0),
              providerTokens: Number(providerUsage.input_tokens ?? 0) + Number(providerUsage.output_tokens ?? 0),
              providerUsage,
            };
            await completeGeneration(
              generationJobId,
              undefined,
              {
                suggestionTarget: target,
                generatedName: finalized.coherentName,
                generatedArchetypes: finalized.suggestion.archetypes,
                streamed: true,
              },
              await calculateGenerationBilling({ kind: "openai-prompt", provider: "openai", model, usage }),
              completedResponse?.id ?? providerRequestId,
            );
            controller.enqueue(encoder.encode(streamLine({
              type: "complete",
              suggestion: finalized.suggestion,
              provider: "openai",
              model,
              usage: providerUsage,
            })));
          } catch (streamError) {
            const message = streamError instanceof Error ? streamError.message : "Character streaming failed.";
            await failGeneration(generationJobId, message);
            controller.enqueue(encoder.encode(streamLine({ type: "error", error: message })));
          } finally {
            controller.close();
          }
        },
      });
      return new Response(stream, {
        headers: {
          "content-type": "application/x-ndjson; charset=utf-8",
          "cache-control": "no-store",
        },
      });
    }
    const response = await requestOpenAIFromLegacyMessages({
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: Math.max(4000, writingConfig.maxTokens ?? 8000),
        thinking: { type: "disabled" },
        system: `${writingConfig.promptPrelude} You are Chaplin's casting director, performance director, cinematographer, story editor, music supervisor, and sound designer. Build an original production-ready fictional actor, not a biography. Every value must be playable, visible, recordable, or usable as a continuity rule. When the maker has not supplied a name, suggest one original, plausible, culturally grounded character name that fits the brief; when they have supplied a name, preserve it exactly. Never use a celebrity, public figure, or copyrighted character name. The visual identity is the highest-priority output: infer a face, hair, body presence, signature wardrobe, material texture, palette, setting, camera, and motivated light that express the personality without reducing the actor to an archetype costume. perceivedAge must be an actual narrow visible age range. Each of the three faceAnchors must name concrete repeatable anatomy or surface detail—brow shape or spacing, eye shape or set, nose structure, mouth, jaw, skin texture, scar, mole, or asymmetry—not generic phrases such as 'distinct face' or 'preserve exactly.' Hair must specify length, texture, part or hairline, finish, and grooming. Wardrobe must specify exact garments, cut, materials, colors, wear, and no logos. Silhouette must describe visible proportions, stance, and one recognizable shape. Camera and lighting must be chosen to reveal those anchors and the central personality contradiction. If appearance or world direction is supplied, preserve it exactly; otherwise invent one coherent, culturally grounded, non-celebrity identity. Also create a dramatic want/need contradiction, precise pressure behavior and micro-expression, motivated story engine, visual hook, situation-changing cliffhanger, payoff, motifs, and explicit cliches to avoid. Never imitate a celebrity or copyrighted character. Voice coherence is mandatory: explicit pronouns and gender words in characterBrief override an unlocked UI default, and voiceGender plus voiceDescription must agree with each other. Infer primary spoken language, dialect or accent, and any code-switching only from the maker's character brief, world, or explicit voice direction. Preserve an explicit creator choice. Never default every actor to English, Indian English, Hindi, or Urdu: a Russian character may speak native Russian, for example. If the canon names no language or region, use neutral international English and do not invent a regional accent or code-switching. The voice prompt must follow ElevenLabs Voice Design order and contain no FX language. SFX must identify concrete physical materials and enough distinct sonic details to build a layered five-second identity from separate high-resolution Foley events. Theme must be a natural-language brief for a complete, polished instrumental identity cue using a current 2020s hybrid genre appropriate to this exact character—for example future garage and cyber-industrial bass for a cyber-mechanical guardian, dark ambient and post-industrial tension design for horror, alternative R&B ambience and future-soul for intimate drama, or deconstructed club and industrial techno for a controlled villain. Name the mood, two to four specific instruments, foreground motif, rhythm, bass movement, opening, build, emotional turn, ending, spatial design, and mix finish. Demand a fully arranged beginning-middle-end cue; reject sparse single-chord noodling, stock trailer music, generic corporate beds, and placeholder loops. Never use BPM/key/time-signature slots or imitate an existing composition. Do not repeat biography across fields and do not use generic adjectives without observable evidence.`,
        messages: [{
          role: "user",
          content: JSON.stringify({
            target,
            instruction: target === "all" ? "Complete every character identity field." : `Refresh the ${target} while keeping the full identity coherent. Return every field, preserving the others where useful.`,
            archetypeGuidance: input.archetypeMix.length > 1
              ? `This actor blends multiple archetypes: ${input.archetypeMix.join(", ")}. The first is dominant; weave the others in as genuine contradictions, not costume changes.`
              : undefined,
            briefGuidance: input.characterBrief
              ? "characterBrief is the maker's creative direction. Treat it as binding canon: every field must be consistent with it."
              : undefined,
            nameCoherenceGuidance: "Before choosing an unsupplied name, infer gender presentation from explicit pronouns and gender words in characterBrief. The generated name, voiceGender, voiceDescription, appearance, and every pronoun must agree. Preserve a name only when the creator explicitly supplied it.",
            currentCharacter: input,
            visualIdentityGuidance: "Set productionBible.visual.medium to the exact requested medium; default to live-action cinematic photography only when no style is requested. Return exactly four short recognitionLocks spanning the most distinctive face, hair, wardrobe, or signature prop invariants. These four locks must carry recognition while every non-locked scene detail remains adaptable.",
          }),
        }],
        output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
      }),
    });
    const data = await response.json() as {
      content?: Array<{ type?: string; text?: string }>;
      error?: { message?: string };
      usage?: { input_tokens?: number; output_tokens?: number };
      stop_reason?: string;
    };
    if (!response.ok) throw new Error(data.error?.message || `OpenAI returned ${response.status}.`);
    if (data.stop_reason === "max_tokens") throw new Error("The character ran longer than the output limit. Try again.");
    const output = data.content?.find((block) => block.type === "text")?.text;
    if (!output) throw new Error("OpenAI returned no character suggestion.");
    let parsed: CharacterSuggestion;
    try {
      parsed = JSON.parse(output) as CharacterSuggestion;
    } catch {
      throw new Error("OpenAI's output was cut off mid-write. Try again.");
    }
    const finalized = finalizeCharacterSuggestion(parsed, input, name);
    const usage = {
      inputTokens: Number(data.usage?.input_tokens ?? 0),
      outputTokens: Number(data.usage?.output_tokens ?? 0),
      providerTokens: Number(data.usage?.input_tokens ?? 0) + Number(data.usage?.output_tokens ?? 0),
      providerUsage: data.usage ?? {},
    };
    await completeGeneration(
      jobId,
      undefined,
      {
        suggestionTarget: target,
        generatedName: finalized.coherentName,
        generatedArchetypes: finalized.suggestion.archetypes,
      },
      await calculateGenerationBilling({ kind: "openai-prompt", provider: "openai", model, usage }),
      response.headers.get("request-id"),
    );
    return Response.json({
      suggestion: finalized.suggestion,
      provider: "openai",
      model,
      usage: data.usage,
      configured: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Character suggestion failed.";
    if (jobId) await failGeneration(jobId, message);
    if (fallbackInput) {
      return Response.json({
        suggestion: localSuggestion(fallbackInput),
        provider: "chaplin-local",
        configured: Boolean(process.env.OPENAI_API_KEY),
        warning: `OpenAI could not run: ${message} Local character suggestions were used instead.`,
      });
    }
    return Response.json({ error: message }, { status: securityErrorStatus(error, message === "Sign in to continue." ? 401 : 502) });
  }
}
