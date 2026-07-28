"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type VoiceRow = {
  voiceId: string;
  name: string;
  characterId: string | null;
  characterName: string | null;
  active: boolean;
  tracked: boolean;
  project: string | null;
  createdAtUnix: number | null;
};

type Inventory = {
  voices: VoiceRow[];
  total: number;
  active: number;
  reclaimable: number;
  error?: string;
};

async function fetchInventory() {
  const response = await fetch("/api/admin/voices", { cache: "no-store" });
  const data = await response.json() as Inventory;
  return response.ok
    ? data
    : { voices: [], total: 0, active: 0, reclaimable: 0, error: data.error ?? "Could not load voices." };
}

export default function AdminVoiceCapacityManager() {
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [selected, setSelected] = useState<VoiceRow | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    setInventory(await fetchInventory());
  }

  useEffect(() => {
    let active = true;
    void fetchInventory().then((data) => {
      if (active) setInventory(data);
    });
    return () => {
      active = false;
    };
  }, []);

  async function deleteVoice() {
    if (!selected || confirmation !== selected.voiceId || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/voices", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voiceId: selected.voiceId, confirmation }),
      });
      const data = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(data.error ?? "The voice could not be deleted.");
      setSelected(null);
      setConfirmation("");
      await load();
      setMessage(data.message ?? "Voice deleted.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The voice could not be deleted.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="voice-capacity" className="mb-10 scroll-mt-24">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">ElevenLabs capacity</p>
          <h2 className="reel-title mt-1 text-2xl">Generated voice control</h2>
          <p className="mt-1 max-w-2xl text-xs text-grey">
            Delete unused generated voices directly. Voices actively locked to an actor are protected.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setMessage("");
            void load();
          }}
          className="rounded-full border border-line px-4 py-2 text-[10px] font-semibold text-grey hover:border-accent hover:text-accent"
        >
          Refresh voices
        </button>
      </div>

      <div className="poster-card overflow-hidden rounded-md">
        <div className="grid grid-cols-3 divide-x divide-line border-b border-line">
          {[
            ["On account", inventory?.total ?? "—"],
            ["Locked", inventory?.active ?? "—"],
            ["Can delete", inventory?.reclaimable ?? "—"],
          ].map(([label, value]) => (
            <div key={label} className="px-4 py-3">
              <p className="text-xl font-semibold">{value}</p>
              <p className="text-[9px] uppercase tracking-wide text-grey">{label}</p>
            </div>
          ))}
        </div>

        {!inventory ? (
          <p className="px-4 py-6 text-xs text-grey">Loading the live ElevenLabs voice inventory…</p>
        ) : inventory.error ? (
          <p className="m-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-3 text-xs text-red-300">{inventory.error}</p>
        ) : inventory.voices.length === 0 ? (
          <p className="px-4 py-6 text-xs text-grey">No personal generated voices are stored on this account.</p>
        ) : (
          <div className="max-h-[32rem] divide-y divide-line overflow-y-auto">
            {inventory.voices.map((voice) => (
              <div key={voice.voiceId} className="grid gap-3 px-4 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold">{voice.name}</p>
                    <span className={`rounded-full border px-2 py-0.5 text-[8px] font-semibold uppercase tracking-wide ${
                      voice.active ? "border-emerald-500/50 text-emerald-400" : "border-amber-500/40 text-amber-400"
                    }`}>
                      {voice.active ? "Locked" : "Unused"}
                    </span>
                    {!voice.tracked && <span className="text-[8px] uppercase tracking-wide text-grey">Untracked</span>}
                  </div>
                  <p className="mt-1 break-all font-mono text-[9px] text-grey">{voice.voiceId}</p>
                  <p className="mt-1 text-[10px] text-grey">
                    {voice.characterName ?? voice.characterId ?? "No actor attached"}
                    {voice.project ? ` · ${voice.project}` : ""}
                  </p>
                </div>
                {voice.active ? (
                  voice.characterId ? (
                    <Link href={`/characters/${voice.characterId}/studio`} className="text-[10px] font-semibold text-accent hover:underline">
                      Open voice lock
                    </Link>
                  ) : (
                    <span className="text-[10px] text-grey">Protected</span>
                  )
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(voice);
                      setConfirmation("");
                      setMessage("");
                    }}
                    className="rounded-full border border-red-500/45 px-3 py-1.5 text-[10px] font-semibold text-red-400 hover:bg-red-500/10"
                  >
                    Delete voice
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {message && (
        <p className={`mt-3 rounded-md border px-3 py-2 text-xs ${
          /deleted|free/i.test(message)
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
            : "border-red-500/30 bg-red-500/10 text-red-300"
        }`}>
          {message}
        </p>
      )}

      {selected && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 px-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-xl border border-red-500/40 bg-[#090c09] p-5 sm:p-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-red-400">Free one voice slot</p>
            <h3 className="reel-title mt-2 text-2xl">Delete {selected.name}?</h3>
            <p className="mt-3 text-xs leading-5 text-grey">
              This permanently removes the generated voice from ElevenLabs. Paste the exact Voice ID to confirm.
            </p>
            <p className="mt-3 break-all rounded-md bg-black/30 p-2 font-mono text-[10px] text-ink">{selected.voiceId}</p>
            <input
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoFocus
              autoComplete="off"
              aria-label="Confirm exact Voice ID"
              className="mt-3 w-full rounded-md border border-line bg-black/40 px-3 py-2.5 font-mono text-xs text-ink outline-none focus:border-red-400"
            />
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setSelected(null);
                  setConfirmation("");
                }}
                className="rounded-full border border-line px-4 py-2 text-xs font-semibold text-grey"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy || confirmation !== selected.voiceId}
                onClick={() => void deleteVoice()}
                className="rounded-full bg-red-500 px-4 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? "Deleting…" : "Delete from ElevenLabs"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
