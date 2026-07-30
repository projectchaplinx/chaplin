import "server-only";

import { createClient, type Session, type User } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";
import { ensureWelcomeCredits } from "@/lib/server/credits";
import { assertMutationOrigin, RequestSecurityError } from "@/lib/server/request-security";
import { CHAPLIN_BRAND_AVATAR, userAvatarUrl } from "@/lib/user-avatars";

export type AccountRole = "creator" | "admin";

export type AuthIdentity = {
  id: string;
  email: string;
  name: string;
  role: AccountRole;
  imageUrl: string;
  creditBalance: number | null;
  createdAt: string;
};

export const ACCESS_COOKIE = "chaplin-access-token";
export const REFRESH_COOKIE = "chaplin-refresh-token";

export function getSupabaseAuthClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase Auth needs SUPABASE_URL and SUPABASE_ANON_KEY in .env.local.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function roleBadges(role: AccountRole) {
  if (role === "admin") return ["admin"];
  return ["maker"];
}

function requestedRole(user: User): AccountRole {
  // user_metadata is writable by the signed-in Supabase user and must never be
  // treated as an authorization source. Admin is granted only by the
  // deployment's private allow-list value.
  const superAdminEmail = (process.env.SUPER_ADMIN_EMAIL ?? "").trim().toLowerCase();
  if (superAdminEmail && user.email?.toLowerCase() === superAdminEmail) return "admin";
  return "creator";
}

