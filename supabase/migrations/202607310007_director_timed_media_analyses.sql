-- Durable evidence packages for rights-cleared timed-film analysis.
-- Raw clips, frames, audio, dialogue, subtitles, and transcripts are never
-- stored. Every analytical package requires direct human playback review.

create table if not exists public.director_timed_media_analyses (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.director_research_sources(id) on delete cascade,
  research_job_id uuid not null references public.director_research_jobs(id) on delete cascade,
  study_id uuid references public.director_scene_studies(id) on delete set null,
  query_key text not null,
  item_id text not null,
  item_url text not null,
  media_url text not null,
  playback_url text not null default '',
  media_object_id text not null default '',
  work_title text not null check (char_length(work_title) between 1 and 240),
  start_second numeric(10,3) not null check (start_second >= 0),
  duration_seconds numeric(10,3) not null check (duration_seconds > 0 and duration_seconds <= 90),
  visual_analysis jsonb not null default '{}'::jsonb,
  audio_analysis jsonb not null default '{}'::jsonb,
  signal_metrics jsonb not null default '{}'::jsonb,
  observations jsonb not null default '[]'::jsonb,
  candidate_principles jsonb not null default '[]'::jsonb,
  limitations text not null default '' check (char_length(limitations) <= 4000),
  models jsonb not null default '{}'::jsonb,
  provider_response_ids jsonb not null default '{}'::jsonb,
  provider_usage jsonb not null default '{}'::jsonb,
  artifact_paths jsonb not null default '{}'::jsonb,
  content_hash text not null,
  playback_status text not null default 'required' check (playback_status in ('required', 'verified', 'rejected')),
  review_notes text not null default '' check (char_length(review_notes) <= 2000),
  reviewed_by text,
  reviewed_at timestamptz,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (research_job_id),
  unique (source_id, query_key)
);

create index if not exists director_timed_media_review_idx
  on public.director_timed_media_analyses(playback_status, updated_at desc);
create index if not exists director_timed_media_study_idx
  on public.director_timed_media_analyses(study_id, updated_at desc);

alter table public.director_timed_media_analyses enable row level security;
revoke all on public.director_timed_media_analyses from anon, authenticated;

alter table public.director_timed_media_analyses
  add column if not exists artifact_paths jsonb not null default '{}'::jsonb;

alter table public.director_timed_media_analyses
  add column if not exists playback_url text not null default '';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'director-research',
  'director-research',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'application/json']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
