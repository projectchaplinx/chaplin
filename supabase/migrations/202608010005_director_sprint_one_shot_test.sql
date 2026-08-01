-- Director Brain Sprint 1: one preserved control-versus-five character-shot test.
-- The test can only be initialized after all five shortlisted principles have
-- immutable verified playback reviews. Generation remains capped at one image
-- and one video result per variant, with six variants total.

create table if not exists public.director_sprint_shot_tests (
  id uuid primary key default gen_random_uuid(),
  sprint_run_id uuid not null references public.director_sprint_runs(id) on delete restrict,
  sprint_key text not null unique,
  character_id text not null references public.characters(id) on delete restrict,
  brief text not null check (char_length(brief) between 40 and 2000),
  invariant_hash text not null check (char_length(invariant_hash) between 32 and 128),
  baseline_revision integer not null check (baseline_revision > 0),
  image_experiment_id uuid not null unique references public.pipeline_experiments(id) on delete restrict,
  video_experiment_id uuid not null unique references public.pipeline_experiments(id) on delete restrict,
  variants jsonb not null check (jsonb_typeof(variants) = 'array' and jsonb_array_length(variants) = 6),
  status text not null default 'initialized' check (status in ('initialized', 'decided', 'shipped', 'failed')),
  human_preference_variant_id text,
  winner_variant_id text,
  outcome text check (outcome is null or outcome in ('challenger-won', 'control-held')),
  shipped_asset_id uuid references public.media_assets(id) on delete restrict,
  shipped_evaluation_id uuid references public.director_evaluations(id) on delete restrict,
  outcome_summary text not null default '' check (char_length(outcome_summary) <= 4000),
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  decided_at timestamptz,
  shipped_at timestamptz
);

create table if not exists public.director_sprint_shot_scores (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references public.director_sprint_shot_tests(id) on delete restrict,
  variant_id text not null,
  video_result_id uuid not null unique references public.pipeline_experiment_results(id) on delete restrict,
  evaluation_id uuid not null unique references public.director_evaluations(id) on delete restrict,
  identity_continuity smallint not null check (identity_continuity between 1 and 5),
  performance smallint not null check (performance between 1 and 5),
  shot_readability smallint not null check (shot_readability between 1 and 5),
  composite_score numeric(5,2) not null check (composite_score between 0 and 100),
  identity_gate text not null check (identity_gate in ('pass', 'fail')),
  review_notes text not null check (char_length(review_notes) between 20 and 4000),
  reviewed_by text not null,
  reviewed_at timestamptz not null default now(),
  unique(test_id, variant_id)
);

create index if not exists director_sprint_shot_scores_test_idx
  on public.director_sprint_shot_scores(test_id, variant_id);

alter table public.director_sprint_shot_tests enable row level security;
alter table public.director_sprint_shot_scores enable row level security;
revoke all on public.director_sprint_shot_tests from anon, authenticated;
revoke all on public.director_sprint_shot_scores from anon, authenticated;

