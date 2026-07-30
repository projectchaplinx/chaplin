"use client";

export type ClientAuthIdentity = {
  id: string;
  email: string;
  name: string;
  role: "creator" | "admin";
  imageUrl: string;
  creditBalance: number | null;
  createdAt: string;
};

let activeRequest: Promise<ClientAuthIdentity | null> | null = null;
let cachedIdentity: ClientAuthIdentity | null | undefined;
let resolvedAt = 0;

/**
 * All client surfaces share this request so an expired access token is
 * refreshed once. Without this, Header and Drafts can race the rotating
 * refresh token and briefly disagree about whether the creator is signed in.
 */
export function getClientAuthIdentity(force = false) {
  if (!force && cachedIdentity !== undefined && Date.now() - resolvedAt < 5_000) {
    return Promise.resolve(cachedIdentity);
  }
  if (activeRequest) return activeRequest;
  activeRequest = fetch("/api/auth", { cache: "no-store", credentials: "same-origin" })
    .then(async (response) => {
      const data = await response.json() as { identity?: ClientAuthIdentity | null; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not load the signed-in account.");
      cachedIdentity = data.identity ?? null;
      resolvedAt = Date.now();
      return cachedIdentity;
    })
    .finally(() => {
      activeRequest = null;
    });
  return activeRequest;
}

export function clearClientAuthIdentity() {
  cachedIdentity = null;
  resolvedAt = Date.now();
  activeRequest = null;
}
