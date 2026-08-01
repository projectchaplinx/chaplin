import { loadEnvConfig } from "@next/env";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import postgres from "postgres";
import { DIRECTOR_SPRINT_ONE_KEY } from "../src/lib/director-sprint-one";

loadEnvConfig(process.cwd());
const databaseUrl = process.env.SUPABASE_DB_URL;
const apiKey = process.env.OPENAI_API_KEY;
const model = process.env.OPENAI_RESEARCH_MODEL?.trim()
  || process.env.OPENAI_WRITING_MODEL?.trim()
  || "gpt-5.6-terra";
if (!databaseUrl) throw new Error("SUPABASE_DB_URL is missing.");
if (!apiKey) throw new Error("OPENAI_API_KEY is missing.");
if (!ffmpegPath) throw new Error("The bundled FFmpeg binary is unavailable.");

const sql = postgres(databaseUrl, { ssl: "require", max: 5 });
const execFileAsync = promisify(execFile);
const SPRINT_KEY = "character-principles-2026-08-02-dense-verifier-v2";
const SAMPLE_FPS = 2;
const EXPECTED_CANDIDATES = 37;
const MAX_PARALLEL = 4;

type Candidate = {
  id: string;
  sprint_run_id: string;
  principle_text: string;
  character_axis: "identity" | "performance" | "framing" | "blocking" | "other";
  agreement_key: string;
  rank_score: number;
  candidate_rank: number;
  work_title: string;
  start_second: number;
  duration_seconds: number;
  playback_url: string;
  media_url: string | null;
  human_verdict: "verified" | "rejected" | null;
  human_notes: string | null;
};

type Verification = {
  verdict: "held" | "refuted";
  evidenceSummary: string;
  refutation: string;
  confidence: number;
  motionEvidence: Array<{ fromSecond: number; toSecond: number; observation: string }>;
};

const VERIFIER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "evidenceSummary", "refutation", "confidence", "motionEvidence"],
  properties: {
    verdict: { type: "string", enum: ["held", "refuted"] },
    evidenceSummary: { type: "string" },
    refutation: { type: "string" },
    confidence: { type: "number", minimum: 0, maximum: 100 },
    motionEvidence: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["fromSecond", "toSecond", "observation"],
        properties: {
          fromSecond: { type: "number", minimum: 0, maximum: 30 },
          toSecond: { type: "number", minimum: 0, maximum: 30 },
          observation: { type: "string" },
        },
      },
    },
  },
} as const;

function outputText(data: { output_text?: unknown; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> }) {
  if (typeof data.output_text === "string") return data.output_text;
  return (data.output ?? []).flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text")
    .map((item) => item.text ?? "").join("");
}

async function buildDenseSheets(candidate: Candidate, directory: string) {
  const candidateDirectory = path.join(directory, candidate.id);
  await execFileAsync(ffmpegPath!, [
    "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
    "-ss", String(candidate.start_second),
    "-t", String(candidate.duration_seconds),
    "-i", candidate.media_url || candidate.playback_url,
    "-vf", `fps=${SAMPLE_FPS},scale=480:-2,tile=3x2:padding=2:margin=2`,
    "-frames:v", "10",
    path.join(candidateDirectory, "sheet-%02d.jpg"),
  ], { timeout: 180_000, windowsHide: true, maxBuffer: 10 * 1024 * 1024 }).catch(async (error) => {
    // FFmpeg does not create nested output directories.
    const { mkdir } = await import("node:fs/promises");
    await mkdir(candidateDirectory, { recursive: true });
    return execFileAsync(ffmpegPath!, [
      "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
      "-ss", String(candidate.start_second), "-t", String(candidate.duration_seconds),
      "-i", candidate.media_url || candidate.playback_url,
      "-vf", `fps=${SAMPLE_FPS},scale=480:-2,tile=3x2:padding=2:margin=2`,
      "-frames:v", "10", path.join(candidateDirectory, "sheet-%02d.jpg"),
    ], { timeout: 180_000, windowsHide: true, maxBuffer: 10 * 1024 * 1024 }).catch(() => { throw error; });
  });
  const files = (await readdir(candidateDirectory)).filter((file) => file.endsWith(".jpg")).sort();
  if (files.length !== 10) throw new Error(`${candidate.work_title} produced ${files.length} dense sheets; expected ten.`);
  const sheets = await Promise.all(files.map(async (file, index) => {
    const bytes = await readFile(path.join(candidateDirectory, file));
    return {
      index,
      startSecond: index * 3,
      endSecond: Math.min(30, (index + 1) * 3),
      sha256: createHash("sha256").update(bytes).digest("hex"),
      dataUrl: `data:image/jpeg;base64,${bytes.toString("base64")}`,
    };
  }));
  return sheets;
}

