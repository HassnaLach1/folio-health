# Folio MVP — implemented data dictionary

Updated: 2026-10-12. Source: `supabase/migrations` and `src/domain.ts`. This documents fields and retrieval paths; it contains no patient entries.

## Ownership

One account represents one person. `owner_id` references the authenticated Supabase user. Composite foreign keys prevent cross-owner links. The versioned schema requires ownership plus TOTP assurance `aal2`; the current local trial applies `supabase/local/password_only.sql` to require ownership and password sign-in without TOTP. Client writes use bounded RPCs. Original files live in private storage at `<owner UUID>/<document UUID>/original` with matching authorization policies.

## Implemented tables

| Table | Fields | Purpose |
| --- | --- | --- |
| documents | id UUID, owner_id UUID, title TEXT, filename TEXT, category TEXT, uploaded_at TIMESTAMPTZ, status TEXT, pages INT, bytes BIGINT, object_key TEXT UNIQUE, mime TEXT, checksum TEXT, tags TEXT[], notes TEXT, raw_text TEXT, error TEXT nullable, storage_verified BOOLEAN | Original metadata and source text. Unique checksum per owner. |
| document_approvals | document_id UUID primary key, owner_id UUID, approved_at TIMESTAMPTZ, calendar_event_id UUID nullable unique | Explicit acceptance audit row. Approval has no calendar event; editing a report removes its approval until accepted again. |
| reports | id UUID, owner_id UUID, document_id UUID, kind TEXT, panel TEXT, panel_code TEXT, source_page INT nullable, examination_date DATE nullable, date_reviewed BOOLEAN, facility TEXT, doctor TEXT, body_region TEXT, conclusion TEXT, findings TEXT, conclusion_reviewed BOOLEAN, revision INT | One lab panel/descriptive report; multiple per document. `panel_code` groups synonymous test names across dates, and `source_page` opens the matching original page. Revision prevents stale corrections. |
| observations | id UUID, owner_id UUID, report_id UUID, data JSONB; generated label, parameter_code, reported_value, reported_unit, reference_text TEXT | One source measurement. Text preserves inequalities and qualitative values. |
| events | id UUID, owner_id UUID, title TEXT, event_date DATE, event_time TIME nullable, timezone TEXT, end_date DATE nullable, notes TEXT, location TEXT, reminder_minutes INT nullable, report_id UUID nullable UNIQUE, document_id UUID nullable | Manual appointments and examination events from dated reports. Document-linked event titles follow the editable Document Title. |
| doctor_access_grants | id UUID, owner_id UUID, token_hash TEXT unique, payload JSONB, expires_at TIMESTAMPTZ, redeemed_at TIMESTAMPTZ nullable, created_at TIMESTAMPTZ | One-use, 15-minute local doctor access. Only a hash of the random code is stored; no table access is granted to the browser. |
| revisions | id BIGINT identity, owner_id UUID, report_id UUID, revision INT, before_data JSONB nullable, after_data JSONB, created_at TIMESTAMPTZ | Correction history saved transactionally with a report. |
| jobs | id BIGINT identity, owner_id UUID, document_id UUID UNIQUE, kind TEXT, status TEXT, attempts INT, locked_at TIMESTAMPTZ nullable, error_code TEXT nullable, lease_token UUID nullable | Extraction/deletion queue; ten-minute leases reject stale publications. |
| extraction_runs | id BIGINT identity, owner_id UUID, document_id UUID, engine TEXT, raw_text TEXT, candidates JSONB, created_at TIMESTAMPTZ | Immutable extraction evidence; retries preserve accepted corrections. |

`auth.users`, MFA factors, `storage.buckets`, and `storage.objects` are provider-owned. Passwords and authenticator secrets are not stored in application tables.

## Observation payload

