-- Film-grade evaluation records for Director Brain decisions and controlled
-- pipeline experiments. Scores remain dimension-level so a clean image cannot
-- hide broken geography, identity, period, or audio continuity.

create table if not exists public.director_evaluations (
  id uuid primary key default gen_random_uuid(),
  decision_trace_id uuid references public.director_decision_traces(id) on delete cascade,
  experiment_result_id uuid references public.pipeline_experiment_results(id) on delete cascade,
  generation_job_id uuid references public.generation_jobs(id) on delete set null,
  pipeline_run_id uuid references public.media_pipeline_runs(id) on delete set null,
  output_asset_id uuid references public.media_assets(id) on delete set null,
  stage text not null check (stage in ('writing', 'voice', 'sfx', 'theme', 'image', 'video')),
  rubric_version text not null,
  evaluator_kind text not null default 'human' check (evaluator_kind in ('human', 'automatic')),
  status text not null default 'draft' check (status in ('draft', 'reviewed', 'rejected')),
  scores jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '{}'::jsonb,
  composite_score numeric(5,2),
  axis_scores jsonb not null default '{}'::jsonb,
  gate_status text not null default 'incomplete' check (gate_status in ('pass', 'fail', 'incomplete')),
  gate_failures text[] not null default '{}',
  reviewer_id text references public.users(id) on delete set null,
  reviewer_notes text not null default '' check (char_length(reviewer_notes) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_at timestamptz,
  check (
    decision_trace_id is not null
    or experiment_result_id is not null
    or generation_job_id is not null
    or pipeline_run_id is not null
    or output_asset_id is not null
  )
);

create unique index if not exists director_evaluations_result_human_unique
  on public.director_evaluations(experiment_result_id, evaluator_kind);

create index if not exists director_evaluations_recent_idx
  on public.director_evaluations(created_at desc);

create index if not exists director_evaluations_trace_idx
  on public.director_evaluations(decision_trace_id, created_at desc);

create index if not exists director_evaluations_gate_idx
  on public.director_evaluations(gate_status, status, created_at desc);

alter table public.pipeline_experiments
  add column if not exists target_dimensions text[] not null default '{}';

alter table public.pipeline_experiments
  add column if not exists minimum_improvement numeric(5,2) not null default 5;

alter table public.pipeline_experiments
  add column if not exists max_gate_regression numeric(5,2) not null default 0;

alter table public.pipeline_experiments
  add column if not exists promotion_snapshot jsonb not null default '{}'::jsonb;

alter table public.director_evaluations enable row level security;
revoke all on public.director_evaluations from anon, authenticated;