export async function ensureAuthProfile(user: User): Promise<AuthIdentity> {
  if (!user.email) throw new Error("The authenticated account has no email address.");
  const admin = getSupabaseAdminClient();
  const role = requestedRole(user);
  const name = role === "admin"
    ? "Chaplin"
    : String(user.user_metadata?.display_name ?? user.email.split("@")[0] ?? "Chaplin Creator").trim().slice(0, 80);
  const handleBase = user.email.split("@")[0].replace(/[^a-zA-Z0-9_]/g, "").toLowerCase() || "creator";
  const handle = role === "admin" ? "@chaplin" : `@${handleBase}_${user.id.slice(0, 4)}`;
  const existingUser = await admin
    .from("users")
    .select("image_url")
    .eq("id", user.id)
    .maybeSingle();
  if (existingUser.error) throw new Error(`Load creator avatar: ${existingUser.error.message}`);
  const imageUrl = role === "admin"
    ? CHAPLIN_BRAND_AVATAR
    : existingUser.data?.image_url || userAvatarUrl(user.id);

  const profileResult = await admin.from("user_profiles").upsert({
    user_id: user.id,
    email: user.email,
    display_name: name,
    account_role: role,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  if (profileResult.error) throw new Error(`Save authenticated profile: ${profileResult.error.message}`);

  const userResult = await admin.from("users").upsert({
    id: user.id,
    name,
    handle,
    role_badges: roleBadges(role),
    avatar_initial: name.slice(0, 1).toUpperCase(),
    avatar_hue: role === "admin" ? 165 : 202,
    image_url: imageUrl,
    updated_at: new Date().toISOString(),
  }, { onConflict: "id" });
  if (userResult.error) throw new Error(`Save authenticated creator: ${userResult.error.message}`);

  const creditBalance = role === "creator" ? await ensureWelcomeCredits(user.id) : null;
  return { id: user.id, email: user.email, name, role, imageUrl, creditBalance, createdAt: user.created_at };
}

export async function identityFromAccessToken(accessToken: string) {
  const result = await getSupabaseAuthClient().auth.getUser(accessToken);
  if (result.error || !result.data.user) return null;
  return ensureAuthProfile(result.data.user);
}

export async function requireRequestIdentity(request: NextRequest | Request) {
  assertMutationOrigin(request);
  const requestWithCookies = request as NextRequest;
  const cookieToken = typeof requestWithCookies.cookies?.get === "function"
    ? requestWithCookies.cookies.get(ACCESS_COOKIE)?.value
    : undefined;
  const bearerToken = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  const accessToken = cookieToken ?? bearerToken;
  const identity = accessToken ? await identityFromAccessToken(accessToken) : null;
  if (!identity) throw new Error("Sign in to continue.");
  return identity;
}

export async function requireAdminIdentity(request: NextRequest | Request) {
  const identity = await requireRequestIdentity(request);
  if (identity.role !== "admin") {
    throw new RequestSecurityError("Super Admin access is required.", 403, "FORBIDDEN");
  }
  return identity;
}

export async function requireOwnedCharacter(identity: AuthIdentity, characterId: string) {
  const cleanId = characterId.trim();
  if (!cleanId) {
    throw new RequestSecurityError("Choose an AI actor.", 400, "INVALID_CHARACTER");
  }
  if (identity.role === "admin") return;
  const result = await getSupabaseAdminClient()
    .from("characters")
    .select("maker_id")
    .eq("id", cleanId)
    .maybeSingle();
  if (result.error) throw new Error(`Check AI actor ownership: ${result.error.message}`);
  if (!result.data || result.data.maker_id !== identity.id) {
    throw new RequestSecurityError(
      "This AI actor does not belong to your studio.",
      404,
      "CHARACTER_NOT_FOUND",
    );
  }
}

export async function requireOwnedScope(
  identity: AuthIdentity,
  scopeType: "actor" | "shot" | "episode" | "spot" | "brief",
  scopeId: string,
) {
  if (identity.role === "admin") return;
  const admin = getSupabaseAdminClient();
  if (scopeType === "actor") {
    await requireOwnedCharacter(identity, scopeId);
    return;
  }
  if (scopeType === "spot" || scopeType === "episode") {
    const story = await admin.from("stories").select("author_id").eq("id", scopeId).maybeSingle();
    if (story.error) throw new Error(`Check production ownership: ${story.error.message}`);
    if (story.data?.author_id === identity.id) return;
    if (scopeType === "spot") {
      throw new RequestSecurityError("This production does not belong to your studio.", 404, "SCOPE_NOT_FOUND");
    }
    const episode = await admin.from("episodes").select("series_id").eq("id", scopeId).maybeSingle();
    if (episode.error) throw new Error(`Check episode ownership: ${episode.error.message}`);
    if (episode.data) {
      const series = await admin.from("series").select("owner_id").eq("id", episode.data.series_id).maybeSingle();
      if (series.error) throw new Error(`Check series ownership: ${series.error.message}`);
      if (series.data?.owner_id === identity.id) return;
    }
  }
  if (scopeType === "shot") {
    const shot = await admin.from("episode_shots").select("episode_id").eq("id", scopeId).maybeSingle();
    if (shot.error) throw new Error(`Check shot ownership: ${shot.error.message}`);
    if (shot.data) {
      await requireOwnedScope(identity, "episode", shot.data.episode_id);
      return;
    }
  }
  if (scopeType === "brief") {
    const brief = await admin.from("video_briefs").select("owner_id").eq("id", scopeId).maybeSingle();
    if (brief.error) throw new Error(`Check brief ownership: ${brief.error.message}`);
    if (brief.data?.owner_id === identity.id) return;
  }
  throw new RequestSecurityError("This production does not belong to your studio.", 404, "SCOPE_NOT_FOUND");
}

export async function requireOwnedPipelineRun(identity: AuthIdentity, runId: string) {
  if (identity.role === "admin") return;
  const result = await getSupabaseAdminClient()
    .from("media_pipeline_runs")
    .select("created_by,scope_type,scope_id")
    .eq("id", runId)
    .maybeSingle();
  if (result.error) throw new Error(`Check pipeline ownership: ${result.error.message}`);
  if (!result.data) {
    throw new RequestSecurityError("Media pipeline not found.", 404, "PIPELINE_NOT_FOUND");
  }
  if (result.data.created_by === identity.id) return;
  await requireOwnedScope(
    identity,
    result.data.scope_type as "actor" | "shot" | "episode" | "spot" | "brief",
    result.data.scope_id,
  );
}

export async function getServerAuthIdentity() {
  const accessToken = (await cookies()).get(ACCESS_COOKIE)?.value;
  return accessToken ? identityFromAccessToken(accessToken) : null;
}

export async function refreshAuthSession(refreshToken: string): Promise<{ session: Session; identity: AuthIdentity } | null> {
  const result = await getSupabaseAuthClient().auth.refreshSession({ refresh_token: refreshToken });
  if (result.error || !result.data.session || !result.data.user) return null;
  return { session: result.data.session, identity: await ensureAuthProfile(result.data.user) };
}
