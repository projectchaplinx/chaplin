import {
  beginGeneration,
  completeGeneration,
  ensureCharacter,
  failGeneration,
  getCharacterProductionState,
} from "@/lib/server/supabase-admin";
import { requireRequestIdentity } from "@/lib/server/auth";
import { assertRequestBodySize, enforceRateLimit, securityErrorStatus } from "@/lib/server/request-security";
import { calculateGenerationBilling } from "@/lib/server/billing";
import {
  buildProductionBible,
  buildScenePackage,
  composeIdentityImagePrompt,
  composeSfxPrompt,
  composeThemePrompt,
  composeVoiceDesignPrompt,
} from "@/lib/production-prompting";
import type { Character } from "@/lib/types";
import { compactVoicePreview } from "@/lib/voice-preview";
import { dialogueForEditor } from "@/lib/dialogue-performance";
import { getPipelineConfig } from "@/lib/server/pipeline-config";
import {
  openAIInputImage,
  openAIWritingModel,
  requestOpenAIFromLegacyMessages,
} from "@/lib/server/openai-responses";
import {
  buildDialogueSystemPrompt,
  buildVoiceDesignPrompt,
  buildWritingContext,
  readCharacterCardV2,
} from "@/lib/character-card";

export const runtime = "nodejs";
export const maxDuration = 60;

const FIELDS = [
  "voice-description",
  "voice-preview",
  "dialogue",
  "sfx",
  "theme",
  "identity-image",
  "image",
  "video",
] as const;
type QuickField = typeof FIELDS[number];
const VISUAL_FIELDS = new Set<QuickField>(["identity-image", "image", "video"]);

const FIELD_RULES: Record<QuickField, string> = {
  "voice-description": "Write only an ElevenLabs Voice Design prompt using this order: primary spoken language and specific dialect or accent; gender presentation and age range; quality; 2-5 word persona; 2-3 emotions; timbre, pitch, resonance, pacing, intonation, and pressure behavior. Derive language, dialect, and code-switching only from this actor's canon or explicit creator direction. Preserve an explicit choice. Never default every actor to English, Indian English, Hindi, or Urdu; a Russian actor may speak native Russian. If canon is silent, use neutral international English without inventing a regional accent or code-switching. Do not include biography, camera language, SFX, reverb, echo, phone, tape, or celebrity imitation. 65-105 words.",
  "voice-preview": "Write one natural spoken sentence of 5-8 words. It must reveal the actor's personality without pause-heavy punctuation and perform in 4-5 seconds, never more than 7 seconds. Output dialogue only.",
  dialogue: "Write one original, performable line of 8-24 words for this exact dramatic moment. These must be the exact words the actor says aloud to another person, with an implied listener; use first person, direct address, or a natural reply. Never write third-person narration, a character description, an action phrase, a logline, a tagline, or a sentence that merely says what the actor is doing. The line must make a tactical move—test, withhold, dare, confess, accuse, bargain, deflect, or reverse the power dynamic—rather than merely sound atmospheric. Let the actor's central contradiction create the subtext. Use one precise detail from the supplied scene only when it sharpens the pressure; never invent a random prop, meal, door, clue, or backstory just to sound specific. The last phrase must land a turn, cost, or invitation that changes what the other person can do next. Before answering, silently reject any line that could belong to a different actor, explains an emotion or visible action, sounds like a slogan, or relies on a stock threat. Output spoken words only: no speaker label, quotation marks, parentheses, brackets, stage directions, or written pause cues. Use punctuation for cadence. Output dialogue only.",
  sfx: "Write only an ElevenLabs 1-2 second non-musical signature-sound prompt. Translate the actor's personality into one physical source, a precise material texture, a close acoustic distance, one unusual identifying detail, and a clean stop. It must work as a short repeatable sonic logo, not a sequence, biography, ambience bed, or score. No speech, voice, melody, riser, or trailer braam. 30-55 words.",
  theme: "Write only a natural-language Eleven Music production brief for an approximately 8-second instrumental identity cue. State a culturally grounded genre/style anchor with an era, the mood in plain words, two to four named instruments, how the cue opens and builds, one emotional turn, and whether it resolves, stops hard, or ends on an unresolved sustained note. End with: About 8 seconds, ends cleanly, no fade-out. Instrumental only, no vocals. Never use BPM fields, key-of fields, time signatures, timestamp slots, mix-priority slots, biography, lyrics, choir, or copyrighted imitation. 45-90 words.",
  "identity-image": "Write only a concise 16:9 identity-image prompt, 90-140 words. Treat the requested visual medium as binding: preserve manga, animation, illustration, or other explicit styling exactly; default to cinematic live-action photography only when no medium is requested. Use one direct paragraph covering medium and rendering language, visible subject anatomy, exact hair and wardrobe, expression and gesture, restrained world detail, camera, light, and palette. Then add one short Negative line and one Recognition locks line containing exactly four short visible invariants. Those four carry recognition; everything else may move between scenes. No biography, plot summary, symbolism essay, generic hero pose, dialogue, text, logo, UI, or watermark.",
  image: "Write only a concise Seedream 16:9 story first-frame prompt. Unless the user explicitly requests a stylized medium, require a visually striking live-action cinematic photograph of a real human with natural skin, believable anatomy, tactile materials, optical depth, physical camera character, and motivated light. Use coherent natural-language blocks: SUBJECT identity anchors; PLAYABLE MOMENT; SET; CAMERA; LIGHT; CONTINUITY; EXCLUSIONS. Show one decision through face, hands, weight, and eyeline. No biography, plot summary, camera movement, dialogue, typography, logo, or watermark. Keep only generation-critical facts. 80-130 words.",
  video: "Inspect the supplied authored scene image as the exact first frame. Write only a 45-80 word Seedance motion prompt that delivers a complete five-second character introduction, not a moving portrait. Preserve the supplied scene intent. The actor must perform one profession- or identity-defining task already supported by visible objects; pressure must produce a readable decision; the environment or task must visibly change state; and the ending must reveal character. Include continuous environmental motion and one simple motivated camera move. Never settle for blinking, breathing, smiling, pointing, or lowering a hand as the main event. Do not invent geometry absent from the frame. Use ordering words, not timestamps or lens notes. Add exactly four relevant failure negatives and end with --duration 5.",
};

