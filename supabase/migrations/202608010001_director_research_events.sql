-- Append-only history for every Director Brain research transition.
-- Current-state rows remain useful for fast rendering; this ledger explains
-- how a job or timed-media analysis reached that state.

create table if not exists public.director_research_events (
  id bigserial primary key,
  job_id uuid references public.director_research_jobs(id) on delete cascade,
  analysis_id uuid references public.director_timed_media_analyses(id) on delete cascade,
  study_id uuid references public.director_scene_studies(id) on delete set null,
  event_kind text not null check (char_length(event_kind) between 1 and 80),
  phase text not null default '' check (char_length(phase) <= 120),
  status text not null default '' check (char_length(status) <= 80),
  progress smallint check (progress is null or progress between 0 and 100),
  message text not null default '' check (char_length(message) <= 2000),
  details jsonb not null default '{}'::jsonb,
  actor text,
  created_at timestamptz not null default now(),
  check (job_id is not null or analysis_id is not null or study_id is not null)
);

create index if not exists director_research_events_job_idx
  on public.director_research_events(job_id, created_at);
create index if not exists director_research_events_analysis_idx
  on public.director_research_events(analysis_id, created_at);
create index if not exists director_research_events_study_idx
  on public.director_research_events(study_id, created_at);

alter table public.director_research_events enable row level security;
revoke all on public.director_research_events from anon, authenticated;

create or replace function public.capture_director_research_job_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  kind text;
begin
  if tg_op = 'INSERT' then kind := 'job-created';
  elsif new.status is distinct from old.status then kind := 'job-status';
  elsif new.phase is distinct from old.phase or new.progress is distinct from old.progress then kind := 'job-progress';
  elsif new.message is distinct from old.message or new.error_message is distinct from old.error_message then kind := 'job-update';
  else return new;
  end if;

  insert into public.director_research_events (
    job_id, event_kind, phase, status, progress, message, details, actor, created_at
  ) values (
    new.id, kind, new.phase, new.status, new.progress, new.message,
    jsonb_strip_nulls(jsonb_build_object(
      'attempt', new.attempt, 'maxAttempts', new.max_attempts,
      'sourceMode', new.source_mode, 'queryKey', new.query_key,
      'contractVersion', new.contract_version, 'model', new.model,
      'error', new.error_message
    )),
    new.created_by, coalesce(new.updated_at, now())
  );
  return new;
end;
$$;

drop trigger if exists director_research_jobs_history on public.director_research_jobs;
create trigger director_research_jobs_history
after insert or update on public.director_research_jobs
for each row execute function public.capture_director_research_job_event();

create or replace function public.capture_director_timed_media_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  kind text;
  event_message text;
begin
  if tg_op = 'INSERT' then
    kind := 'evidence-archived';
    event_message := 'Derived contact sheet, signal evidence, and analysis package archived';
  elsif new.playback_status is distinct from old.playback_status then
    kind := 'playback-status';
    event_message := 'Direct playback marked ' || new.playback_status;
  elsif new.review_notes is distinct from old.review_notes or new.reviewed_at is distinct from old.reviewed_at then
    kind := 'review-updated';
    event_message := 'Playback review notes updated';
  elsif new.artifact_paths is distinct from old.artifact_paths then
    kind := 'assets-updated';
    event_message := 'Derived research assets updated';
  else return new;
  end if;

  insert into public.director_research_events (
    job_id, analysis_id, study_id, event_kind, phase, status, progress,
    message, details, actor, created_at
  ) values (
    new.research_job_id, new.id, new.study_id, kind,
    case when new.playback_status = 'required' then 'playback-review' else 'playback-reviewed' end,
    new.playback_status,
    case when new.playback_status = 'required' then 90 else 100 end,
    event_message,
    jsonb_strip_nulls(jsonb_build_object(
      'artifacts', new.artifact_paths, 'contentHash', new.content_hash,
      'models', new.models, 'reviewNotes', nullif(new.review_notes, '')
    )),
    coalesce(new.reviewed_by, new.created_by), coalesce(new.updated_at, now())
  );
  return new;
end;
$$;

drop trigger if exists director_timed_media_history on public.director_timed_media_analyses;
create trigger director_timed_media_history
after insert or update on public.director_timed_media_analyses
for each row execute function public.capture_director_timed_media_event();

-- Preserve a snapshot of work completed before this ledger existed.
insert into public.director_research_events (
  job_id, event_kind, phase, status, progress, message, details, actor, created_at
)
select job.id, 'state-imported', job.phase, job.status, job.progress, job.message,
  jsonb_strip_nulls(jsonb_build_object(
    'attempt', job.attempt, 'maxAttempts', job.max_attempts,
    'sourceMode', job.source_mode, 'queryKey', job.query_key,
    'contractVersion', job.contract_version, 'model', job.model,
    'error', job.error_message
  )),
  job.created_by, job.updated_at
from public.director_research_jobs job
where not exists (
  select 1 from public.director_research_events event where event.job_id = job.id
);

insert into public.director_research_events (
  job_id, analysis_id, study_id, event_kind, phase, status, progress,
  message, details, actor, created_at
)
select analysis.research_job_id, analysis.id, analysis.study_id,
  'evidence-imported', 'playback-review', analysis.playback_status,
  case when analysis.playback_status = 'required' then 90 else 100 end,
  'Existing timed-media evidence package added to the research ledger',
  jsonb_strip_nulls(jsonb_build_object(
    'artifacts', analysis.artifact_paths, 'contentHash', analysis.content_hash,
    'models', analysis.models, 'reviewNotes', nullif(analysis.review_notes, '')
  )),
  coalesce(analysis.reviewed_by, analysis.created_by), analysis.updated_at
from public.director_timed_media_analyses analysis
where not exists (
  select 1 from public.director_research_events event where event.analysis_id = analysis.id
);
