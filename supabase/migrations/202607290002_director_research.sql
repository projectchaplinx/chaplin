-- Rights-aware Director Brain research ledger.
--
-- Research observations remain separate from promoted production rules. The
-- service-role API is the only writer; browser clients receive no direct table
-- privileges. Raw screenplays, transcripts, and copied dialogue are not fields
-- in this schema.

create table if not exists public.director_research_sources (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 240),
  institution text not null default '' check (char_length(institution) <= 180),
  source_url text,
  source_kind text not null check (source_kind in (
    'institutional',
    'public-domain',
    'licensed',
    'filmmaker-interview',
    'provider-research',
    'chaplin-test'
  )),
  rights_basis text not null check (char_length(rights_basis) between 10 and 1000),
  access_notes text not null default '' check (char_length(access_notes) <= 1000),
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists director_research_sources_url_unique
  on public.director_research_sources(source_url)
  where source_url is not null;

create table if not exists public.director_scene_studies (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.director_research_sources(id) on delete restrict,
  study_title text not null check (char_length(study_title) between 3 and 180),
  work_title text not null default '' check (char_length(work_title) <= 180),
  scene_locator text not null default '' check (char_length(scene_locator) <= 240),
  duration_seconds numeric(8,3) check (duration_seconds is null or duration_seconds > 0),
  period_label text not null default '' check (char_length(period_label) <= 120),
  region text not null default '' check (char_length(region) <= 180),
  tags text[] not null default '{}',
  observations jsonb not null default '[]'::jsonb,
  candidate_principles jsonb not null default '[]'::jsonb,
  limitations text not null default '' check (char_length(limitations) <= 2000),
  review_notes text not null default '' check (char_length(review_notes) <= 2000),
  status text not null default 'draft' check (status in ('draft', 'reviewed', 'approved', 'rejected')),
  created_by text not null,
  reviewed_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists director_scene_studies_status_idx
  on public.director_scene_studies(status, updated_at desc);

create index if not exists director_scene_studies_tags_idx
  on public.director_scene_studies using gin(tags);

create index if not exists director_scene_studies_source_idx
  on public.director_scene_studies(source_id, updated_at desc);

alter table public.director_research_sources enable row level security;
alter table public.director_scene_studies enable row level security;

revoke all on public.director_research_sources from anon, authenticated;
revoke all on public.director_scene_studies from anon, authenticated;

