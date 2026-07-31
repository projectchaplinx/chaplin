-- GPLC P0: preserve every Director Brain mutation and make deletion impossible.
-- Current-state tables remain fast projections while this immutable ledger
-- retains the complete before/after record needed to finish the append-only
-- state-machine migration safely.

create table if not exists public.director_entity_revisions (
  id bigserial primary key,
  entity_table text not null,
  entity_key text not null,
  mutation_kind text not null check (mutation_kind in ('baseline', 'insert', 'update')),
  prior_snapshot jsonb,
  next_snapshot jsonb not null,
  actor text,
  created_at timestamptz not null default now()
);

create index if not exists director_entity_revisions_entity_idx
  on public.director_entity_revisions(entity_table, entity_key, created_at, id);

alter table public.director_entity_revisions enable row level security;
revoke all on public.director_entity_revisions from anon, authenticated;

create or replace function public.capture_director_entity_revision()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  prior jsonb;
  next_value jsonb;
  key_value text;
  actor_value text;
begin
  prior := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
  next_value := to_jsonb(new);
  if tg_op = 'UPDATE' and prior = next_value then return new; end if;
  key_value := coalesce(next_value ->> 'id', concat_ws(':', next_value ->> 'study_id', next_value ->> 'manifest_id'));
  actor_value := coalesce(next_value ->> 'reviewed_by', next_value ->> 'updated_by', next_value ->> 'created_by', next_value ->> 'reviewer_id');
  insert into public.director_entity_revisions (
    entity_table, entity_key, mutation_kind, prior_snapshot, next_snapshot, actor, created_at
  ) values (tg_table_name, key_value, lower(tg_op), prior, next_value, actor_value, now());
  return new;
end;
$$;

create or replace function public.prevent_director_entity_delete()
returns trigger language plpgsql as $$
begin
  raise exception 'GPLC preservation contract forbids deleting or rewriting immutable rows in %', tg_table_name;
end;
$$;

-- Current-state rows are projections, not the historical record. Updates are
-- allowed only while the immutable revision ledger can retain the old value.
-- Human decisions and terminal job evidence become write-once.
create or replace function public.enforce_director_projection_preservation()
returns trigger language plpgsql as $$
begin
  if tg_table_name = 'director_research_jobs' then
    if old.status in ('succeeded', 'failed', 'review-required', 'cancelled')
      and to_jsonb(new) - array['cost_usd', 'cost_method', 'pricing_note', 'updated_at']::text[]
        <> to_jsonb(old) - array['cost_usd', 'cost_method', 'pricing_note', 'updated_at']::text[] then
      raise exception 'GPLC preservation contract makes terminal research job % immutable; create a new attempt', old.id;
    end if;
    if old.error_message is not null and new.error_message is distinct from old.error_message then
      raise exception 'GPLC preservation contract forbids overwriting job error %', old.id;
    end if;
    if coalesce(old.output, '{}'::jsonb) <> '{}'::jsonb and new.output is distinct from old.output then
      raise exception 'GPLC preservation contract forbids overwriting job output %', old.id;
    end if;
    if coalesce(old.usage, '{}'::jsonb) <> '{}'::jsonb and new.usage is distinct from old.usage then
      raise exception 'GPLC preservation contract forbids overwriting job usage %', old.id;
    end if;
  elsif tg_table_name = 'director_scene_studies' then
    if old.status in ('approved', 'rejected') and to_jsonb(new) <> to_jsonb(old) then
      raise exception 'GPLC preservation contract makes reviewed study % immutable', old.id;
    end if;
  elsif tg_table_name = 'director_evidence_manifests' then
    if old.reviewed_at is not null and to_jsonb(new) <> to_jsonb(old) then
      raise exception 'GPLC preservation contract makes reviewed manifest % immutable', old.id;
    end if;
  elsif tg_table_name = 'director_timed_media_analyses' then
    if old.playback_status in ('verified', 'rejected') and to_jsonb(new) <> to_jsonb(old) then
      raise exception 'GPLC preservation contract makes playback verdict % immutable', old.id;
    end if;
  elsif tg_table_name = 'director_decision_traces' then
    if old.status in ('succeeded', 'failed') and to_jsonb(new) <> to_jsonb(old) then
      raise exception 'GPLC preservation contract makes terminal decision trace % immutable', old.id;
    end if;
    if old.error_message is not null and new.error_message is distinct from old.error_message then
      raise exception 'GPLC preservation contract forbids overwriting trace error %', old.id;
    end if;
    if coalesce(old.outcome, '{}'::jsonb) <> '{}'::jsonb and new.outcome is distinct from old.outcome then
      raise exception 'GPLC preservation contract forbids overwriting trace outcome %', old.id;
    end if;
  elsif tg_table_name = 'director_evaluations' then
    if old.reviewed_at is not null and to_jsonb(new) <> to_jsonb(old) then
      raise exception 'GPLC preservation contract makes reviewed evaluation % immutable', old.id;
    end if;
  end if;
  return new;
