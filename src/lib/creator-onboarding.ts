export const CREATOR_ONBOARDING_VERSION = 1;
export const CREATOR_ONBOARDING_EVENT = "chaplin:onboarding:replay";
export const CREATOR_ONBOARDING_FRESH_ACCOUNT_DAYS = 30;

export type CreatorOnboardingStatus = "complete" | `step:${number}` | null;

export function creatorOnboardingStorageKey(userId: string) {
  return `chaplin:creator-onboarding:v${CREATOR_ONBOARDING_VERSION}:${userId}`;
}

export function parseCreatorOnboardingStatus(value: string | null): CreatorOnboardingStatus {
  if (value === "complete") return value;
  if (value && /^step:\d+$/.test(value)) return value as `step:${number}`;
  return null;
}

export function resumableCreatorOnboardingStep(status: CreatorOnboardingStatus, lastStep: number) {
  if (!status?.startsWith("step:")) return null;
  const parsed = Math.max(0, Math.min(Number(status.slice(5)) || 0, lastStep));
  return parsed === 1 ? 0 : parsed;
}

export function creatorOnboardingResumePath(step: number, pathname: string) {
  return step >= 2 && pathname !== "/characters/new" ? "/characters/new" : null;
}
export function isFreshCreatorAccount(
  createdAt: string | undefined,
  now = Date.now(),
  freshDays = CREATOR_ONBOARDING_FRESH_ACCOUNT_DAYS,
) {
  if (!createdAt) return false;
  const created = Date.parse(createdAt);
  if (!Number.isFinite(created)) return false;
  const age = now - created;
  return age >= 0 && age <= freshDays * 24 * 60 * 60 * 1000;
}

export function shouldAutoStartCreatorOnboarding(input: {
  role: "creator" | "admin";
  createdAt?: string;
  storedStatus: CreatorOnboardingStatus;
  pathname: string;
  now?: number;
}) {
  if (input.role !== "creator") return false;
  if (input.storedStatus !== null) return false;
  if (input.pathname === "/auth" || input.pathname.startsWith("/super-admin") || input.pathname.startsWith("/admin")) return false;
  return isFreshCreatorAccount(input.createdAt, input.now);
}