-- Earlier discovery upserts could demote already-reviewed evidence. Restore the
-- decisions represented by approved study links, and quarantine an identified
-- culturally sensitive power figure from automatic eligibility.
update public.director_evidence_manifests manifest
set status = 'eligible',
    review_notes = case when manifest.review_notes = '' then 'Restored from an approved study evidence link after review-state preservation was added.' else manifest.review_notes end,
    reviewed_by = coalesce(manifest.reviewed_by, 'chaplin-review-state-repair'),
    reviewed_at = coalesce(manifest.reviewed_at, now()),
    updated_at = now()
from public.director_study_evidence_manifests link
join public.director_scene_studies study on study.id = link.study_id and study.status = 'approved'
where manifest.id = link.manifest_id
  and manifest.reuse_status = 'reusable'
  and manifest.culturally_sensitive = false;

update public.director_evidence_manifests
set culturally_sensitive = true,
    status = 'needs-review',
    review_notes = 'Culturally sensitive power figure; requires specialist contextual review and cannot be auto-promoted.',
    reviewed_by = null,
    reviewed_at = null,
    updated_at = now()
where provider = 'met'
  and (title ilike '%Power Figure%' or title ilike '%Nkisi%');
