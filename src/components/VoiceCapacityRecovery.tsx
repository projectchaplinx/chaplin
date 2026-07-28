"use client";

import Link from "next/link";
import { useState } from "react";
import { getClientAuthIdentity } from "@/lib/client-auth";

type VoiceCapacityCandidate = {
  voiceId: string;
  name: string;
  characterId: string | null;
  characterName?: string | null;
  project?: string | null;
  tracked?: boolean;
  createdAtUnix: number | null;
};

export default function VoiceCapacityRecovery({
  characterId,
  onDeleted,
  onContinue,
}: {
  characterId: string;
  onDeleted?: (message: string) => void;
  onContinue?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [candidates, setCandidates] = useState<VoiceCapacityCandidate[]>([]);
  const [busy, setBusy] = useState(false);
  const [deletingVoiceId, setDeletingVoiceId] = useState("");
  const [message, setMessage] = useState("");
  const [adminMode, setAdminMode] = useState(false);
  const [slotReady, setSlotReady] = useState(false);

  async function loadVoices() {
    setOpen(true);
    setBusy(true);
    setMessage("");
    setSlotReady(false);
    try {
      const identity = await getClientAuthIdentity();
      const isAdmin = identity?.role === "admin";
      setAdminMode(isAdmin);
      const response = isAdmin
        ? await fetch("/api/admin/voices", { cache: "no-store" })
        : await fetch("/api/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "voice-capacity-list",
              characterId,
            }),
          });
      const data = await response.json() as {
        voices?: Array<VoiceCapacityCandidate & { active: boolean }>;
        candidates?: VoiceCapacityCandidate[];
        error?: string;
      };
      if (!response.ok) throw new Error(data.error ?? "Could not inspect voice capacity.");
      const available = isAdmin
        ? (data.voices ?? []).filter((voice) => !voice.active)
        : data.candidates ?? [];
      setCandidates(available);
      if (!available.length) {
        setMessage(
          isAdmin
            ? "No inactive generated voice is available to delete. Every voice Chaplin can identify is currently locked."
            : "No inactive voice is available across the actors in your Studio. Active voices and other creators' voices stay protected.",
        );
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not inspect voice capacity.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteVoice(candidate: VoiceCapacityCandidate) {
    const outsideChaplin = adminMode && candidate.project !== "chaplin";
    if (
      !window.confirm(
        `Permanently delete the inactive voice "${candidate.name}" from ElevenLabs? ${
          outsideChaplin ? "Chaplin does not own this voice, so confirm that its other app no longer needs it. " : ""
        }This cannot be undone.`,
      )
    ) {
      return;
    }
    setDeletingVoiceId(candidate.voiceId);
    setMessage("");
    try {
      const response = adminMode
        ? await fetch("/api/admin/voices", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              voiceId: candidate.voiceId,
              confirmation: candidate.voiceId,
            }),
          })
        : await fetch("/api/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "voice-capacity-delete",
              characterId,
              voiceId: candidate.voiceId,
              confirmedVoiceId: candidate.voiceId,
            }),
          });
      const data = await response.json() as {
        deleted?: boolean;
        message?: string;
        error?: string;
      };
      if (!response.ok || !data.deleted) {
        throw new Error(data.error ?? "The selected voice could not be deleted.");
      }
      const successMessage =
        data.message ?? "One inactive Chaplin voice was deleted and its slot is now free.";
      setCandidates((current) => current.filter((voice) => voice.voiceId !== candidate.voiceId));
      setMessage(successMessage);
      setSlotReady(true);
      onDeleted?.(successMessage);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The selected voice could not be deleted.");
    } finally {
      setDeletingVoiceId("");
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => void loadVoices()}
        className="shrink-0 rounded-full border border-red-500/45 px-3 py-1.5 text-[10px] font-semibold text-red-300 hover:bg-red-500/10"
      >
        Manage unused voices
      </button>
    );
  }

  return (
    <div className="w-full rounded-md border border-red-500/25 bg-black/20 p-3" data-voice-capacity-recovery>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold text-ink">Choose an unused voice slot</p>
          <p className="mt-1 text-[9px] leading-4 text-grey">
            {adminMode
              ? "Super Admin can reclaim any inactive generated voice on this ElevenLabs account. Voices from another app are marked before deletion."
              : "Showing named inactive voices from every actor in your Studio. Locked voices and other creators' voices cannot be deleted."}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void loadVoices()}
            disabled={busy || Boolean(deletingVoiceId)}
            className="rounded-full border border-line px-3 py-1 text-[9px] font-semibold text-grey disabled:opacity-40"
          >
            {busy ? "Checking…" : "Refresh"}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            disabled={Boolean(deletingVoiceId)}
            className="rounded-full border border-line px-3 py-1 text-[9px] font-semibold text-grey disabled:opacity-40"
          >
            Close
          </button>
        </div>
      </div>

      {candidates.length > 0 && (
        <div className="mt-3 divide-y divide-line overflow-hidden rounded-sm border border-line">
          {candidates.map((candidate) => (
            <div key={candidate.voiceId} className="flex flex-wrap items-center justify-between gap-3 bg-paper/30 px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-[11px] font-semibold text-ink">{candidate.name}</p>
                <p className={`mt-0.5 text-[8px] font-semibold uppercase tracking-wide ${
                  candidate.project === "chaplin" ? "text-accent-secondary" : "text-amber-300"
                }`}>
                  {candidate.project === "chaplin"
                    ? candidate.characterName ?? "Chaplin voice"
                    : candidate.project
                      ? `Other app · ${candidate.project}`
                      : "Untracked · verify before deleting"}
                </p>
                <p className="mt-0.5 font-mono text-[8px] text-grey">
                  {candidate.characterId ? `Actor ${candidate.characterId.slice(0, 8)} · ` : ""}
                  {candidate.voiceId}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void deleteVoice(candidate)}
                disabled={Boolean(deletingVoiceId)}
                className="rounded-full border border-red-500/45 px-3 py-1.5 text-[9px] font-semibold text-red-300 hover:bg-red-500/10 disabled:opacity-40"
              >
                {deletingVoiceId === candidate.voiceId ? "Deleting…" : "Delete voice"}
              </button>
            </div>
          ))}
        </div>
      )}

      {message && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className={`text-[10px] leading-4 ${
            /deleted|free/i.test(message) ? "text-emerald-300" : "text-red-200"
          }`}>
            {message}
          </p>
          {slotReady && onContinue && (
            <button
              type="button"
              onClick={onContinue}
              className="rounded-full bg-accent px-4 py-2 text-[10px] font-semibold text-paper hover:bg-accent-light"
            >
              Create new voice takes →
            </button>
          )}
          {!adminMode && candidates.length === 0 && !slotReady && (
            <Link
              href="/super-admin#voice-capacity"
              className="rounded-full border border-line px-3 py-1.5 text-[9px] font-semibold text-grey hover:border-accent hover:text-accent"
            >
              Open account-wide Super Admin control →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
