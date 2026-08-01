-- Director Brain Sprint 2 + final GPFC.
-- Evidence is append-only. A cycle owns exactly 37 dense verifications,
-- five diverse principles, six keyframes, twenty-four video shots, one locked
-- voice render, twelve final mixes, automatic evaluations, and human picks.

create table if not exists public.director_dense_verifier_runs (
  id uuid primary key default gen_random_uuid(),
  sprint_key text not null unique,
  source_sprint_run_id uuid not null references public.director_sprint_runs(id) on delete restrict,
  status text not null default 'running' check (status in ('running','calibration_failed','succeeded','failed')),
  model text not null,
  sample_fps numeric(4,2) not null default 2 check (sample_fps = 2),
  expected_candidates integer not null default 37 check (expected_candidates = 37),
  calibration_count integer not null default 0 check (calibration_count between 0 and 5),
  calibration_matches integer not null default 0 check (calibration_matches between 0 and calibration_count),
  calibrated boolean not null default false,
  usage jsonb not null default '{}'::jsonb,
  cost_usd numeric(12,8) not null default 0 check (cost_usd >= 0),
  response_ids text[] not null default '{}',
  failure_summary text not null default '',
  created_by text not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  check (not calibrated or (calibration_count = 5 and calibration_matches = 5))
);

create table if not exists public.director_dense_verifications (
  id uuid primary key default gen_random_uuid(),
  verifier_run_id uuid not null references public.director_dense_verifier_runs(id) on delete restrict,
  assessment_id uuid not null references public.director_principle_assessments(id) on delete restrict,
  verdict text not null check (verdict in ('held','refuted')),
  frame_count integer not null check (frame_count >= 1),
  sampled_fps numeric(4,2) not null check (sampled_fps = 2),
  evidence_manifest jsonb not null,
  evidence_summary text not null check (char_length(evidence_summary) between 20 and 4000),
  refutation text not null default '' check (char_length(refutation) <= 4000),
  confidence numeric(5,2) not null check (confidence between 0 and 100),
  human_verdict text check (human_verdict is null or human_verdict in ('held','refuted')),
  calibration_match boolean,
  model text not null,
  response_id text,
  usage jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(verifier_run_id, assessment_id),
  check (human_verdict is null or calibration_match is not null),
  check (verdict = 'held' or char_length(refutation) >= 20)
);

create table if not exists public.director_dense_shortlist_entries (
  id uuid primary key default gen_random_uuid(),
  verifier_run_id uuid not null references public.director_dense_verifier_runs(id) on delete restrict,
  assessment_id uuid not null references public.director_principle_assessments(id) on delete restrict,
  shortlist_rank smallint not null check (shortlist_rank between 1 and 5),
  character_axis text not null check (character_axis in ('identity','performance','framing','blocking','other')),
  duplicate_key text not null check (char_length(duplicate_key) between 3 and 120),
  rank_score numeric(8,3) not null,
  ranking_rationale text not null check (char_length(ranking_rationale) between 20 and 2000),
  created_at timestamptz not null default now(),
  unique(verifier_run_id, assessment_id),
  unique(verifier_run_id, shortlist_rank),
  unique(verifier_run_id, character_axis, duplicate_key)
);

