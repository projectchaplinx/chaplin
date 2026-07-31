-- Enforce the research concurrency limit across all server processes, not only
-- inside one Node.js worker. The advisory transaction lock makes the active
-- lease count and claim atomic across cron and Super Admin invocations.
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
declare
  global_cap constant integer := 4;
  active_count integer;
  available_count integer;
begin
  perform pg_advisory_xact_lock(hashtext('chaplin-director-research-global-cap'));
  select count(*)::integer into active_count
  from public.director_research_jobs job
  where job.status = 'running' and job.lease_expires_at > now();
  available_count := greatest(0, global_cap - active_count);
  if available_count = 0 then return; end if;

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
    limit least(available_count, greatest(1, least(coalesce(p_limit, 4), global_cap)))
  )
  update public.director_research_jobs job
  set status = 'running', phase = 'fetching', progress = greatest(job.progress, 5),
      message = 'Fetching authoritative evidence', attempt = job.attempt + 1,
      lease_owner = p_worker,
      lease_expires_at = now() + make_interval(secs => greatest(30, least(coalesce(p_lease_seconds, 300), 1800))),
      next_attempt_at = null,
      started_at = coalesce(job.started_at, now()), updated_at = now()
  from candidates where job.id = candidates.id returning job.*;
end;
$$;

revoke all on function public.claim_director_research_jobs(text, integer, integer) from public, anon, authenticated;
grant execute on function public.claim_director_research_jobs(text, integer, integer) to service_role;
