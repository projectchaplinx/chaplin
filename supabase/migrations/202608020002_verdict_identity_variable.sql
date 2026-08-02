-- Identity drift and voice failure are the two kill causes a character
-- marketplace most needs to count, and neither was a nameable variable.
-- Widening the CHECK keeps every existing verdict valid.

alter table public.generation_verdicts
  drop constraint if exists generation_verdicts_changed_variable_check;

alter table public.generation_verdicts
  add constraint generation_verdicts_changed_variable_check
  check (changed_variable is null or changed_variable in (
    'camera', 'lighting', 'speed', 'action', 'reference', 'identity', 'voice'
  ));