| Field | Type / maximum | Meaning |
| --- | --- | --- |
| id | UUID | Measurement identity |
| label | string, 160 | Reported parameter name |
| parameter | string, 120 | Canonical lowercase analyte identity for comparison; empty when unknown |
| value | string, 100 | Exact value including inequality/qualitative text |
| unit | string, 80 | Original reported unit |
| range | string, 400 | Source reference statement; empty when absent |
| source | string, 4,000 | Source passage/transcription note |
| page | integer, 1–50 | Source page |
| review.value, review.unit, review.range | pending / reviewed | User verification per field |

Date and conclusion review flags live on the report. Review confirms transcription rather than clinical correctness. Source values are never overwritten by normalized values.

## Controlled values and bounds

- Categories: Laboratory, Imaging, Pathology, Procedures, Prescriptions, Consultations, Other.
- Document status: uploading → queued → processing → review → ready (shown as **Accepted** only after `approve_document`); failed is retryable; deleting hides data until original removal/cascades finish.
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
| edit_document(...) | Save title/category/tags/notes and synchronize document-linked calendar titles. |
| save_report(report) | Owner/revision checks, observation replacement, correction history, calendar synchronization, review status calculation in one transaction. |
| save_event(event), delete_event(event_id) | Own manual events; examination dates are edited through reports. |
| retry_processing(doc_id) | Requeue failed extraction without replacing corrected reports. |
| start_manual_review(doc_id), finish_upload_manual(doc_id) | Let a person transcribe a document without automatic extraction. |
| approve_document(doc_id) | Explicitly accept the document, record approval, and place only confirmed examination dates on the calendar. |
| create_doctor_access(records), redeem_doctor_access(secret), doctor_access_status(), revoke_doctor_access() | Issue one-use 15-minute record access, atomically redeem the token, inspect status, and revoke a pending grant. |
| request_document_deletion(doc_id) | Hide records and enqueue original removal. |
| claim_job(), complete_extraction(...), fail_job(...) | Privileged worker leasing/publication/failure. |

Indexes: owner/upload date, owner/panel/examination date, owner/report, and owner/event date. The MVP searches the entire authorized client snapshot; paginated/full-text retrieval is future scaling work.

## Comparisons and evolving fields

The local parser recognizes a document type/title near the top, labeled dates, doctors, and places; copies conclusion and detailed findings sections separately; and suggests laboratory rows with common units. Named lab panels on different pages become separate reports when the names are distinct. The optional Amazon Bedrock path renders pages locally, requests structured document metadata and multiple specific panel reports, and validates the result before publication. Each report stores its first source page; each observation stores its own page. A report can contain both rows and a conclusion. A recognized type replaces a filename-derived document title during first extraction, but does not replace a custom user title. Both engines publish unreviewed suggestions. Comparison groups reports by panel code, then observations by canonical parameter and exact unit. It preserves repeated occurrences and same-day panels, and keeps references specific to each source. A small curated dictionary provides physiological explanations for known analytes; unknown analytes have no generated explanation.

Hemoglobin g/L → g/dL divides supported values and simple ranges by 10 with decimal arithmetic; originals remain unchanged. Other numerical conversions are not inferred. Unreviewed dates/results are omitted by default, with an explicit labeled inclusion option.

New analytes are rows rather than schema columns. Unknown details remain in source text/candidate JSON. Promote reusable attributes using versioned migrations; update this dictionary and validators together. OCR/document text cannot execute schema-changing SQL.

Current scope does not model multiple patients per account, specimen/method identity, amended-report relationships, or conditional reference-range selection. Those workflows require explicit schema extensions.

### Whole-document Haiku extraction and panel insights

The worker supplies all rendered document pages in one native Bedrock Messages request to Claude Haiku 4.5. Model JSON records null for absent source fields; the adapter retains compatibility with blank editable source fields. Reports add `source_pages` (all pages contributing to a panel), nullable `educational_note` (general physiology), and nullable `ai_interpretation` (neutral comparison with printed ranges, with a disclaimer). Model commentary is independent of source conclusion/findings and is written only by the service worker. Saving changed source facts clears the old interpretation. `public.user_preferences(owner_id, show_ai_interpretation)` stores an account-scoped display preference defaulting to false, through `set_ai_interpretation_preference(enabled)`. `get_snapshot` returns it as `preferences.showAiInterpretation`. Original report fields and pending review semantics are preserved.