create table if not exists public.director_sprint_two_runs (
  id uuid primary key default gen_random_uuid(),
  sprint_key text not null unique,
  verifier_run_id uuid not null unique references public.director_dense_verifier_runs(id) on delete restrict,
  character_id text not null references public.characters(id) on delete restrict,
  fixed_brief text not null check (char_length(fixed_brief) between 40 and 4000),
  locked_line text not null check (char_length(locked_line) between 1 and 500),
  lighting_plan jsonb not null,
  audio_plan jsonb not null,
  camera_plan jsonb not null,
  invariant_hash text not null check (char_length(invariant_hash) between 32 and 128),
  baseline_revision integer not null check (baseline_revision > 0),
  variants jsonb not null check (jsonb_typeof(variants) = 'array' and jsonb_array_length(variants) = 6),
  status text not null default 'initialized' check (status in ('initialized','generating','needs_human_pick','picked','failed','closed')),
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.director_sprint_two_voice_renders (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null unique references public.director_sprint_two_runs(id) on delete restrict,
  status text not null check (status in ('succeeded','failed')),
  provider text not null default 'elevenlabs' check (provider = 'elevenlabs'),
  voice_id text,
  asset_id uuid references public.media_assets(id) on delete restrict,
  line_hash text not null check (char_length(line_hash) between 32 and 128),
  error_message text not null default '',
  provider_request_id text,
  usage jsonb not null default '{}'::jsonb,
  cost_usd numeric(12,8) not null default 0 check (cost_usd >= 0),
  created_at timestamptz not null default now(),
  check ((status = 'succeeded' and asset_id is not null and voice_id is not null and error_message = '')
    or (status = 'failed' and asset_id is null and char_length(error_message) >= 10))
);

create table if not exists public.director_sprint_two_outputs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.director_sprint_two_runs(id) on delete restrict,
  variant_id text not null,
  output_kind text not null check (output_kind in ('keyframe','video-shot','final-mix')),
  duration_seconds integer not null check (duration_seconds in (5,15)),
  shot_index smallint not null check (shot_index between 0 and 3),
  status text not null check (status in ('succeeded','failed')),
  asset_id uuid references public.media_assets(id) on delete restrict,
  provider text not null,
  model text not null,
  voice_path text check (voice_path is null or voice_path in ('A-native-reference','B-post-mix','failed')),
  voice_render_id uuid references public.director_sprint_two_voice_renders(id) on delete restrict,
  prompt_hash text not null check (char_length(prompt_hash) between 32 and 128),
  prompt_snapshot text not null,
  what_changed text not null,
  continuity_handoff jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  provider_request_id text,
  cost_usd numeric(12,8) not null default 0 check (cost_usd >= 0),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  error_message text not null default '',
  created_at timestamptz not null default now(),
  unique(run_id, variant_id, output_kind, duration_seconds, shot_index),
  check ((output_kind = 'keyframe' and duration_seconds = 5 and shot_index = 0)
    or (output_kind = 'video-shot' and shot_index >= 1)
    or (output_kind = 'final-mix' and shot_index = 0)),
  check ((status = 'succeeded' and asset_id is not null and error_message = '')
    or (status = 'failed' and asset_id is null and char_length(error_message) >= 10)),
  check (output_kind <> 'final-mix' or voice_render_id is not null or voice_path = 'failed')
);

