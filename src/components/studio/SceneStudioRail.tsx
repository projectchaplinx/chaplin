"use client";

import type { Character } from "@/lib/types";

export type SceneStage = {
  id: 1 | 2 | 3;
  label: string;
  hint: string;
  state: "done" | "active" | "todo";
  detail: string;
};

/**
 * Left rail of the Scene Studio. Mirrors the Create Character panel: the whole
 * job is visible at once, with each stage carrying its own live status instead
 * of being discovered by scrolling.
 */
export default function SceneStudioRail({
  stages,
  step,
  onSelect,
  cast,
  formatLabel,
  durationSeconds,
  sceneCount,
  framesReady,
  actionLabel,
  onStartProduction,
  blockedReason,
  starting,
  productionMode = false,
}: {
  stages: SceneStage[];
  step: 1 | 2 | 3;
  onSelect: (step: 1 | 2 | 3) => void;
  cast: Character[];
  formatLabel: string;
  durationSeconds: number;
  sceneCount: number;
  framesReady: number;
  actionLabel: string;
  onStartProduction: () => void;
  blockedReason?: string;
  starting?: boolean;
  productionMode?: boolean;
}) {
  const complete = stages.filter((stage) => stage.state === "done").length;

  return (
    <aside className="studio-production-rail flex flex-col gap-3 border-r border-line/70 p-3" data-scene-studio-rail>
      <div className="rounded-xl border border-line/70 bg-black/25 p-3">
        <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-accent">Scene studio</p>
        <p className="reel-title mt-1 text-lg leading-tight">{formatLabel}</p>
        <p className="mt-1 text-[10px] text-grey">
          {durationSeconds}s · {sceneCount} {sceneCount === 1 ? "scene" : "scenes"}
        </p>
        <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-500"
            style={{ width: `${(complete / stages.length) * 100}%` }}
          />
        </div>
        <p className="mt-1.5 text-[9px] text-grey">{complete} of {stages.length} locked</p>
      </div>

      <nav className="flex flex-col gap-1.5" aria-label="Scene studio stages">
        {stages.map((stage) => {
          const active = stage.id === step;
          return (
            <button
              key={stage.id}
              type="button"
              onClick={() => onSelect(stage.id)}
              aria-current={active ? "step" : undefined}
              className={`rounded-xl border p-3 text-left transition-colors ${
                active
                  ? "border-accent/60 bg-accent/10"
                  : "border-line/70 bg-black/15 hover:border-accent/35"
              }`}
            >
              <span className="flex items-center gap-2">
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${
                    stage.state === "done"
                      ? "bg-emerald-400/20 text-emerald-300"
                      : active
                        ? "bg-accent text-paper"
                        : "bg-white/10 text-grey"
                  }`}
                >
                  {stage.state === "done" ? "✓" : stage.id}
                </span>
                <span className="text-[12px] font-semibold text-ink">{stage.label}</span>
              </span>
              <span className="mt-1.5 block text-[10px] leading-4 text-grey">{stage.hint}</span>
              <span className={`mt-1 block text-[9.5px] font-semibold ${stage.state === "done" ? "text-emerald-400" : "text-grey"}`}>
                {stage.detail}
              </span>
            </button>
          );
        })}
      </nav>

      <div className="rounded-xl border border-line/70 bg-black/15 p-3">
        <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-grey">Locked cast</p>
        {cast.length ? (
          <ul className="mt-2 flex flex-col gap-1.5">
            {cast.map((character) => (
              <li key={character.id} className="flex items-center gap-2">
                <span
                  className="h-5 w-5 shrink-0 rounded-full border border-white/15"
                  style={{ background: `hsl(${character.avatarHue} 45% 30%)` }}
                />
                <span className="min-w-0 truncate text-[11px] text-ink">{character.name}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1.5 text-[10px] text-grey">No actors cast yet.</p>
        )}
      </div>

      <div className="rounded-xl border border-line/70 bg-black/15 p-3">
        <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-grey">Frames</p>
        <p className="mt-1 text-[15px] font-semibold text-ink">
          {framesReady}<span className="text-[11px] text-grey"> / {sceneCount}</span>
        </p>
        <p className="mt-0.5 text-[9.5px] text-grey">first frames rendered</p>
      </div>

      {/*
        The only way to start a production used to be a button below every scene
        card at the foot of step 3, which in this canvas is its own scroller: with
        four scenes authored the rail read "3 of 3 locked" while the action sat
        thousands of pixels out of view. The rail owns the readiness state, so it
        owns the action too, pinned where the readiness is read.
      */}
      {/*
        `mt-auto` belongs on the action, not on Frames. With it on the Frames
        card, Frames was pushed to the bottom of the content box and this block
        rendered past the scrollport - the CTA was pinned somewhere nobody could
        see, which is the bug it was added to fix.
      */}
      <div className="sticky bottom-0 mt-auto -mx-3 border-t border-line/70 bg-[#070a08]/95 px-3 pb-3 pt-3 backdrop-blur">
        {productionMode ? (
          <div className="rounded-lg border border-accent/40 bg-accent/[0.08] px-3 py-2.5" aria-live="polite">
            <p className="flex items-center gap-2 text-[11px] font-semibold text-ink">
              <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
              Production is in this Studio
            </p>
            <p className="mt-1 text-[9.5px] leading-4 text-grey">
              Frames, motion, master, and approval update in the center canvas.
            </p>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={onStartProduction}
              disabled={starting}
              className={`w-full rounded-lg px-3 py-2.5 text-[12px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                blockedReason
                  ? "border border-line/70 bg-white/[0.04] text-grey hover:border-accent/40 hover:text-ink"
                  : "bg-accent text-paper hover:bg-accent-light"
              }`}
            >
              {starting ? "Starting…" : `${actionLabel} →`}
            </button>
            <p className="mt-1.5 text-center text-[9.5px] leading-4 text-grey">
              {blockedReason ?? `${sceneCount} ${sceneCount === 1 ? "scene" : "scenes"} · ${durationSeconds}s master`}
            </p>
          </>
        )}
      </div>
    </aside>
  );
}
