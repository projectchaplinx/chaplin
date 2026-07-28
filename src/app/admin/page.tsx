import Link from "next/link";
import { redirect } from "next/navigation";
import AdminCharacterManager from "@/components/AdminCharacterManager";
import AdminProviderStatus from "@/components/AdminProviderStatus";
import AdminRefreshButton from "@/components/AdminRefreshButton";
import AdminSectionNav from "@/components/AdminSectionNav";
import AdminVoiceCapacityManager from "@/components/AdminVoiceCapacityManager";
import AppearanceToggle from "@/components/AppearanceToggle";
import { pipelineModelLabel } from "@/lib/pipeline-config";
import { getServerAuthIdentity } from "@/lib/server/auth";
import { getAdminDashboard } from "@/lib/server/supabase-admin";

export const dynamic = "force-dynamic";

const SEEDANCE_SETUP_URL = "https://docs.byteplus.com/en/docs/ModelArk/2291680";

function number(value: number | string | null | undefined) {
  return value == null ? 0 : Number(value);
}

function formatUsd(value: number | string | null | undefined) {
  return `$${number(value).toFixed(4)}`;
}

function formatInr(value: number | string | null | undefined) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(number(value));
}

export default async function AdminPage() {
  const identity = await getServerAuthIdentity();
  if (identity?.role !== "admin") redirect("/super-admin?next=/admin");

  const data = await getAdminDashboard();
  const activeVoiceCharacterIds = [
    ...new Set(
      data.voices
        .filter((voice) => voice.status === "active")
        .map((voice) => voice.character_id),
    ),
  ];
  const voices = new Set(activeVoiceCharacterIds);
  const assetsByCharacter = new Map<string, string[]>();
  for (const asset of data.assets) {
    if (!asset.character_id) continue;
    assetsByCharacter.set(
      asset.character_id,
      [...(assetsByCharacter.get(asset.character_id) ?? []), asset.kind],
    );
  }
  const readyCharacters = data.characters.filter((character) => {
    const assets = assetsByCharacter.get(character.id) ?? [];
    return Boolean(
      character.image_url
      && character.banner_url
      && voices.has(character.id)
      && assets.includes("sfx")
      && assets.includes("theme")
      && assets.includes("video")
      && assets.filter((kind) => kind === "gallery").length >= 3
    );
  });

  const totalUsd = data.jobs.reduce((total, job) => total + number(job.cost_usd), 0);
  const totalInr = data.jobs.reduce((total, job) => total + number(job.cost_inr), 0);
  const totalTokens = data.jobs.reduce((total, job) => total + number(job.normalized_tokens), 0);
  const costedJobs = data.jobs.filter((job) => job.cost_usd != null).length;
  const latestSeedanceJob = data.jobs.find((job) => /seedance/i.test(job.model));
  const seedanceNeedsActivation =
    latestSeedanceJob?.status === "failed"
    && /not activated|activate the model/i.test(latestSeedanceJob.error_message ?? "");

  return (
    <div className="app-width w-full min-w-0 overflow-hidden px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-accent">Content operations</p>
          <h1 className="marquee-title break-words text-3xl leading-tight sm:text-5xl">ADMIN CONTROL ROOM</h1>
          <p className="mt-2 max-w-2xl text-sm text-grey">
            Control the actor catalogue, every attached file, homepage placement, providers, and generation activity.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 self-start">
          <AppearanceToggle />
          <AdminRefreshButton />
          <Link href="/characters/new" className="accent-btn rounded-full px-5 py-2.5 text-sm font-semibold">
            + Create AI actor
          </Link>
        </div>
      </div>

      <AdminSectionNav />

      {seedanceNeedsActivation && (
        <div className="mb-8 flex flex-col justify-between gap-3 rounded-md border border-amber-500/60 bg-amber-500/10 px-4 py-3 sm:flex-row sm:items-center">
          <div>
            <p className="text-sm font-semibold text-amber-500">Video pipeline action required</p>
            <p className="mt-1 text-xs text-grey">
              {pipelineModelLabel(latestSeedanceJob.model)} is configured, but BytePlus has not activated it for this account.
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

      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["AI actors", data.characters.length],
          ["Homepage ready", readyCharacters.length],
          ["Media assets", data.assets.length],
          ["Generation jobs", data.jobs.length],
        ].map(([label, value]) => (
          <div key={label} className="poster-card min-w-0 rounded-md p-4">
            <p className="text-2xl font-semibold">{value}</p>
            <p className="mt-1 break-words text-[11px] uppercase tracking-wide text-grey">{label}</p>
          </div>
        ))}
      </div>

      <section className="mb-10">
        <div className="mb-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
          <div>
            <h2 className="reel-title text-2xl">Generation spend</h2>
            <p className="mt-1 text-xs text-grey">
              Provider-native units stay visible while Chaplin tokens normalize spend at 1,000 tokens per US dollar.
            </p>
          </div>
          <span className="text-[10px] uppercase tracking-wide text-grey">{costedJobs}/{data.jobs.length} jobs costed</span>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            ["USD burned", formatUsd(totalUsd)],
            ["INR burned", formatInr(totalInr)],
            ["Chaplin tokens", Math.round(totalTokens).toLocaleString("en-IN")],
            [
              "FX used",
              data.jobs.find((job) => job.usd_to_inr_rate)?.usd_to_inr_rate
                ? `₹${number(data.jobs.find((job) => job.usd_to_inr_rate)?.usd_to_inr_rate).toFixed(2)} / $1`
                : "Waiting",
            ],
          ].map(([label, value]) => (
            <div key={label} className="poster-card min-w-0 rounded-md p-4">
              <p className="break-words text-xl font-semibold sm:text-2xl">{value}</p>
              <p className="mt-1 text-[10px] uppercase tracking-wide text-grey">{label}</p>
            </div>
          ))}
        </div>
      </section>

      <AdminCharacterManager
        characters={data.characters}
        assets={data.assets}
        homeSlots={data.homeSlots}
        activeVoiceCharacterIds={activeVoiceCharacterIds}
      />

      <section className="mb-6">
        <AdminProviderStatus />
      </section>

      <AdminVoiceCapacityManager />

      <section className="poster-card flex min-h-56 flex-col justify-between rounded-md p-5">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">Operations</p>
          <h2 className="reel-title mt-2 text-2xl">Generation logs</h2>
          <p className="mt-2 text-xs leading-relaxed text-grey">
            Provider requests, prompts, errors, outputs, runtime, tokens, and spend live in their own workspace.
          </p>
        </div>
        <div className="mt-6">
          <p className="text-3xl font-semibold">{data.jobs.length}</p>
          <p className="mb-4 mt-1 text-[10px] uppercase tracking-wide text-grey">Recorded events</p>
          <Link href="/admin/logs" className="accent-btn inline-flex rounded-full px-4 py-2.5 text-xs font-semibold">
            Open complete logs →
          </Link>
        </div>
      </section>
    </div>
  );
}
