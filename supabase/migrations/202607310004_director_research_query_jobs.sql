-- Multiple resumable queries may run against one research source and contract.
alter table public.director_research_jobs add column if not exists query_key text not null default 'root';
alter table public.director_research_jobs add column if not exists parent_job_id uuid references public.director_research_jobs(id) on delete cascade;
alter table public.director_research_jobs add column if not exists next_attempt_at timestamptz;

alter table public.director_research_jobs
  drop constraint if exists director_research_jobs_source_id_campaign_id_contract_version_key;
alter table public.director_research_jobs
  drop constraint if exists director_research_jobs_source_id_campaign_id_contract_versi_key;

create unique index if not exists director_research_jobs_query_unique
  on public.director_research_jobs(source_id, campaign_id, contract_version, query_key);
create index if not exists director_research_jobs_retry_idx
  on public.director_research_jobs(status, next_attempt_at, lease_expires_at);

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
      and (job.next_attempt_at is null or job.next_attempt_at <= now())
      and job.attempt < job.max_attempts
    order by job.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 4), 12))
  )
  update public.director_research_jobs job
  set status = 'running', phase = 'fetching', progress = greatest(job.progress, 5),
      message = 'Fetching authoritative evidence', attempt = job.attempt + 1,
      lease_owner = p_worker,
      lease_expires_at = now() + make_interval(secs => greatest(30, least(coalesce(p_lease_seconds, 300), 1800))),
      started_at = coalesce(job.started_at, now()), updated_at = now()
  from candidates where job.id = candidates.id returning job.*;
end;
$$;

revoke all on function public.claim_director_research_jobs(text, integer, integer) from public, anon, authenticated;
grant execute on function public.claim_director_research_jobs(text, integer, integer) to service_role;
