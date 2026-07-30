"use client";

import { useMemo, useState } from "react";
import {
  buildDirectorDecisionDiagnostics,
  type DirectorDecisionTraceRecord,
} from "@/lib/director-decisions";

type GraphNode = {
  id: string;
  label: string;
  detail: string;
  x: number;
  y: number;
  active: (decision: DirectorDecisionTraceRecord | null) => boolean;
};

type GuidedShotExample = {
  decision: DirectorDecisionTraceRecord;
  shot: {
    label: string;
    title: string;
    storyJob: string;
    frame: string;
    camera: string;
    action: string;
    sound: string;
    world: string;
    continuity: string;
    handoff: string;
  };
};

const NODES: GraphNode[] = [
  { id: "sources", label: "Research corpus", detail: "Craft, history, public-domain scenes, provider tests", x: 20, y: 190, active: () => true },
  { id: "rights", label: "Rights gate", detail: "Provenance and analytical-only evidence", x: 190, y: 190, active: () => true },
  { id: "approval", label: "Human approval", detail: "Only reviewed principles can reach a production", x: 360, y: 190, active: (run) => Boolean(run) },
  { id: "retrieval", label: "Director retrieval", detail: "Signals rank rules for this exact brief", x: 530, y: 190, active: (run) => Boolean(run) },
  { id: "period", label: "World resolver", detail: "Time × place × role × material evidence", x: 530, y: 20, active: (run) => Boolean(run?.trace.periodProfileId) },
  { id: "attention", label: "Attention map", detail: "Every delivered second receives a story job", x: 530, y: 360, active: (run) => Boolean(run?.trace.attentionMap.length) },
  { id: "writing", label: "Magic Write", detail: "Original editable scene plan with trace attached", x: 720, y: 190, active: (run) => run?.runKind === "writing" || run?.runKind === "render" },
  { id: "render", label: "Render pipeline", detail: "Frames, motion, sound, assembly, continuity", x: 890, y: 190, active: (run) => run?.runKind === "render" },
  { id: "verdict", label: "Outcome + verdict", detail: "Success, failure, keeper/kill, changed variable", x: 1060, y: 190, active: (run) => run?.status === "succeeded" || run?.status === "failed" },
];

const EDGES = [
  ["sources", "rights"],
  ["rights", "approval"],
  ["approval", "retrieval"],
  ["retrieval", "writing"],
  ["period", "retrieval"],
  ["attention", "retrieval"],
  ["writing", "render"],
  ["render", "verdict"],
] as const;

function statusTone(status: DirectorDecisionTraceRecord["status"]) {
  if (status === "succeeded") return "border-emerald-400/40 text-emerald-200";
  if (status === "failed") return "border-red-400/40 text-red-200";
  if (status === "running") return "border-accent-secondary/50 text-accent-secondary";
  return "border-amber-300/35 text-amber-100";
}

