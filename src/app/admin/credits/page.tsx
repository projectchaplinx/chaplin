import { redirect } from "next/navigation";
import AdminCreditUsageManager from "@/components/AdminCreditUsageManager";
import AdminRefreshButton from "@/components/AdminRefreshButton";
import AdminSectionNav from "@/components/AdminSectionNav";
import { CREDIT_CATALOG } from "@/lib/credits";
import { getAdminCreditDashboard } from "@/lib/server/admin-credits";
import { getServerAuthIdentity } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

function usd(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(value);
}

export default async function AdminCreditsPage() {
  const identity = await getServerAuthIdentity();
  if (identity?.role !== "admin") redirect("/super-admin?next=/admin/credits");
  const data = await getAdminCreditDashboard();

  return (
    <div className="app-width w-full min-w-0 overflow-hidden px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-accent">Wallet operations</p>
          <h1 className="marquee-title break-words text-3xl leading-tight sm:text-5xl">CREDITS & USAGE</h1>
          <p className="mt-2 max-w-3xl text-sm text-grey">
            Current wallet balances, every debit and refund, included AI-step allocations, and actual provider cost per creator.
          </p>
        </div>
        <AdminRefreshButton />
      </div>

      <AdminSectionNav />

      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          ["Users", data.users.length.toLocaleString("en-IN")],
          ["Available", `${data.totals.balance.toLocaleString("en-IN")} CR`],
          ["Granted", `${data.totals.granted.toLocaleString("en-IN")} CR`],
          ["Wallet spent", `${data.totals.spent.toLocaleString("en-IN")} CR`],
          ["Provider cost", usd(data.totals.providerCostUsd)],
        ].map(([label, value]) => (
          <div key={label} className="poster-card min-w-0 rounded-md p-4">
            <p className="break-words text-xl font-semibold sm:text-2xl">{value}</p>
            <p className="mt-1 text-[10px] uppercase tracking-wide text-grey">{label}</p>
          </div>
        ))}
      </div>

      <section className="mb-10">
        <div className="mb-4">
          <h2 className="reel-title text-2xl">Current Chaplin rate card</h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-grey">
            Direct prices debit the wallet once. Included allocations explain the work inside a paid bundle and never create a second debit.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {CREDIT_CATALOG.map((item) => (
            <article key={item.code} className="poster-card min-w-0 rounded-md p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{item.label}</p>
                  <p className="mt-0.5 text-[10px] uppercase tracking-wide text-grey">{item.unit}</p>
                </div>
                <p className="shrink-0 text-xl font-semibold text-mint">{item.credits} CR</p>
              </div>
              <p className="mt-3 text-xs leading-5 text-grey">{item.description}</p>
              <p className="mt-3 text-[9px] font-semibold uppercase tracking-[0.16em] text-accent">{item.billing}</p>
            </article>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-4">
          <h2 className="reel-title text-2xl">Per-user ledger</h2>
          <p className="mt-1 text-xs text-grey">Select any account to see its current balance and exactly what it generated.</p>
        </div>
        <AdminCreditUsageManager
          users={data.users}
          transactions={data.transactions}
          activities={data.activities}
        />
      </section>
    </div>
  );
}
