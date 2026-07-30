"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getClientAuthIdentity, type ClientAuthIdentity } from "@/lib/client-auth";
import {
  CREATOR_ONBOARDING_EVENT,
  creatorOnboardingStorageKey,
  parseCreatorOnboardingStatus,
  resumableCreatorOnboardingStep,
  creatorOnboardingResumePath,
  shouldAutoStartCreatorOnboarding,
} from "@/lib/creator-onboarding";

type TourStep = {
  selector: string;
  eyebrow: string;
  title: string;
  copy: string;
  instruction: string;
  advanceOnTargetClick?: boolean;
  requiresBrief?: boolean;
};

type SpotlightRect = { top: number; left: number; right: number; bottom: number; width: number; height: number };

const STEPS: TourStep[] = [
  {
    selector: "[data-create-toggle]",
    eyebrow: "Start here",
    title: "This is your Create button",
    copy: "The plus is the front door to every new actor and scene. Chaplin keeps it in the same place throughout the product.",
    instruction: "Click the highlighted + button.",
    advanceOnTargetClick: true,
  },
  {
    selector: '[data-create-choice="actor"]',
    eyebrow: "Choose what to make",
    title: "Build your first AI actor",
    copy: "Actor creation locks the identity, voice, behavior, sound, and production rules that future scenes will reuse.",
    instruction: "Click Build an AI actor.",
    advanceOnTargetClick: true,
  },
  {
    selector: "[data-character-format-options]",
    eyebrow: "Actor identity · 1 of 4",
    title: "Choose the visual medium",
    copy: "Pick how this actor should exist on screen. This changes the rendering medium, not the character idea.",
    instruction: "Choose one highlighted visual style.",
    advanceOnTargetClick: true,
  },
  {
    selector: '[data-character-field="brief"]',
    eyebrow: "Actor identity · 2 of 4",
    title: "Describe one strong idea",
    copy: "Write who this person is, what makes them specific, and the contradiction that makes them playable. Chaplin can expand it into editable details.",
    instruction: "Enter at least 20 characters, then continue.",
    requiresBrief: true,
  },
  {
    selector: '[data-character-field="name"]',
    eyebrow: "Actor identity · 3 of 4",
    title: "Everything remains editable",
    copy: "Name the actor yourself or let Magic suggest one. You can edit the promise, character engine, voice, sound, and world before creation.",
    instruction: "Review the highlighted identity field, then continue.",
  },
  {
    selector: "[data-character-archetypes]",
    eyebrow: "Actor identity · 4 of 4",
    title: "Choose the role they play",
    copy: "Archetype is a production signal, not a personality shortcut. It helps scenes understand how this actor creates pressure and change.",
    instruction: "Choose one highlighted role.",
    advanceOnTargetClick: true,
  },
  {
    selector: "[data-create-actor-submit]",
    eyebrow: "Ready when you are",
    title: "Create and enter the Actor Studio",
    copy: "When the required details are complete, this creates the actor for 25 credits and opens the Studio where the look, voice, Spark, and publishing steps continue.",
    instruction: "Finish this tour now. Create the actor whenever the button is ready.",
  },
];

function visibleTarget(selector: string) {
  return Array.from(document.querySelectorAll<HTMLElement>(selector)).find((element) => {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width > 1 && rect.height > 1 && style.display !== "none" && style.visibility !== "hidden";
  }) ?? null;
}

function spotlightRect(element: HTMLElement): SpotlightRect {
  const rect = element.getBoundingClientRect();
  const padding = 9;
  const top = Math.max(7, rect.top - padding);
  const left = Math.max(7, rect.left - padding);
  const right = Math.min(window.innerWidth - 7, rect.right + padding);
  const bottom = Math.min(window.innerHeight - 7, rect.bottom + padding);
  return { top, left, right, bottom, width: right - left, height: bottom - top };
}

