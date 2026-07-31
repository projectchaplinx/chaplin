"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DirectorEvidenceManifest } from "@/lib/director-evidence-manifest";

export default function AdminDirectorEvidenceManifests() {
  const [manifests, setManifests] = useState<DirectorEvidenceManifest[]>([]);
  const [storageReady, setStorageReady] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const load = useCallback(async () => {
    const response = await fetch("/api/admin/director-brain/evidence-manifests?limit=100", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Could not load evidence manifests.");
    setManifests(body.manifests ?? []); setStorageReady(body.storageReady !== false);
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      load().catch((reason) => setError(reason instanceof Error ? reason.message : "Could not load evidence."));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const counts = useMemo(() => ({
    discovered: manifests.filter((item) => item.status === "discovered").length,
    review: manifests.filter((item) => item.status === "needs-review").length,
    eligible: manifests.filter((item) => item.status === "eligible").length,
    reusable: manifests.filter((item) => item.reuseStatus === "reusable").length,
  }), [manifests]);
  async function review(id: string, status: "eligible" | "rejected") {
    setBusy(id); setError("");
    try {
      const response = await fetch("/api/admin/director-brain/evidence-manifests", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, status, notes: status === "eligible" ? "Item-level rights and context reviewed in Super Admin." : "Rejected during item-level evidence review." }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || "Evidence review failed.");
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Evidence review failed."); }
    finally { setBusy(""); }
  }
  return (
    <section className="poster-card mb-8 rounded-md p-5" data-evidence-manifests>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-accent-secondary">Evidence manifests · item-level gate</p>
          <h2 className="reel-title mt-1 text-3xl">What the parallel catalog workers found</h2>
          <p className="mt-2 max-w-3xl text-xs leading-5 text-grey">These are attributable collection and provenance records—not learned directing rules. Review rights and context here; only a separately approved study can enter Magic retrieval.</p>
        </div>
        <button type="button" onClick={() => load().catch((reason) => setError(String(reason)))} className="rounded-full border border-line px-4 py-2 text-xs text-ink">Refresh</button>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[["Found", manifests.length], ["Reusable candidates", counts.reusable], ["Needs review", counts.discovered + counts.review], ["Eligible evidence", counts.eligible]].map(([label, value]) => <div key={label} className="rounded-md border border-line bg-black/10 p-3"><p className="text-xl font-semibold text-ink">{value}</p><p className="text-[9px] uppercase tracking-[0.14em] text-grey">{label}</p></div>)}
      </div>
      {!storageReady && <p className="mt-4 rounded-md border border-amber-500/30 p-3 text-xs text-amber-200">Evidence storage is not installed yet.</p>}
      {error && <p className="mt-4 rounded-md border border-red-500/30 p-3 text-xs text-red-300">{error}</p>}
      <div className="mt-4 grid gap-2 lg:grid-cols-2">
        {manifests.slice(0, 24).map((item) => <article key={item.id} className="rounded-md border border-line bg-black/10 p-4">
          <div className="flex flex-wrap justify-between gap-2"><p className="text-sm font-semibold text-ink">{item.title}</p><span className="text-[9px] uppercase tracking-[0.14em] text-accent-secondary">{item.provider} · {item.reuseStatus}</span></div>
          <p className="mt-1 text-xs text-grey">{item.dateLabel || "Date unresolved"}{item.region ? ` · ${item.region}` : ""}</p>
          <p className="mt-2 line-clamp-2 text-[11px] leading-5 text-grey">Rights: {item.rightsLabel || "unknown — must be resolved before use"}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <a href={item.canonicalUrl} target="_blank" rel="noreferrer" className="text-[10px] font-semibold text-accent-secondary">Open record ↗</a>
            {item.status !== "eligible" && item.reuseStatus === "reusable" && !item.culturallySensitive && <button disabled={busy === item.id} onClick={() => review(item.id, "eligible")} className="rounded-full border border-emerald-500/40 px-3 py-1 text-[10px] text-emerald-300">Mark evidence eligible</button>}
            {item.status !== "rejected" && <button disabled={busy === item.id} onClick={() => review(item.id, "rejected")} className="rounded-full border border-red-500/40 px-3 py-1 text-[10px] text-red-300">Reject</button>}
          </div>
        </article>)}
      </div>
    </section>
  );
}
