import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminDashboard } from "@/lib/server/supabase-admin";
import { getServerAuthIdentity } from "@/lib/server/auth";
import AdminRefreshButton from "@/components/AdminRefreshButton";
import AdminProviderStatus from "@/components/AdminProviderStatus";
import AdminSectionNav from "@/components/AdminSectionNav";
import AppearanceToggle from "@/components/AppearanceToggle";
import AdminDeleteCharacterButton from "@/components/AdminDeleteCharacterButton";
import AdminVoiceCapacityManager from "@/components/AdminVoiceCapacityManager";
import { pipelineModelLabel } from "@/lib/pipeline-config";

export const dynamic = "force-dynamic";

const SEEDANCE_SETUP_URL = "https://docs.byteplus.com/en/docs/ModelArk/2291680";

function number(value: number | string | null | undefined) {
  return value == null ? 0 : Number(value);
}

function formatUsd(value: number | string | null | undefined) {
  return `$${number(value).toFixed(4)}`;
}

function formatInr(value: number | string | null | undefined) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(number(value));
}

function StatusDot({ ready, label }: { ready: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] ${ready ? "text-emerald-500" : "text-grey"}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${ready ? "bg-emerald-500" : "bg-grey/40"}`} />
      {label}
    </span>
  );
}

export default async function AdminPage() {
  const identity = await getServerAuthIdentity();
  if (identity?.role !== "admin") redirect("/super-admin?next=/admin");
  const data = await getAdminDashboard();
  const voices = new Set(data.voices.filter((voice) => voice.status === "active").map((voice) => voice.character_id));
  const assetsByCharacter = new Map<string, string[]>();
  for (const asset of data.assets) {
    if (!asset.character_id) continue;
    assetsByCharacter.set(asset.character_id, [...(assetsByCharacter.get(asset.character_id) ?? []), asset.kind]);
  }
  const slots = new Map(data.homeSlots.map((slot) => [slot.character_id, slot]));
  const readyCharacters = data.characters.filter((character) => {
    const assets = assetsByCharacter.get(character.id) ?? [];
    return Boolean(character.image_url && character.banner_url && voices.has(character.id) && assets.includes("sfx") && assets.includes("theme") && assets.includes("video") && assets.filter((kind) => kind === "gallery").length >= 3);
  });
  const totalUsd = data.jobs.reduce((total, job) => total + number(job.cost_usd), 0);
  const totalInr = data.jobs.reduce((total, job) => total + number(job.cost_inr), 0);
  const totalTokens = data.jobs.reduce((total, job) => total + number(job.normalized_tokens), 0);
  const costedJobs = data.jobs.filter((job) => job.cost_usd != null).length;
  const latestSeedanceJob = data.jobs.find((job) => /seedance/i.test(job.model));
  const seedanceNeedsActivation =
    latestSeedanceJob?.status === "failed" &&
    /not activated|activate the model/i.test(latestSeedanceJob.error_message ?? "");

  return (
    <div className="app-width px-4 sm:px-6 py-8 sm:py-10 w-full min-w-0 overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-accent font-semibold mb-2">Content operations</p>
          <h1 className="marquee-title text-3xl sm:text-5xl leading-tight break-words">ADMIN CONTROL ROOM</h1>
          <p className="text-sm text-grey mt-2 max-w-2xl">See what exists, what is missing, and which AI actors are ready to earn a position on the homepage.</p>
        </div>
        <div className="flex flex-wrap gap-2 self-start">
          <AppearanceToggle />
          <AdminRefreshButton />
          <Link href="/characters/new" className="accent-btn rounded-full px-5 py-2.5 text-sm font-semibold">+ Create AI actor</Link>
        </div>
      </div>

      <AdminSectionNav />

      {seedanceNeedsActivation && (
        <div className="mb-8 rounded-md border border-amber-500/60 bg-amber-500/10 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-amber-500">Video pipeline action required</p>
            <p className="text-xs text-grey mt-1">
              {pipelineModelLabel(latestSeedanceJob.model)} is configured, but BytePlus has not activated it for this account. The failed request remains recorded below with its trace ID.
            </p>
          </div>
          <a
            href={SEEDANCE_SETUP_URL}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 rounded-full border border-amber-500 px-4 py-2 text-xs font-semibold text-amber-500 hover:bg-amber-500/10"
          >
            Open Seedance setup ↗
          </a>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        {[
          ["AI actors", data.characters.length],
          ["Homepage ready", readyCharacters.length],
          ["Media assets", data.assets.length],
          ["Generation jobs", data.jobs.length],
        ].map(([label, value]) => (
          <div key={label} className="poster-card rounded-md p-4 min-w-0">
            <p className="text-2xl font-semibold">{value}</p>
            <p className="text-[11px] uppercase tracking-wide text-grey mt-1 break-words">{label}</p>
          </div>
        ))}
      </div>

      <section className="mb-10">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 mb-4">
          <div>
            <h2 className="reel-title text-2xl">Generation spend</h2>
            <p className="text-xs text-grey mt-1">Voice and media APIs bill in characters, credits, seconds, or images—not LLM tokens. Chaplin tokens normalize spend at 1,000 tokens per US dollar while every provider-native unit remains visible.</p>
          </div>
          <span className="text-[10px] uppercase tracking-wide text-grey">{costedJobs}/{data.jobs.length} jobs costed</span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            ["USD burned", formatUsd(totalUsd)],
            ["INR burned", formatInr(totalInr)],
            ["Chaplin tokens", Math.round(totalTokens).toLocaleString("en-IN")],
            ["FX used", data.jobs.find((job) => job.usd_to_inr_rate)?.usd_to_inr_rate ? `₹${number(data.jobs.find((job) => job.usd_to_inr_rate)?.usd_to_inr_rate).toFixed(2)} / $1` : "Waiting"],
          ].map(([label, value]) => (
            <div key={label} className="poster-card rounded-md p-4 min-w-0">
              <p className="text-xl sm:text-2xl font-semibold break-words">{value}</p>
              <p className="text-[10px] uppercase tracking-wide text-grey mt-1">{label}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-10">
        <div className="flex items-end justify-between gap-4 mb-4">
          <div>
            <h2 className="reel-title text-2xl">AI actor readiness</h2>
            <p className="text-xs text-grey mt-1">A homepage-ready AI actor needs identity art, a locked voice, signature SFX, a theme score, at least three gallery stills, and a video.</p>
          </div>
          <span className="text-xs text-grey">{readyCharacters.length}/{data.characters.length} ready</span>
        </div>

        <div className="overflow-x-auto max-w-full poster-card rounded-md">
          <table className="w-full min-w-[980px] text-left">
            <thead className="text-[10px] uppercase tracking-[0.16em] text-grey border-b border-line">
              <tr>
                <th className="px-4 py-3">AI actor</th>
                <th className="px-3 py-3">Identity</th>
                <th className="px-3 py-3">Voice</th>
                <th className="px-3 py-3">SFX</th>
                <th className="px-3 py-3">Theme</th>
                <th className="px-3 py-3">Gallery</th>
                <th className="px-3 py-3">Video</th>
                <th className="px-3 py-3">Home</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.characters.map((character) => {
                const assetKinds = assetsByCharacter.get(character.id) ?? [];
                const identityReady = Boolean(character.image_url && character.banner_url);
                const voiceReady = voices.has(character.id);
                const sfxReady = assetKinds.includes("sfx");
                const themeReady = assetKinds.includes("theme");
                const galleryCount = assetKinds.filter((kind) => kind === "gallery").length;
                const videoReady = assetKinds.includes("video");
                const slot = slots.get(character.id);
                return (
                  <tr key={character.id} className="hover:bg-white/[0.03]">
                    <td className="px-4 py-3.5">
                      <p className="font-medium text-sm">{character.name}</p>
                      <p className="text-[11px] text-grey">{character.archetype} · {character.license_type}</p>
                    </td>
                    <td className="px-3"><StatusDot ready={identityReady} label={identityReady ? "Ready" : "Missing"} /></td>
                    <td className="px-3"><StatusDot ready={voiceReady} label={voiceReady ? "Locked" : "Create"} /></td>
                    <td className="px-3"><StatusDot ready={sfxReady} label={sfxReady ? "Ready" : "Create"} /></td>
                    <td className="px-3"><StatusDot ready={themeReady} label={themeReady ? "Ready" : "Create"} /></td>
                    <td className="px-3"><StatusDot ready={galleryCount >= 3} label={`${galleryCount}/3`} /></td>
                    <td className="px-3"><StatusDot ready={videoReady} label={videoReady ? "Ready" : "Create"} /></td>
                    <td className="px-3">
                      <span className={`text-[10px] uppercase tracking-wide rounded-full border px-2 py-1 ${slot?.status === "published" ? "border-emerald-500 text-emerald-500" : "border-line text-grey"}`}>
                        {slot ? `${slot.position}. ${slot.status}` : "Not placed"}
                      </span>
                    </td>
                    <td className="px-4 text-right">
                      <div className="flex flex-col items-end gap-1">
                        <Link href={`/characters/${character.id}/system`} className="text-xs font-semibold text-[#36e0cd] hover:underline">Master prompt →</Link>
                        <Link href={`/characters/${character.id}`} className="text-[10px] text-accent hover:underline">Open production</Link>
                        <AdminDeleteCharacterButton characterId={character.id} characterName={character.name} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Provider readiness sits beside the logs: an unconfigured or rejected
          key is the first thing to check when generation starts failing. */}
      <section className="mb-6">
        <AdminProviderStatus />
      </section>

      <AdminVoiceCapacityManager />

      <div className="grid lg:grid-cols-[1.5fr_0.5fr] gap-6">
        <section className="poster-card rounded-md p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="reel-title text-xl">Homepage queue</h2>
            <span className="text-[10px] uppercase tracking-wide text-grey">Position order</span>
          </div>
          <div className="flex flex-col divide-y divide-line">
            {data.homeSlots.map((slot) => {
              const character = data.characters.find((item) => item.id === slot.character_id);
              return (
                <div key={slot.character_id} className="flex items-center gap-3 py-3">
                  <span className="w-7 h-7 rounded-full bg-accent/15 text-accent flex items-center justify-center text-xs font-semibold">{slot.position}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{character?.name ?? slot.character_id}</p>
                    <p className="text-[11px] text-grey truncate">{slot.editorial_note ?? "No editorial note"}</p>
                  </div>
                  <span className="text-[10px] uppercase text-grey">{slot.status}</span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="poster-card rounded-md p-5 flex flex-col justify-between min-h-56">
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-accent font-semibold">Operations</p>
            <h2 className="reel-title text-2xl mt-2">Generation logs</h2>
            <p className="text-xs text-grey mt-2 leading-relaxed">Provider requests, prompts, errors, outputs, runtime, tokens, and spend now live in their own workspace.</p>
          </div>
          <div className="mt-6">
            <p className="text-3xl font-semibold">{data.jobs.length}</p>
            <p className="text-[10px] uppercase tracking-wide text-grey mt-1 mb-4">Recorded events</p>
            <Link href="/admin/logs" className="accent-btn rounded-full px-4 py-2.5 text-xs font-semibold inline-flex">
              Open complete logs →
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
