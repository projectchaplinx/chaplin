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
  const superAdminEmail = process.env.DIRECTOR_SPRINT_ADMIN_EMAIL?.trim() || "chaplin@chaplin.com";
  const users = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (users.error) throw new Error(users.error.message);
  const user = users.data.users.find((item) => item.email?.toLowerCase() === superAdminEmail.toLowerCase());
  if (!user?.email) throw new Error(`The established Super Admin account ${superAdminEmail} does not exist.`);
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email: user.email });
  const tokenHash = link.data.properties?.hashed_token;
  if (link.error || !tokenHash) throw new Error(link.error?.message ?? "Could not mint a Sprint 1 execution session.");
  const verified = await auth.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
  const accessToken = verified.data.session?.access_token;
  if (verified.error || !accessToken) throw new Error(verified.error?.message ?? "Could not verify the Sprint 1 execution session.");
  const baseUrl = process.env.DIRECTOR_SPRINT_ONE_BASE_URL ?? "http://localhost:3000";
  const headers = { "content-type": "application/json", authorization: `Bearer ${accessToken}` };
  async function json(pathname: string, init?: RequestInit) {
    const response = await fetch(`${baseUrl}${pathname}`, { ...init, headers: { ...headers, ...(init?.headers ?? {}) } });
    const data = await response.json() as any;
    if (!response.ok) throw new Error(data.error ?? `Request failed with ${response.status}.`);
    return data;
  }
  let bundle = await json("/api/admin/director-brain/sprint-one/test");
  if (!bundle.test) {
    const character = bundle.characters.find((item: any) => item.name === "Nova Calloway")
      ?? bundle.characters.find((item: any) => item.name === "Arjan Devraj")
      ?? bundle.characters[0];
    if (!character) throw new Error("No marketplace character is available for Sprint 1.");
    const brief = `${character.name} waits alone on a quiet station platform. A distant sound makes them stop mid-step, choose not to turn, and tighten one hand around a folded ticket. One continuous five-second medium shot with a clear beginning, reaction, and landing.`;
    bundle = await json("/api/admin/director-brain/sprint-one/test", { method: "POST", body: JSON.stringify({ characterId: character.id, brief }) });
  }
  const test = bundle.test;
  const existing = (stage: "image" | "video", variantId: string) => test.results.find((item: any) => item.stage === stage && item.variantId === variantId);
  const images = test.variants.filter((variant: any) => !existing("image", variant.id));
  const imageResults = await Promise.allSettled(images.map((variant: any) => json("/api/generate", {
    method: "POST", body: JSON.stringify({ action: "image", characterId: test.characterId, directorSprint: { testId: test.id, variantId: variant.id } }),
  })));
  bundle = await json("/api/admin/director-brain/sprint-one/test");
  const pendingVideos = bundle.test.variants.filter((variant: any) => {
    const keyframe = bundle.test.results.find((item: any) => item.stage === "image" && item.variantId === variant.id);
    const video = bundle.test.results.find((item: any) => item.stage === "video" && item.variantId === variant.id);
    return keyframe?.status === "succeeded" && !video;
  });
  const videoResults = await Promise.allSettled(pendingVideos.map((variant: any) => json("/api/generate", {
    method: "POST", body: JSON.stringify({ action: "video", characterId: bundle.test.characterId, directorSprint: { testId: bundle.test.id, variantId: variant.id } }),
  })));
  bundle = await json("/api/admin/director-brain/sprint-one/test");
  const summarize = (results: PromiseSettledResult<any>[]) => ({ succeeded: results.filter((item) => item.status === "fulfilled").length, failed: results.filter((item) => item.status === "rejected").map((item: any) => item.reason instanceof Error ? item.reason.message : String(item.reason)) });
  console.log(JSON.stringify({ testId: bundle.test.id, character: bundle.test.characterName, images: summarize(imageResults), videos: summarize(videoResults), persisted: bundle.test.results.map((item: any) => ({ variantId: item.variantId, stage: item.stage, status: item.status, url: item.url })) }, null, 2));
  if (bundle.test.results.filter((item: any) => item.stage === "image" && item.status === "succeeded").length !== 6
    || bundle.test.results.filter((item: any) => item.stage === "video" && item.status === "succeeded").length !== 6) process.exitCode = 2;
}

void main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
