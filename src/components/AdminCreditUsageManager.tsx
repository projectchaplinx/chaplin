"use client";

import { useMemo, useState } from "react";
import type {
  AdminCreditActivity,
  AdminCreditTransaction,
  AdminCreditUser,
} from "@/lib/server/admin-credits";

function timestamp(value: string | null) {
  if (!value) return "No activity yet";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function usd(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(value);
}

export default function AdminCreditUsageManager({
  users,
  transactions,
  activities,
}: {
  users: AdminCreditUser[];
  transactions: AdminCreditTransaction[];
  activities: AdminCreditActivity[];
}) {
  const [query, setQuery] = useState("");
  const [selectedUserId, setSelectedUserId] = useState(users[0]?.id ?? "");
  const filteredUsers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle
      ? users.filter((user) => `${user.displayName} ${user.email}`.toLowerCase().includes(needle))
      : users;
  }, [query, users]);
  const selectedUser = users.find((user) => user.id === selectedUserId) ?? filteredUsers[0];
  const selectedTransactions = transactions.filter((row) => row.userId === selectedUser?.id);
  const selectedActivities = activities.filter((row) => row.userId === selectedUser?.id);
  const timeline = [
    ...selectedTransactions.map((row) => ({
      id: `transaction-${row.id}`,
      at: row.createdAt,
      title: row.description,
      subtitle: row.context || row.actionCode,
      status: row.kind,
      credits: row.amount,
      providerCost: null as number | null,
    })),
    ...selectedActivities.map((row) => ({
      id: `activity-${row.id}`,
      at: row.createdAt,
      title: row.actionLabel,
      subtitle: `${row.subject} · ${row.provider} / ${row.model}`,
      status: row.status,
      credits: row.allocatedCredits,
      providerCost: row.providerCostUsd,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(320px,0.8fr)_minmax(0,1.6fr)]">
      <section className="poster-card min-w-0 rounded-md p-4">
        <label className="block">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-grey">Find a user</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Name or email"
            className="mt-2 w-full rounded-md border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-accent"
          />
        </label>
        <div className="mt-3 max-h-[720px] space-y-2 overflow-y-auto pr-1">
          {filteredUsers.map((user) => (
            <button
              key={user.id}
              type="button"
              onClick={() => setSelectedUserId(user.id)}
              className={`w-full min-w-0 rounded-md border p-3 text-left transition-colors ${
                selectedUser?.id === user.id ? "border-accent bg-accent/10" : "border-line hover:border-grey"
              }`}
            >
              <span className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{user.displayName}</span>
                  <span className="block truncate text-[11px] text-grey">{user.email}</span>
                </span>
                <span className="shrink-0 text-lg font-semibold text-mint">{user.balance}</span>
              </span>
              <span className="mt-2 flex justify-between gap-3 text-[10px] uppercase tracking-wide text-grey">
                <span>{user.lifetimeSpent} spent</span>
                <span>{user.activityCount} actions</span>
              </span>
            </button>
          ))}
          {!filteredUsers.length && <p className="py-8 text-center text-xs text-grey">No matching user.</p>}
        </div>
      </section>

      <section className="poster-card min-w-0 rounded-md p-4 sm:p-5">
        {selectedUser ? (
          <>
            <div className="flex flex-col justify-between gap-3 border-b border-line pb-5 sm:flex-row sm:items-start">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">{selectedUser.accountRole}</p>
                <h2 className="mt-1 break-words text-2xl font-semibold">{selectedUser.displayName}</h2>
                <p className="break-all text-xs text-grey">{selectedUser.email}</p>
              </div>
              <div className="grid shrink-0 grid-cols-2 gap-2 text-right">
                <div className="rounded-md border border-line px-3 py-2">
                  <p className="text-xl font-semibold text-mint">{selectedUser.balance}</p>
                  <p className="text-[9px] uppercase tracking-wide text-grey">Available</p>
                </div>
                <div className="rounded-md border border-line px-3 py-2">
                  <p className="text-xl font-semibold">{selectedUser.lifetimeSpent}</p>
                  <p className="text-[9px] uppercase tracking-wide text-grey">Wallet spent</p>
                </div>
              </div>
            </div>

            <div className="my-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
              {[
                ["Granted", selectedUser.lifetimeGranted.toLocaleString("en-IN")],
                ["AI actions", selectedUser.activityCount.toLocaleString("en-IN")],
                ["Included allocation", selectedUser.allocatedCredits.toLocaleString("en-IN")],
                ["Provider cost", usd(selectedUser.providerCostUsd)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-md border border-line p-3">
                  <p className="break-words text-lg font-semibold">{value}</p>
                  <p className="mt-1 text-[9px] uppercase tracking-wide text-grey">{label}</p>
                </div>
              ))}
            </div>

            <div className="overflow-hidden rounded-md border border-line">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-line bg-black/10 px-3 py-2 text-[9px] font-semibold uppercase tracking-wide text-grey">
                <span>Credit and activity ledger</span>
                <span>{timestamp(selectedUser.lastActiveAt)}</span>
              </div>
              <div className="max-h-[620px] divide-y divide-line overflow-y-auto">
                {timeline.map((row) => (
                  <div key={row.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-3 px-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{row.title}</p>
                      <p className="mt-0.5 truncate text-[11px] text-grey">{row.subtitle}</p>
                      <p className="mt-1 text-[9px] uppercase tracking-wide text-grey">{timestamp(row.at)} · {row.status}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-semibold ${row.credits < 0 ? "text-accent" : "text-mint"}`}>
                        {row.credits > 0 ? "+" : ""}{row.credits} CR
                      </p>
                      {row.providerCost != null && <p className="mt-1 text-[10px] text-grey">{usd(row.providerCost)}</p>}
                    </div>
                  </div>
                ))}
                {!timeline.length && <p className="px-3 py-10 text-center text-xs text-grey">No wallet or generation activity yet.</p>}
              </div>
            </div>
          </>
        ) : (
          <p className="py-12 text-center text-sm text-grey">No creator profiles are available.</p>
        )}
      </section>
    </div>
  );
}