function clean(value: unknown, max = 4000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanQuickWriteResult(field: QuickField, value: unknown) {
  const text = clean(value);
  if (field === "voice-preview") return compactVoicePreview(text);
  if (field === "dialogue") return dialogueForEditor(text);
  return text;
}

function ndjsonLine(value: Record<string, unknown>) {
  return new TextEncoder().encode(`${JSON.stringify(value)}\n`);
}

function takeSseEvents(buffer: string) {
  const normalized = buffer.replace(/\r\n/g, "\n");
  const blocks = normalized.split("\n\n");
  const remainder = blocks.pop() ?? "";
  const data = blocks.flatMap((block) => {
    const lines = block
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart());
    return lines.length ? [lines.join("\n")] : [];
  });
  return { data, remainder };
}

function localRewrite(field: QuickField, character: Character, currentText: string) {
  const base = currentText || character.tagline;
  const scene = buildScenePackage(character, Math.abs(base.length) % 4);
  if (field === "voice-description") return composeVoiceDesignPrompt(character);
  if (field === "voice-preview") return compactVoicePreview(character.brollLine || scene.dialogue);
  if (field === "dialogue") {
    // A Quick Write retry should not echo a weak starter line supplied during
    // character creation. It needs a fresh, playable alternative even offline.
    const alternateScene = buildScenePackage({ ...character, brollLine: undefined }, Math.abs(base.length + 1) % 4);
    return dialogueForEditor(alternateScene.dialogue);
  }
  if (field === "sfx") return composeSfxPrompt(character);
  if (field === "theme") return composeThemePrompt(character);
  if (field === "identity-image") return composeIdentityImagePrompt(character);
  return field === "image" ? scene.image : scene.video;
}

