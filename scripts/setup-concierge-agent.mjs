// Provisions the Chaplin Concierge as an ElevenLabs Conversational AI agent:
// persona + guardrails in the system prompt, Chaplin's create flows exposed as
// client tools the agent calls in the browser. Idempotent — creates the agent
// once and stores CHAPLIN_ELEVENLABS_AGENT_ID in .env.local; re-run to update
// the prompt/tools in place.
import nextEnv from "@next/env";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { loadEnvConfig } = nextEnv;
loadEnvConfig(projectDir);

const apiKey = process.env.CHAPLIN_ELEVENLABS_API_KEY ?? process.env.ELEVEN_LABS_API_KEY_NEW ?? process.env.ELEVENLABS_API_KEY_NEW ?? process.env.ELEVEN_LABS_API_KEY_2 ?? process.env.ELEVENLABS_API_KEY_2 ?? process.env.ELEVEN_LABS_API_KEY_V2 ?? process.env.ELEVENLABS_API_KEY_V2 ?? process.env.ELEVEN_LABS_API_KEY ?? process.env.ELEVENLABS_API_KEY;
if (!apiKey) throw new Error("ELEVEN_LABS_API_KEY is missing from .env.local");

const SYSTEM_PROMPT = `You are the Chaplin Concierge — the first voice creators and brands hear inside Chaplin, a casting marketplace for AI actors. Users build original AI actors (locked face, voice, signature sound, production bible), then cast them into videos, ads, reels, and series.

Your job: understand what the user wants to make in as few turns as possible, then CALL A TOOL to build it in front of them. You are warm, fast, and confident — a creative producer, not a form. One or two sentences per reply, never lists, never emoji.

Content tiers (mention briefly when relevant): a new actor automatically gets a 5-second Spark audition and can earn a 15-second Punch personality reel; stories run as 60-second Episodes with a mandatory cliffhanger; brand Spots are 30-60 second ads.

Rules:
- If they describe a person or personality, that's a character. Extract the name only if they said one — never invent names. Compose a vivid 1-3 sentence brief in "You are …" canon form from what they said, pick 1-3 archetypes from: villain, mentor, love-interest, comic-relief, hero, superhero, horror, rebel, sidekick, outsider. Then call create_character.
- If they describe a story, video, ad, or reel idea, distill a one-line brief and call create_video with the right format (story, ad, or reel).
- Ask at most ONE clarifying question, and only when you genuinely cannot act. Otherwise act.
- Announce what you're doing as you do it ("Casting her now — watch the builder fill in").
- Guardrails: never imitate real celebrities or copyrighted characters — steer to an original identity instead. Keep briefs brand-safe: no explicit content, no real-person likeness. Refuse politely and redirect if asked for anything outside creating on Chaplin.`;

const CLIENT_TOOLS = [
  {
    type: "client",
    name: "create_character",
    description: "Open Chaplin's actor builder with the extracted identity and start the full Magic Character build immediately. Call as soon as you have a brief; name and archetypes are optional extras.",
    expects_response: true,
    response_timeout_secs: 10,
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "The actor's name exactly as the user said it, or empty if they didn't give one" },
        brief: { type: "string", description: "1-3 sentence canon brief in 'You are …' form composed from the user's description" },
        archetypes: { type: "string", description: "Comma-separated list of 1-3 archetypes from the allowed set, dominant first" },
      },
      required: ["brief"],
    },
  },
  {
    type: "client",
    name: "create_video",
    description: "Open Chaplin's writing room with the brief and start the Magic draft immediately. format is story for narrative videos and episodes, ad for brand spots, reel for short vertical content.",
    expects_response: true,
    response_timeout_secs: 10,
    parameters: {
      type: "object",
      properties: {
        format: { type: "string", description: "One of: story, ad, reel" },
        brief: { type: "string", description: "One-line distilled creative brief" },
      },
      required: ["format", "brief"],
    },
  },
  {
    type: "client",
    name: "open_page",
    description: "Navigate the user somewhere in Chaplin when they just want to look around. path is one of: /characters (browse actors), /feed (creator feed), /series (watch), /series/new (build a series pilot).",
    expects_response: false,
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "The app path to open" },
      },
      required: ["path"],
    },
  },
];

const agentBody = {
  name: "Chaplin Concierge",
  conversation_config: {
    agent: {
      first_message: "What are we creating today?",
      language: "en",
      prompt: {
        prompt: SYSTEM_PROMPT,
        llm: "gemini-2.5-flash",
        tools: CLIENT_TOOLS,
      },
    },
    tts: {
      // ElevenLabs requires the English-only Agent path to use Flash v2.
      // The popup's direct TTS reply path uses multilingual Flash v2.5.
      model_id: "eleven_flash_v2",
      voice_id: "xMagNCpMgZ83QOEsHNre",
      stability: 0.42,
      similarity_boost: 0.82,
      speed: 0.98,
    },
  },
};

const envPath = path.join(projectDir, ".env.local");
const envSource = await readFile(envPath, "utf8");
const existingId = envSource.match(/^CHAPLIN_ELEVENLABS_AGENT_ID=(.+)$/m)?.[1]?.trim();

if (existingId) {
  const response = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${existingId}`, {
    method: "PATCH",
    headers: { "xi-api-key": apiKey, "content-type": "application/json" },
    body: JSON.stringify(agentBody),
  });
  if (!response.ok) throw new Error(`Update agent failed (${response.status}): ${(await response.text()).slice(0, 400)}`);
  console.log(`Updated Chaplin Concierge agent ${existingId} (prompt + tools synced).`);
} else {
  const response = await fetch("https://api.elevenlabs.io/v1/convai/agents/create", {
    method: "POST",
    headers: { "xi-api-key": apiKey, "content-type": "application/json" },
    body: JSON.stringify(agentBody),
  });
  if (!response.ok) throw new Error(`Create agent failed (${response.status}): ${(await response.text()).slice(0, 400)}`);
  const data = await response.json();
  const agentId = data.agent_id;
  if (!agentId) throw new Error(`No agent_id in response: ${JSON.stringify(data).slice(0, 300)}`);
  await writeFile(envPath, `${envSource.replace(/\n?$/, "\n")}CHAPLIN_ELEVENLABS_AGENT_ID=${agentId}\n`);
  console.log(`Created Chaplin Concierge agent ${agentId} and saved CHAPLIN_ELEVENLABS_AGENT_ID to .env.local.`);
}