`public.extraction_runs.structured_output` retains the validated native JSON response, including source nulls, independently of the editable report fields. Client-supplied report saves cannot replace generated commentary. Doctor-access bundles and PDF exports include source reports without AI interpretation.


### Imaging comparison queue

`public.imaging_comparisons` stores the requesting owner, earlier/later report IDs and revisions, immutable source conclusion/findings snapshots, queued/running/done/failed status, worker lease and generated summary. RPCs enforce ownership, the AI preference, matching study type and body region, review flags and date order. The service role alone claims/completes leases. `get_imaging_comparison` returns stale with no summary when either revision changes. Cascade deletion removes comparisons when a source report is deleted. The frontend hides the entire generated comparison when AI interpretation is off.

The single document review confirmation writes existing per-field review flags for all panels, preserving the existing acceptance and comparison contracts. Unsaved edits across panels are kept in memory until Save draft or Save review.


### Typed care events and overall history summaries

Events add `event_type` (Procedure, Prescription, Consultation, Other), `doctor`, and `medications`. Manual care events are the canonical record for both Documents categories and Calendar; there is no duplicated document/date row. Existing linked report events expose their source document category and report doctor/details through the snapshot. `save_event` validates typed fields through an authenticated owner-scoped wrapper.

`history_conclusions` stores owner, ordered report IDs/revisions, scope cache key, lab/imaging mode, immutable source JSON, status, summary and worker lease. Authenticated requests verify reviewed sources and grouping; service-only claim/complete RPCs write model output. Imaging source JSON contains conclusions only. Laboratory source values are validated and normalized using the existing domain rules before the model sees them, alongside computed range status. Revision changes make summaries stale, and deleting a source report removes dependent history summaries. Pair imaging summaries have a scope version to invalidate old description-based results.


Compact care forms normalize omitted fields through the authenticated save_event wrapper: no time/reminder for procedure or prescription; no end date for typed care; no prescription location; automatic consultation title. Manual care doctors are required. Dual-unit grouping is a presentation layer over unchanged source observation records, with independent references/review flags per measurement. Comparison cache scope v4 (pair) and the short-overlap history key regenerate previously longer summaries; compatible anatomical coverage is checked in both client and RPC.
# User profile

`public.user_profiles` stores one optional profile per authenticated owner: first_name, last_name, birth_date, photo_path, weight_kg, and height_meters. The app converts pounds and inches for display/editing while keeping a single canonical measurement. Birth dates must be valid and not in the future; measurements must be positive when supplied. `get_profile()` and `save_profile(jsonb)` enforce the current account and authentication requirement. Profiles are separate from document extraction and doctor-access bundles.

Profile photos use the private `profile-photos` bucket (JPEG/PNG, 5 MB maximum), with keys `ownerUUID/photoUUID.jpg` or `.png`. Storage policies restrict read/upload/delete to the owner. Preview links expire after one hour. Changing/removing a photo deletes obsolete files after saving; canceling the form cleans up newly uploaded draft photos where possible.


### Onboarding and preferences

Migration `202610130007_profile_onboarding.sql` adds weight_unit, height_unit, goals and onboarding_completed to user_profiles. Goals use stable keys: digitize, compare, appointments, understand. All accounts without completion enter the three-step setup; existing profile fields are preserved. Completion requires first/last name, birth date, weight, at least one goal and an explicit AI choice. Completed profiles cannot be reset to incomplete or lose required fields through the save RPC. Height/photo remain optional.

The profile RPC saves these fields and the existing user_preferences.show_ai_interpretation in one transaction. get_profile reads the same AI preference used by workspace/Compare toggles, avoiding competing settings. Profile data stays owner-scoped and is not added to extraction requests or doctor exports. Older internal profile RPCs are no longer executable by clients.