function timeLabel(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function AdminDirectorGraph({
  decisions,
  storageReady,
  guidedExample,
}: {
  decisions: DirectorDecisionTraceRecord[];
  storageReady: boolean;
  guidedExample: GuidedShotExample;
}) {
  const [selectedId, setSelectedId] = useState(decisions[0]?.id ?? guidedExample.decision.id);
  const isGuided = selectedId === guidedExample.decision.id;
  const selected = isGuided
    ? guidedExample.decision
    : decisions.find((decision) => decision.id === selectedId) ?? decisions[0] ?? guidedExample.decision;
  const diagnostics = useMemo(() => buildDirectorDecisionDiagnostics(decisions), [decisions]);
  const nodeById = new Map(NODES.map((node) => [node.id, node]));

  return (
    <section className="mb-10" data-director-live-graph>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">Director Graph · live decisions</p>
          <h2 className="reel-title mt-1 text-3xl">See the brain think</h2>
          <p className="mt-2 max-w-3xl text-xs leading-5 text-grey">
            Read left to right: evidence enters, unsafe or unreviewed material stops, the brief selects only relevant craft and period rules, every second receives a job, and the same trace follows the plan into production and review. Choose a real run—or open the guided shot—to inspect each decision.
          </p>
        </div>
        {selected ? (
          <span className={`rounded-full border px-3 py-2 text-[9px] font-semibold uppercase tracking-[0.12em] ${statusTone(selected.status)}`}>
            {isGuided ? "guided example · original shot" : `${selected.runKind} · ${selected.status}`}
          </span>
        ) : null}
      </div>

      {!storageReady ? (
        <div className="mb-4 rounded-xl border border-amber-300/35 bg-amber-300/[0.06] p-4 text-xs text-amber-100">
          Apply <code>202607300002_director_decision_traces.sql</code> to activate the live graph ledger.
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="poster-card rounded-xl p-3">
          <div className="grid grid-cols-2 gap-2">
            {[
              ["Runs", diagnostics.total],
              ["Writing", diagnostics.writingRuns],
              ["Rendering", diagnostics.renderRuns],
              ["Succeeded", diagnostics.succeeded],
              ["Failed", diagnostics.failed],
              ["Live", diagnostics.active],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-white/10 p-2.5">
                <p className="text-lg font-semibold text-ink">{value}</p>
                <p className="text-[8px] uppercase tracking-[0.12em] text-grey">{label}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[9px] font-semibold uppercase tracking-[0.14em] text-grey">Recent decisions</p>
          <div className="mt-2 max-h-[430px] space-y-2 overflow-y-auto pr-1">
            <button
              type="button"
              onClick={() => setSelectedId(guidedExample.decision.id)}
              className={`w-full rounded-lg border p-3 text-left transition-colors ${
                isGuided ? "border-accent-secondary bg-accent-secondary/10" : "border-white/10 hover:border-white/25"
              }`}
            >
              <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-accent-secondary">Guided example</span>
              <span className="mt-1 block text-[10px] font-semibold leading-4 text-ink">How one 1966 suspense shot is understood</span>
              <span className="mt-1 block text-[8px] uppercase tracking-[0.1em] text-grey">Original · no provider cost</span>
            </button>
            {decisions.length ? decisions.map((decision) => (
              <button
                key={decision.id}
                type="button"
                onClick={() => setSelectedId(decision.id)}
                className={`w-full rounded-lg border p-3 text-left transition-colors ${
                  selected?.id === decision.id ? "border-accent bg-accent/10" : "border-white/10 hover:border-white/25"
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-accent-secondary">{decision.runKind}</span>
                  <span className="text-[8px] text-grey">{timeLabel(decision.createdAt)}</span>
                </span>
                <span className="mt-1 block line-clamp-2 text-[10px] leading-4 text-ink">{decision.briefExcerpt || `${decision.format} production`}</span>
                <span className="mt-1 block text-[8px] uppercase tracking-[0.1em] text-grey">{decision.status} · {decision.brainVersion}</span>
              </button>
            )) : (
              <p className="rounded-lg border border-dashed border-line p-4 text-[10px] leading-5 text-grey">
                The guided example is active because no real decision has run yet. Use Magic Write or initialize a production; its trace will appear here immediately without removing the example.
              </p>
            )}
          </div>
        </aside>

        <div className="min-w-0 space-y-4">
          <div className="poster-card overflow-x-auto rounded-xl p-4">
            <div className="relative h-[500px] min-w-[1240px]" aria-label="Director Brain execution graph">
              <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1240 500" role="presentation">
                <defs>
                  <marker id="director-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                    <path d="M0,0 L8,4 L0,8 Z" fill="rgba(54,224,205,.65)" />
                  </marker>
                </defs>
                {EDGES.map(([fromId, toId]) => {
                  const from = nodeById.get(fromId)!;
                  const to = nodeById.get(toId)!;
                  const fromActive = from.active(selected);
                  const toActive = to.active(selected);
                  const startX = from.x + 150;
                  const startY = from.y + 56;
                  const endX = to.x;
                  const endY = to.y + 56;
                  const middleX = (startX + endX) / 2;
                  return (
                    <path
                      key={`${fromId}-${toId}`}
                      d={`M ${startX} ${startY} C ${middleX} ${startY}, ${middleX} ${endY}, ${endX} ${endY}`}
                      fill="none"
                      stroke={fromActive && toActive ? "rgba(54,224,205,.7)" : "rgba(255,255,255,.12)"}
                      strokeWidth={fromActive && toActive ? 2.5 : 1.5}
                      strokeDasharray={fromActive && toActive ? undefined : "5 7"}
                      markerEnd="url(#director-arrow)"
                    />
                  );
                })}
              </svg>
              {NODES.map((node) => {
                const active = node.active(selected);
                const step = NODES.findIndex((item) => item.id === node.id) + 1;
                return (
                  <article
                    key={node.id}
                    className={`absolute w-[150px] rounded-xl border p-3 transition-all ${
                      active
                        ? "border-accent-secondary/60 bg-[#06201d] shadow-[0_0_24px_rgba(54,224,205,.12)]"
                        : "border-white/10 bg-black/25 opacity-55"
                    }`}
                    style={{ left: node.x, top: node.y }}
                    data-graph-node={node.id}
                    data-active={active}
                  >
                    <span className="mb-2 flex items-center justify-between">
                      <span className={`block h-2 w-2 rounded-full ${active ? "animate-pulse bg-accent-secondary" : "bg-white/20"}`} />
                      <span className="font-mono text-[8px] text-white/35">{String(step).padStart(2, "0")}</span>
                    </span>
                    <h3 className="text-xs font-semibold text-ink">{node.label}</h3>
                    <p className="mt-1 text-[9px] leading-4 text-grey">{node.detail}</p>
                  </article>
                );
              })}
            </div>
          </div>

          {isGuided ? (
            <article className="overflow-hidden rounded-xl border border-accent-secondary/35 bg-[linear-gradient(135deg,rgba(54,224,205,.08),rgba(5,8,7,.35)_42%,rgba(244,72,111,.07))]">
              <div className="grid lg:grid-cols-[310px_minmax(0,1fr)]">
                <div className="border-b border-line p-5 lg:border-b-0 lg:border-r">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-accent-secondary">One-shot walkthrough</p>
                  <p className="mt-2 text-[10px] uppercase tracking-[0.12em] text-grey">{guidedExample.shot.label}</p>
                  <h3 className="reel-title mt-1 text-3xl">{guidedExample.shot.title}</h3>
                  <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.12em] text-accent">Input brief</p>
                  <p className="mt-2 text-xs leading-6 text-ink">{guidedExample.decision.briefExcerpt}</p>
                  <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.12em] text-accent">What this shot must do</p>
                  <p className="mt-2 text-xs leading-6 text-grey">{guidedExample.shot.storyJob}</p>
                </div>
                <div className="p-5">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-grey">The brain converts meaning into production controls</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {[
                      ["Frame & geography", guidedExample.shot.frame],
                      ["Camera", guidedExample.shot.camera],
                      ["Performance & action", guidedExample.shot.action],
                      ["Diegetic sound", guidedExample.shot.sound],
                      ["1966 world evidence", guidedExample.shot.world],
                      ["Continuity out", guidedExample.shot.continuity],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-lg border border-white/10 bg-black/15 p-3">
                        <p className="text-[8px] font-semibold uppercase tracking-[0.12em] text-accent-secondary">{label}</p>
                        <p className="mt-1 text-[10px] leading-5 text-grey">{value}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 rounded-lg border border-accent/35 bg-accent/[0.05] p-3">
                    <p className="text-[8px] font-semibold uppercase tracking-[0.12em] text-accent">Exact handoff to the shot generator</p>
                    <p className="mt-2 font-mono text-[10px] leading-5 text-ink">{guidedExample.shot.handoff}</p>
                  </div>
                </div>
              </div>
            </article>
          ) : null}

          {selected ? (
            <div className="grid gap-3 lg:grid-cols-2">
              <article className="poster-card rounded-xl p-4">
                <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-accent-secondary">Why these rules fired</p>
                <h3 className="mt-1 text-lg font-semibold text-ink">{selected.format} · {selected.durationSeconds ?? "—"}s · {selected.sceneCount} scenes</h3>
                <ul className="mt-3 space-y-2 text-[10px] leading-5 text-grey">
                  {selected.trace.selectionReasons.map((reason) => <li key={reason}>→ {reason}</li>)}
                </ul>
                {selected.trace.warnings.length ? (
                  <div className="mt-3 rounded-lg border border-amber-300/30 bg-amber-300/[0.05] p-3 text-[10px] leading-5 text-amber-100">
                    {selected.trace.warnings.map((warning) => <p key={warning}>! {warning}</p>)}
                  </div>
                ) : null}
              </article>
              <article className="poster-card rounded-xl p-4">
                <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-accent-secondary">Exact retrieved knowledge</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {selected.trace.patternIds.map((id) => <span key={id} className="rounded-full border border-accent/30 px-2 py-1 text-[8px] text-accent">{id}</span>)}
                  {selected.trace.periodProfileId ? <span className="rounded-full border border-amber-300/30 px-2 py-1 text-[8px] text-amber-100">{selected.trace.periodProfileId}</span> : null}
                </div>
                <p className="mt-3 text-[10px] leading-5 text-grey">
                  Sources: {selected.trace.sourceIds.join(" · ") || "No source selected"}
                </p>
                <p className="mt-2 text-[10px] leading-5 text-grey">
                  Approved studies: {selected.trace.approvedStudies.map((study) => study.studyTitle).join(" · ") || "None"}
                </p>
                <p className="mt-3 text-[9px] uppercase tracking-[0.12em] text-white/40">
                  {selected.provider || "provider pending"} · {selected.model || "model pending"}
                </p>
              </article>
              <article className="poster-card rounded-xl p-4 lg:col-span-2">
                <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-accent-secondary">Second-by-second attention</p>
                <div className="mt-3 flex gap-1 overflow-x-auto pb-2">
                  {selected.trace.attentionMap.map((beat) => (
                    <div key={beat.second} className="min-w-[112px] rounded-lg border border-white/10 p-2.5">
                      <p className="font-mono text-sm text-accent">{String(beat.second).padStart(2, "0")}s</p>
                      <p className="mt-1 text-[8px] font-semibold uppercase tracking-[0.1em] text-ink">{beat.phase}</p>
                      <p className="mt-1 text-[8px] leading-4 text-grey">{beat.job}</p>
                    </div>
                  ))}
                </div>
              </article>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