async function verifyCandidate(candidate: Candidate, directory: string) {
  const sheets = await buildDenseSheets(candidate, directory);
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      store: false,
      reasoning: { effort: "none" },
      max_output_tokens: 1200,
      instructions: `You are Chaplin's adversarial dense-frame film-craft verifier. The ten sheets contain every sampled frame from one exact 30-second passage at 2 fps, in chronological order; each sheet is three seconds and each cell is 0.5 seconds apart. Test only the supplied principle. Look for the observable temporal relation the principle claims, not merely a compatible still. Try to refute it. If motion, order, or subject continuity is ambiguous, verdict must be refuted. Do not identify people, infer dialogue, or rely on outside knowledge. Do not demand proof of authorial intent: wording such as "can carry" describes an observable affordance, so multiple readable gaze/posture changes during a sustained hold are sufficient. A held verdict requires at least two timestamped observations that jointly demonstrate the claimed change or persistence.`,
      input: [{
        role: "user",
        content: [
          { type: "input_text", text: `Work: ${candidate.work_title}\nExact passage: ${candidate.start_second}s to ${candidate.start_second + candidate.duration_seconds}s in the source.\nPrinciple under test: ${candidate.principle_text}\nReturn passage-relative seconds from 0 to 30. Default to refuted when uncertain.` },
          ...sheets.map((sheet) => ({ type: "input_image", image_url: sheet.dataUrl, detail: "high" })),
        ],
      }],
      text: { format: { type: "json_schema", name: "dense_principle_verification", strict: true, schema: VERIFIER_SCHEMA } },
    }),
    signal: AbortSignal.timeout(240_000),
  });
  const data = await response.json() as {
    id?: string;
    error?: { message?: string };
    output_text?: string;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  if (!response.ok) throw new Error(data.error?.message ?? `OpenAI returned ${response.status}.`);
  const parsed = JSON.parse(outputText(data)) as Verification;
  if (parsed.verdict === "held" && parsed.motionEvidence.length < 2) {
    parsed.verdict = "refuted";
    parsed.refutation = "The response did not provide the two independent timestamped motion observations required to hold the principle.";
  }
  if (parsed.verdict === "refuted" && parsed.refutation.trim().length < 20) {
    parsed.refutation = "Dense-frame evidence did not establish the claimed temporal relation with sufficient certainty.";
  }
  return {
    result: parsed,
    responseId: data.id ?? null,
    usage: data.usage ?? {},
    manifest: {
      source: candidate.media_url || candidate.playback_url,
      canonicalPlaybackUrl: candidate.playback_url,
      sourceStartSecond: candidate.start_second,
      sourceDurationSeconds: candidate.duration_seconds,
      sampledFps: SAMPLE_FPS,
      frameCount: 60,
      sheets: sheets.map(({ dataUrl: _dataUrl, ...sheet }) => sheet),
    },
  };
}

async function concurrentMap<T>(items: T[], limit: number, task: (item: T) => Promise<void>) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      await task(item);
    }
  });
  await Promise.all(workers);
}

function chooseDiverseShortlist(rows: Array<Candidate & { verdict: "held" | "refuted" }>) {
  const eligible = rows.filter((row) => row.verdict === "held")
    .filter((row, index, all) => all.findIndex((candidate) => (
      candidate.character_axis === row.character_axis && candidate.agreement_key === row.agreement_key
    )) === index);
  let best: Candidate[] = [];
  let bestScore = -Infinity;
  const visit = (start: number, chosen: Candidate[]) => {
    if (chosen.length === 5) {
      const axes = new Set(chosen.map((row) => row.character_axis));
      if (axes.size < 3) return;
      if ([...axes].some((axis) => chosen.filter((row) => row.character_axis === axis).length > 2)) return;
      const score = chosen.reduce((total, row) => total + Number(row.rank_score), 0);
      if (score > bestScore) { best = [...chosen]; bestScore = score; }
      return;
    }
    for (let index = start; index <= eligible.length - (5 - chosen.length); index += 1) {
      const candidate = eligible[index];
      if (chosen.filter((row) => row.character_axis === candidate.character_axis).length >= 2) continue;
      visit(index + 1, [...chosen, candidate]);
    }
  };
  visit(0, []);
  if (best.length !== 5) throw new Error("Dense-held principles cannot form an honest five-item shortlist spanning three axes.");
  return best.sort((left, right) => Number(right.rank_score) - Number(left.rank_score));
}

