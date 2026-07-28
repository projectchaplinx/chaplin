"use client";

import { useState } from "react";
import { changedVariableSchema, type GenerationVerdictInput } from "@/lib/generation-verdict";

type ChangedVariable = NonNullable<GenerationVerdictInput["changed_variable"]>;

export default function TakeVerdictControls({ assetId }: { assetId: string }) {
  const [changedVariable, setChangedVariable] = useState<ChangedVariable | "">("");
  const [verdict, setVerdict] = useState<"kept" | "killed" | "pending">("pending");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(next: "kept" | "killed") {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/generation-verdicts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          result_asset_id: assetId,
          verdict: next,
          changed_variable: changedVariable || null,
        }),
      });
      if (!response.ok) throw new Error("Verdict could not be saved.");
      setVerdict(next);
      setMessage(next === "kept" ? "Kept" : "Killed");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Verdict could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5" data-take-verdict={verdict}>
      <select
        value={changedVariable}
        onChange={(event) => setChangedVariable(event.target.value as ChangedVariable | "")}
        aria-label="Single changed variable for this iteration"
        className="rounded-full border border-line bg-paper px-2 py-1 text-[9px] text-grey"
      >
        <option value="">Changed variable…</option>
        {changedVariableSchema.options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
      <button type="button" disabled={busy} onClick={() => void save("kept")} className="rounded-full border border-emerald-500/40 px-2 py-1 text-[9px] text-emerald-300">Keep</button>
      <button type="button" disabled={busy} onClick={() => void save("killed")} className="rounded-full border border-red-500/40 px-2 py-1 text-[9px] text-red-300">Kill</button>
      {!changedVariable && verdict === "pending" && <span className="text-[8px] text-amber-300">Name one variable before a re-roll.</span>}
      {message && <span className="text-[8px] text-grey">{message}</span>}
    </div>
  );
}
