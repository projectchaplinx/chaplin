-- Versioned research backlog for the Director Brain.
--
-- A queued source is not a learned rule. It becomes production knowledge only
-- after a source is analyzed into a scene study and a human approves the
-- resulting abstract principles.

alter table public.director_research_sources
  add column if not exists campaign_id text not null default '',
  add column if not exists target_tags text[] not null default '{}',
  add column if not exists research_questions jsonb not null default '[]'::jsonb,
  add column if not exists priority text not null default 'next',
  add column if not exists queue_status text not null default 'queued',
  add column if not exists updated_by text,
  add column if not exists last_verified_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'director_research_sources_priority_check'
      and conrelid = 'public.director_research_sources'::regclass
  ) then
    alter table public.director_research_sources
      add constraint director_research_sources_priority_check
      check (priority in ('now', 'next', 'later'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'director_research_sources_queue_status_check'
      and conrelid = 'public.director_research_sources'::regclass
  ) then
    alter table public.director_research_sources
      add constraint director_research_sources_queue_status_check
      check (queue_status in ('queued', 'in-progress', 'analyzed', 'paused'));
  end if;
end
$$;

create index if not exists director_research_sources_campaign_idx
  on public.director_research_sources(campaign_id, priority, queue_status, updated_at desc);

create index if not exists director_research_sources_target_tags_idx
  on public.director_research_sources using gin(target_tags);

create unique index if not exists director_scene_studies_source_title_locator_unique
  on public.director_scene_studies(source_id, study_title, scene_locator);
