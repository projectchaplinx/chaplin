-- First-class, inspectable Director Brain decisions.
--
-- Research explains what the brain may know. This ledger records what it
-- actually selected for each writing or render run, how the run ended, and
-- which production object received the decision.

create table if not exists public.director_decision_traces (
  id uuid primary key default gen_random_uuid(),
  run_kind text not null check (run_kind in ('writing', 'render')),
  status text not null default 'selected' check (
    status in ('selected', 'running', 'succeeded', 'failed', 'cancelled')
  ),
  user_id text references public.users(id) on delete set null,
  character_id text references public.characters(id) on delete set null,
  story_id text references public.stories(id) on delete set null,
  generation_job_id uuid references public.generation_jobs(id) on delete set null,
  pipeline_run_id uuid references public.media_pipeline_runs(id) on delete set null,
  brain_version text not null,
  format text not null default '',
  duration_seconds numeric(8,3),
  scene_count integer not null default 0 check (scene_count >= 0),
  brief_excerpt text not null default '' check (char_length(brief_excerpt) <= 1000),
  trace jsonb not null default '{}'::jsonb,
  provider text not null default '',
  model text not null default '',
  outcome jsonb not null default '{}'::jsonb,
  error_message text not null default '' check (char_length(error_message) <= 2000),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists director_decision_traces_generation_job_unique
  on public.director_decision_traces(generation_job_id)
  where generation_job_id is not null;

create unique index if not exists director_decision_traces_pipeline_run_unique
  on public.director_decision_traces(pipeline_run_id)
  where pipeline_run_id is not null;

create index if not exists director_decision_traces_recent_idx
  on public.director_decision_traces(created_at desc);

create index if not exists director_decision_traces_brain_idx
  on public.director_decision_traces(brain_version, run_kind, status, created_at desc);

alter table public.director_decision_traces enable row level security;
revoke all on public.director_decision_traces from anon, authenticated;
