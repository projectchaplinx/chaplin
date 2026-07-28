import { buildProductionBible } from "@/lib/production-prompting";
import { planCameraForScene, type CameraMovementId } from "@/lib/camera-movements";
import { anthropicImageBlock, type AnthropicImageBlock } from "@/lib/server/anthropic-image";
import { calculateGenerationBilling } from "@/lib/server/billing";
import {
  beginGeneration,
  completeGeneration,
  failGeneration,
  getCharacterProductionState,
} from "@/lib/server/supabase-admin";
import { getPipelineConfig } from "@/lib/server/pipeline-config";
import { requireRequestIdentity } from "@/lib/server/auth";
import { assertRequestBodySize, enforceRateLimit, securityErrorStatus } from "@/lib/server/request-security";
import type { Archetype, CharacterProductionBible, VoiceGender } from "@/lib/types";
import {
  normalizeProductionFormat,
  productionDuration,
  productionShotCount,
  type ProductionFormat,
} from "@/lib/production-formats";

export const runtime = "nodejs";
export const maxDuration = 120; // json_schema output on a full scene draft can run 35-55s; give real headroom over the wall clock

type PromptCharacter = {
  id: string;
  name: string;
  archetype: Archetype;
  tagline: string;
  personality: string;
  voiceGender: VoiceGender;
  voiceDesc: string;
  productionBible: CharacterProductionBible;
};

type MagicDraft = {
  title: string;
  logline: string;
  creativeDirection: string;
  castIds: string[];
  scenes: Array<{
    setting: string;
    objective: string;
    action: string;
    cameraMovementId?: CameraMovementId;
    lines: Array<{ characterId: string; text: string }>;
  }>;
};

const FORMATS = new Set<ProductionFormat>(["spark", "punch", "episode", "spot"]);

function clean(value: unknown, max = 2000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function parseCharacters(value: unknown): PromptCharacter[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 24).flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const row = candidate as Record<string, unknown>;
    const id = clean(row.id, 100);
    const name = clean(row.name, 120);
    if (!id || !name) return [];
    const base = {
      id,
      name,
      archetype: clean(row.archetype, 50) as Archetype,
      tagline: clean(row.tagline, 500),
      personality: clean(row.personality, 1200),
      voiceGender: clean(row.voiceGender, 30) as VoiceGender,
      voiceDesc: clean(row.voiceDesc, 700),
    };
    return [{
      ...base,
      productionBible: row.productionBible && typeof row.productionBible === "object"
        ? row.productionBible as CharacterProductionBible
        : buildProductionBible(base),
    }];
  });
}

function attachCameraMovements(draft: MagicDraft, format: ProductionFormat): MagicDraft {
  const sceneCount = draft.scenes.length;
  return {
    ...draft,
    scenes: draft.scenes.map((scene, sceneIndex) => ({
      ...scene,
      cameraMovementId: planCameraForScene({
        movementId: scene.cameraMovementId,
        setting: scene.setting,
        objective: scene.objective,
        action: scene.action,
        format,
        sceneIndex,
        sceneCount,
      }).movementId,
    })),
  };
}

