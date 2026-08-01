import { loadEnvConfig } from "@next/env";
import postgres from "postgres";
import { DIRECTOR_SPRINT_ONE_KEY } from "../src/lib/director-sprint-one";

loadEnvConfig(process.cwd());
if (!process.env.SUPABASE_DB_URL) throw new Error("SUPABASE_DB_URL is missing.");
const sql = postgres(process.env.SUPABASE_DB_URL, { ssl: "require", max: 1 });

async function main() {
  try {
    const [run] = await sql<any[]>`
      select id,status,principle_count,discard_count,park_count,candidate_count
      from director_sprint_runs where sprint_key=${DIRECTOR_SPRINT_ONE_KEY} and status='succeeded'
      order by created_at desc limit 1
    `;
    if (!run) throw new Error("The successful ranked Sprint 1 run does not exist.");
    const [assessment] = await sql<any[]>`
      select count(*)::int total,
        count(*) filter(where lane='discard')::int discard,
        count(*) filter(where lane='park')::int park,
        count(*) filter(where lane='candidate')::int candidate,
        count(*) filter(where lane='candidate' and candidate_rank is not null)::int ranked_candidates,
        count(*) filter(where shortlist_rank is not null)::int shortlist
      from director_principle_assessments where sprint_run_id=${run.id}
    `;
    const [reviews] = await sql<any[]>`
      select count(*)::int total,
        count(*) filter(where assessment.shortlist_rank is not null)::int shortlist_reviews,
        count(*) filter(where assessment.shortlist_rank is null)::int outside_shortlist,
        count(*) filter(where review.verdict='verified')::int verified,
        count(*) filter(where review.verdict='rejected')::int rejected
      from director_principle_playback_reviews review
      join director_principle_assessments assessment on assessment.id=review.assessment_id
      where assessment.sprint_run_id=${run.id}
    `;
    const [test] = await sql<any[]>`
      select test.*,asset.url shipped_url
      from director_sprint_shot_tests test
      left join media_assets asset on asset.id=test.shipped_asset_id
      where test.sprint_run_id=${run.id} order by test.created_at desc limit 1
    `;
    let production = null;
    if (test) {
      const [counts] = await sql<any[]>`
        select
          count(*) filter(where result.experiment_id=${test.image_experiment_id})::int image_results,
          count(*) filter(where result.experiment_id=${test.image_experiment_id} and result.status='succeeded')::int images_succeeded,
          count(*) filter(where result.experiment_id=${test.video_experiment_id})::int video_results,
          count(*) filter(where result.experiment_id=${test.video_experiment_id} and result.status='succeeded')::int videos_succeeded,
          count(distinct trace.id) filter(where result.experiment_id=${test.video_experiment_id})::int linked_video_traces
        from pipeline_experiment_results result
        left join director_decision_traces trace on trace.generation_job_id=result.generation_job_id
        where result.experiment_id in (${test.image_experiment_id},${test.video_experiment_id})
      `;
      const [scoreCounts] = await sql<any[]>`
        select count(*)::int scores,
          count(*) filter(where score.identity_gate='pass')::int identity_passes,
          count(distinct score.evaluation_id)::int linked_evaluations
        from director_sprint_shot_scores score where score.test_id=${test.id}
      `;
      production = { testId: test.id, status: test.status, variantCount: Array.isArray(test.variants) ? test.variants.length : 0,
        outcome: test.outcome, winner: test.winner_variant_id, shippedAssetId: test.shipped_asset_id,
        shippedEvaluationId: test.shipped_evaluation_id, shippedUrl: test.shipped_url, ...counts, ...scoreCounts };
    }
    const checks = {
      triaged282: assessment.total === 282 && assessment.discard + assessment.park + assessment.candidate === 282,
      candidateDigest: assessment.candidate <= 40 && assessment.ranked_candidates === assessment.candidate,
      rankedTopFive: assessment.shortlist === 5,
      onlyTopFivePlaybackVerified: reviews.total === 5 && reviews.shortlist_reviews === 5 && reviews.outside_shortlist === 0 && reviews.verified === 5 && reviews.rejected === 0,
      exactGenerationCeiling: production?.variantCount === 6 && production?.image_results === 6 && production?.video_results === 6,
      completeGeneration: production?.images_succeeded === 6 && production?.videos_succeeded === 6,
      visibleEvidence: production?.linked_video_traces === 6 && production?.scores === 6 && production?.linked_evaluations === 6,
      shippedLinkedShot: production?.status === "shipped" && Boolean(production?.shippedAssetId && production?.shippedEvaluationId && production?.shippedUrl),
    };
    console.log(JSON.stringify({ sprintKey: DIRECTOR_SPRINT_ONE_KEY, run, assessment, reviews, production, checks, complete: Object.values(checks).every(Boolean) }, null, 2));
    if (!Object.values(checks).every(Boolean)) process.exitCode = 2;
  } finally {
    await sql.end();
  }
}

void main();
