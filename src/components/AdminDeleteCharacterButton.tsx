"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useChaplinStore } from "@/lib/store";

export default function AdminDeleteCharacterButton({
  characterId,
  characterName,
}: {
  characterId: string;
  characterName: string;
}) {
  const router = useRouter();
  const removeCharacter = useChaplinStore((state) => state.removeCharacter);
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) {
        setOpen(false);
        setConfirmation("");
        setError("");
      }
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [busy, open]);

  async function deleteCharacter() {
    if (confirmation !== characterName || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/characters/${encodeURIComponent(characterId)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "The AI actor could not be deleted.");
      removeCharacter(characterId);
      window.dispatchEvent(new CustomEvent("chaplin:catalogue-updated", { detail: { characterId } }));
      setOpen(false);
      setConfirmation("");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The AI actor could not be deleted.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError("");
          setOpen(true);
        }}
        className="text-[10px] font-semibold text-red-400 hover:text-red-300 hover:underline"
      >
        Delete completely
      </button>
      {open && createPortal(
        <div
          className="fixed inset-0 z-[1000] grid min-h-full place-items-center overflow-y-auto bg-black/80 px-4 py-6 text-left backdrop-blur-sm sm:py-10"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`delete-character-${characterId}`}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) {
              setOpen(false);
              setConfirmation("");
              setError("");
            }
          }}
        >
          <div className="mx-auto w-full max-w-md rounded-xl border border-red-500/40 bg-[#090c09] p-5 shadow-2xl sm:p-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-red-400">Permanent deletion</p>
            <h2 id={`delete-character-${characterId}`} className="reel-title mt-2 text-2xl">
              Delete {characterName}?
            </h2>
            <p className="mt-3 text-xs leading-5 text-grey">
              This removes the actor, custom ElevenLabs voices, archived media, production briefs,
              cast memberships, and generation history. It cannot be undone.
            </p>
            <label className="mt-5 block text-[11px] font-semibold text-grey">
              Type <span className="text-ink">{characterName}</span> to confirm
              <input
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoFocus
                autoComplete="off"
                className="mt-2 w-full rounded-md border border-line bg-black/40 px-3 py-2.5 text-sm text-ink outline-none focus:border-red-400"
              />
            </label>
            {error && (
              <p className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                {error}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setOpen(false);
                  setConfirmation("");
                  setError("");
                }}
                className="rounded-full border border-line px-4 py-2 text-xs font-semibold text-grey hover:text-ink"
              >
                Keep actor
              </button>
              <button
                type="button"
                disabled={confirmation !== characterName || busy}
                onClick={() => void deleteCharacter()}
                className="rounded-full bg-red-500 px-4 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? "Deleting everything…" : "Delete permanently"}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