function fallbackDraft(input: {
  format: ProductionFormat;
  durationSeconds: number;
  brief: string;
  title: string;
  logline: string;
  characters: PromptCharacter[];
  castIds: string[];
  productImageUrl?: string;
  productImageName?: string;
}): MagicDraft {
  const selected = input.castIds
    .map((id) => input.characters.find((character) => character.id === id))
    .filter((character): character is PromptCharacter => Boolean(character));
  const cast = (selected.length ? selected : input.characters.slice(0, input.format === "episode" ? 2 : 1)).slice(0, 4);
  const lead = cast[0];
  const foil = cast[1] ?? lead;
  const subject = input.brief || (input.format === "episode"
    ? `${lead?.name ?? "An unlikely hero"} must make one irreversible choice before dawn.`
    : `${lead?.name ?? "A charismatic AI actor"} introduces one memorable product benefit.`);
  const leadId = lead?.id ?? "";
  const foilId = foil?.id ?? leadId;
  const leadName = lead?.name ?? "The Lead";
  const foilName = foil?.name ?? leadName;
  const storyEngine = lead?.productionBible.story;
  const performance = lead?.productionBible.performance;
  const actorWorld = lead?.productionBible.cinematography.worldTexture || "the actor's established story world";
  const leadLine = lead?.tagline || "Watch what changes when the choice becomes real.";

  if (input.format !== "episode") {
    const creatorShort = input.format === "spark" || input.format === "punch";
    const spark = input.format === "spark";
    return {
      title: input.title || (creatorShort ? `${leadName}: Casting Proof` : `${leadName} Makes the Case`),
      logline: input.logline || (creatorShort
        ? `${leadName} turns ${subject.toLowerCase()} into one unmistakable performance choice.`
        : `${leadName} turns ${subject.toLowerCase()} into one sharp, visual promise and a direct invitation to act.`),
      creativeDirection: `${input.durationSeconds}-second ${spark ? "private Spark audition" : input.format === "punch" ? "public Punch performance" : "managed brand Spot"}. ${input.productImageUrl ? `The uploaded ${input.productImageName || "product"} image is binding product canon and must remain visually exact.` : ""} Hook grammar: ${storyEngine?.hookPattern ?? "open on a visible interruption"}. ${creatorShort ? "Prove the actor's personality through visible pressure and choice." : "Communicate one benefit through proof on screen, then finish on a specific call to action."}`,
      castIds: cast.map((character) => character.id),
      scenes: [
        {
          setting: actorWorld,
          objective: `Hook attention in the first two seconds: ${storyEngine?.hookPattern ?? "show a visible problem or surprise"}.`,
          action: `${leadName} begins in their established resting behavior, registers the specific problem in ${subject.toLowerCase()}, and makes one readable choice through ${performance?.signatureGesture ?? "a restrained physical gesture"}.`,
          lines: [{ characterId: leadId, text: leadLine }],
        },
        {
          setting: `${actorWorld} — CONTINUOUS`,
          objective: "Demonstrate one concrete benefit rather than listing features.",
          action: `${leadName} performs one concrete before-and-after action tied directly to ${subject.toLowerCase()}; the result remains visible in the same composition.`,
          lines: [{ characterId: leadId, text: "One choice. One visible result." }],
        },
        {
          setting: `${actorWorld} — PROOF FRAME`,
          objective: "Make the promise believable through a visual result or reaction.",
          action: `${foilName} tests the visible result while ${leadName} holds the response described by ${performance?.underPressure ?? "their established pressure behavior"}.`,
          lines: foilId ? [{ characterId: foilId, text: "That changed the outcome." }] : [],
        },
        {
          setting: `${actorWorld} — CLEAN END FRAME`,
          objective: `Pay off the actor's pattern (${storyEngine?.payoffPattern ?? "turn the demonstrated proof into a decision"}) and land a clear next action.`,
          action: `${leadName} completes the choice, holds the visible result, and leaves one uncluttered area for the final message without changing the actor's identity or world.`,
          lines: [{ characterId: leadId, text: creatorShort ? leadLine : "The proof is already in the frame." }],
        },
      ].filter((scene) => scene.lines.length > 0).slice(0, spark ? 1 : 4),
    };
  }

  return {
    title: input.title || `${leadName}: The Choice`,
    logline: input.logline || `${leadName} pursues ${subject.toLowerCase()}, but ${foilName} forces a choice that changes what winning means.`,
    creativeDirection: `A compact three-act short built from the actor's persistent story engine. Hook: ${storyEngine?.hookPattern ?? "open after the obvious plan fails"}. Escalation: ${storyEngine?.escalationPattern ?? "make every gain create a cost"}. Cliffhanger: ${storyEngine?.cliffhangerPattern ?? "reverse the power relationship"}. Payoff: ${storyEngine?.payoffPattern ?? "resolve through a character choice"}. Every scene changes the situation; no biography as dialogue.`,
    castIds: cast.map((character) => character.id),
    scenes: [
      {
        setting: `${actorWorld} — OPENING`,
        objective: `Establish the external want (${lead?.productionBible.dramatic.externalWant ?? "a concrete urgent goal"}) through visible behavior inside the actor's own world.`,
        action: `${leadName} enters in their established movement style, reads the consequence of ${subject.toLowerCase()}, and begins ${performance?.signatureGesture ?? "one restrained signature action"} without explaining it.`,
        lines: [{ characterId: leadId, text: leadLine }],
      },
      {
        setting: `${actorWorld} — PRESSURE TURN`,
        objective: `Escalate through the actor's contradiction: ${lead?.productionBible.dramatic.contradiction ?? "the plan conflicts with a private value"}. Change who holds power through an observable action.`,
        action: `${foilName} makes the pressure concrete. ${leadName} responds through ${performance?.underPressure ?? "a visible break from their resting behavior"} and chooses what matters more.`,
        lines: [
          { characterId: foilId, text: "You cannot keep both outcomes." },
          { characterId: leadId, text: "Then I choose the one that changes us." },
        ],
      },
      {
        setting: `${actorWorld} — AFTERMATH`,
        objective: `Pay off the central choice through ${storyEngine?.payoffPattern ?? "an irreversible visual action"}, not an explanatory speech.`,
        action: `${leadName} completes one irreversible action tied to ${subject.toLowerCase()}, lets the consequence register, and returns to a changed version of the opening posture.`,
        lines: [{ characterId: leadId, text: "Now the choice has a consequence." }],
      },
    ],
  };
}

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "logline", "creativeDirection", "castIds", "scenes"],
  properties: {
    title: { type: "string" },
    logline: { type: "string" },
    creativeDirection: { type: "string" },
    castIds: { type: "array", items: { type: "string" } },
    scenes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["setting", "objective", "action", "lines"],
        properties: {
          setting: { type: "string" },
          objective: { type: "string" },
          action: { type: "string" },
          lines: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["characterId", "text"],
              properties: {
                characterId: { type: "string" },
                text: { type: "string" },
              },
            },
          },
        },
      },
    },
  },
} as const;