create table if not exists public.director_sprint_two_evaluations (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.director_sprint_two_runs(id) on delete restrict,
  output_id uuid not null unique references public.director_sprint_two_outputs(id) on delete restrict,
  evaluator_kind text not null default 'automatic' check (evaluator_kind = 'automatic'),
  model text not null,
  response_id text,
  identity_continuity numeric(5,2) not null check (identity_continuity between 0 and 100),
  performance numeric(5,2) not null check (performance between 0 and 100),
  shot_readability numeric(5,2) not null check (shot_readability between 0 and 100),
  lighting_continuity numeric(5,2) not null check (lighting_continuity between 0 and 100),
  audio_completeness numeric(5,2) not null check (audio_completeness between 0 and 100),
  lip_sync numeric(5,2) check (lip_sync is null or lip_sync between 0 and 100),
  composite_score numeric(5,2) not null check (composite_score between 0 and 100),
  identity_gate text not null check (identity_gate in ('pass','fail')),
  audio_gate text not null check (audio_gate in ('pass','fail')),
  lip_sync_gate text not null check (lip_sync_gate in ('pass','fail','not-applicable')),
  null_result boolean not null default false,
  evidence jsonb not null,
  usage jsonb not null default '{}'::jsonb,
  cost_usd numeric(12,8) not null default 0 check (cost_usd >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.director_sprint_two_human_picks (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.director_sprint_two_runs(id) on delete restrict,
  duration_seconds integer not null check (duration_seconds in (5,15)),
  output_id uuid not null references public.director_sprint_two_outputs(id) on delete restrict,
  picked_by text not null,
  pick_notes text not null check (char_length(pick_notes) between 20 and 4000),
  created_at timestamptz not null default now(),
  unique(run_id, duration_seconds)
);

create index if not exists director_dense_verifications_run_idx on public.director_dense_verifications(verifier_run_id, verdict);
create index if not exists director_dense_shortlist_run_idx on public.director_dense_shortlist_entries(verifier_run_id, shortlist_rank);
create index if not exists director_sprint_two_outputs_run_idx on public.director_sprint_two_outputs(run_id, variant_id, duration_seconds, shot_index);
create index if not exists director_sprint_two_evaluations_run_idx on public.director_sprint_two_evaluations(run_id, composite_score desc);

alter table public.director_dense_verifier_runs enable row level security;
alter table public.director_dense_verifications enable row level security;
alter table public.director_dense_shortlist_entries enable row level security;
alter table public.director_sprint_two_runs enable row level security;
alter table public.director_sprint_two_voice_renders enable row level security;
alter table public.director_sprint_two_outputs enable row level security;
alter table public.director_sprint_two_evaluations enable row level security;
alter table public.director_sprint_two_human_picks enable row level security;
revoke all on public.director_dense_verifier_runs, public.director_dense_verifications,
  public.director_dense_shortlist_entries, public.director_sprint_two_runs,
  public.director_sprint_two_voice_renders, public.director_sprint_two_outputs,
  public.director_sprint_two_evaluations, public.director_sprint_two_human_picks
  from anon, authenticated;

create or replace function public.lock_director_dense_shortlist(
  p_verifier_run_id uuid,
  p_entries jsonb
) returns integer language plpgsql security definer set search_path = public as $$
declare
  entry jsonb;
  entry_count integer;
  axis_count integer;
  max_axis_count integer;
begin
  select count(*)::integer into entry_count from director_dense_verifications where verifier_run_id = p_verifier_run_id;
  if entry_count <> 37 then raise exception 'Dense verification must preserve exactly 37 candidate verdicts before ranking'; end if;
  if not exists (select 1 from director_dense_verifier_runs where id = p_verifier_run_id and status = 'succeeded' and calibrated) then
    raise exception 'The adversarial verifier must match all five human calibration verdicts first';
  end if;
  if jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) <> 5 then
    raise exception 'Sprint 2 requires exactly five shortlisted principles';
  end if;
  if exists (select 1 from director_dense_shortlist_entries where verifier_run_id = p_verifier_run_id) then
    raise exception 'The dense shortlist is immutable once locked';
  end if;
  create temporary table _shortlist on commit drop as
    select (item->>'assessmentId')::uuid assessment_id,
      (item->>'rank')::smallint shortlist_rank,
      item->>'axis' character_axis,
      item->>'duplicateKey' duplicate_key,
      (item->>'score')::numeric rank_score,
      item->>'rationale' ranking_rationale
    from jsonb_array_elements(p_entries) item;
  if (select count(distinct shortlist_rank) from _shortlist) <> 5
    or (select min(shortlist_rank) from _shortlist) <> 1
    or (select max(shortlist_rank) from _shortlist) <> 5 then
    raise exception 'Shortlist ranks must be exactly 1 through 5';
  end if;
  select count(distinct character_axis), max(per_axis) into axis_count, max_axis_count
  from (select character_axis, count(*) per_axis from _shortlist group by character_axis) axes;
  if axis_count < 3 then raise exception 'The shortlist must span at least three character axes'; end if;
  if max_axis_count > 2 then raise exception 'The shortlist permits at most two entries per character axis'; end if;
  if exists (select 1 from _shortlist group by character_axis, duplicate_key having count(*) > 1) then
    raise exception 'Near-duplicate principles must collapse before shortlisting';
  end if;
  if exists (
    select 1 from _shortlist shortlist
    left join director_dense_verifications verification
      on verification.verifier_run_id = p_verifier_run_id and verification.assessment_id = shortlist.assessment_id
    where verification.id is null or verification.verdict <> 'held'
  ) then raise exception 'Only dense-frame principles that held may be shortlisted'; end if;
  insert into director_dense_shortlist_entries (
    verifier_run_id, assessment_id, shortlist_rank, character_axis,
    duplicate_key, rank_score, ranking_rationale
  ) select p_verifier_run_id, assessment_id, shortlist_rank, character_axis,
    duplicate_key, rank_score, ranking_rationale from _shortlist order by shortlist_rank;
  return 5;
end;
$$;

create or replace function public.enforce_director_sprint_two_output_ceiling()
returns trigger language plpgsql set search_path = public as $$
declare
  variant_count integer;
  kind_count integer;
begin
  perform pg_advisory_xact_lock(hashtext(new.run_id::text));
  if not exists (
    select 1 from director_sprint_two_runs run,
      jsonb_array_elements(run.variants) variant
    where run.id = new.run_id and variant->>'id' = new.variant_id
      and run.status in ('initialized','generating')
  ) then raise exception 'Unknown or closed Sprint 2 variant'; end if;
  select count(*)::integer into kind_count from director_sprint_two_outputs
    where run_id = new.run_id and output_kind = new.output_kind;
  if new.output_kind = 'keyframe' and kind_count >= 6 then raise exception 'Sprint 2 keyframe ceiling is six'; end if;
  if new.output_kind = 'video-shot' and kind_count >= 24 then raise exception 'Sprint 2 video-shot ceiling is twenty-four'; end if;
  if new.output_kind = 'final-mix' and kind_count >= 12 then raise exception 'Sprint 2 mix ceiling is twelve'; end if;
  if new.output_kind = 'video-shot' then
    if new.duration_seconds = 5 and new.shot_index <> 1 then raise exception 'A 5-second version has exactly one shot'; end if;
    if new.duration_seconds = 15 and new.shot_index not between 1 and 3 then raise exception 'A 15-second version has exactly three shots'; end if;
  end if;
  select count(*)::integer into variant_count from director_sprint_two_outputs
    where run_id = new.run_id and variant_id = new.variant_id and output_kind = new.output_kind;
  if new.output_kind = 'keyframe' and variant_count >= 1 then raise exception 'One keyframe per variant'; end if;
  if new.output_kind = 'video-shot' and variant_count >= 4 then raise exception 'Four total video shots per variant'; end if;
  if new.output_kind = 'final-mix' and variant_count >= 2 then raise exception 'Two final mixes per variant'; end if;
  return new;
end;
$$;

create or replace function public.enforce_director_sprint_two_pick()
returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (
    select 1 from director_sprint_two_outputs output
    join director_sprint_two_evaluations evaluation on evaluation.output_id = output.id
    where output.id = new.output_id and output.run_id = new.run_id
      and output.output_kind = 'final-mix' and output.duration_seconds = new.duration_seconds
      and output.status = 'succeeded' and evaluation.identity_gate = 'pass'
      and evaluation.audio_gate = 'pass' and evaluation.lip_sync_gate in ('pass','not-applicable')
  ) then raise exception 'Human picks require a successful final mix that passed every automatic hard gate'; end if;
  return new;
end;
$$;

drop trigger if exists director_sprint_two_output_ceiling on public.director_sprint_two_outputs;
create trigger director_sprint_two_output_ceiling before insert on public.director_sprint_two_outputs
  for each row execute function public.enforce_director_sprint_two_output_ceiling();
drop trigger if exists director_sprint_two_pick_guard on public.director_sprint_two_human_picks;
create trigger director_sprint_two_pick_guard before insert on public.director_sprint_two_human_picks
  for each row execute function public.enforce_director_sprint_two_pick();

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'director_dense_verifier_runs','director_dense_verifications','director_dense_shortlist_entries',
    'director_sprint_two_runs','director_sprint_two_voice_renders','director_sprint_two_outputs',
    'director_sprint_two_evaluations','director_sprint_two_human_picks'
  ] loop
    execute format('drop trigger if exists director_prevent_delete on public.%I', table_name);
    execute format('create trigger director_prevent_delete before delete on public.%I for each row execute function public.prevent_director_entity_delete()', table_name);
    execute format('drop trigger if exists director_revision_history on public.%I', table_name);
    execute format('create trigger director_revision_history after insert or update on public.%I for each row execute function public.capture_director_entity_revision()', table_name);
  end loop;
end;
$$;

-- Evidence, verifier verdicts, shortlist membership, evaluations and human
-- choices are append-only. Run/output rows may advance status, while the
-- revision ledger retains every state transition.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'director_dense_verifications','director_dense_shortlist_entries',
    'director_sprint_two_voice_renders','director_sprint_two_evaluations',
    'director_sprint_two_human_picks'
  ] loop
    execute format('drop trigger if exists director_prevent_update on public.%I', table_name);
    execute format('create trigger director_prevent_update before update on public.%I for each row execute function public.prevent_director_entity_delete()', table_name);
  end loop;
end;
$$;

revoke all on function public.lock_director_dense_shortlist(uuid,jsonb) from public;
revoke all on function public.enforce_director_sprint_two_output_ceiling() from public;
revoke all on function public.enforce_director_sprint_two_pick() from public;
