import type { NextRequest } from "next/server";
import { requireRequestIdentity } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export type ProviderStatus = {
  id: string;
  label: string;
  purpose: string;
  configured: boolean;
  reachable: boolean | null;
  /** Human-readable quota, only when the provider actually reports one. */
  quota: string | null;
  /** 0-1 when a real usage ratio is known, otherwise null. Never estimated. */
  usedRatio: number | null;
  detail: string;
};

const TIMEOUT_MS = 8000;

async function probe(url: string, headers: Record<string, string>) {
  try {
    const response = await fetch(url, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = await response.json().catch(() => null) as Record<string, unknown> | null;
    return { ok: response.ok, status: response.status, body };
  } catch (error) {
    return { ok: false, status: 0, body: null, error: error instanceof Error ? error.message : "unreachable" };
  }
}

/**
 * Live provider readiness for the admin dashboard.
 *
 * Deliberately reports only what each provider actually exposes. ElevenLabs
 * publishes a character quota, so that is shown as a real number; OpenAI,
 * BytePlus and Replicate expose no balance endpoint, so those are
 * reported as reachable or not rather than given an invented figure. A missing
 * key is distinguished from a rejected key, because they need different fixes.
 */
async function elevenLabs(): Promise<ProviderStatus> {
  const key = process.env.ELEVENLABS_API_KEY ?? process.env.ELEVEN_LABS_API_KEY;
  const base: ProviderStatus = {
    id: "elevenlabs", label: "ElevenLabs", purpose: "Voice, dialogue, SFX, theme",
    configured: Boolean(key), reachable: null, quota: null, usedRatio: null,
    detail: key ? "" : "No API key configured.",
  };
  if (!key) return base;
  const result = await probe("https://api.elevenlabs.io/v1/user/subscription", { "xi-api-key": key });
  if (!result.ok) {
    return { ...base, reachable: false, detail: result.status === 401 ? "Key rejected (401)." : `Unreachable (${result.status || "network"}).` };
  }
  const used = Number(result.body?.character_count ?? NaN);
  const limit = Number(result.body?.character_limit ?? NaN);
  const tier = typeof result.body?.tier === "string" ? result.body.tier : "";
  if (Number.isFinite(used) && Number.isFinite(limit) && limit > 0) {
    return {
      ...base, reachable: true,
      quota: `${used.toLocaleString()} / ${limit.toLocaleString()} characters`,
      usedRatio: Math.min(1, used / limit),
      detail: tier ? `${tier} plan` : "Connected",
    };
  }
  return { ...base, reachable: true, detail: "Connected. No quota reported." };
}

async function openAi(): Promise<ProviderStatus> {
  const key = process.env.OPENAI_API_KEY;
  const base: ProviderStatus = {
    id: "openai", label: "OpenAI", purpose: "GPT-5.6 Terra writing, conversions, character rooms, and image generation",
    configured: Boolean(key), reachable: null, quota: null, usedRatio: null,
    detail: key ? "" : "No API key configured.",
  };
  if (!key) return base;
  const result = await probe("https://api.openai.com/v1/models", { Authorization: `Bearer ${key}` });
  // OpenAI removed its balance endpoint, so reachability is all that is knowable.
  return {
    ...base, reachable: result.ok,
    detail: result.ok ? "Connected. No balance endpoint published." : result.status === 401 ? "Key rejected (401)." : `Unreachable (${result.status || "network"}).`,
  };
}

async function replicate(): Promise<ProviderStatus> {
  const key = process.env.REPLICATE_API_KEY ?? process.env.REPLICATE_API_TOKEN;
  const base: ProviderStatus = {
    id: "replicate", label: "Replicate", purpose: "Open-weights video fallback",
    configured: Boolean(key), reachable: null, quota: null, usedRatio: null,
    detail: key ? "" : "No API key configured.",
  };
  if (!key) return base;
  const result = await probe("https://api.replicate.com/v1/account", { Authorization: `Bearer ${key}` });
  const username = typeof result.body?.username === "string" ? result.body.username : "";
  return {
    ...base, reachable: result.ok,
    detail: result.ok
      // Replicate reports no balance; insufficient credit only shows as a 402 at prediction time.
      ? `Connected as ${username || "account"}. Credit is only visible when a prediction runs.`
      : result.status === 401 ? "Key rejected (401)." : `Unreachable (${result.status || "network"}).`,
  };
}

function bytePlus(): ProviderStatus {
  const key = process.env.SEEDANCE_API_KEY ?? process.env.SEEDREAM_API_KEY;
  return {
    id: "byteplus", label: "BytePlus ModelArk", purpose: "Seedream stills, Seedance video",
    configured: Boolean(key), reachable: null, quota: null, usedRatio: null,
    // ModelArk has no unauthenticated health or balance endpoint worth probing,
    // and a probe would cost a generation, so configuration is all that is checked.
    detail: key ? "Key present. No health endpoint; failures surface in the job log." : "No API key configured.",
  };
}

function openRouter(): ProviderStatus {
  const key = process.env.OPENROUTER_API_KEY;
  return {
    id: "openrouter", label: "OpenRouter", purpose: "Image fallback",
    configured: Boolean(key), reachable: null, quota: null, usedRatio: null,
    detail: key ? "Key present." : "No API key configured.",
  };
}

export async function GET(request: NextRequest) {
  try {
    // Handled separately so a signed-out caller gets 401 rather than a 500:
    // requireRequestIdentity throws a plain "Sign in to continue." Error.
    const identity = await requireRequestIdentity(request).catch(() => null);
    if (!identity) {
      return Response.json({ error: "Sign in as Super Admin to view provider status." }, { status: 401 });
    }
    if (identity.role !== "admin") {
      return Response.json({ error: "Super Admin access is required." }, { status: 403 });
    }
    const [voice, writingAndImage, video] = await Promise.all([
      elevenLabs(), openAi(), replicate(),
    ]);
    const providers: ProviderStatus[] = [writingAndImage, voice, bytePlus(), video, openRouter()];
    return Response.json({
      providers,
      checkedAt: new Date().toISOString(),
      unconfigured: providers.filter((provider) => !provider.configured).map((provider) => provider.label),
      failing: providers.filter((provider) => provider.reachable === false).map((provider) => provider.label),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not read provider status.";
    return Response.json({ error: message }, { status: /admin|identity|auth/i.test(message) ? 403 : 500 });
  }
}