create or replace function public.initialize_director_sprint_shot_test(
  p_sprint_run_id uuid,
  p_sprint_key text,
  p_character_id text,
  p_brief text,
  p_invariant_hash text,
  p_baseline_revision integer,
  p_reference_image_url text,
  p_variants jsonb,
  p_image_variants jsonb,
  p_video_variants jsonb,
  p_created_by text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  verified_count integer;
  shortlist_count integer;
  image_experiment uuid;
  video_experiment uuid;
  test_id uuid;
begin
  select count(*)::integer,
    count(*) filter (where review.verdict = 'verified')::integer
  into shortlist_count, verified_count
  from director_principle_assessments assessment
  left join director_principle_playback_reviews review on review.assessment_id = assessment.id
  where assessment.sprint_run_id = p_sprint_run_id and assessment.shortlist_rank is not null;

  if shortlist_count <> 5 or verified_count <> 5 then
    raise exception 'Sprint 1 generation stays dormant until all five shortlisted passages are playback-verified';
  end if;
  if jsonb_typeof(p_variants) <> 'array' or jsonb_array_length(p_variants) <> 6 then
    raise exception 'Sprint 1 requires exactly one control and five challengers';
  end if;
  if not exists (select 1 from characters where id = p_character_id) then
    raise exception 'Sprint 1 requires a real marketplace character';
  end if;

  insert into pipeline_experiments (
    name, stage, status, input_prompt, character_id, reference_image_url,
    baseline_revision, variants, target_dimensions, minimum_improvement,
    max_gate_regression, created_by, updated_at
  ) values (
    'Sprint 1 · six controlled keyframes', 'image', 'draft', p_brief,
    p_character_id, p_reference_image_url, p_baseline_revision, p_image_variants,
    array['identity_wardrobe','cinematic_language','image_quality'], 0, 0,
    p_created_by, now()
  ) returning id into image_experiment;

  insert into pipeline_experiments (
    name, stage, status, input_prompt, character_id, reference_image_url,
    baseline_revision, variants, target_dimensions, minimum_improvement,
    max_gate_regression, created_by, updated_at
  ) values (
    'Sprint 1 · control versus five shots', 'video', 'draft', p_brief,
    p_character_id, p_reference_image_url, p_baseline_revision, p_video_variants,
    array['identity_wardrobe','performance_believability','cinematic_language'], 0, 0,
    p_created_by, now()
  ) returning id into video_experiment;

  insert into director_sprint_shot_tests (
    sprint_run_id, sprint_key, character_id, brief, invariant_hash,
    baseline_revision, image_experiment_id, video_experiment_id, variants,
    created_by, created_at, updated_at
  ) values (
    p_sprint_run_id, p_sprint_key, p_character_id, p_brief, p_invariant_hash,
    p_baseline_revision, image_experiment, video_experiment, p_variants,
    p_created_by, now(), now()
  ) returning id into test_id;
  return test_id;
end;
$$;

create or replace function public.record_director_sprint_shot_score(
  p_test_id uuid,
  p_variant_id text,
  p_identity_continuity integer,
  p_performance integer,
  p_shot_readability integer,
  p_review_notes text,
  p_reviewer_id text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  test_row director_sprint_shot_tests%rowtype;
  result_row pipeline_experiment_results%rowtype;
  evaluation_id uuid;
  score_id uuid;
  composite numeric(5,2);
  gate text;
begin
  select * into test_row from director_sprint_shot_tests where id = p_test_id for update;
  if not found or test_row.status <> 'initialized' then
    raise exception 'This Sprint 1 test is not open for scoring';
  end if;
  if not exists (select 1 from jsonb_array_elements(test_row.variants) item where item->>'id' = p_variant_id) then
    raise exception 'Unknown Sprint 1 variant';
  end if;
  if p_identity_continuity not between 1 and 5
    or p_performance not between 1 and 5
    or p_shot_readability not between 1 and 5 then
    raise exception 'Every Sprint 1 score must be between 1 and 5';
  end if;
  if char_length(trim(p_review_notes)) < 20 then
    raise exception 'Record concrete playback evidence for this score';
  end if;
  select * into result_row
  from pipeline_experiment_results
  where experiment_id = test_row.video_experiment_id
    and variant_id = p_variant_id
    and status = 'succeeded'
    and output_asset_id is not null
  order by completed_at desc nulls last
  limit 1;
  if not found then raise exception 'A successful video is required before scoring'; end if;

  composite := round(((p_identity_continuity + p_performance + p_shot_readability)::numeric / 15) * 100, 2);
  gate := case when p_identity_continuity >= 3 then 'pass' else 'fail' end;

  insert into director_evaluations (
    decision_trace_id, experiment_result_id, generation_job_id, output_asset_id,
    stage, rubric_version, evaluator_kind, status, scores, evidence,
    composite_score, axis_scores, gate_status, gate_failures, reviewer_id,
    reviewer_notes, created_at, updated_at, reviewed_at
  ) values (
    (select id from director_decision_traces where generation_job_id = result_row.generation_job_id),
    result_row.id, result_row.generation_job_id, result_row.output_asset_id,
    'video', 'sprint-1-character-shot-2026.08.01', 'human', 'reviewed',
    jsonb_build_object(
      'identity_wardrobe', p_identity_continuity,
      'performance_believability', p_performance,
      'cinematic_language', p_shot_readability
    ),
    jsonb_build_object(
      'identity_wardrobe', trim(p_review_notes),
      'performance_believability', trim(p_review_notes),
      'cinematic_language', trim(p_review_notes)
    ),
    composite,
    jsonb_build_object(
      'continuity', p_identity_continuity * 20,
      'aesthetic', p_performance * 20,
      'instruction', p_shot_readability * 20
    ),
    gate,
    case when gate = 'fail' then array['identity_wardrobe']::text[] else '{}'::text[] end,
    p_reviewer_id, trim(p_review_notes), now(), now(), now()
  ) returning id into evaluation_id;

  insert into director_sprint_shot_scores (
    test_id, variant_id, video_result_id, evaluation_id,
    identity_continuity, performance, shot_readability, composite_score,
    identity_gate, review_notes, reviewed_by, reviewed_at
  ) values (
    p_test_id, p_variant_id, result_row.id, evaluation_id,
    p_identity_continuity, p_performance, p_shot_readability, composite,
    gate, trim(p_review_notes), p_reviewer_id, now()
  ) returning id into score_id;
  return score_id;
end;
$$;

create or replace function public.decide_director_sprint_shot_test(
  p_test_id uuid,
  p_human_preference_variant_id text,
  p_actor text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  test_row director_sprint_shot_tests%rowtype;
  control_score director_sprint_shot_scores%rowtype;
  preferred_score director_sprint_shot_scores%rowtype;
  winner text;
  result_kind text;
  summary text;
begin
  select * into test_row from director_sprint_shot_tests where id = p_test_id for update;
  if not found or test_row.status <> 'initialized' then raise exception 'This Sprint 1 test cannot be decided'; end if;
  if (select count(*) from director_sprint_shot_scores where test_id = p_test_id) <> 6 then
    raise exception 'Score all six videos before choosing the result';
  end if;
  select * into control_score from director_sprint_shot_scores where test_id = p_test_id and variant_id = 'control';
  select * into preferred_score from director_sprint_shot_scores where test_id = p_test_id and variant_id = p_human_preference_variant_id;
  if not found then raise exception 'Choose a reviewed human preference'; end if;

  if preferred_score.identity_gate = 'pass'
    and (p_human_preference_variant_id = 'control'
      or control_score.identity_gate = 'fail'
      or preferred_score.composite_score > control_score.composite_score) then
    winner := p_human_preference_variant_id;
  elsif control_score.identity_gate = 'pass' then
    winner := 'control';
  else
    raise exception 'No human-preferred shot passed the identity-and-continuity hard gate';
  end if;
  result_kind := case when winner = 'control' then 'control-held' else 'challenger-won' end;
  summary := case when winner = 'control'
    then format('Control held. Human preference was %s; the control remained the publishable winner after the identity hard gate and score comparison.', p_human_preference_variant_id)
    else format('Challenger %s beat control, passed the identity hard gate, and became the publishable winner.', winner)
  end;
  update director_sprint_shot_tests set
    status = 'decided', human_preference_variant_id = p_human_preference_variant_id,
    winner_variant_id = winner, outcome = result_kind, outcome_summary = summary,
    updated_at = now(), decided_at = now()
  where id = p_test_id;
  return winner;
end;
$$;

create or replace function public.ship_director_sprint_shot_test(
  p_test_id uuid,
  p_actor text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  test_row director_sprint_shot_tests%rowtype;
  score_row director_sprint_shot_scores%rowtype;
  result_row pipeline_experiment_results%rowtype;
begin
  select * into test_row from director_sprint_shot_tests where id = p_test_id for update;
  if not found or test_row.status <> 'decided' or test_row.winner_variant_id is null then
    raise exception 'Choose and record the Sprint 1 winner before shipping';
  end if;
  select * into score_row from director_sprint_shot_scores
    where test_id = p_test_id and variant_id = test_row.winner_variant_id;
  if not found or score_row.identity_gate <> 'pass' then
    raise exception 'The shipped shot must pass identity and continuity';
  end if;
  select * into result_row from pipeline_experiment_results
    where experiment_id = test_row.video_experiment_id
      and variant_id = test_row.winner_variant_id
      and status = 'succeeded' and output_asset_id is not null
    order by completed_at desc nulls last limit 1;
  if not found then raise exception 'The winning video artifact is missing'; end if;

  update characters set featured_video_asset_id = result_row.output_asset_id, updated_at = now()
    where id = test_row.character_id;
  update director_sprint_shot_tests set
    status = 'shipped', shipped_asset_id = result_row.output_asset_id,
    shipped_evaluation_id = score_row.evaluation_id, updated_at = now(), shipped_at = now()
    where id = p_test_id;
  return jsonb_build_object(
    'assetId', result_row.output_asset_id,
    'evaluationId', score_row.evaluation_id,
    'winnerVariantId', test_row.winner_variant_id
  );
end;
$$;

create or replace function public.enforce_director_sprint_generation_ceiling()
returns trigger language plpgsql set search_path = public as $$
declare
  test_row director_sprint_shot_tests%rowtype;
  stage_name text;
  result_count integer;
begin
  select * into test_row from director_sprint_shot_tests
    where image_experiment_id = new.experiment_id or video_experiment_id = new.experiment_id;
  if not found then return new; end if;
  perform pg_advisory_xact_lock(hashtext(new.experiment_id::text));
  stage_name := case when test_row.image_experiment_id = new.experiment_id then 'image' else 'video' end;
  if test_row.status <> 'initialized' then raise exception 'Sprint 1 generation is closed'; end if;
  if not exists (select 1 from jsonb_array_elements(test_row.variants) item where item->>'id' = new.variant_id) then
    raise exception 'Unknown Sprint 1 variant';
  end if;
  if exists (select 1 from pipeline_experiment_results where experiment_id = new.experiment_id and variant_id = new.variant_id) then
    raise exception 'Sprint 1 permits one % result per variant', stage_name;
  end if;
  select count(*)::integer into result_count from pipeline_experiment_results where experiment_id = new.experiment_id;
  if result_count >= 6 then raise exception 'Sprint 1 % ceiling is six', stage_name; end if;
  if stage_name = 'video' and not exists (
    select 1 from pipeline_experiment_results
    where experiment_id = test_row.image_experiment_id and variant_id = new.variant_id
      and status = 'succeeded' and output_asset_id is not null
  ) then raise exception 'A successful matching keyframe is required before video generation'; end if;
  return new;
end;
$$;

create or replace function public.preserve_director_sprint_test_result()
returns trigger language plpgsql set search_path = public as $$
begin
  if exists (
    select 1 from director_sprint_shot_tests
    where image_experiment_id = old.experiment_id or video_experiment_id = old.experiment_id
  ) then raise exception 'Sprint 1 experiment evidence cannot be deleted'; end if;
  return old;
end;
$$;

create or replace function public.enforce_director_sprint_test_update()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.status = 'shipped' and to_jsonb(new) <> to_jsonb(old) then
    raise exception 'A shipped Sprint 1 test is immutable';
  end if;
  if new.sprint_run_id <> old.sprint_run_id or new.sprint_key <> old.sprint_key
    or new.character_id <> old.character_id or new.brief <> old.brief
    or new.invariant_hash <> old.invariant_hash
    or new.image_experiment_id <> old.image_experiment_id
    or new.video_experiment_id <> old.video_experiment_id
    or new.variants <> old.variants then
    raise exception 'Sprint 1 test inputs are immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists director_sprint_generation_ceiling on public.pipeline_experiment_results;
create trigger director_sprint_generation_ceiling before insert on public.pipeline_experiment_results
  for each row execute function public.enforce_director_sprint_generation_ceiling();
drop trigger if exists director_sprint_result_delete_guard on public.pipeline_experiment_results;
create trigger director_sprint_result_delete_guard before delete on public.pipeline_experiment_results
  for each row execute function public.preserve_director_sprint_test_result();
drop trigger if exists director_sprint_result_revisions on public.pipeline_experiment_results;
create trigger director_sprint_result_revisions after insert or update on public.pipeline_experiment_results
  for each row execute function public.capture_director_entity_revision();

drop trigger if exists director_sprint_test_update_guard on public.director_sprint_shot_tests;
create trigger director_sprint_test_update_guard before update on public.director_sprint_shot_tests
  for each row execute function public.enforce_director_sprint_test_update();
drop trigger if exists director_prevent_delete on public.director_sprint_shot_tests;
create trigger director_prevent_delete before delete on public.director_sprint_shot_tests
  for each row execute function public.prevent_director_entity_delete();
drop trigger if exists director_revision_history on public.director_sprint_shot_tests;
create trigger director_revision_history after insert or update on public.director_sprint_shot_tests
  for each row execute function public.capture_director_entity_revision();

drop trigger if exists director_prevent_delete on public.director_sprint_shot_scores;
create trigger director_prevent_delete before delete on public.director_sprint_shot_scores
  for each row execute function public.prevent_director_entity_delete();
drop trigger if exists director_prevent_update on public.director_sprint_shot_scores;
create trigger director_prevent_update before update on public.director_sprint_shot_scores
  for each row execute function public.prevent_director_entity_delete();
drop trigger if exists director_revision_history on public.director_sprint_shot_scores;
create trigger director_revision_history after insert on public.director_sprint_shot_scores
  for each row execute function public.capture_director_entity_revision();

revoke all on function public.initialize_director_sprint_shot_test(uuid,text,text,text,text,integer,text,jsonb,jsonb,jsonb,text) from public;
revoke all on function public.record_director_sprint_shot_score(uuid,text,integer,integer,integer,text,text) from public;
revoke all on function public.decide_director_sprint_shot_test(uuid,text,text) from public;
revoke all on function public.ship_director_sprint_shot_test(uuid,text) from public;
grant execute on function public.initialize_director_sprint_shot_test(uuid,text,text,text,text,integer,text,jsonb,jsonb,jsonb,text) to service_role;
grant execute on function public.record_director_sprint_shot_score(uuid,text,integer,integer,integer,text,text) to service_role;
grant execute on function public.decide_director_sprint_shot_test(uuid,text,text) to service_role;
grant execute on function public.ship_director_sprint_shot_test(uuid,text) to service_role;