export default function CreatorOnboarding() {
  const pathname = usePathname();
  const [identity, setIdentity] = useState<ClientAuthIdentity | null>(null);
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [rect, setRect] = useState<SpotlightRect | null>(null);
  const [briefReady, setBriefReady] = useState(false);
  const scrolledStepRef = useRef(-1);
  const step = STEPS[stepIndex];

  const storageKey = useMemo(
    () => identity ? creatorOnboardingStorageKey(identity.id) : null,
    [identity],
  );

  const finish = useCallback(() => {
    if (storageKey) window.localStorage.setItem(storageKey, "complete");
    setActive(false);
    setTarget(null);
    setRect(null);
  }, [storageKey]);

  const advance = useCallback(() => {
    const next = stepIndex + 1;
    if (next >= STEPS.length) {
      finish();
      return;
    }
    if (storageKey) window.localStorage.setItem(storageKey, `step:${next}`);
    scrolledStepRef.current = -1;
    setStepIndex(next);
    setBriefReady(false);
  }, [finish, stepIndex, storageKey]);

  useEffect(() => {
    let cancelled = false;
    void getClientAuthIdentity().then((nextIdentity) => {
      if (cancelled) return;
      setIdentity(nextIdentity);
      if (!nextIdentity || nextIdentity.role !== "creator") return;
      const key = creatorOnboardingStorageKey(nextIdentity.id);
      const storedStatus = parseCreatorOnboardingStatus(window.localStorage.getItem(key));
      const storedStep = resumableCreatorOnboardingStep(storedStatus, STEPS.length - 1);
      if (storedStep !== null) {
        // The create menu is ephemeral. If a reload happened while it was open,
        // restart at the plus instead of masking a button that no longer exists.
        if (storedStatus === "step:1") window.localStorage.setItem(key, "step:0");
        setStepIndex(storedStep);
        setActive(true);
        const resumePath = creatorOnboardingResumePath(storedStep, pathname);
        if (resumePath) window.location.assign(resumePath);
        return;
      }
      if (shouldAutoStartCreatorOnboarding({
        role: nextIdentity.role,
        createdAt: nextIdentity.createdAt,
        storedStatus,
        pathname,
      })) {
        window.localStorage.setItem(key, "step:0");
        setStepIndex(0);
        setActive(true);
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [pathname]);

  useEffect(() => {
    function replay() {
      void getClientAuthIdentity(true).then((nextIdentity) => {
        if (!nextIdentity || nextIdentity.role !== "creator") return;
        const key = creatorOnboardingStorageKey(nextIdentity.id);
        window.localStorage.setItem(key, "step:0");
        setIdentity(nextIdentity);
        setStepIndex(0);
        setBriefReady(false);
        scrolledStepRef.current = -1;
        setActive(true);
      }).catch(() => {});
    }
    window.addEventListener(CREATOR_ONBOARDING_EVENT, replay);
    return () => window.removeEventListener(CREATOR_ONBOARDING_EVENT, replay);
  }, []);

  useEffect(() => {
    if (!active || !step || pathname === "/auth" || pathname.startsWith("/super-admin") || pathname.startsWith("/admin")) return;
    let frame = 0;
    function update() {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const nextTarget = visibleTarget(step.selector);
        setTarget(nextTarget);
        setRect(nextTarget ? spotlightRect(nextTarget) : null);
        if (nextTarget && scrolledStepRef.current !== stepIndex) {
          scrolledStepRef.current = stepIndex;
          nextTarget.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
          window.setTimeout(() => setRect(spotlightRect(nextTarget)), 350);
        }
      });
    }
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [active, pathname, step, stepIndex]);

  useEffect(() => {
    if (!active || !step?.requiresBrief || !target) return;
    const input = target as HTMLTextAreaElement;
    const update = () => setBriefReady(input.value.trim().length >= 20);
    update();
    input.addEventListener("input", update);
    return () => input.removeEventListener("input", update);
  }, [active, step, target]);

  useEffect(() => {
    if (!active || !target) return;
    const selector = 'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const targetControls = [
      ...(target.matches(selector) ? [target] : []),
      ...Array.from(target.querySelectorAll<HTMLElement>(selector)),
    ];
    const card = document.querySelector<HTMLElement>("[data-onboarding-card]");
    const cardControls = card ? Array.from(card.querySelectorAll<HTMLElement>(selector)) : [];
    const controls = [...targetControls, ...cardControls];
    targetControls[0]?.focus({ preventScroll: true });

    function trapTab(event: KeyboardEvent) {
      if (event.key !== "Tab" || controls.length < 2) return;
      const current = controls.indexOf(document.activeElement as HTMLElement);
      const next = event.shiftKey
        ? current <= 0 ? controls.length - 1 : current - 1
        : current < 0 || current === controls.length - 1 ? 0 : current + 1;
      event.preventDefault();
      controls[next]?.focus({ preventScroll: true });
    }
    document.addEventListener("keydown", trapTab, true);
    return () => document.removeEventListener("keydown", trapTab, true);
  }, [active, target]);

  useEffect(() => {
    if (!active || !target || !step) return;
    const activeTarget = target;
    const activeStep = step;
    function captureClick(event: MouseEvent) {
      const clicked = event.target as Node | null;
      if (!clicked) return;
      const card = document.querySelector("[data-onboarding-card]");
      if (card?.contains(clicked)) return;
      if (activeTarget.contains(clicked)) {
        if (activeStep.advanceOnTargetClick) advance();
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    }
    document.addEventListener("click", captureClick, true);
    return () => document.removeEventListener("click", captureClick, true);
  }, [active, advance, step, target]);

  if (!active || !identity || !step || pathname === "/auth" || pathname.startsWith("/super-admin") || pathname.startsWith("/admin")) return null;

  const cardWidth = Math.min(370, window.innerWidth - 24);
  const estimatedCardHeight = 245;
  const cardLeft = rect
    ? Math.max(12, Math.min(window.innerWidth - cardWidth - 12, rect.left + rect.width / 2 - cardWidth / 2))
    : Math.max(12, (window.innerWidth - cardWidth) / 2);
  const cardTop = rect
    ? rect.bottom + estimatedCardHeight + 16 < window.innerHeight
      ? rect.bottom + 16
      : Math.max(12, rect.top - estimatedCardHeight - 16)
    : Math.max(90, window.innerHeight / 2 - estimatedCardHeight / 2);
  const canContinue = !step.requiresBrief || briefReady;

  return (
    <div className="pointer-events-none fixed inset-0 z-[200]" aria-live="polite" data-creator-onboarding>
      {rect ? (
        <>
          <div className="pointer-events-auto absolute inset-x-0 top-0 bg-black/82 backdrop-blur-[2px]" style={{ height: rect.top }} />
          <div className="pointer-events-auto absolute inset-x-0 bottom-0 bg-black/82 backdrop-blur-[2px]" style={{ top: rect.bottom }} />
          <div className="pointer-events-auto absolute left-0 bg-black/82 backdrop-blur-[2px]" style={{ top: rect.top, width: rect.left, height: rect.height }} />
          <div className="pointer-events-auto absolute right-0 bg-black/82 backdrop-blur-[2px]" style={{ top: rect.top, left: rect.right, height: rect.height }} />
          <div
            className="pointer-events-none fixed rounded-2xl border-2 border-accent shadow-[0_0_0_4px_rgba(242,78,112,0.16),0_0_42px_rgba(242,78,112,0.48)]"
            style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
          />
        </>
      ) : (
        <div className="pointer-events-auto absolute inset-0 bg-black/82 backdrop-blur-[2px]" />
      )}

      <section
        role="dialog"
        aria-labelledby="creator-onboarding-title"
        aria-describedby="creator-onboarding-description"
        data-onboarding-card
        className="pointer-events-auto fixed rounded-2xl border border-accent/45 bg-[#0a0e0c]/98 p-5 text-white shadow-[0_30px_100px_rgba(0,0,0,0.82)]"
        style={{ top: cardTop, left: cardLeft, width: cardWidth }}
      >
        <div className="flex items-center justify-between gap-4">
          <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-accent">{step.eyebrow}</p>
          <span className="font-mono text-[9px] text-white/45">{stepIndex + 1} / {STEPS.length}</span>
        </div>
        <h2 id="creator-onboarding-title" className="mt-2 text-xl font-semibold leading-tight">{step.title}</h2>
        <p id="creator-onboarding-description" className="mt-2 text-xs leading-5 text-white/65">{step.copy}</p>
        <p className="mt-3 rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-[11px] font-semibold text-white/85">
          {target ? step.instruction : "Opening the next highlighted control…"}
        </p>
        <div className="mt-4 flex items-center justify-between gap-3">
          <button type="button" onClick={finish} className="text-[10px] font-semibold text-white/45 hover:text-white">Not now</button>
          {!step.advanceOnTargetClick && (
            <button
              type="button"
              onClick={advance}
              disabled={!canContinue}
              className="rounded-full bg-accent px-5 py-2 text-[11px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-35"
            >
              {stepIndex === STEPS.length - 1 ? "Finish tour" : "Continue →"}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}