export async function GET() {
  return Response.json({
    configured: Boolean(process.env.ANTHROPIC_API_KEY),
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
  });
}

export async function POST(request: Request) {
  let fallbackInput: Parameters<typeof fallbackDraft>[0] | null = null;
  let jobId: string | null = null;
  try {
    assertRequestBodySize(request, 512 * 1024);
    const identity = await requireRequestIdentity(request);
    if (identity.role !== "admin") {
      await enforceRateLimit({ request, bucket: "write-magic", limit: 30, windowSeconds: 86400, identityId: identity.id });
    }
    const body = await request.json() as Record<string, unknown>;
    const requestedFormat = normalizeProductionFormat(clean(body.format, 20), "punch");
    const format = FORMATS.has(requestedFormat) ? requestedFormat : "punch";
    const durationSeconds = productionDuration(format, Number(body.durationSeconds));
    const characters = parseCharacters(body.characters);
    if (characters.length === 0) {
      return Response.json({ error: "At least one available AI actor is required." }, { status: 400 });
    }
    const validIds = new Set(characters.map((character) => character.id));
    const castIds = Array.isArray(body.castIds)
      ? body.castIds.filter((id): id is string => typeof id === "string" && validIds.has(id)).slice(0, 6)
      : [];
    const input = {
      format,
      durationSeconds,
      sceneDurationSeconds: 4,
      requiredSceneCount: productionShotCount(format, durationSeconds),
      brief: clean(body.brief, 4000),
      title: clean(body.title, 200),
      logline: clean(body.logline, 700),
      characters,
      castIds,
      productImageUrl: clean(body.productImageUrl, 2000),
      productImageName: clean(body.productImageName, 180),
    };
    if (format === "spot" && !input.productImageUrl) {
      return Response.json({ error: "A product image is required before writing a brand Spot." }, { status: 400 });
    }
    fallbackInput = input;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return Response.json({ draft: attachCameraMovements(fallbackDraft(input), format), provider: "chaplin-local", configured: false });
    }

    const writingConfig = (await getPipelineConfig()).stages.writing;
    if (!writingConfig.enabled) throw new Error("AI writing is paused by Super Admin.");
    const model = writingConfig.model || process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
    const characterContext = characters.map((character) => ({
      ...character,
      selected: castIds.includes(character.id),
    }));
    const selectedCharacters = (castIds.length
      ? castIds.map((id) => characters.find((character) => character.id === id)).filter((character): character is PromptCharacter => Boolean(character))
      : characters.slice(0, format === "episode" ? 2 : 1)
    ).slice(0, 6);
    const visualContexts = (await Promise.all(selectedCharacters.map(async (character) => {
      try {
        const production = await getCharacterProductionState(character.id);
        if (!production.visualReference) return null;
        return {
          character,
          reference: production.visualReference,
          block: await anthropicImageBlock(production.visualReference.url),
        };
      } catch {
        return null;
      }
    }))).filter((context): context is {
      character: PromptCharacter;
      reference: NonNullable<Awaited<ReturnType<typeof getCharacterProductionState>>["visualReference"]>;
      block: AnthropicImageBlock;
    } => Boolean(context));
    const taskPayload = JSON.stringify({
      task: "Expand the user's partial input into a complete, editable production draft. Preserve useful supplied title and logline text, but improve weak or incomplete fields.",
      format,
      durationSeconds,
      brief: input.brief || "Invent a strong concept suited to the selected cast.",
      existingTitle: input.title || null,
      existingLogline: input.logline || null,
      productReference: input.productImageUrl
        ? {
            name: input.productImageName || "Uploaded product",
            rule: "Preserve exact shape, packaging, colors, proportions, label placement, and materials.",
          }
        : null,
      characters: characterContext.map((character) => ({
        ...character,
        visualReference: visualContexts.find((context) => context.character.id === character.id)?.reference.source ?? null,
      })),
    });
    const messageContent: Array<AnthropicImageBlock | { type: "text"; text: string }> = [];
    if (input.productImageUrl) {
      messageContent.push({
        type: "text",
        text: `Binding product reference for this brand Spot (${input.productImageName || "uploaded product"}):`,
      });
      messageContent.push(await anthropicImageBlock(input.productImageUrl));
    }
    for (const context of visualContexts) {
      messageContent.push({ type: "text", text: `Canonical visual identity seed for ${context.character.name}:` });
      messageContent.push(context.block);
    }
    messageContent.push({ type: "text", text: taskPayload });
    jobId = await beginGeneration({
      characterId: selectedCharacters[0]?.id,
      kind: "prompt-production-draft",
      provider: "anthropic",
      model,
      prompt: input.brief || `${format} production draft`,
      metadata: {
        userId: identity.id,
        creditActionCode: "writing.magic",
        creditAllocation: 1,
        creditBilling: "included",
        format,
        durationSeconds,
        castIds: selectedCharacters.map((character) => character.id),
      },
    });
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: Math.max(4000, writingConfig.maxTokens ?? 8000),
        thinking: { type: "disabled" },
        system: `${writingConfig.promptPrelude} You are Chaplin's senior screenwriter and advertising creative director. Write concise, production-ready scripts for fictional AI actors using each supplied production bible and canonical reference image as binding character canon. The images are the source of truth for face, apparent age, hair, body, wardrobe, materials, palette, and physical presence; stage action, blocking, framing, and motivated light around what is actually visible instead of redesigning or generically redescribing it. For a Spot, the supplied product image is equally binding canon: preserve its exact shape, packaging, proportions, colors, materials, label placement, and recognizable details; build the idea around what is actually visible instead of inventing or redesigning the product. Never restate biography as dialogue. Every returned scene is exactly one four-second visual unit and must have a screenplay slugline, one playable objective, one concise visible action that can complete in four seconds, and dialogue short enough to perform inside that same four-second window. Do not hide camera directions inside visible action; Chaplin assigns a controlled camera plan after the dramatic beat is written. Return exactly the requiredSceneCount supplied in the task. The first scene needs a visual hook, not an explanation. Each subsequent scene must escalate cost or reverse power. A cliffhanger must introduce new pressure, reveal consequential information, or force an irreversible choice; merely withholding information is not a cliffhanger. Payoffs must answer an earlier image, gesture, object, or moral boundary. Preserve performance tells, movement grammar, recurring motifs, and moral boundaries without mechanically repeating them. Spark is a private five-second audition with one performance choice. Punch is a public fifteen-second personality proof assembled from four authored four-second scenes and trimmed to runtime. Episode is a sixty-second microdrama ending on a situation-changing cliffhanger. Spot is a managed thirty- or sixty-second brand output that dramatizes one benefit through visible proof and a specific CTA. Keep scenes realistic for the requested duration and use only supplied character IDs.`,
        messages: [{
          role: "user",
          content: messageContent,
        }],
        output_config: {
          format: {
            type: "json_schema",
            schema: OUTPUT_SCHEMA,
          },
        },
      }),
    });
    const data = await response.json() as {
      content?: Array<{ type?: string; text?: string }>;
      error?: { message?: string };
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    if (!response.ok) {
      throw new Error(data.error?.message || `Claude returned ${response.status}.`);
    }
    const text = data.content?.find((block) => block.type === "text")?.text;
    if (!text) throw new Error("Claude returned no script draft.");
    const draft = JSON.parse(text) as MagicDraft;
    const allowedIds = new Set(characters.map((character) => character.id));
    const returnedScenes = Array.isArray(draft.scenes) ? draft.scenes : [];
    draft.scenes = returnedScenes.slice(0, 10).flatMap((scene) => {
      if (!scene || typeof scene !== "object") return [];
      const setting = clean(scene.setting, 300);
      const objective = clean(scene.objective, 700);
      const action = clean(scene.action, 1600);
      const lines = Array.isArray(scene.lines)
        ? scene.lines
          .filter((line) => line && allowedIds.has(line.characterId) && clean(line.text, 800))
          .slice(0, 12)
          .map((line) => ({ characterId: line.characterId, text: clean(line.text, 800) }))
        : [];
      return setting || objective || action || lines.length
        ? [{ setting, objective, action, lines }]
        : [];
    });
    const repairedEmptyScenes = draft.scenes.length === 0;
    if (repairedEmptyScenes) {
      draft.scenes = fallbackDraft(input).scenes;
    }
    const requiredSceneCount = productionShotCount(format, durationSeconds);
    if (format !== "spark") {
      const fallbackScenes = fallbackDraft(input).scenes;
      while (draft.scenes.length < requiredSceneCount && fallbackScenes.length) {
        const source = fallbackScenes[draft.scenes.length % fallbackScenes.length];
        draft.scenes.push({
          ...source,
          setting: source.setting.replace(/ - (DAY|NIGHT|CONTINUOUS)$/i, ` - CONTINUOUS ${draft.scenes.length + 1}`),
          lines: source.lines.map((line) => ({ ...line })),
        });
      }
      draft.scenes = draft.scenes.slice(0, requiredSceneCount);
    }
    const speakingCastIds = draft.scenes.flatMap((scene) => scene.lines.map((line) => line.characterId));
    draft.castIds = [...new Set([...draft.castIds, ...speakingCastIds])]
      .filter((id) => allowedIds.has(id));
    const directedDraft = attachCameraMovements(draft, format);
    const usage = {
      inputTokens: Number(data.usage?.input_tokens ?? 0),
      outputTokens: Number(data.usage?.output_tokens ?? 0),
      providerTokens: Number(data.usage?.input_tokens ?? 0) + Number(data.usage?.output_tokens ?? 0),
      providerUsage: data.usage ?? {},
    };
    await completeGeneration(
      jobId,
      undefined,
      { format, durationSeconds, title: directedDraft.title, castIds: directedDraft.castIds },
      await calculateGenerationBilling({ kind: "anthropic-prompt", usage }),
      response.headers.get("request-id"),
    );
    return Response.json({
      draft: directedDraft,
      provider: repairedEmptyScenes ? "chaplin-local" : "anthropic",
      model,
      usage: data.usage,
      configured: true,
      warning: repairedEmptyScenes
        ? "Claude returned no playable scene, so Chaplin repaired the draft with a complete local scene beat."
        : undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not build the magic draft.";
    if (jobId) await failGeneration(jobId, message);
    if (fallbackInput) {
      return Response.json({
        draft: attachCameraMovements(fallbackDraft(fallbackInput), fallbackInput.format),
        provider: "chaplin-local",
        configured: Boolean(process.env.ANTHROPIC_API_KEY),
        warning: `Claude could not run: ${message} A complete local draft was used instead.`,
      });
    }
    return Response.json(
      { error: message },
      { status: securityErrorStatus(error, message === "Sign in to continue." ? 401 : 502) }
    );
  }
}
