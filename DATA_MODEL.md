# Folio MVP — implemented data dictionary

Updated: 2026-10-08. Source: `supabase/migrations/202610080001_mvp.sql` and `src/domain.ts`. This documents fields and retrieval paths; it contains no patient entries.

## Ownership

One account represents one person. `owner_id` references the authenticated Supabase user. Composite foreign keys prevent cross-owner links. Authenticated reads require ownership plus TOTP assurance `aal2`; client writes use bounded RPCs. Original files live in private storage at `<owner UUID>/<document UUID>/original` with matching authorization policies.

## Implemented tables

| Table | Fields | Purpose |
| --- | --- | --- |
| documents | id UUID, owner_id UUID, title TEXT, filename TEXT, category TEXT, uploaded_at TIMESTAMPTZ, status TEXT, pages INT, bytes BIGINT, object_key TEXT UNIQUE, mime TEXT, checksum TEXT, tags TEXT[], notes TEXT, raw_text TEXT, error TEXT nullable, storage_verified BOOLEAN | Original metadata and source text. Unique checksum per owner. |
| reports | id UUID, owner_id UUID, document_id UUID, kind TEXT, panel TEXT, examination_date DATE nullable, date_reviewed BOOLEAN, facility TEXT, body_region TEXT, conclusion TEXT, conclusion_reviewed BOOLEAN, revision INT | One lab panel/descriptive report; multiple per document. Revision prevents stale corrections. |
| observations | id UUID, owner_id UUID, report_id UUID, data JSONB; generated label, parameter_code, reported_value, reported_unit, reference_text TEXT | One source measurement. Text preserves inequalities and qualitative values. |
| events | id UUID, owner_id UUID, title TEXT, event_date DATE, event_time TIME nullable, timezone TEXT, end_date DATE nullable, notes TEXT, location TEXT, reminder_minutes INT nullable, report_id UUID nullable UNIQUE, document_id UUID nullable | Manual appointments or one automatic examination event per reviewed report date. |
| revisions | id BIGINT identity, owner_id UUID, report_id UUID, revision INT, before_data JSONB nullable, after_data JSONB, created_at TIMESTAMPTZ | Correction history saved transactionally with a report. |
| jobs | id BIGINT identity, owner_id UUID, document_id UUID UNIQUE, kind TEXT, status TEXT, attempts INT, locked_at TIMESTAMPTZ nullable, error_code TEXT nullable, lease_token UUID nullable | Extraction/deletion queue; ten-minute leases reject stale publications. |
| extraction_runs | id BIGINT identity, owner_id UUID, document_id UUID, engine TEXT, raw_text TEXT, candidates JSONB, created_at TIMESTAMPTZ | Immutable extraction evidence; retries preserve accepted corrections. |

`auth.users`, MFA factors, `storage.buckets`, and `storage.objects` are provider-owned. Passwords and authenticator secrets are not stored in application tables.

## Observation payload

| Field | Type / maximum | Meaning |
| --- | --- | --- |
| id | UUID | Measurement identity |
| label | string, 160 | Reported parameter name |
| parameter | string, 120 | Recognized comparison identity; empty when unknown |
| value | string, 100 | Exact value including inequality/qualitative text |
| unit | string, 80 | Original reported unit |
| range | string, 400 | Source reference statement; empty when absent |
| source | string, 4,000 | Source passage/transcription note |
| page | integer, 1–50 | Source page |
| review.value, review.unit, review.range | pending / reviewed | User verification per field |

Date and conclusion review flags live on the report. Review confirms transcription rather than clinical correctness. Source values are never overwritten by normalized values.

## Controlled values and bounds

- Categories: Laboratory, Imaging, Pathology, Procedures, Prescriptions, Consultations, Other.
- Document status: uploading → queued → processing → review → ready; failed is retryable; deleting hides data until original removal/cascades finish.
- Report kinds: lab, imaging, other. Job kinds: extract, delete. Job states: queued, running, done, failed.
- File: PDF/JPEG/PNG, maximum 25 MB and 50 pages; SHA-256 lowercase hexadecimal.
- Report: maximum 300 observations; JSONB is validated at the mutation boundary.
- Reminder: null or 0–10,080 minutes before a timed event; PostgreSQL validates the IANA zone. Device scheduling currently requires its own zone.

## Quick retrieval and mutations

| RPC | Purpose |
| --- | --- |
| get_snapshot() | Own documents/reports/observations/events as JSON; excludes deleting records. |
| begin_upload(doc) | Register metadata; return canonical UUID; resume unfinished identical upload. |
| finish_upload(doc_id) | Confirm storage object existence and enqueue once; safe to repeat. |
| edit_document(...) | Save title/category/tags/notes. |
| save_report(report) | Owner/revision checks, observation replacement, correction history, calendar synchronization, review status calculation in one transaction. |
| save_event(event), delete_event(event_id) | Own manual events; examination dates are edited through reports. |
| retry_processing(doc_id) | Requeue failed extraction without replacing corrected reports. |
| request_document_deletion(doc_id) | Hide records and enqueue original removal. |
| claim_job(), complete_extraction(...), fail_job(...) | Privileged worker leasing/publication/failure. |

Indexes: owner/upload date, owner/panel/examination date, owner/report, and owner/event date. The MVP searches the entire authorized client snapshot; paginated/full-text retrieval is future scaling work.

## Comparisons and evolving fields

The automatic parser recognizes hemoglobin, white blood cells, platelets, red blood cells, and hematocrit. Unknown measurements remain editable and separate. Matching uses recognized identity plus compatible unit, preserves repeated occurrences and same-day panels, and keeps references specific to each source.

Hemoglobin g/L → g/dL divides supported values and simple ranges by 10 with decimal arithmetic; originals remain unchanged. Other numerical conversions are not inferred. Unreviewed dates/results are omitted by default, with an explicit labeled inclusion option.

New analytes are rows rather than schema columns. Unknown details remain in source text/candidate JSON. Promote reusable attributes using versioned migrations; update this dictionary and validators together. OCR/document text cannot execute schema-changing SQL.

Current scope does not model multiple patients per account, specimen/method identity, amended-report relationships, or conditional reference-range selection. Those workflows require explicit schema extensions.
