import { loadEnvConfig } from "@next/env";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import postgres from "postgres";
import { canonicalAutoEvaluation } from "@/lib/auto-evaluation";
import { DIRECTOR_EVALUATION_VERSION } from "@/lib/director-evaluation";
import { estimateDirectorResearchCost } from "@/lib/director-research-cost";

loadEnvConfig(process.cwd());
const apiKey = process.env.OPENAI_API_KEY;
const databaseUrl = process.env.SUPABASE_DB_URL;
const model = process.env.OPENAI_RESEARCH_MODEL?.trim() || process.env.OPENAI_WRITING_MODEL?.trim() || "gpt-5.6-terra";
if (!apiKey || !databaseUrl || !ffmpegPath) throw new Error("OpenAI, database, and FFmpeg configuration are required.");
const sql = postgres(databaseUrl, { ssl: "require", max: 4 });
const execute = promisify(execFile);

const SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    identityContinuity: { type: "number", minimum: 0, maximum: 100 },
    performance: { type: "number", minimum: 0, maximum: 100 },
    shotReadability: { type: "number", minimum: 0, maximum: 100 },
    lightingContinuity: { type: "number", minimum: 0, maximum: 100 },
    offFaceDuringSpeech: { type: "boolean" },
    evidence: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 8 },
  },
  required: ["identityContinuity", "performance", "shotReadability", "lightingContinuity", "offFaceDuringSpeech", "evidence"],
};

function outputText(data: { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> }) {
  if (data.output_text) return data.output_text;
  for (const item of data.output ?? []) for (const content of item.content ?? []) if (content.type === "output_text" && content.text) return content.text;
  throw new Error("Evaluator returned no structured output.");
}

