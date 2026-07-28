import "server-only";

import type { User } from "@supabase/supabase-js";
import { CREDIT_CATALOG, generationCreditAllocation } from "@/lib/credits";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";

export type AdminCreditTransaction = {
  id: string;
  userId: string;
  amount: number;
  kind: string;
  actionCode: string;
  description: string;
  context: string;
  createdAt: string;
};

export type AdminCreditActivity = {
  id: string;
  userId: string;
  actionCode: string;
  actionLabel: string;
  allocatedCredits: number;
  kind: string;
  subject: string;
  provider: string;
  model: string;
  status: string;
  providerCostUsd: number;
  createdAt: string;
};

export type AdminCreditUser = {
  id: string;
  email: string;
  displayName: string;
  accountRole: string;
  balance: number;
  lifetimeGranted: number;
  lifetimeSpent: number;
  transactionCount: number;
  activityCount: number;
  allocatedCredits: number;
  providerCostUsd: number;
  lastActiveAt: string | null;
};

export type AdminCreditDashboard = {
  users: AdminCreditUser[];
  transactions: AdminCreditTransaction[];
  activities: AdminCreditActivity[];
  totals: {
    balance: number;
    granted: number;
    spent: number;
    allocated: number;
    providerCostUsd: number;
  };
};

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function string(value: unknown) {
  return typeof value === "string" ? value : "";
}

function number(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function inferredTransactionCode(kind: string, key: string, metadata: JsonRecord) {
  const explicit = string(metadata.actionCode);
  if (explicit) return explicit;
  if (kind === "welcome") return "welcome";
  if (string(metadata.characterId) || key.startsWith("character:create:")) return "actor.create";
  const format = string(metadata.format);
  const duration = number(metadata.durationSeconds);
  if (format && duration) return `production.${format}.${duration}`;
  return kind === "refund" ? "refund" : "adjustment";
}

function transactionContext(metadata: JsonRecord) {
  return string(metadata.characterName)
    || string(metadata.storyTitle)
    || string(metadata.characterId)
    || string(metadata.storyId)
    || "";
}

async function loadAllCreditTransactions(supabase: ReturnType<typeof getSupabaseAdminClient>) {
  const rows: Array<{
    id: unknown;
    user_id: unknown;
    amount: unknown;
    kind: unknown;
    idempotency_key: unknown;
    description: unknown;
    metadata: unknown;
    created_at: unknown;
  }> = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const page = await supabase
      .from("creator_credit_transactions")
      .select("id,user_id,amount,kind,idempotency_key,description,metadata,created_at")
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);
    if (page.error) throw new Error(`Load credit transactions: ${page.error.message}`);
    rows.push(...(page.data ?? []));
    if ((page.data?.length ?? 0) < pageSize) return rows;
  }
}

async function loadAllAuthUsers(supabase: ReturnType<typeof getSupabaseAdminClient>) {
  const users: User[] = [];
  const pageSize = 1000;
  for (let page = 1; ; page += 1) {
    const result = await supabase.auth.admin.listUsers({ page, perPage: pageSize });
    if (result.error) throw new Error(`Load authenticated users: ${result.error.message}`);
    users.push(...result.data.users);
    if (result.data.users.length < pageSize) return users;
  }
}

async function loadAllGenerationJobs(supabase: ReturnType<typeof getSupabaseAdminClient>) {
  const rows: Array<{
    id: unknown;
    character_id: unknown;
    kind: unknown;
    provider: unknown;
    model: unknown;
    status: unknown;
    cost_usd: unknown;
    metadata: unknown;
    created_at: unknown;
  }> = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const page = await supabase
      .from("generation_jobs")
      .select("id,character_id,kind,provider,model,status,cost_usd,metadata,created_at")
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);
    if (page.error) throw new Error(`Load generation jobs: ${page.error.message}`);
    rows.push(...(page.data ?? []));
    if ((page.data?.length ?? 0) < pageSize) return rows;
  }
}