export async function POST(request: Request) {
  let jobId: string | null = null;
  let fallbackField: QuickField | null = null;
  let fallbackCharacter: Character | null = null;
  let fallbackCurrentText = "";
  try {
    assertRequestBodySize(request, 256 * 1024);
    const identity = await requireRequestIdentity(request);
    if (identity.role !== "admin") {
      await enforceRateLimit({ request, bucket: "write-quick", limit: 60, windowSeconds: 86400, identityId: identity.id });
    }
    const body = await request.json() as Record<string, unknown>;
    const field = clean(body.field, 40) as QuickField;
    if (!FIELDS.includes(field)) {
      return Response.json({ error: "Unknown Quick Write field." }, { status: 400 });
    }
    if (!body.character || typeof body.character !== "object") {
      return Response.json({ error: "AI actor context is required." }, { status: 400 });
    }
    const character = body.character as Character;
    if (!clean(character.id, 100) || !clean(character.name, 120)) {
      return Response.json({ error: "AI actor context is invalid." }, { status: 400 });
    }
    const currentText = clean(body.currentText);
    const wantsStream = body.stream === true;
    const variation = Math.max(1, Math.floor(Number(body.variation) || 1));
    fallbackField = field;
    fallbackCharacter = character;
    fallbackCurrentText = currentText;
    const context = body.context && typeof body.context === "object"
      ? body.context as Record<string, unknown>
      : {};

    await ensureCharacter(character);
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return Response.json({
        text: localRewrite(field, character, currentText),
        provider: "chaplin-local",
        configured: false,
      });
    }

    const writingConfig = (await getPipelineConfig()).stages.writing;
    if (!writingConfig.enabled) throw new Error("AI writing is paused by Super Admin.");
    const model = openAIWritingModel(writingConfig.model);
    const production = VISUAL_FIELDS.has(field) ? await getCharacterProductionState(character.id) : null;
    const canonicalReference = production?.visualReference ?? null;
    const requestedReference = clean(body.referenceImage, 12000);
    // Identity-image is a recasting operation, not a continuity operation.
    // Enforce this server-side even if a stale editor sends its current cover.
    const acceptsVisualReference = field !== "identity-image";
    const visualReferenceUrl = acceptsVisualReference
      ? requestedReference || canonicalReference?.url || ""
      : "";
    const visualReferenceSource = acceptsVisualReference
      ? requestedReference ? "exact-first-frame" : canonicalReference?.source ?? null
      : null;
    const visualReferenceAssetId = acceptsVisualReference
      ? requestedReference ? null : canonicalReference?.assetId ?? null
      : null;
    const card = readCharacterCardV2(character.cardV2);
    const v2ConsumerContext = card
      ? field === "dialogue"
        ? { dialogue: buildDialogueSystemPrompt(card) }
        : field === "voice-description" || field === "voice-preview"
          ? { voice: buildVoiceDesignPrompt(card) }
          : field === "identity-image" || field === "image" || field === "video"
            ? { visual: { identity_locks: card.identity_locks, wardrobe_states: card.wardrobe_states, age_states: card.age_states } }
            : { writing: buildWritingContext(card) }
      : null;
    const promptPayload = JSON.stringify({
      field,
      currentText: currentText || null,
      regenerationPass: variation,
      creativeInstruction: field === "dialogue"
        ? "Treat currentText as a disposable draft, not a line to preserve. Keep only useful scene intent. Make a genuinely different playable choice rooted in the actor's contradiction and immediate pressure; a synonym-level rewrite is a failure."
        : field === "identity-image"
          ? "This is a fresh casting pass. Treat currentText as a rejected visual attempt, not continuity to preserve. Keep the user's explicit medium, age range, cultural context, archetype, and essential wardrobe intent, but cast a materially different original face and choose a different non-narrative casting composition. Do not reuse the previous facial geometry, hairstyle arrangement, pose, camera angle, or location."
          : "Make a genuinely different creative choice, not a synonym-level paraphrase. Preserve canon and user intent while changing the central playable beat, visual action, composition, or rhythm as appropriate for this field.",
      actor: {
        name: character.name,
        ...(v2ConsumerContext
          ? { characterCardV2: v2ConsumerContext }
          : {
              archetype: character.archetype,
              tagline: character.tagline,
              personality: character.personality,
              voiceGender: character.voiceGender,
              voiceDescription: character.voiceDesc,
              signatureSfx: character.sfxDesc,
              theme: character.themeDesc,
              brollLine: character.brollLine ?? null,
              brollScene: character.brollScene ?? null,
              productionBible: character.productionBible ?? buildProductionBible(character),
            }),
        visualReference: visualReferenceUrl ? { source: visualReferenceSource, assetId: visualReferenceAssetId } : null,
      },
      relatedCurrentFields: context,
    });
    const messageContent = visualReferenceUrl
      ? [
          await openAIInputImage(visualReferenceUrl),
          { type: "input_text" as const, text: field === "video"
            ? "This authored scene image is the exact first frame. Inspect its crop and visible geometry. Preserve the character-revealing scene intent in currentText, but animate only actions and environmental changes physically supported by what the frame visibly established. Reject a result whose main action is merely a facial gesture or camera drift."
            : `The image above is ${character.name}'s canonical visual identity seed. Base composition and continuity on what is actually visible. Do not invent a conflicting face, age, hair, body, wardrobe, palette, or material.` },
          { type: "input_text" as const, text: promptPayload },
        ]
      : promptPayload;
    jobId = await beginGeneration({
      characterId: character.id,
      kind: `prompt-${field}`,
      provider: "openai",
      model,
      prompt: currentText || `${field} for ${character.name}`,
      metadata: {
        userId: identity.id,
        creditActionCode: "writing.magic",
        creditAllocation: 1,
        creditBilling: "included",
        quickWriteField: field,
      },
    });
    const writingBody: Record<string, unknown> = {
      model,
      max_tokens: Math.min(2000, writingConfig.maxTokens ?? 700),
      system: `${writingConfig.promptPrelude} You are Chaplin's production copywriter. Rewrite exactly one field for an original fictional AI actor. This is creative regeneration pass ${variation}: make a materially new creative choice rather than paraphrasing the existing text. ${field === "identity-image" ? "This pass is casting a replacement identity: preserve explicit user constraints but do not preserve any unapproved face, pose, composition, or setting from earlier attempts." : "Preserve useful user intent, character continuity, and provider constraints."} ${wantsStream ? "Return only the requested field as plain text. Do not wrap it in JSON, markdown, quotation marks, or a label." : "Return only the requested field in structured JSON."} ${FIELD_RULES[field]}`,
      messages: [{
        role: "user",
        content: messageContent,
      }],
      stream: wantsStream,
    };
    if (!wantsStream) {
      writingBody.output_config = {
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["text"],
            properties: { text: { type: "string" } },
          },
        },
      };
    }
    const response = await requestOpenAIFromLegacyMessages({
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(writingBody),
    });
    if (wantsStream) {
      if (!response.ok) {
        const data = await response.json() as { error?: { message?: string } };
        throw new Error(data.error?.message || `OpenAI returned ${response.status}.`);
      }
      if (!response.body) throw new Error("OpenAI returned no Quick Write stream.");
      const providerRequestId = response.headers.get("request-id");
      const activeJobId = jobId;
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const reader = response.body!.getReader();
          const decoder = new TextDecoder();
          let eventBuffer = "";
          let output = "";
          let inputTokens = 0;
          let outputTokens = 0;
          try {
            while (true) {
              const { value, done } = await reader.read();
              eventBuffer += decoder.decode(value, { stream: !done });
              const parsed = takeSseEvents(eventBuffer);
              eventBuffer = parsed.remainder;
              for (const raw of parsed.data) {
                if (!raw || raw === "[DONE]") continue;
                const event = JSON.parse(raw) as {
                  type?: string;
                  delta?: { type?: string; text?: string };
                  error?: { message?: string };
                  message?: { usage?: { input_tokens?: number } };
                  usage?: { output_tokens?: number };
                };
                if (event.type === "error") {
                  throw new Error(event.error?.message || "OpenAI stopped the Quick Write stream.");
                }
                if (event.type === "message_start") {
                  inputTokens = Number(event.message?.usage?.input_tokens ?? inputTokens);
                }
                if (event.type === "message_delta") {
                  outputTokens = Number(event.usage?.output_tokens ?? outputTokens);
                }
                const delta = event.type === "content_block_delta" && event.delta?.type === "text_delta"
                  ? event.delta.text ?? ""
                  : "";
                if (delta) {
                  output += delta;
                  controller.enqueue(ndjsonLine({ type: "delta", text: delta }));
                }
              }
              if (done) break;
            }
            const text = cleanQuickWriteResult(field, output);
            if (!text) throw new Error("OpenAI returned an empty Quick Write result.");
            const usage = {
              inputTokens,
              outputTokens,
              providerTokens: inputTokens + outputTokens,
              providerUsage: { input_tokens: inputTokens, output_tokens: outputTokens },
            };
            await completeGeneration(
              activeJobId,
              undefined,
              { field, characterId: character.id, visualReference: visualReferenceUrl || null, visualReferenceSource, streamed: true },
              await calculateGenerationBilling({ kind: "openai-prompt", provider: "openai", model, usage }),
              providerRequestId,
            );
            controller.enqueue(ndjsonLine({ type: "done", text, provider: "openai", model, usage, configured: true }));
          } catch (streamError) {
            const message = streamError instanceof Error ? streamError.message : "Quick Write stream failed.";
            await failGeneration(activeJobId, message);
            const text = localRewrite(field, character, currentText);
            controller.enqueue(ndjsonLine({
              type: "done",
              text,
              provider: "chaplin-local",
              configured: true,
              warning: `OpenAI could not finish streaming: ${message} Local Quick Write was used instead.`,
            }));
          } finally {
            reader.releaseLock();
            controller.close();
          }
        },
      });
      jobId = null;
      return new Response(stream, {
        headers: {
          "Content-Type": "application/x-ndjson; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          "X-Accel-Buffering": "no",
        },
      });
    }
    const data = await response.json() as {
      content?: Array<{ type?: string; text?: string }>;
      error?: { message?: string };
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    if (!response.ok) throw new Error(data.error?.message || `OpenAI returned ${response.status}.`);
    const output = data.content?.find((block) => block.type === "text")?.text;
    if (!output) throw new Error("OpenAI returned no Quick Write result.");
    const result = JSON.parse(output) as { text?: unknown };
    const text = cleanQuickWriteResult(field, result.text);
    if (!text) throw new Error("OpenAI returned an empty Quick Write result.");
    const usage = {
      inputTokens: Number(data.usage?.input_tokens ?? 0),
      outputTokens: Number(data.usage?.output_tokens ?? 0),
      providerTokens: Number(data.usage?.input_tokens ?? 0) + Number(data.usage?.output_tokens ?? 0),
      providerUsage: data.usage ?? {},
    };
    await completeGeneration(
      jobId,
      undefined,
      { field, characterId: character.id, visualReference: visualReferenceUrl || null, visualReferenceSource },
      await calculateGenerationBilling({ kind: "openai-prompt", provider: "openai", model, usage })
    );
    return Response.json({ text, provider: "openai", model, usage, configured: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Quick Write failed.";
    if (jobId) await failGeneration(jobId, message);
    if (fallbackField && fallbackCharacter) {
      return Response.json({
        text: localRewrite(fallbackField, fallbackCharacter, fallbackCurrentText),
        provider: "chaplin-local",
        configured: Boolean(process.env.OPENAI_API_KEY),
        warning: `OpenAI could not run: ${message} Local Quick Write was used instead.`,
      });
    }
    return Response.json({ error: message }, { status: securityErrorStatus(error, message === "Sign in to continue." ? 401 : 502) });
  }
}