async function evaluate(row: Record<string, any>) {
  const directory = await mkdtemp(path.join(tmpdir(), "chaplin-sprint-two-eval-"));
  try {
    const video = path.join(directory, "output.mp4");
    const sheet = path.join(directory, "sheet.jpg");
    const response = await fetch(row.url);
    if (!response.ok) throw new Error(`Download final output: ${response.status}`);
    await writeFile(video, Buffer.from(await response.arrayBuffer()));
    await execute(ffmpegPath!, ["-y", "-i", video, "-vf", `fps=${row.duration_seconds === 5 ? 1 : 0.5},scale=480:-1,tile=3x2:padding=4:margin=4`, "-frames:v", "1", sheet], { timeout: 120_000, windowsHide: true });
    const image = (await readFile(sheet)).toString("base64");
    const openai = await fetch("https://api.openai.com/v1/responses", {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model, store: false, reasoning: { effort: "none" }, max_output_tokens: 800,
        instructions: "You are Chaplin's automatic finished-video evaluator. Compare the chronological contact sheet to the canonical actor reference. Score only visible evidence. Identity is a hard gate. The Path B line is post-mixed; it passes lip-sync safety only when the actor's speaking mouth is not visibly readable during the line. Do not reward beauty over continuity.",
        input: [{ role: "user", content: [
          { type: "input_text", text: `Duration ${row.duration_seconds}s. Variant ${row.variant_id}. The locked line begins near ${row.duration_seconds === 5 ? "0.7" : "5.7"} seconds. What changed: ${row.what_changed}` },
          { type: "input_image", image_url: row.character_image, detail: "high" },
          { type: "input_image", image_url: `data:image/jpeg;base64,${image}`, detail: "high" },
        ] }],
        text: { format: { type: "json_schema", name: "finished_output_evaluation", strict: true, schema: SCHEMA } },
      }),
      signal: AbortSignal.timeout(240_000),
    });
    const data = await openai.json() as any;
    if (!openai.ok) throw new Error(data.error?.message ?? `OpenAI returned ${openai.status}`);
    const result = JSON.parse(outputText(data));
    const identityGate = result.identityContinuity >= 70 ? "pass" : "fail";
    const audioGate = "pass";
    const lipSyncGate = result.offFaceDuringSpeech ? "not-applicable" : "fail";
    const composite = Math.round((result.identityContinuity * 0.35 + result.performance * 0.25 + result.shotReadability * 0.2 + result.lightingContinuity * 0.15 + 100 * 0.05) * 100) / 100;
    const nullResult = row.variant_id !== "control" && composite <= Number(row.control_score ?? -1);
    const evidence = { observations: result.evidence, offFaceDuringSpeech: result.offFaceDuringSpeech, voicePath: row.voice_path, automatic: true };
    const cost = estimateDirectorResearchCost((data.usage ?? {}) as Record<string, unknown>);
    const [evaluation] = await sql`
      insert into director_sprint_two_evaluations (
        run_id,output_id,model,response_id,identity_continuity,performance,shot_readability,
        lighting_continuity,audio_completeness,lip_sync,composite_score,identity_gate,audio_gate,
        lip_sync_gate,null_result,evidence,usage,cost_usd
      ) values (
        ${row.run_id},${row.id},${model},${data.id ?? null},${result.identityContinuity},${result.performance},${result.shotReadability},
        ${result.lightingContinuity},100,${null},${composite},${identityGate},${audioGate},${lipSyncGate},${nullResult},
        ${sql.json(evidence)},${sql.json(data.usage ?? {})},${cost.costUsd}
      ) returning id
    `;
    /*
      The canonical row goes through the shared 1-5 integer contract. The old
      raw insert stored 0-100 floats under invented dimension names, which the
      read-path normalizer silently discarded — every Sprint 2 evaluation read
      back as an empty scorecard with an unexplained "fail".
    */
    const canonical = canonicalAutoEvaluation("video", {
      identity_wardrobe: result.identityContinuity,
      performance_believability: result.performance,
      cinematic_language: result.shotReadability,
      temporal_progression: result.lightingContinuity,
      audio_source: result.offFaceDuringSpeech ? 80 : 40,
    });
    await sql`
      insert into director_evaluations (
        output_asset_id,stage,rubric_version,evaluator_kind,status,scores,evidence,composite_score,
        axis_scores,gate_status,gate_failures,reviewer_notes,reviewed_at
      ) values (
        ${row.asset_id},'video',${DIRECTOR_EVALUATION_VERSION},'automatic','draft',
        ${sql.json(canonical.scores)},
        ${sql.json({ sprintTwoEvaluationId: evaluation.id, rawPercent: { identity: result.identityContinuity, performance: result.performance, readability: result.shotReadability, lighting: result.lightingContinuity }, ...evidence })},
        ${canonical.summary.score},
        ${sql.json(canonical.summary.axisScores)},
        ${canonical.summary.gateStatus},${canonical.summary.gateFailures},
        'Automatic Sprint 2 measurement on the canonical scale; partial dimensions, so status stays draft. Human pick remains required.',${null}
      )
    `;
    return { id: row.id, composite, identityGate, lipSyncGate };
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function main() {
  try {
    const rows = await sql<any[]>`
      select output.id,output.run_id,output.variant_id,output.duration_seconds,output.asset_id,
        output.what_changed,output.voice_path,asset.url,coalesce(character.image_url,keyframe_asset.url) as character_image
      from director_sprint_two_outputs output
      join director_sprint_two_runs run on run.id=output.run_id
      join media_assets asset on asset.id=output.asset_id
      join characters character on character.id=run.character_id
      join director_sprint_two_outputs keyframe on keyframe.run_id=output.run_id and keyframe.variant_id=output.variant_id
        and keyframe.output_kind='keyframe' and keyframe.status='succeeded'
      join media_assets keyframe_asset on keyframe_asset.id=keyframe.asset_id
      left join director_sprint_two_evaluations evaluation on evaluation.output_id=output.id
      where output.output_kind='final-mix' and output.status='succeeded' and evaluation.id is null
      order by output.duration_seconds,case when output.variant_id='control' then 0 else 1 end,output.variant_id
    `;
    const results: any[] = [];
    const controlScores = new Map<number, number>();
    for (const row of rows) {
      const result = await evaluate({ ...row, control_score: controlScores.get(Number(row.duration_seconds)) });
      results.push(result);
      if (row.variant_id === "control") controlScores.set(Number(row.duration_seconds), result.composite);
    }
    await sql`
      update director_sprint_two_runs run set status=case
        when (select count(distinct output.duration_seconds) from director_sprint_two_evaluations evaluation join director_sprint_two_outputs output on output.id=evaluation.output_id where evaluation.run_id=run.id and evaluation.identity_gate='pass' and evaluation.audio_gate='pass' and evaluation.lip_sync_gate in ('pass','not-applicable'))=2
          then 'needs_human_pick'
        else 'failed'
      end,updated_at=now()
      where id in (select distinct run_id from director_sprint_two_evaluations)
    `;
    console.log(`Sprint 2 automatic evaluations: ${results.length} completed; ${results.filter((item) => item.identityGate === "pass" && item.lipSyncGate !== "fail").length} passed hard gates.`);
  } finally {
    await sql.end();
  }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
