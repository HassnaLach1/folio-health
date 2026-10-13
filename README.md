# Folio Health

A personal medical document organizer for Android, iOS, and web. Four tabs: **Home**, **Documents**, **Compare**, and **Calendar**. The app presents source information without diagnosing or recommending treatment.

## Current development direction

The priority is a local MVP with a phone-first experience. The frontend already uses **React Native with Expo**; it can produce an Android APK without rewriting the app in another framework. Web is also available for development previews. No installable APK has been built or tested yet.

Docker Desktop is installed. The [local Supabase stack](https://supabase.com/docs/guides/local-development) supplies PostgreSQL, login, private file storage, and Studio without a hosted account. `supabase/config.toml` enables email confirmation and a 12-character password minimum. TOTP is available, but the local app currently uses password-only sign-in. Local analytics/log collection is disabled because its Vector container cannot reach Docker Desktop's log endpoint on this computer; app data, auth, storage, and Studio remain available. The migrations set up the data model, extraction queue, and manual fallback. The approved Tesseract.js OCR worker runs in Docker.

Local addresses verified on 2026-10-09 (check `pnpm exec supabase status` and Expo output after a restart):

| What to open | Verified address | Purpose |
| --- | --- | --- |
| Supabase Studio | [Local database dashboard](http://localhost:54323) | Choose **Table Editor**, then a table, to view rows; use **SQL Editor** for queries. |
| App preview | [Local app](http://localhost:8081) | Preview Documents, Compare, and Calendar when Expo is running. |
| Backend API | [Local Supabase API](http://localhost:54321) | Used by the app; this is not the table dashboard. |
| Local email inbox | [Mailpit](http://localhost:54324) | Open confirmation and password reset links sent by local auth. |

These addresses refer to the Windows computer. A physical phone needs the computer's local network address instead of `localhost`; set `EXPO_PUBLIC_SUPABASE_URL` to `http://<computer-LAN-IP>:54321` for a phone build and restart Expo. The computer and backend must stay running. Test reachability and auth redirects on the phone before using it for records. To create a one-time doctor link, open the web app at `http://<computer-LAN-IP>:8081`, or set `EXPO_PUBLIC_DOCTOR_VIEW_URL=http://<computer-LAN-IP>:8081` for the native app. The doctor must be on the same network and able to reach both this web address and the local Supabase API. `localhost` links are rejected because they would point to the doctor's own device.

Deployment and paid hosting are deferred. The running worker selects Claude Haiku 4.5 with local OCR/PDF-text fallback; suggested details must be checked against the original. Manual review remains available when extraction fails or is not wanted. Bedrock processing for uploaded document pages was explicitly approved on 2026-10-12 and is configured in the running Compose worker. Live AWS Bedrock extraction passed on 2026-10-12 using a fictional three-page document: two panels, correct continuation pages, checked source values, and pending review. The initial account-verification block has cleared. The frontend and local Supabase remain running.

Project preferences and communication instructions are saved in `AGENTS.md`.

## MVP features

- Sign-in and email account creation include a Google option through local Supabase Auth. Google OAuth was verified end to end on 2026-10-13: the user completed Google sign-in, a Google identity and session were created in local Supabase, and Folio stayed signed in after a browser refresh. Android sign-in has not been tested. Follow [the Google sign-in setup guide](GOOGLE_SIGN_IN.md). Authentication uses PKCE; email confirmation/recovery links must be opened on the browser/device that began the request. No new dependencies are required.
- Laboratory comparison uses one column per date for the selected panel. Same-day sub-reports are combined in the table, PDF, and results-at-a-glance cards; identical source measurements are shown once. Distinct values and alternative units remain visible, with source links to the original documents. Stored reports remain separate.
- **Onboarding and profile:** accounts without completed onboarding see three short steps after sign-in: first/last name and birth date, current weight and preferred units (kg/lb, m/in), then goals and an explicit AI-insights choice. Height and photo are optional. Answers remain editable through the header avatar (photo or initials) or Account settings → My profile. Completion and preferences are saved per account; incomplete accounts, including existing ones, see setup on their next visit. The AI answer controls the existing insights preference, not the extraction engine. Birth date and measurements use scroll wheels. Both unit equivalents are displayed; kg and meters are stored canonically. Private profile photos are JPEG/PNG up to 5 MB and are not sent to the worker or doctor exports. Apply migration `202610130007_profile_onboarding.sql` with `pnpm exec supabase migration up --local` when updating an existing local stack.
- Upload PDF/JPG/PNG or photograph/combine report pages (25 MB, 50 pages maximum).
- Categories, tags, notes, and search across source text and reported details.
- English/French scan OCR and PDF text extraction. Suggested report details include a title/type near the top of the document, date, doctor, place, imaging conclusion only, and laboratory parameter/value/unit/reference-range rows when those appear in readable source text. Multi-line laboratory sections and later reference ranges are linked to their parameter and unit. The inferred lab/imaging category replaces the upload choice when the document is classified. An extracted title replaces the filename-based default; a title the user chose is preserved. Stored report suggestions remain intact in review, including those produced by Bedrock. Extraction can miss unusual layouts; the original remains available for checking.
- Home starts with scan/upload actions, a one-time doctor access card, and upcoming personal events from Calendar.
- In the frontend demo, the doctor access card has an active-state preview only; it does not create a share link. The Compare screen also shows the planned AI progress summary as a labeled placeholder, with the source-report timeline available now.
- Distinct named lab panels on separate pages become separate reports under one document when the extracted page text identifies both. The reviewer opens the original at the active lab panel’s page; ambiguous pages stay together for manual review.
- Review the private original above the form with page and zoom controls; split lab panels open at their source page. Edit the document title and notes, choose a suggested test or procedure type, pick the examination date, and correct doctor, facility, laboratory rows, conclusion, and detailed findings. The form shows the values table and narrative fields according to the extracted content, including both for mixed reports. **Save review** stores the corrections and changes the status to **Accepted**; **Save draft** stores work in progress and leaves it at **Needs review**. An approved report with an examination date creates or updates a calendar event using the Document Title.
- Historical lab tables, source ranges/links, explicit unreviewed labels, range-based red/green/black values, and chronological imaging reports. Only supported hemoglobin g/L → g/dL conversion is applied. Compare includes four quick date ranges and calendar date pickers. Its imaging summary counts dated reports; automated clinical synthesis is not enabled.
- Comparison PDFs through browser Save as PDF or native PDF sharing.
- Month/week/agenda calendar, reviewed examination events, personal appointments, multi-day procedures, and optional device reminders.
- Individual original downloads/sharing. In Documents, **Select documents** shows Select all for the current filtered list, **Share PDF**, and **Delete** actions. PDF sharing merges up to 20 selected PDF/image originals (100 MB) for the native share sheet; the web preview downloads the merged PDF. Bulk deletion asks for confirmation and permanently removes the selected originals and report details. Fictional demo samples without original bytes cannot be merged.
- One-time doctor access links expose up to 100 **reviewed** documents and their report details. The code can be redeemed once within 15 minutes; redemption clears the stored bundle. Original-file links also expire after 15 minutes. This local HTTP workflow is for fictional records on the same network during development. Non-development builds require HTTPS for the viewer and originals. Revoking access stops a new redemption but cannot retract a file already opened or saved by the recipient.
- Supabase authentication, private storage, PostgreSQL ownership policies, and correction history. Local development currently uses password-only sign-in; hosted use should restore mandatory TOTP before real records.

One account represents one person's records. Demo records are fictional and kept only in memory. Offline medical storage, caregiver accounts, automated clinical interpretation, and app-store submission are outside this MVP.

## Previous hosted setup (development now takes priority)

The private website is [Folio Health](https://folio-health-records.frostylarch2.chatgpt.site). Its client build uses the dedicated Supabase project `klseftzdlekhpwnazaal` in Ireland. The initial migration was applied on 2026-10-08: all seven tables have RLS, the document bucket is private, and anonymous snapshot access and client worker access are denied. Production, localhost:8081, and native authentication redirects are configured; TOTP and email confirmation are enabled, with a minimum password length of 12.

The OCR worker is not running on a cloud host yet. Until it is started, uploaded documents remain queued for extraction. Account/email/TOTP and complete upload processing still need live verification. Signed mobile builds and custom email delivery are also pending.

## Run

Use Node.js 24 and pnpm 11.25.0.

### Local backend and app

Start [Docker Desktop](https://docs.docker.com/desktop/), then from this folder run:

```sh
pnpm install --frozen-lockfile
pnpm exec supabase start
pnpm exec supabase status
```

The first start downloads images and applies `supabase/migrations` automatically. Copy the local **API URL** and **publishable key** from `supabase status` into `.env` as `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Use the local API URL, not the old hosted project. The previous hosted `.env` values were saved in ignored `.env.hosted`. Do not put the secret/service-role key in an `EXPO_PUBLIC_` variable. Start the app with `pnpm web` or `pnpm start` for Expo Go. The local email inbox is [Mailpit](http://localhost:54324); confirm your email there, then sign in with your password. Open [Studio](http://localhost:54323) → **Table Editor** → `public` → `documents`, `document_approvals`, `reports`, or `events` to inspect local rows. Stop services with `pnpm exec supabase stop` when finished; avoid `supabase db reset` if you need the records.

### Run the web preview in Docker Desktop

The root `Dockerfile` and `compose.yaml` build the Expo **web** preview as a container named `folio-health-web-1`. This is a browser preview, not an Android APK. The container does not include Supabase or the OCR worker. For real local accounts and documents, start the existing Supabase stack separately with `pnpm exec supabase start`; with Supabase stopped, the web preview can only use synthetic demo mode when the public settings are blank.

Before building, set the local `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` in ignored `.env` from `pnpm exec supabase status`. Keep the service-role key out of these public settings. Compose reads `.env` when building, and Expo embeds these public values in the web files, so rebuild after changing them. For a browser on this computer, the local API address is normally `http://localhost:54321`. A browser on a phone needs the computer's LAN address for the API; update `.env` and rebuild for that case.

```sh
docker compose up --build -d
docker compose down
```

The first command builds and starts the web container. Open the planned address [http://localhost:8081](http://localhost:8081) after it starts. In [Docker Desktop](https://docs.docker.com/desktop/), open **Containers** → **folio-health** to stop or start the `web` container. `docker compose down` removes that container without deleting Supabase data. To make a changed `.env` or source file take effect, run `docker compose up --build -d` again. Keep local `pnpm web` stopped while this container uses port 8081. Supabase's own containers appear separately in Docker Desktop and can be stopped with `pnpm exec supabase stop`.

For the current password-only local trial, set `EXPO_PUBLIC_REQUIRE_MFA=false` in `.env`, run `./scripts/enable-local-password-only.ps1` after starting Supabase, then restart Expo. This local-only override relaxes MFA checks while preserving account ownership checks. It is outside `supabase/migrations` so it is not applied to the hosted database. Apply it again after `supabase db reset`. Email confirmation is still required for new accounts; local test emails appear in Mailpit. Existing verified authenticators are simply skipped in the local app.

Uploads enter the local extraction queue. Open a document to compare the suggested fields with the original shown at the top of the review sheet. If extraction cannot read it, choose **Review manually** and enter the details yourself. **Save review** changes the document to **Accepted** and puts an entered examination date on the calendar under its editable Document Title. **Save draft** leaves it at **Needs review**. Upload and approval dates never place a document on the calendar. Editing an accepted report later requires another review. Local setup is for development; use fictional records until device behavior and backups are verified.

```sh
pnpm install --frozen-lockfile
pnpm web
```

Open the localhost address printed by Expo. Without both public Supabase settings, the app enters a labeled synthetic demo. Demo uploads disappear on reload and do not run server OCR. Use fictional documents in demo mode.

For Android/iOS preview, run `pnpm start` with compatible Expo Go. Inline PDF viewing uses `react-native-pdf` and its Expo SDK 55 config plugins, so PDFs inside the review sheet require a custom Android/iOS build; Expo Go shows an **Open / share original** fallback. Photos can be viewed in the sheet. `pnpm android` uses a configured Android emulator; a local iOS simulator requires macOS. Cloud native profiles are in `eas.json`. No APK has been built or verified on a phone yet.

## Hosted PostgreSQL and storage reference (optional, deferred)

PostgreSQL supports typed ownership/date relationships and JSONB for evolving source attributes. Supabase supplies PostgreSQL, authentication, and private object storage together.

1. Create a **new dedicated Supabase project** in your account. Choose a region and enter the database password yourself.
2. Run `supabase/migrations/202610080001_mvp.sql` once in the SQL editor. It creates seven application tables, RPCs, ownership/MFA policies, and the private `medical-documents` bucket; no patient fixtures.
3. Copy `.env.example` to `.env`. Set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` from the project URL and public publishable key (legacy anon also works).
4. In Authentication, keep email confirmation enabled, enable TOTP, enforce minimum password length 12, and configure email delivery. Set the Site URL and redirect allowlist to the deployed web origin, localhost for development, and `foliohealth://` for native builds.
5. Restart Expo/rebuild the export. Public client values are embedded at build time.
6. Create a Folio account, confirm its email, and enroll an authenticator. Keep an authenticator backup; this MVP does not implement authenticator recovery codes.

Public publishable/anon keys may be in the client. Secret/service-role keys belong only in the worker environment. Never prefix privileged keys with `EXPO_PUBLIC_`, place them in the hosting manifest, or commit them.

Official references: [API keys](https://supabase.com/docs/guides/getting-started/api-keys), [redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls), [production configuration](https://supabase.com/docs/guides/deployment/going-into-prod).

## OCR worker

For local Docker processing, create an ignored `.env.worker.local` containing `SUPABASE_URL=http://host.docker.internal:54321` and `SUPABASE_SERVICE_ROLE_KEY=<local service_role key from pnpm exec supabase status>`. Keep the key out of app variables and source control. Then run:

```sh
docker build -f worker/Dockerfile -t folio-worker:local .
docker run -d --name folio-worker-local --env-file .env.worker.local --restart unless-stopped -v folio_ocr_cache:/app/.cache/ocr-language folio-worker:local
docker logs --tail 20 folio-worker-local
```

The worker polls PostgreSQL jobs, validates file signatures/SHA-256, extracts text, and publishes unreviewed candidates. A bounded child process receives documents in memory without database credentials. Document content is excluded from logs. First OCR use downloads English/French models; `.cache/ocr-language` stores models only. Failed extraction preserves original-file access and supports retry.

The worker needs network access to local Supabase and the OCR language models on first use. The named volume keeps those models across container restarts. `EXTRACTION_ENGINE=local` is the default; Azure now requires `EXTRACTION_ENGINE=azure` explicitly. The current worker explicitly selects Bedrock; local OCR is its configured fallback. The live fictional-document test passed on 2026-10-12 after account verification cleared.

### Amazon Bedrock extraction with Claude Haiku 4.5

The worker can use `EXTRACTION_ENGINE=bedrock` for PDF/JPEG/PNG extraction through the [Bedrock Runtime InvokeModel API](https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-anthropic-claude-messages-request-response.html). It renders every PDF page locally in a credentialless child process and sends all pages together in a single native Messages request. The prompt requires reading the full document before extracting panels; continuation pages remain together, and separate panels on the same page stay separate. Requests support Folio’s 50-page limit, cap each image dimension at 2000 pixels, divide a 17 MB image budget across pages, and reject JSON bodies above 24 MB. Truncated or invalid results never publish partial reports. AWS enforces a structured JSON schema; Folio validates the response again before writing unreviewed candidates. Distinct test panels remain separate reports with source pages and comparison codes. The default is local OCR; `EXTRACTION_FALLBACK=local` retries local extraction if Bedrock fails. A failed Bedrock request may still consume credits before fallback.

Claude 3.5 Sonnet and 3.5 Haiku have reached end of life on Bedrock. The selected default is **Claude Haiku 4.5** (`eu.anthropic.claude-haiku-4-5-20251001-v1:0`). Model selection remains configurable with `AWS_BEDROCK_MODEL_ID`. `AWS_REGION=eu-west-1` selects the Ireland endpoint; the `eu.` inference profiles can route among supported EU Regions. Check [regional model availability](https://docs.aws.amazon.com/bedrock/latest/userguide/models-region-compatibility.html) and [model access](https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html) for the account before activation.

In the [AWS Billing and Cost Management console](https://console.aws.amazon.com/billing/home#/credits), check the actual Free Tier credit balance and expiry. AWS offers up to $200 to eligible new accounts, often $100 at signup and an additional $100 earned through activities; do not assume all $200 has been granted. Create a [budget alert](https://console.aws.amazon.com/billing/home#/budgets). Anthropic models are third-party offerings whose charges may appear under the provider in Cost Explorer. Confirm credit eligibility for the specific model in your account before paid use.

In the [Bedrock model catalog](https://console.aws.amazon.com/bedrock/home#/model-catalog), choose the same Region, open Haiku 4.5, complete Anthropic's first-time-use form, and review Marketplace/payment prerequisites. Give a dedicated worker identity only the Bedrock invocation permissions for the selected model or inference profile. Prefer temporary credentials through an AWS profile or role; never put AWS credentials in `EXPO_PUBLIC_` variables or source control. The AWS SDK uses its standard credential chain. For Docker, mount only the worker's credential/profile files read-only and set `AWS_PROFILE` if needed.

The user selected Haiku on 2026-10-12 and requested this integration. Once the account/model-access and worker authentication setup is verified, set `AWS_REGION`, `AWS_BEDROCK_MODEL_ID`, and `EXTRACTION_ENGINE=bedrock` in the ignored worker environment. Rebuild and restart only the worker, then test a fictional document first. The current web container and local Supabase can remain available without Bedrock.

The structured model JSON uses `null` for missing source fields. The validated original JSON is retained in `public.extraction_runs.structured_output`, while the adapter converts missing source text to blank strings for Folio’s existing editable fields. Each report records `sourcePages`, `educationalNote`, and nullable `aiInterpretation` separately from source findings and conclusions. A required disclaimer accompanies interpretations. Corrections to source facts clear stale interpretations in PostgreSQL. Educational notes remain independent of patient values.

The account setting **Show AI interpretation** defaults to off and is saved in `public.user_preferences`. The same switch appears in Review, Compare, and workspace settings. Hidden interpretations are not rendered or added to PDF exports or doctor views. Panel buttons group histories using canonical panel codes, with English/French aliases and analyte aliases normalized in the worker. Extraction suggestions still require review before acceptance.

Apply versioned migrations with `pnpm exec supabase migration up --local`; do not reset the database. For the existing local password-only setup, reapply `./scripts/enable-local-password-only.ps1` afterwards. Studio is at [http://localhost:54323](http://localhost:54323), with fields in `public.reports` and preferences in `public.user_preferences`.

For a local trial, a short-term Bedrock key can be kept as `AWS_BEARER_TOKEN_BEDROCK` in ignored `.env.worker.local`. It is valid only in its generating Region and expires with the AWS console session, within 12 hours. Use an IAM identity with appropriate model invocation permissions; do not use root credentials. Put `EXTRACTION_ENGINE=bedrock`, `AWS_REGION=eu-west-1`, and `AWS_BEDROCK_MODEL_ID=eu.anthropic.claude-haiku-4-5-20251001-v1:0` in that worker file. Create the cache once with `docker volume create folio_ocr_cache`, then start with `docker compose --profile worker up -d --build worker`, after stopping the older standalone `folio-worker-local` container so only one worker polls the queue. The worker is then visible in Docker Desktop under `folio-health`. Long-running use should use a refreshable IAM profile/role instead. Token counts are logged, without document contents, for cost tracking. Run the explicit fictional-document check with `docker run --rm --env-file .env.worker.local folio-worker:haiku node --import tsx worker/smoke.ts`; it sends only generated fictional pages to AWS and verifies a kidney panel spanning two pages plus a separate liver panel. It consumes a small amount of model credits.

## Build and deploy

```sh
pnpm build:web
pnpm build:all
```

Web output is `dist/`; `.openai/hosting.json` identifies the private Sites deployment. Publish the exact export through Sites. The Supabase backend and OCR worker are deployed separately.

Native EAS profiles are included. With your Expo account/signing setup, use `npx eas-cli build --platform android --profile preview` or its iOS equivalent. Expo/Apple accounts, signing credentials, and provider charges may be needed. No store submission is automatic.

## Verification and limits

Run `pnpm typecheck` and `pnpm test`. Tests cover SQL with auth/storage stubs, MFA/account isolation, one-time access redemption, transactions, revisions, calendar synchronization, uploads, comparisons, export escaping, and real synthetic PDF/scan OCR. The older ZIP utility still has a test, although selected-document sharing now creates a PDF. These checks do not replace live Supabase or physical-device tests.

Before real records, verify registration/email, account isolation, upload → extraction → approval, manual fallback, deletion, exports, and reminders on the actual devices. Configure backups, email delivery, and retention. The worker checks signatures and SHA-256 before publishing extraction results; the manual fallback relies on client-side checks. Antivirus scanning is not included. Web auth tokens use browser `sessionStorage` so refreshes keep the session until the tab session ends; native tokens use SecureStore. No medical content is cached in browser storage. Restore mandatory MFA before using real records outside this local trial.

Reminders run on the device where an event is saved, require its local time zone, and are not web push or a cross-device reminder service. Search currently loads the whole authorized personal library; pagination/full-text indexing can be added for larger libraries.

## Files

| Path | Purpose |
| --- | --- |
| App.tsx, src/screens | Home/Documents/Compare/Calendar navigation and screens |
| src/dialogs.tsx, src/DocumentReview.tsx, src/DocumentViewer.*.tsx, src/DoctorAccess.tsx, src/Auth.tsx | Upload/event forms, document review, private original and temporary doctor viewers, and authenticator access |
| src/domain.ts | Validation, extraction, comparison, PDF HTML |
| src/backend.ts, src/device.ts, src/archive.ts | Database access, doctor links, PDF sharing/reminders; legacy ZIP utility |
| supabase/migrations | Schema and ownership policies |
| Dockerfile, compose.yaml, docker/nginx.conf | Container build and server for the Expo web preview |
| worker | OCR processing/container |
| tests | Domain, database, OCR, archive checks |
| DATA_MODEL.md | Current schema/retrieval dictionary |
| AGENTS.md, CLAUDE.md | Project instructions; `CLAUDE.md` is an exact copy of `AGENTS.md` |

Patient entries belong in PostgreSQL/private storage. Markdown files document schema, never actual patient records.

Verification on 2026-10-12: TypeScript and 26 tests passed; frontend/worker Docker images built; local migrations applied after a local backup; the browser interpretation preference persisted across reloads and was restored to off. The running worker is `folio-health-worker-1`, with `EXTRACTION_ENGINE=bedrock`, the EU Haiku 4.5 profile and existing OCR cache. The live fictional-document test subsequently passed against AWS Haiku 4.5 (6,497 input tokens and 733 output tokens), checking three pages, two panels, source values and pending review. The worker was rebuilt from the tested source. This verifies the synthetic example, not accuracy across real medical documents. The short-term credential must be renewed after expiry; failed AWS calls use local extraction. Android/phone UI has not been tested for this change.


### Review and imaging comparison updates (2026-10-12)

Documents offers the same Scan Document and Upload Document actions as Home. Review uses one large required confirmation for the entire document, with a red reminder. Panel edits are retained while switching; Save review confirms all panels, values, units, ranges, conclusions and entered examination dates together. Save draft remains available without the confirmation.

Compare colors values green when within the source reference interval, red when definitively outside, and black when the reference is missing or cannot be interpreted reliably. Supported ranges include numeric intervals, one-sided limits and explicit positive/negative references. An inequality that overlaps the reference interval remains black because its exact position is unknown.

For two imaging reports of the same type and body region, Compare shows conclusions and descriptions together. Enable Show AI interpretation, select the earlier and later reviewed reports with confirmed dates, then choose Generate short comparison. Haiku compares the source texts in at most three short sentences, with its disclaimer displayed separately. It does not infer that an unmentioned finding disappeared. The new migration `202610120003_imaging_comparisons.sql` adds an owner-scoped worker queue with leases and revision-bound caching; changing either report makes a cached comparison stale. No AWS credentials enter the frontend. The request runs only after the user presses Generate; local OCR does not generate a replacement AI comparison when AWS fails.

The worker extraction prompt now asks for a direct range summary in at most two sentences before its disclaimer. Laboratory summaries are displayed as short checks calculated from source values and ranges, so older model commentary cannot contradict the table colors. Missing or ambiguous references stay explicit. To test the imaging model with fictional source text only: `docker run --rm --env-file .env.worker.local folio-health-worker node --import tsx worker/imaging-smoke.ts`.

Migration `202610120004_imaging_panel_names.sql` also matches older imaging reports without a panel code to newer reports with the equivalent code.

Verification for these updates: 28 regression tests and TypeScript passed; migrations applied to local Supabase after a backup; frontend and worker rebuilt. A live Haiku fictional imaging comparison preserved the 5 mm and 6 mm source measurements and the disclaimer. Browser checks confirmed one review checkbox, Save review disabled before confirmation and enabled after it, and scan/upload actions in Documents. No physical phone or APK was tested.


### Compare and care records (2026-10-13)

Compare stays mounted during Home/Documents/Calendar navigation, retaining the chosen panel, date filters, unreviewed toggle, imaging pair and generated summaries during the signed-in session. Imaging pair and timeline views now show conclusions only; pair AI requests exclude detailed descriptions. One educational explanation appears for the selected panel type. Laboratory results-at-a-glance remain grouped by examination date. The final AI conclusion summarizes the whole selected history, using matching parameters and units and checked source range statuses, without inferring diagnoses, causes or treatments. Generate requests require 2 to 30 reviewed reports and confirmed dates; imaging histories also require the same body region. Summaries are invalidated when source revisions change.

French reference phrases such as "inferieur a 100" (including accented spellings), "inferieur ou egal a 100", and "superieur a 100" use their stated strict or inclusive limits for table colors and summaries.

Documents adds **Add procedure, prescription or consultation**. These manually entered care records are stored once in `public.events` and displayed under the corresponding Documents category and in Calendar. Procedure names, dates, doctors, prescription medications and consultation details can be edited from either view. No source file or extraction is required for these records. Calendar starts with Procedure/Consultation/Other selection, followed by the appropriate name and doctor/date fields; prescriptions can be entered from Documents or edited through their existing calendar entry. Uploaded care documents retain their source review workflow and appear on reviewed dates, with doctor and prescription/consultation details taken from the source report.

Apply `202610130001_care_events.sql` and `202610130002_history_conclusions.sql` with `pnpm exec supabase migration up --local`, preserve the local sign-in override, and rebuild the frontend and worker. The history queue is owner scoped and leased by the service worker; old pair summaries that included descriptions are marked stale by the scope version. The laptop **My workspace** breadcrumb opens Home.


Verification on 2026-10-13: 29 regression tests and TypeScript passed; local migrations applied after a backup; frontend/worker images rebuilt. Browser checks confirmed that Compare retains the chosen region and unreviewed toggle across Home and Calendar, imaging descriptions are absent, there is one panel explanation, typed consultation/prescription forms expose their required fields, and the laptop breadcrumb opens Home. The temporary Bedrock credential was renewed privately after expiry. A live fictional three-report laboratory history summarized hemoglobin 11 -> 13 -> 14 g/dL and its change from below to within the printed 12-16 range. Android APK and physical phone behavior remain untested.

Run that provider test without accessing patient records: `docker run --rm --env-file .env.worker.local folio-health-worker node --import tsx worker/history-smoke.ts`.


### Compact care forms, grouped units and report-only PDF (2026-10-13)

Prescription records show name, doctor, date, medications and notes; time, location, end date and timezone controls are hidden. Procedures omit time and end date. Consultations use an automatic "Consultation" title and omit the name/end-date controls. Required names, care doctors, dates and prescription medications have small red Required labels and validation. Appointment times use two scrollable hour/minute lists with tap selection. Hidden time/end/location fields are normalized when saving; removed appointment reminders are cancelled on the current device.

Laboratory review and Compare group each canonical analyte in one block, retaining every source measurement with its own value, unit and reference. Repeated source measurements remain visible inside that block; no dual-unit value is invented or discarded. Canonical panel names are used in Compare, including Kidney Function Panel. The library counter counts uploaded Laboratory, Imaging and Pathology documents only.

On web, Download PDF prints an isolated report-only document rather than the application window. Imaging exports contain the dated report timeline and source conclusions; laboratory exports use grouped analytes and their original per-unit references. The native app retains Expo PDF generation and sharing.

Imaging AI comparisons now accept studies whose anatomical coverage overlaps (for example, abdomen/pelvis and thorax/abdomen/pelvis), while rejecting unrelated areas. The prompt compares only source conclusions within shared coverage, in two short sentences, and notes limited coverage where relevant. Cached longer summaries are invalidated by the new scope version. Migration `202610130003_compact_care_and_shared_imaging.sql` applies these rules and care-field normalization.


The final summary cache scope is updated by `202610130004_plain_language_conclusions.sql`, so old longer or less precise summaries are regenerated. Imaging prompts use plain language, exclude recommendations even when source reports contain them, and do not call a finding new or resolved because another conclusion omits it. Known legacy analyte names such as fasting glucose are canonicalized for display grouping; printed values, units, source references and review flags remain in their original observation records.

Verification: 31 tests and TypeScript passed; compact care-field normalization and overlapping-region RPCs were tested. Browser checks confirmed removed prescription/procedure/consultation fields, Required labels, a 14:30 time selection, the five-document library count excluding two care records, grouped urea/creatinine measurements and the Kidney Function Panel label. The report-only print document contains timeline columns and excludes app navigation and detailed findings. Physical phone/APK behavior and the final native print-dialog save remain untested.


Final live verification: both the two-report imaging comparison and the overall imaging-history conclusion completed through the running Bedrock worker and appeared in the browser. They use two short source-summary sentences, with one separate disclaimer per summary. `202610130005_regenerate_source_summaries.sql` marks prior generated-cache entries for regeneration without changing source reports. Final browser checks confirmed one displayed name each for urea, creatinine and fasting glucose, with their individual measurements and ranges grouped underneath. All 31 regression tests and TypeScript passed. The final native print-dialog PDF save and physical phone/APK remain unverified.

## AWS Docker deployment

The complete source backup is on [codex/folio-full-backup](https://github.com/HassnaLach1/folio-health/tree/codex/folio-full-backup). AWS deployment preparation lives in [deploy/README.md](deploy/README.md): a fresh self-hosted Supabase stack, Folio web/worker images, HTTPS proxy, private internal services and a CloudFormation host template sized for a $50 monthly target. Local accounts and records are not imported. Docker images and the isolated empty stack have passed integration checks; actual AWS hosting is pending launch approval and live verification. Secrets, local screenshots and database caches are excluded from Git and build contexts.