end;
$$;

do $$
declare
  table_name text;
  tables text[] := array[
    'director_research_sources', 'director_scene_studies', 'director_research_jobs',
    'director_evidence_manifests', 'director_timed_media_analyses',
    'director_study_evidence_manifests', 'director_decision_traces', 'director_evaluations'
  ];
begin
  foreach table_name in array tables loop
    if to_regclass('public.' || table_name) is null then continue; end if;
    execute format('drop trigger if exists director_revision_history on public.%I', table_name);
    execute format('create trigger director_revision_history after insert or update on public.%I for each row execute function public.capture_director_entity_revision()', table_name);
    execute format('drop trigger if exists director_projection_preservation on public.%I', table_name);
    execute format('create trigger director_projection_preservation before update on public.%I for each row execute function public.enforce_director_projection_preservation()', table_name);
    execute format('drop trigger if exists director_prevent_delete on public.%I', table_name);
    execute format('create trigger director_prevent_delete before delete on public.%I for each row execute function public.prevent_director_entity_delete()', table_name);
  end loop;
end;
$$;

-- Snapshot all rows that predate the revision ledger before any P0 backfill.
do $$
declare
  table_name text;
  row_value jsonb;
  key_value text;
  tables text[] := array[
    'director_research_sources', 'director_scene_studies', 'director_research_jobs',
    'director_evidence_manifests', 'director_timed_media_analyses',
    'director_study_evidence_manifests', 'director_decision_traces', 'director_evaluations'
  ];
begin
  foreach table_name in array tables loop
    if to_regclass('public.' || table_name) is null then continue; end if;
    for row_value in execute format('select to_jsonb(row_value) from public.%I row_value', table_name) loop
      key_value := coalesce(row_value ->> 'id', concat_ws(':', row_value ->> 'study_id', row_value ->> 'manifest_id'));
      insert into public.director_entity_revisions (entity_table, entity_key, mutation_kind, next_snapshot, actor, created_at)
      select table_name, key_value, 'baseline', row_value,
        coalesce(row_value ->> 'reviewed_by', row_value ->> 'updated_by', row_value ->> 'created_by', row_value ->> 'reviewer_id'),
        coalesce((row_value ->> 'updated_at')::timestamptz, (row_value ->> 'created_at')::timestamptz, now())
      where not exists (
        select 1 from public.director_entity_revisions revision
        where revision.entity_table = table_name and revision.entity_key = key_value
      );
    end loop;
  end loop;
end;
$$;

-- Retries become separate jobs. The original result and error remain intact.
alter table public.director_research_jobs
  add column if not exists logical_query_key text,
  add column if not exists supersedes_job_id uuid references public.director_research_jobs(id) on delete restrict,
  add column if not exists attempt_sequence integer not null default 0;

update public.director_research_jobs set logical_query_key = query_key where logical_query_key is null;
alter table public.director_research_jobs alter column logical_query_key set not null;
create index if not exists director_research_jobs_logical_idx
  on public.director_research_jobs(source_id, campaign_id, contract_version, logical_query_key, attempt_sequence desc, created_at desc);