export async function getAdminCreditDashboard(): Promise<AdminCreditDashboard> {
  const supabase = getSupabaseAdminClient();
  const [authUsers, profiles, accounts, transactions, characters, jobs] = await Promise.all([
    loadAllAuthUsers(supabase),
    supabase.from("user_profiles").select("user_id,email,display_name,account_role,created_at"),
    supabase.from("creator_credit_accounts").select("user_id,balance,lifetime_granted,lifetime_spent,updated_at"),
    loadAllCreditTransactions(supabase),
    supabase.from("characters").select("id,maker_id,name"),
    loadAllGenerationJobs(supabase),
  ]);
  for (const [label, error] of [
    ["profiles", profiles.error],
    ["credit accounts", accounts.error],
    ["characters", characters.error],
  ] as const) {
    if (error) throw new Error(`Load ${label}: ${error.message}`);
  }

  const catalog = new Map(CREDIT_CATALOG.map((item) => [item.code, item]));
  const characterById = new Map((characters.data ?? []).map((row) => [
    string(row.id),
    { makerId: string(row.maker_id), name: string(row.name) },
  ]));
  const accountByUser = new Map((accounts.data ?? []).map((row) => [string(row.user_id), row]));

  const transactionRows: AdminCreditTransaction[] = transactions.map((row) => {
    const metadata = record(row.metadata);
    return {
      id: string(row.id),
      userId: string(row.user_id),
      amount: number(row.amount),
      kind: string(row.kind),
      actionCode: inferredTransactionCode(string(row.kind), string(row.idempotency_key), metadata),
      description: string(row.description),
      context: transactionContext(metadata),
      createdAt: string(row.created_at),
    };
  });

  const activityRows: AdminCreditActivity[] = jobs.flatMap((row) => {
    const metadata = record(row.metadata);
    const character = characterById.get(string(row.character_id));
    const userId = string(metadata.userId) || character?.makerId || "";
    if (!userId) return [];
    const inferred = generationCreditAllocation(string(row.kind), metadata);
    const actionCode = string(metadata.creditActionCode) || inferred.code;
    const allocatedCredits = metadata.creditAllocation == null
      ? inferred.credits
      : number(metadata.creditAllocation);
    return [{
      id: string(row.id),
      userId,
      actionCode,
      actionLabel: catalog.get(actionCode)?.label ?? string(row.kind),
      allocatedCredits,
      kind: string(row.kind),
      subject: character?.name || string(metadata.storyTitle) || string(metadata.product_id) || "Workspace",
      provider: string(row.provider),
      model: string(row.model),
      status: string(row.status),
      providerCostUsd: number(row.cost_usd),
      createdAt: string(row.created_at),
    }];
  });

  const profileByUser = new Map((profiles.data ?? []).map((profile) => [string(profile.user_id), profile]));
  const knownUserIds = new Set([
    ...authUsers.map((user) => user.id),
    ...profileByUser.keys(),
    ...accountByUser.keys(),
    ...transactionRows.map((row) => row.userId),
    ...activityRows.map((row) => row.userId),
  ]);
  const authByUser = new Map(authUsers.map((user) => [user.id, user]));
  const users: AdminCreditUser[] = [...knownUserIds].map((userId) => {
    const profile = profileByUser.get(userId);
    const authUser = authByUser.get(userId);
    const account = accountByUser.get(userId);
    const userTransactions = transactionRows.filter((row) => row.userId === userId);
    const userActivities = activityRows.filter((row) => row.userId === userId);
    const latest = [...userTransactions, ...userActivities]
      .map((row) => row.createdAt)
      .filter(Boolean)
      .sort()
      .at(-1) ?? null;
    return {
      id: userId,
      email: string(profile?.email) || authUser?.email || userId,
      displayName: string(profile?.display_name)
        || string(authUser?.user_metadata?.display_name)
        || (authUser?.email ?? userId).split("@")[0],
      accountRole: string(profile?.account_role) || string(authUser?.user_metadata?.account_role) || "creator",
      balance: number(account?.balance),
      lifetimeGranted: number(account?.lifetime_granted),
      lifetimeSpent: number(account?.lifetime_spent),
      transactionCount: userTransactions.length,
      activityCount: userActivities.length,
      allocatedCredits: userActivities.reduce((total, row) => total + row.allocatedCredits, 0),
      providerCostUsd: userActivities.reduce((total, row) => total + row.providerCostUsd, 0),
      lastActiveAt: latest || string(profile?.created_at) || authUser?.created_at || null,
    };
  }).sort((a, b) => (b.lastActiveAt ?? "").localeCompare(a.lastActiveAt ?? ""));

  return {
    users,
    transactions: transactionRows,
    activities: activityRows,
    totals: {
      balance: users.reduce((total, user) => total + user.balance, 0),
      granted: users.reduce((total, user) => total + user.lifetimeGranted, 0),
      spent: users.reduce((total, user) => total + user.lifetimeSpent, 0),
      allocated: activityRows.reduce((total, row) => total + row.allocatedCredits, 0),
      providerCostUsd: activityRows.reduce((total, row) => total + row.providerCostUsd, 0),
    },
  };
}
