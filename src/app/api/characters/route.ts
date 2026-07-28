import type { NextRequest } from "next/server";
import { getSupabaseAdminClient, listCharacters, persistCharacter } from "@/lib/server/supabase-admin";
import { parseCharacterCardV2 } from "@/lib/character-card";
import type { Archetype, Character, CharacterProductionBible, LicenseType, VoiceGender } from "@/lib/types";
import { requireRequestIdentity } from "@/lib/server/auth";
import { refundCreatorCredits, spendCreatorCredits } from "@/lib/server/credits";
import { CHARACTER_CREATION_CREDITS } from "@/lib/credits";
import {
  assertRequestBodySize,
  enforceRateLimit,
  securityErrorStatus,
} from "@/lib/server/request-security";

export const runtime = "nodejs";

const ARCHETYPES = new Set<Archetype>([
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
]);
const LICENSES = new Set<LicenseType>(["open", "paid", "approval"]);
const VOICE_GENDERS = new Set<VoiceGender>(["feminine", "masculine", "androgynous"]);

export async function GET() {
  try {
    const characters = await listCharacters();
    return Response.json(
      { characters },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not load AI actors." },
      { status: 500 }
    );
  }
}

function requiredString(value: unknown, field: string, max = 2000) {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new Error(`${field} is required.`);
  }
  return value.trim();
}

function parseCharacter(value: unknown): Character {
  if (!value || typeof value !== "object") throw new Error("AI actor data is required.");
  const input = value as Record<string, unknown>;
  const archetype = requiredString(input.archetype, "archetype", 50) as Archetype;
  const voiceGender = requiredString(input.voiceGender, "voiceGender", 30) as VoiceGender;
  const licenseType = requiredString(input.licenseType, "licenseType", 30) as LicenseType;
  if (!ARCHETYPES.has(archetype)) throw new Error("archetype is invalid.");
  if (!VOICE_GENDERS.has(voiceGender)) throw new Error("voiceGender is invalid.");
  if (!LICENSES.has(licenseType)) throw new Error("licenseType is invalid.");

  const number = (field: string, fallback = 0) => {
    const candidate = Number(input[field] ?? fallback);
    if (!Number.isFinite(candidate)) throw new Error(`${field} is invalid.`);
    return candidate;
  };
  const stats = input.stats && typeof input.stats === "object" ? input.stats as Record<string, unknown> : {};

  return {
    id: requiredString(input.id, "id", 100),
    makerId: requiredString(input.makerId, "makerId", 100),
    name: requiredString(input.name, "name", 120),
    archetype,
    tagline: requiredString(input.tagline, "tagline", 1000),
    personality: requiredString(input.personality, "personality", 8000),
    voiceGender,
    voiceDesc: requiredString(input.voiceDesc, "voiceDesc", 6000),
    voiceId: typeof input.voiceId === "string" ? input.voiceId : undefined,
    sfxDesc: requiredString(input.sfxDesc, "sfxDesc", 6000),
    themeDesc: requiredString(input.themeDesc, "themeDesc", 8000),
    productionBible: input.productionBible && typeof input.productionBible === "object"
      ? input.productionBible as CharacterProductionBible
      : undefined,
    cardV2: input.cardV2 && typeof input.cardV2 === "object"
      ? parseCharacterCardV2(input.cardV2)
      : undefined,
    cardVersion: input.cardV2 && typeof input.cardV2 === "object" ? 2 : undefined,
    brollLine: typeof input.brollLine === "string" ? input.brollLine : undefined,
    brollScene: typeof input.brollScene === "string" ? input.brollScene : undefined,
    avatarHue: number("avatarHue"),
    imageUrl: typeof input.imageUrl === "string" ? input.imageUrl : undefined,
    bannerUrl: typeof input.bannerUrl === "string" ? input.bannerUrl : undefined,
    videoUrl: typeof input.videoUrl === "string" ? input.videoUrl : undefined,
    galleryUrls: Array.isArray(input.galleryUrls) ? input.galleryUrls.filter((url): url is string => typeof url === "string") : undefined,
    licenseType,
    royaltyRate: number("royaltyRate"),
    createdAt: requiredString(input.createdAt, "createdAt", 100),
    stats: {
      castings: Number(stats.castings ?? 0),
      fans: Number(stats.fans ?? 0),
      earnings: Number(stats.earnings ?? 0),
      socialImpressions: Number(stats.socialImpressions ?? 0),
      socialViews: Number(stats.socialViews ?? 0),
      socialLikes: Number(stats.socialLikes ?? 0),
    },
  };
}

export async function POST(request: NextRequest) {
  try {
    assertRequestBodySize(request, 256 * 1024);
    const body = await request.json() as unknown;
    const identity = await requireRequestIdentity(request);
    const ensureOnly = Boolean(
      body && typeof body === "object" && (body as Record<string, unknown>).ensureOnly === true
    );
    const character = parseCharacter(
      {
        ...((ensureOnly ? (body as Record<string, unknown>).character : body) as Record<string, unknown>),
        makerId: identity.id,
      }
    );
    if (ensureOnly) {
      const existing = await getSupabaseAdminClient()
        .from("characters")
        .select("id,maker_id")
        .eq("id", character.id)
        .maybeSingle();
      if (existing.error) throw new Error(`Check AI actor: ${existing.error.message}`);
      if (existing.data) {
        if (identity.role !== "admin" && existing.data.maker_id !== identity.id) {
          return Response.json({ error: "This AI actor does not belong to your studio." }, { status: 404 });
        }
        return Response.json({
          character: { ...character, makerId: existing.data.maker_id ?? character.makerId },
        });
      }
    }
    if (identity.role !== "admin") {
      await enforceRateLimit({
        request,
        bucket: "character-create",
        limit: 6,
        windowSeconds: 24 * 60 * 60,
        identityId: identity.id,
      });
    }
    const idempotencyKey = `character:create:${character.id}`;
    const reservation = await spendCreatorCredits({
      userId: identity.id,
      amount: CHARACTER_CREATION_CREDITS,
      idempotencyKey,
      description: `Create actor: ${character.name}`,
      metadata: {
        actionCode: "actor.create",
        characterId: character.id,
        characterName: character.name,
      },
    });
    try {
      await persistCharacter(character);
    } catch (error) {
      if (reservation.applied) {
        await refundCreatorCredits({
          userId: identity.id,
          idempotencyKey,
          description: `Actor save failed: ${character.name}`,
        });
      }
      throw error;
    }
    return Response.json({ character, creditBalance: reservation.balance }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save AI actor.";
    return Response.json(
      { error: message },
      {
        status: securityErrorStatus(
          error,
          message === "Sign in to continue." ? 401 : message.includes("Not enough Chaplin credits") ? 402 : 400,
        ),
      }
    );
  }
}
