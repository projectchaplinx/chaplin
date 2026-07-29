import { composeCharacterInteractionPrompt } from "@/lib/character-system";
import { buildProductionBible } from "@/lib/production-prompting";
import { listCharacters } from "@/lib/server/supabase-admin";
import {
  assertMutationOrigin,
  assertRequestBodySize,
  enforceRateLimit,
  securityErrorStatus,
} from "@/lib/server/request-security";
import {
  openAIWritingModel,
  requestOpenAIFromLegacyMessages,
} from "@/lib/server/openai-responses";

export const runtime = "nodejs";
export const maxDuration = 30;

function clean(value: unknown, max = 800) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

function localReply(name: string, message: string, bible: ReturnType<typeof buildProductionBible>) {
  const subject = message.replace(/[?!\.]+$/g, "").trim();
  return [
    `I hear you. ${subject ? `About “${subject}” — ` : ""}${bible.dramatic.externalWant} is still the thing pulling me forward.`,
    `I won't pretend the doubt is gone; ${bible.dramatic.contradiction} is part of how I move through a room.`,
  ].join(" ").slice(0, 480);
}

/**
 * Prior turns of this conversation, oldest first. Only the current message used
 * to be sent, so the actor answered every question as if it were the first one
 * and could not refer back to anything already said. The window is capped so a
 * long room does not grow the request without bound.
 */
const MEMORY_TURNS = 16;

function conversationMemory(value: unknown) {
  if (!Array.isArray(value)) return [];
  const turns = value.flatMap((entry) => {
    const turn = entry as { role?: unknown; text?: unknown };
    const text = clean(turn.text, 600);
    if (!text) return [];
    // The model sees the character's own prior replies as assistant turns.
    const role = turn.role === "character" || turn.role === "assistant" ? "assistant" as const : "user" as const;
    return [{ role, content: text }];
  });
  const windowed = turns.slice(-MEMORY_TURNS);
  // The exchange must begin with a user turn, so drop a leading assistant line
  // (the opening punchline) rather than letting the request be rejected.
  while (windowed.length && windowed[0].role === "assistant") windowed.shift();
  return windowed;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertMutationOrigin(request);
    assertRequestBodySize(request, 32 * 1024);
    const { id } = await context.params;
    await enforceRateLimit({
      request,
      bucket: `public-character-chat:${id}`,
      limit: 20,
      windowSeconds: 60 * 60,
    });
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const message = clean(body.message);
    const memory = conversationMemory(body.history);
    if (message.length < 2) return Response.json({ error: "Write something for the actor first." }, { status: 400 });

  let character;
  try {
    character = (await listCharacters()).find((item) => item.id === id);
  } catch {
    return Response.json({ error: "The actor could not be reached right now." }, { status: 503 });
  }
  if (!character) return Response.json({ error: "Actor not found." }, { status: 404 });

  const bible = buildProductionBible(character);
  const fallback = localReply(character.name, message, bible);
  const apiKey = process.env.OPENAI_API_KEY;
  const model = openAIWritingModel();

  if (!apiKey) return Response.json({ reply: fallback, provider: "character-local", canSpeak: Boolean(character.voiceId) });

    try {
      const response = await requestOpenAIFromLegacyMessages({
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 220,
        thinking: { type: "disabled" },
        system: `${composeCharacterInteractionPrompt(character, bible)}\n\nReply only as the actor, in first person. Be conversational and specific, never narrate an action, never mention a prompt, bible, model, or creator notes. Keep it to one or two short sentences. You remember everything already said in this conversation; refer back to it naturally when it matters, and never reintroduce yourself to someone you are already talking to.`,
        messages: [...memory, { role: "user", content: message }],
      }),
      cache: "no-store",
    });
    const data = (await response.json()) as { content?: Array<{ type?: string; text?: string }> };
    const reply = clean(data.content?.find((block) => block.type === "text")?.text, 700);
    if (!response.ok || !reply) throw new Error("Actor response unavailable.");
    return Response.json({ reply, provider: "openai", canSpeak: Boolean(character.voiceId) });
    } catch {
      return Response.json({ reply: fallback, provider: "character-local", canSpeak: Boolean(character.voiceId) });
    }
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Actor interaction failed." },
      { status: securityErrorStatus(error, 400) },
    );
  }
}
