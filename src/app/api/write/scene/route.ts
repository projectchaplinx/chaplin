import {
  buildProductionBible,
  buildScenePackage,
  composeImagePrompt,
  composeSfxPrompt,
  composeThemePrompt,
  composeVideoPrompt,
  type ScenePackage,
  type ShotBlueprint,
} from "@/lib/production-prompting";
import { calculateGenerationBilling } from "@/lib/server/billing";
import {
  beginGeneration,
  completeGeneration,
  ensureCharacter,
  failGeneration,
  getCharacterProductionState,
} from "@/lib/server/supabase-admin";
import { requireRequestIdentity } from "@/lib/server/auth";
import { assertRequestBodySize, enforceRateLimit, securityErrorStatus } from "@/lib/server/request-security";
import { anthropicImageBlock } from "@/lib/server/anthropic-image";
import type { Character } from "@/lib/types";
import { dialogueForEditor } from "@/lib/dialogue-performance";
import { getPipelineConfig } from "@/lib/server/pipeline-config";
import { buildWritingContext, readCharacterCardV2 } from "@/lib/character-card";

export const runtime = "nodejs";
export const maxDuration = 120;

function clean(value: unknown, max = 4000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

const SHOT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "sceneName", "dramaticBeat", "hook", "setting", "subjectStart", "actionTimeline",
    "facialBeat", "framing", "cameraAngle", "lens", "cameraMovement", "keyLight",
    "fillAndEdge", "environmentalMotion", "soundTexture", "musicalArc", "finalFrame", "dialogue",
  ],
  properties: {
    sceneName: { type: "string" },
    dramaticBeat: { type: "string" },
    hook: { type: "string" },
    setting: { type: "string" },
    subjectStart: { type: "string" },
    actionTimeline: { type: "array", items: { type: "string" } },
    facialBeat: { type: "string" },
    framing: { type: "string" },
    cameraAngle: { type: "string" },
    lens: { type: "string" },
    cameraMovement: { type: "string" },
    keyLight: { type: "string" },
    fillAndEdge: { type: "string" },
    environmentalMotion: { type: "string" },
    soundTexture: { type: "string" },
    musicalArc: { type: "string" },
    finalFrame: { type: "string" },
    dialogue: { type: "string" },
  },
} as const;

function renderPackage(character: Character, shot: ShotBlueprint): ScenePackage {
  return {
    sceneName: shot.sceneName,
    hook: shot.hook,
    dialogue: dialogueForEditor(shot.dialogue),
    image: composeImagePrompt(character, shot),
    video: composeVideoPrompt(character, shot),
    sfx: composeSfxPrompt(character, shot.soundTexture),
    theme: composeThemePrompt(character, shot.musicalArc),
    blueprint: shot,
  };
}

