-- Retain previous generated text privately, but require regeneration for the final source-summary wording.
update public.history_conclusions set status='failed' where status='done' and request_key=md5(report_ids::text||revisions::text||'conclusions-v3-plain-source-only');
update public.imaging_comparisons set status='failed' where status='done' and summary_version=4;
