-- Durable, lease-based execution for Director Brain research.
--
-- Jobs may run concurrently, but extracted evidence remains draft-only until
-- a human approves its reusable principles. A source and contract version can
-- have only one job, which makes retries and admin clicks idempotent.

create table if not exists public.director_research_jobs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.director_research_sources(id) on delete cascade,
  campaign_id text not null,
  contract_version text not null,
  source_mode text not null check (source_mode in (
    'document', 'collection-discovery', 'provenance', 'timed-media', 'provider-doc'
  )),
  status text not null default 'queued' check (status in (
    'queued', 'running', 'succeeded', 'failed', 'review-required', 'cancelled'
  )),
  phase text not null default 'queued',
  progress smallint not null default 0 check (progress between 0 and 100),
  message text not null default '' check (char_length(message) <= 1000),
  attempt smallint not null default 0 check (attempt >= 0),
  max_attempts smallint not null default 3 check (max_attempts between 1 and 10),
  lease_owner text,
  lease_expires_at timestamptz,
  model text,
  provider_response_id text,
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  usage jsonb not null default '{}'::jsonb,
  cost_usd numeric(12,6),
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, campaign_id, contract_version)
);

create index if not exists director_research_jobs_work_idx
  on public.director_research_jobs(status, lease_expires_at, created_at);

create index if not exists director_research_jobs_campaign_idx
  on public.director_research_jobs(campaign_id, updated_at desc);

alter table public.director_research_jobs enable row level security;
revoke all on public.director_research_jobs from anon, authenticated;

create or replace function public.claim_director_research_jobs(
  p_worker text,
  p_limit integer default 4,
  p_lease_seconds integer default 300
)
returns setof public.director_research_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidates as (
    select job.id
    from public.director_research_jobs job
    where (
      job.status = 'queued'
      or (job.status = 'running' and job.lease_expires_at < now())
    )
      and job.attempt < job.max_attempts
    order by job.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 4), 12))
  )
  update public.director_research_jobs job
  set status = 'running',
      phase = 'fetching',
      progress = greatest(job.progress, 5),
      message = 'Fetching authoritative evidence',
      attempt = job.attempt + 1,
      lease_owner = p_worker,
      lease_expires_at = now() + make_interval(secs => greatest(30, least(coalesce(p_lease_seconds, 300), 1800))),
      started_at = coalesce(job.started_at, now()),
      updated_at = now()
  from candidates
  where job.id = candidates.id
  returning job.*;
end;
$$;

revoke all on function public.claim_director_research_jobs(text, integer, integer) from public, anon, authenticated;
grant execute on function public.claim_director_research_jobs(text, integer, integer) to service_role;