export async function POST(request: Request) {
  let fallbackCharacter: Character | null = null;
  let fallbackVariation = 0;
  let jobId: string | null = null;
  try {
    assertRequestBodySize(request, 256 * 1024);
    const identity = await requireRequestIdentity(request);
    if (identity.role !== "admin") {
      await enforceRateLimit({ request, bucket: "write-scene", limit: 60, windowSeconds: 86400, identityId: identity.id });
    }
    const body = await request.json() as Record<string, unknown>;
    if (!body.character || typeof body.character !== "object") {
      return Response.json({ error: "AI actor context is required." }, { status: 400 });
    }
    const character = body.character as Character;
    if (!clean(character.id, 100) || !clean(character.name, 120)) {
      return Response.json({ error: "AI actor context is invalid." }, { status: 400 });
    }
    const variation = Math.max(0, Math.floor(Number(body.variation) || 0));
    const brief = clean(body.brief, 1600);
    fallbackCharacter = character;
    fallbackVariation = variation;
    await ensureCharacter(character);

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return Response.json({ scene: buildScenePackage(character, variation), provider: "chaplin-local", configured: false });
    }

    const writingConfig = (await getPipelineConfig()).stages.writing;
    if (!writingConfig.enabled) throw new Error("AI writing is paused by Super Admin.");
    const model = writingConfig.model || process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
    const production = await getCharacterProductionState(character.id);
    const visualReference = production.visualReference;
    const card = readCharacterCardV2(character.cardV2);
    const promptPayload = JSON.stringify({
      brief: brief || null,
      variation,
      actor: {
        name: character.name,
        ...(card
          ? { characterCardV2: buildWritingContext(card) }
          : {
              archetype: character.archetype,
              tagline: character.tagline,
              personality: character.personality,
              productionBible: character.productionBible ?? buildProductionBible(character),
            }),
        visualReference: visualReference ? { source: visualReference.source, assetId: visualReference.assetId } : null,
      },
    });
    const messageContent = visualReference
      ? [
          await anthropicImageBlock(visualReference.url),
          { type: "text" as const, text: `This is ${character.name}'s canonical visual identity seed. Design the shot around the visible face, body, wardrobe, materials, palette, existing camera logic, and plausible light. Do not redescribe or redesign the actor.` },
          { type: "text" as const, text: promptPayload },
        ]
      : promptPayload;
    jobId = await beginGeneration({
      characterId: character.id,
      kind: "prompt-scene-package",
      provider: "anthropic",
      model,
      prompt: brief || `New playable five-second scene for ${character.name}`,
      metadata: {
        userId: identity.id,
        creditActionCode: "writing.magic",
        creditAllocation: 1,
        creditBilling: "included",
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
        max_tokens: writingConfig.maxTokens ?? 4000,
        system: `${writingConfig.promptPrelude} You are a film director creating one production-ready five-second beat for an established fictional actor. Return a shot blueprint, not prose about the character. The hook must be visible in the first frame or first second. The dramatic beat must change the situation. Dialogue is one original 8-24 word line that the actor says aloud to another person; it must use first person, direct address, or a natural reply, never third-person narration, a character description, an action phrase, a tagline, or a line explaining visible action. It must make a tactical move—test, withhold, dare, confess, accuse, bargain, deflect, or reverse power. It must draw subtext from the actor's contradiction and the actual scene pressure, not explain identity, emotion, or visible action. The final phrase must create a turn, cost, or invitation. Do not use a generic aphorism, stock threat, catchphrase, or an invented prop/detail merely to sound specific. Dialogue must contain spoken words only: no speaker labels, quotation marks, parentheses, brackets, stage directions, or written pause cues; use punctuation for cadence. Block one readable body action and one micro-expression across exactly three time ranges. Specify precise framing, camera height/angle, lens, one physically plausible camera path, motivated key-light direction, fill/edge, environmental motion, an acoustic soundTexture made only of recordable physical sources, a musicalArc expressed only as musical/emotional development, and a final frame that creates a genuine cliffhanger by introducing new pressure or reversing power. Respect the actor bible. Avoid generic walking, posing, looking at camera, montage, multiple cuts, excessive motion, unmotivated light, or biography. The still is a designed first frame; the video will animate that exact image, so motion instructions must never redesign the frame.`,
        messages: [{
          role: "user",
          content: messageContent,
        }],
        output_config: { format: { type: "json_schema", schema: SHOT_SCHEMA } },
      }),
    });
    const data = await response.json() as {
      content?: Array<{ type?: string; text?: string }>;
      error?: { message?: string };
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    if (!response.ok) throw new Error(data.error?.message || `Claude returned ${response.status}.`);
    const output = data.content?.find((block) => block.type === "text")?.text;
    if (!output) throw new Error("Claude returned no shot blueprint.");
    const parsed = JSON.parse(output) as Omit<ShotBlueprint, "actionTimeline"> & { actionTimeline: string[] };
    if (!Array.isArray(parsed.actionTimeline) || parsed.actionTimeline.length !== 3) {
      throw new Error("Claude returned an invalid action timeline.");
    }
    const shot = { ...parsed, actionTimeline: parsed.actionTimeline as [string, string, string] };
    const usage = {
      inputTokens: Number(data.usage?.input_tokens ?? 0),
      outputTokens: Number(data.usage?.output_tokens ?? 0),
      providerTokens: Number(data.usage?.input_tokens ?? 0) + Number(data.usage?.output_tokens ?? 0),
      providerUsage: data.usage ?? {},
    };
    await completeGeneration(
      jobId,
      undefined,
      { characterId: character.id, sceneName: shot.sceneName, blueprint: shot, visualReference: visualReference?.url ?? null, visualReferenceSource: visualReference?.source ?? null },
      await calculateGenerationBilling({ kind: "anthropic-prompt", usage })
    );
    return Response.json({ scene: renderPackage(character, shot), provider: "anthropic", model, usage, configured: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Magic Scene failed.";
    if (jobId) await failGeneration(jobId, message);
    if (fallbackCharacter) {
      /*
        The local director draws from only four authored blueprints, so when this
        path runs often every actor ends up playing the same scene — the reason
        one projection-corridor door kept appearing across unrelated characters.
        The response stays 200 with a usable scene so the creator is never left
        with nothing, but it is now explicitly flagged as a fallback and carries
        the real provider error, instead of reading like a normal success with a
        soft note. Callers must treat `fallback: true` as a degraded result.
      */
      const configured = Boolean(process.env.ANTHROPIC_API_KEY);
      return Response.json({
        scene: buildScenePackage(fallbackCharacter, fallbackVariation),
        provider: "chaplin-local",
        configured,
        fallback: true,
        reason: message,
        warning: configured
          ? `Magic Scene could not reach the writer, so Chaplin used a stock scene. This is one of only a few built-in scenes, so it will repeat across actors. Try another take. (${message})`
          : "AI writing is not configured, so Chaplin used a stock scene. These repeat across actors until a writer is connected.",
      });
    }
    return Response.json({ error: message }, { status: securityErrorStatus(error, message === "Sign in to continue." ? 401 : 502) });
  }
}
