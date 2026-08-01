-- Director Brain Sprint 1: preserved principle-level triage and human playback.
-- Source studies stay untouched. Every assessment is an immutable analytical
-- record linked back to the exact principle text that produced it.

create table if not exists public.director_sprint_runs (
  id uuid primary key default gen_random_uuid(),
  sprint_key text not null,
  status text not null check (status in ('succeeded', 'failed')),
  model text not null,
  corpus_hash text not null,
  principle_count integer not null check (principle_count >= 0),
  discard_count integer not null check (discard_count >= 0),
  park_count integer not null check (park_count >= 0),
  candidate_count integer not null check (candidate_count between 0 and 40),
  response_ids text[] not null default '{}',
  usage jsonb not null default '{}'::jsonb,
  cost_usd numeric(12,8),
  error_message text not null default '',
  created_by text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists director_sprint_runs_success_unique
  on public.director_sprint_runs(sprint_key, corpus_hash)
  where status = 'succeeded';

create table if not exists public.director_principle_assessments (
  id uuid primary key default gen_random_uuid(),
  sprint_run_id uuid not null references public.director_sprint_runs(id) on delete restrict,
  sprint_key text not null,
  study_id uuid not null references public.director_scene_studies(id) on delete restrict,
  timed_media_analysis_id uuid references public.director_timed_media_analyses(id) on delete restrict,
  principle_index integer not null check (principle_index >= 0),
  principle_text text not null check (char_length(principle_text) between 3 and 3000),
  principle_hash text not null,
  lane text not null check (lane in ('discard', 'park', 'candidate')),
  character_axis text not null check (character_axis in ('identity', 'performance', 'framing', 'blocking', 'other')),
  agreement_key text not null,
  confidence text not null check (confidence in ('low', 'medium', 'high')),
  rationale text not null check (char_length(rationale) between 10 and 1200),
  rejection_reason text not null default '',
  source_strength text not null check (source_strength in ('motion-verified', 'contact-sheet-only', 'document')),
  character_axis_score integer not null check (character_axis_score between 0 and 100),
  cross_study_agreement integer not null check (cross_study_agreement >= 0),
  production_reach integer not null check (production_reach between 0 and 5),
  rank_score numeric(8,2) not null,
  candidate_rank integer check (candidate_rank is null or candidate_rank between 1 and 40),
  shortlist_rank integer check (shortlist_rank is null or shortlist_rank between 1 and 5),
  model text not null,
  response_id text,
  created_at timestamptz not null default now(),
  unique(sprint_key, study_id, principle_hash)
);

create index if not exists director_principle_assessments_digest_idx
  on public.director_principle_assessments(sprint_key, lane, candidate_rank, rank_score desc);
create index if not exists director_principle_assessments_shortlist_idx
  on public.director_principle_assessments(sprint_key, shortlist_rank)
  where shortlist_rank is not null;

create table if not exists public.director_principle_playback_reviews (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.director_principle_assessments(id) on delete restrict,
  verdict text not null check (verdict in ('verified', 'rejected')),
  review_notes text not null check (char_length(review_notes) between 20 and 2000),
  reviewed_by text not null,
  reviewed_at timestamptz not null default now(),
  unique(assessment_id)
);

create table if not exists public.director_coverage_findings (
  id uuid primary key default gen_random_uuid(),
  sprint_run_id uuid not null references public.director_sprint_runs(id) on delete restrict,
  finding_key text not null unique,
  axis text not null check (axis in ('identity', 'performance', 'framing', 'blocking', 'other')),
  title text not null check (char_length(title) between 3 and 240),
  finding text not null check (char_length(finding) between 20 and 4000),
  cause text not null check (char_length(cause) between 20 and 4000),
  next_method text not null check (char_length(next_method) between 20 and 2000),
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.director_sprint_runs enable row level security;
alter table public.director_principle_assessments enable row level security;
alter table public.director_principle_playback_reviews enable row level security;
alter table public.director_coverage_findings enable row level security;
revoke all on public.director_sprint_runs from anon, authenticated;
revoke all on public.director_principle_assessments from anon, authenticated;
revoke all on public.director_principle_playback_reviews from anon, authenticated;
revoke all on public.director_coverage_findings from anon, authenticated;

-- Sprint records and human verdicts are write-once. A correction is a new
-- sprint run, never a rewrite of the historical decision.
do $$
declare
  table_name text;
  tables text[] := array[
    'director_sprint_runs',
    'director_principle_assessments',
    'director_principle_playback_reviews',
    'director_coverage_findings'
  ];
begin
  foreach table_name in array tables loop
    execute format('drop trigger if exists director_prevent_delete on public.%I', table_name);
    execute format('create trigger director_prevent_delete before delete on public.%I for each row execute function public.prevent_director_entity_delete()', table_name);
    execute format('drop trigger if exists director_prevent_update on public.%I', table_name);
    execute format('create trigger director_prevent_update before update on public.%I for each row execute function public.prevent_director_entity_delete()', table_name);
    execute format('drop trigger if exists director_revision_history on public.%I', table_name);
    execute format('create trigger director_revision_history after insert on public.%I for each row execute function public.capture_director_entity_revision()', table_name);
  end loop;
end;
$$;
