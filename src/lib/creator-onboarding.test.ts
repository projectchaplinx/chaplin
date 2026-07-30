import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  creatorOnboardingStorageKey,
  isFreshCreatorAccount,
  parseCreatorOnboardingStatus,
  resumableCreatorOnboardingStep,
  creatorOnboardingResumePath,
  shouldAutoStartCreatorOnboarding,
} from "./creator-onboarding";

const NOW = Date.parse("2026-07-30T12:00:00.000Z");

test("onboarding state is isolated per signed-in creator", () => {
  assert.equal(creatorOnboardingStorageKey("creator-a"), "chaplin:creator-onboarding:v1:creator-a");
  assert.notEqual(creatorOnboardingStorageKey("creator-a"), creatorOnboardingStorageKey("creator-b"));
});

test("only recognized progress values are restored", () => {
  assert.equal(parseCreatorOnboardingStatus("complete"), "complete");
  assert.equal(parseCreatorOnboardingStatus("step:4"), "step:4");
  assert.equal(parseCreatorOnboardingStatus("4"), null);
  assert.equal(parseCreatorOnboardingStatus("step:wat"), null);
});

test("interrupted tours resume at a reachable control", () => {
  assert.equal(resumableCreatorOnboardingStep("step:1", 6), 0);
  assert.equal(resumableCreatorOnboardingStep("step:4", 6), 4);
  assert.equal(resumableCreatorOnboardingStep("step:99", 6), 6);
  assert.equal(resumableCreatorOnboardingStep("complete", 6), null);
  assert.equal(creatorOnboardingResumePath(4, "/feed"), "/characters/new");
  assert.equal(creatorOnboardingResumePath(4, "/characters/new"), null);
});

test("fresh-account detection has an explicit bounded window", () => {
  assert.equal(isFreshCreatorAccount("2026-07-29T12:00:00.000Z", NOW), true);
  assert.equal(isFreshCreatorAccount("2026-05-01T12:00:00.000Z", NOW), false);
  assert.equal(isFreshCreatorAccount("not-a-date", NOW), false);
});

test("first-login tour is creator-only, once-only, and excluded from private auth surfaces", () => {
  const base = {
    role: "creator" as const,
    createdAt: "2026-07-29T12:00:00.000Z",
    storedStatus: null,
    pathname: "/feed",
    now: NOW,
  };
  assert.equal(shouldAutoStartCreatorOnboarding(base), true);
  assert.equal(shouldAutoStartCreatorOnboarding({ ...base, storedStatus: "complete" }), false);
  assert.equal(shouldAutoStartCreatorOnboarding({ ...base, role: "admin" }), false);
  assert.equal(shouldAutoStartCreatorOnboarding({ ...base, pathname: "/auth" }), false);
  assert.equal(shouldAutoStartCreatorOnboarding({ ...base, pathname: "/super-admin" }), false);
});
test("every guided step is wired to a real desktop and mobile product control", () => {
  const root = process.cwd();
  const bottomNav = readFileSync(join(root, "src/components/BottomNav.tsx"), "utf8");
  const concierge = readFileSync(join(root, "src/components/ConciergeOrb.tsx"), "utf8");
  const actorBuilder = readFileSync(join(root, "src/app/characters/new/page.tsx"), "utf8");
  const header = readFileSync(join(root, "src/components/Header.tsx"), "utf8");

  assert.match(bottomNav, /data-create-toggle/);
  assert.match(concierge, /data-create-choice=\{option\.kind\}/);
  assert.match(concierge, /kind:\s*"actor"|option\.kind/);
  assert.equal(actorBuilder.match(/data-character-format-options/g)?.length, 2);
  assert.equal(actorBuilder.match(/data-character-field="brief"/g)?.length, 2);
  assert.equal(actorBuilder.match(/data-character-field="name"/g)?.length, 2);
  assert.equal(actorBuilder.match(/data-character-archetypes/g)?.length, 2);
  assert.equal(actorBuilder.match(/data-create-actor-submit/g)?.length, 3);
  assert.match(header, /data-onboarding-replay/);
});