-- Append-only cost entries distinguish estimates from unknown or absent usage.
create table if not exists public.director_research_cost_entries (
  id bigserial primary key,
  job_id uuid not null references public.director_research_jobs(id) on delete restrict,
  usage_hash text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_usd numeric(12,8) not null check (cost_usd >= 0),
  cost_method text not null check (cost_method in ('rate-card-estimate', 'partial-rate-card', 'no-recorded-usage', 'unknown-rate')),
  pricing_note text not null,
  usage_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(job_id, usage_hash)
);

create index if not exists director_research_cost_entries_job_idx on public.director_research_cost_entries(job_id, created_at desc);
alter table public.director_research_cost_entries enable row level security;
revoke all on public.director_research_cost_entries from anon, authenticated;

alter table public.director_research_jobs
  add column if not exists cost_method text,
  add column if not exists pricing_note text;

with measured as (
  select job.id, job.usage,
    coalesce((job.usage ->> 'input_tokens')::integer, 0) + coalesce((job.usage #>> '{visualSynthesis,input_tokens}')::integer, 0) as input_tokens,
    coalesce((job.usage ->> 'output_tokens')::integer, 0) + coalesce((job.usage #>> '{visualSynthesis,output_tokens}')::integer, 0) as output_tokens,
    coalesce((job.usage #>> '{audioPerception,prompt_tokens_details,audio_tokens}')::integer, 0) as audio_tokens
  from public.director_research_jobs job
), costed as (
  select measured.*,
    round(((input_tokens::numeric * 2.5) + (output_tokens::numeric * 15.0)) / 1000000.0, 8) as known_cost,
    case when usage = '{}'::jsonb then 'no-recorded-usage'
      when audio_tokens > 0 then 'partial-rate-card'
      when input_tokens + output_tokens > 0 then 'rate-card-estimate'
      else 'unknown-rate' end as method
  from measured
)
insert into public.director_research_cost_entries (
  job_id, usage_hash, input_tokens, output_tokens, cost_usd, cost_method, pricing_note, usage_snapshot
)
select id, md5(usage::text), input_tokens, output_tokens, known_cost, method,
  case when method = 'rate-card-estimate' then 'Estimated from recorded GPT-5.6 Terra tokens at $2.50/M input and $15/M output.'
    when method = 'partial-rate-card' then 'Minimum known cost from GPT-5.6 Terra text tokens; gpt-audio-1.5 audio-token cost is unpriced and explicitly excluded.'
    when method = 'no-recorded-usage' then 'No provider-token usage was recorded. $0 is recorded usage, not proof that no external cost occurred.'
    else 'Provider usage exists but no safe rate mapping is available; $0 remains explicitly unknown rather than invented.' end,
  usage
from costed on conflict (job_id, usage_hash) do nothing;

update public.director_research_jobs job
set cost_usd = cost.cost_usd, cost_method = cost.cost_method, pricing_note = cost.pricing_note, updated_at = job.updated_at
from public.director_research_cost_entries cost
where cost.job_id = job.id and job.cost_usd is null;

-- Cost and revision rows are immutable.
drop trigger if exists director_prevent_delete on public.director_research_cost_entries;
create trigger director_prevent_delete before delete on public.director_research_cost_entries for each row execute function public.prevent_director_entity_delete();
drop trigger if exists director_prevent_update on public.director_research_cost_entries;
create trigger director_prevent_update before update on public.director_research_cost_entries for each row execute function public.prevent_director_entity_delete();
drop trigger if exists director_prevent_delete on public.director_entity_revisions;
create trigger director_prevent_delete before delete on public.director_entity_revisions for each row execute function public.prevent_director_entity_delete();
drop trigger if exists director_prevent_update on public.director_entity_revisions;
create trigger director_prevent_update before update on public.director_entity_revisions for each row execute function public.prevent_director_entity_delete();