async function main() {
  const workDirectory = await mkdtemp(path.join(tmpdir(), "chaplin-dense-verifier-"));
  try {
    const candidates = await sql<Candidate[]>`
      select assessment.id, assessment.sprint_run_id, assessment.principle_text,
        assessment.character_axis, assessment.agreement_key,
        assessment.rank_score::float8 as rank_score, assessment.candidate_rank,
        study.work_title, timed.start_second::float8 as start_second,
        timed.duration_seconds::float8 as duration_seconds, timed.playback_url, timed.media_url,
        review.verdict as human_verdict, review.review_notes as human_notes
      from director_principle_assessments assessment
      join director_scene_studies study on study.id = assessment.study_id
      join director_timed_media_analyses timed on timed.id = assessment.timed_media_analysis_id
      left join director_principle_playback_reviews review on review.assessment_id = assessment.id
      where assessment.sprint_key = ${DIRECTOR_SPRINT_ONE_KEY} and assessment.lane = 'candidate'
      order by assessment.shortlist_rank nulls last, assessment.candidate_rank
    `;
    if (candidates.length !== EXPECTED_CANDIDATES) throw new Error(`Expected 37 candidates; found ${candidates.length}.`);
    if (candidates.some((candidate) => !candidate.playback_url || candidate.duration_seconds !== 30)) {
      throw new Error("Every Sprint 2 candidate needs an exact 30-second trusted playback passage.");
    }
    const sourceSprintRunId = candidates[0].sprint_run_id;
    let [run] = await sql`select * from director_dense_verifier_runs where sprint_key = ${SPRINT_KEY}`;
    if (!run) {
      [run] = await sql`
        insert into director_dense_verifier_runs (
          sprint_key, source_sprint_run_id, model, created_by
        ) values (${SPRINT_KEY}, ${sourceSprintRunId}, ${model}, 'codex-sprint-two-verifier') returning *
      `;
    }
    const existingRows = await sql`select assessment_id,verdict,response_id,usage from director_dense_verifications where verifier_run_id = ${run.id}`;
    const existing = new Map(existingRows.map((row) => [String(row.assessment_id), row]));
    const responseIds = existingRows.map((row) => row.response_id).filter(Boolean);
    let inputTokens = existingRows.reduce((sum, row) => sum + Number(row.usage?.input_tokens ?? 0), 0);
    let outputTokens = existingRows.reduce((sum, row) => sum + Number(row.usage?.output_tokens ?? 0), 0);

    const persist = async (candidate: Candidate) => {
      if (existing.has(candidate.id)) return;
      const verified = await verifyCandidate(candidate, workDirectory);
      const humanVerdict = candidate.human_verdict ? (candidate.human_verdict === "verified" ? "held" : "refuted") : null;
      const calibrationMatch = humanVerdict ? humanVerdict === verified.result.verdict : null;
      await sql`
        insert into director_dense_verifications (
          verifier_run_id, assessment_id, verdict, frame_count, sampled_fps,
          evidence_manifest, evidence_summary, refutation, confidence,
          human_verdict, calibration_match, model, response_id, usage
        ) values (
          ${run.id}, ${candidate.id}, ${verified.result.verdict}, 60, ${SAMPLE_FPS},
          ${sql.json(verified.manifest)}, ${verified.result.evidenceSummary.slice(0, 4000)},
          ${verified.result.refutation.slice(0, 4000)}, ${verified.result.confidence},
          ${humanVerdict}, ${calibrationMatch}, ${model}, ${verified.responseId}, ${sql.json(verified.usage)}
        )
      `;
      existing.set(candidate.id, { assessment_id: candidate.id, verdict: verified.result.verdict });
      if (verified.responseId) responseIds.push(verified.responseId);
      inputTokens += Number(verified.usage.input_tokens ?? 0);
      outputTokens += Number(verified.usage.output_tokens ?? 0);
      process.stdout.write(`${JSON.stringify({ assessmentId: candidate.id, work: candidate.work_title, verdict: verified.result.verdict, calibrationMatch })}\n`);
    };

    const calibration = candidates.filter((candidate) => candidate.human_verdict).slice(0, 5);
    if (calibration.length !== 5) throw new Error("The verifier needs all five preserved human playback verdicts for calibration.");
    await concurrentMap(calibration, MAX_PARALLEL, persist);
    const calibrationRows = await sql`select calibration_match from director_dense_verifications where verifier_run_id = ${run.id} and human_verdict is not null`;
    const calibrationMatches = calibrationRows.filter((row) => row.calibration_match === true).length;
    if (calibrationRows.length !== 5 || calibrationMatches !== 5) {
      await sql`update director_dense_verifier_runs set status='calibration_failed', calibration_count=${calibrationRows.length}, calibration_matches=${calibrationMatches}, calibrated=false, failure_summary='The adversarial verifier disagreed with preserved human playback evidence; no automatic expansion was authorized.', completed_at=now() where id=${run.id}`;
      throw new Error(`Verifier calibration failed: ${calibrationMatches}/5 matched. Correct the verifier before processing the remaining candidates.`);
    }

    await concurrentMap(candidates.filter((candidate) => !candidate.human_verdict), MAX_PARALLEL, persist);
    const finalRows = await sql<Array<{ assessment_id: string; verdict: "held" | "refuted" }>>`select assessment_id,verdict from director_dense_verifications where verifier_run_id=${run.id}`;
    if (finalRows.length !== EXPECTED_CANDIDATES) throw new Error(`Dense verifier preserved ${finalRows.length}/37 verdicts.`);
    const verdictByAssessment = new Map(finalRows.map((row) => [row.assessment_id, row.verdict]));
    const shortlist = chooseDiverseShortlist(candidates.map((candidate) => ({ ...candidate, verdict: verdictByAssessment.get(candidate.id)! })));
    const shortlistEntries = shortlist.map((candidate, index) => ({
      assessmentId: candidate.id,
      rank: index + 1,
      axis: candidate.character_axis,
      duplicateKey: candidate.agreement_key,
      score: candidate.rank_score,
      rationale: `Dense 2 fps evidence held. Highest diverse surviving hypothesis on the ${candidate.character_axis} axis after near-duplicate collapse.`,
    }));
    const costUsd = ((inputTokens * Number(process.env.OPENAI_TERRA_INPUT_USD_PER_MILLION_TOKENS ?? "2.5"))
      + (outputTokens * Number(process.env.OPENAI_TERRA_OUTPUT_USD_PER_MILLION_TOKENS ?? "15"))) / 1_000_000;
    await sql.begin(async (transaction) => {
      await transaction`
        update director_dense_verifier_runs set status='succeeded', calibration_count=5,
          calibration_matches=5, calibrated=true,
          usage=${transaction.json({ input_tokens: inputTokens, output_tokens: outputTokens })},
          cost_usd=${costUsd}, response_ids=${responseIds}, failure_summary='', completed_at=now()
        where id=${run.id}
      `;
      const existingShortlist = await transaction`select count(*)::int as count from director_dense_shortlist_entries where verifier_run_id=${run.id}`;
      if (Number(existingShortlist[0]?.count ?? 0) === 0) {
        await transaction`select lock_director_dense_shortlist(${run.id}, ${transaction.json(shortlistEntries)})`;
      }
    });
    console.log(JSON.stringify({
      runId: run.id,
      verified: finalRows.length,
      held: finalRows.filter((row) => row.verdict === "held").length,
      refuted: finalRows.filter((row) => row.verdict === "refuted").length,
      calibration: "5/5",
      shortlist: shortlistEntries,
      usage: { inputTokens, outputTokens, costUsd },
    }, null, 2));
  } finally {
    await rm(workDirectory, { recursive: true, force: true }).catch(() => undefined);
    await sql.end();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
