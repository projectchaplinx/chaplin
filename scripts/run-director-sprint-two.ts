import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";

loadEnvConfig(process.cwd());

async function main() {

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) throw new Error("Supabase credentials are required.");

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const auth = createClient(url, anonKey, { auth: { persistSession: false } });
const runResult = await admin.from("director_sprint_two_runs")
  .select("id,created_by,variants").order("created_at", { ascending: false }).limit(1).single();
if (runResult.error) throw new Error(runResult.error.message);
const userResult = await admin.auth.admin.getUserById(runResult.data.created_by);
if (userResult.error || !userResult.data.user?.email) throw new Error(userResult.error?.message ?? "Run owner email is unavailable.");
const link = await admin.auth.admin.generateLink({ type: "magiclink", email: userResult.data.user.email });
const tokenHash = link.data.properties?.hashed_token;
if (link.error || !tokenHash) throw new Error(link.error?.message ?? "Could not mint an execution session.");
const session = await auth.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
const accessToken = session.data.session?.access_token;
if (session.error || !accessToken) throw new Error(session.error?.message ?? "Could not verify the execution session.");

const baseUrl = process.env.DIRECTOR_SPRINT_TWO_BASE_URL ?? "http://localhost:3000";
const headers = { "content-type": "application/json", authorization: `Bearer ${accessToken}` };
const stage = process.argv[2] ?? "status";

async function request(body: Record<string, unknown>) {
  const response = await fetch(`${baseUrl}/api/admin/director-brain/sprint-two`, {
    method: "POST", headers, body: JSON.stringify(body),
  });
  const data = await response.json() as { error?: string };
  if (!response.ok) throw new Error(data.error ?? `Request failed with ${response.status}.`);
  return data;
}

const variants = runResult.data.variants as Array<{ id: string }>;
const completedResult = await admin.from("director_sprint_two_outputs")
  .select("variant_id,output_kind,duration_seconds,shot_index,status")
  .eq("run_id", runResult.data.id).eq("status", "succeeded");
if (completedResult.error) throw new Error(completedResult.error.message);
const completed = new Set((completedResult.data ?? []).map((item) => `${item.variant_id}:${item.output_kind}:${item.duration_seconds}:${item.shot_index}`));
if (stage === "mixes") {
  await request({ action: "mix-final-outputs", runId: runResult.data.id });
  console.log("Sprint 2 final mixes completed.");
} else if (stage === "keyframes") {
  const pending = variants.filter((variant) => !completed.has(`${variant.id}:keyframe:5:0`));
  const results = await Promise.allSettled(pending.map((variant) => request({
    action: "generate-keyframe", runId: runResult.data.id, variantId: variant.id,
    durationSeconds: 5, shotIndex: 0,
  })));
  const failed = results.filter((result) => result.status === "rejected");
  console.log(`Sprint 2 keyframes: ${results.length - failed.length}/${results.length} succeeded.`);
  for (const result of failed) console.error(result.reason instanceof Error ? result.reason.message : result.reason);
  if (failed.length) process.exitCode = 1;
} else if (stage === "videos") {
  const slots = variants.flatMap((variant) => [
    { variantId: variant.id, durationSeconds: 5, shotIndex: 1 },
    ...[1, 2, 3].map((shotIndex) => ({ variantId: variant.id, durationSeconds: 15, shotIndex })),
  ]).filter((slot) => !completed.has(`${slot.variantId}:video-shot:${slot.durationSeconds}:${slot.shotIndex}`));
  const results = await Promise.allSettled(slots.map((slot) => request({
    action: "generate-video-shot", runId: runResult.data.id, ...slot,
  })));
  const failed = results.filter((result) => result.status === "rejected");
  console.log(`Sprint 2 video shots: ${results.length - failed.length}/${results.length} succeeded.`);
  for (const result of failed) console.error(result.reason instanceof Error ? result.reason.message : result.reason);
  if (failed.length) process.exitCode = 1;
} else {
  const response = await fetch(`${baseUrl}/api/admin/director-brain/sprint-two`, { headers: { authorization: `Bearer ${accessToken}` } });
  const data = await response.json() as { matrix?: unknown; voice?: unknown };
  if (!response.ok) throw new Error((data as { error?: string }).error ?? `Request failed with ${response.status}.`);
  console.log(JSON.stringify({ matrix: data.matrix, voice: data.voice }, null, 2));
}
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
