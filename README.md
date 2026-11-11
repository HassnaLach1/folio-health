# Medical Folio / Folio Health

A personal project by **Hassna Ait Lachgar**, exploring how software can make medical documents easier to organize and understand.

## Project overview

Medical reports are often spread across paper files, scans, and separate laboratory results. This project brings documents, reviewed results, comparisons, and appointments into one application. It is designed around a simple workflow: **import a document, review extracted information, and compare records over time**.

## Development approach

I initiated the project from a practical document-management need and defined the intended user experience. I am developing it with AI-assisted coding tools while learning how the application, database, and OCR worker fit together. This repository documents my progress from identifying a problem to developing a working prototype.

The application includes TypeScript code, an Expo client, Supabase services, an OCR worker packaged with Docker, and a test suite. The technical documentation below explains setup and current limitations.

## Current status and next steps

The core features are available in my local development version. Payment integration and publication on the App Store and Google Play remain planned work. The existing web deployment has separate limitations, including pending cloud-worker operation and end-to-end live verification, detailed below. Local functionality should not be confused with a fully deployed service.

This is a document-organization prototype: it does not diagnose conditions or recommend treatment. Use fictional records when evaluating the demo.

## Présentation en français

Projet personnel de gestion de documents médicaux : classement des comptes rendus, extraction de texte, vérification des résultats et comparaison dans le temps. Je développe cette application avec l’aide d’outils d’IA afin de transformer un besoin concret en un projet d’apprentissage. La version locale et le déploiement sont distingués dans la documentation ; la publication mobile et le paiement restent à finaliser.

---

## Technical documentation

A personal medical document organizer for Android, iOS, and web. Three screens: **Documents**, **Compare**, and **Calendar**. The app presents source information without diagnosing or recommending treatment.

## MVP features

- Upload PDF/JPG/PNG or photograph/combine report pages (25 MB, 50 pages maximum).
- Categories, tags, notes, and search across source text and reported details.
- English/French scan OCR and PDF text extraction. Conservative structured extraction recognizes common blood-count parameters and copies descriptive conclusions. Other details remain available for manual transcription.
- Review/correct values, units, ranges, dates, and conclusions; add multiple reports per document.
- Historical lab tables, source ranges/links, explicit unreviewed labels, and chronological imaging reports. Only supported hemoglobin g/L → g/dL conversion is applied.
- Comparison PDFs through browser Save as PDF or native PDF sharing.
- Month/week/agenda calendar, reviewed examination events, personal appointments, multi-day procedures, and optional device reminders.
- Individual original downloads/sharing and up to 20 selected originals (100 MB) in one ZIP.
- Supabase authentication with mandatory TOTP, private storage, PostgreSQL ownership policies, and correction history.

One account represents one person's records. Demo records are fictional and kept only in memory. Offline medical storage, caregiver accounts, automated clinical interpretation, and app-store submission are outside this MVP.

## Deployment status

The private website is [Folio Health](https://folio-health-records.frostylarch2.chatgpt.site). Its client build uses the dedicated Supabase project `klseftzdlekhpwnazaal` in Ireland. The initial migration was applied on 2026-10-08: all seven tables have RLS, the document bucket is private, and anonymous snapshot access and client worker access are denied. Production, localhost:8081, and native authentication redirects are configured; TOTP and email confirmation are enabled, with a minimum password length of 12.

The OCR worker is not running on a cloud host yet. Until it is started, uploaded documents remain queued for extraction. Account/email/TOTP and complete upload processing still need live verification. Signed mobile builds and custom email delivery are also pending.

## Run

Use Node.js 24 and pnpm 11.25.0.

```sh
pnpm install --frozen-lockfile
pnpm web
```

Open the localhost address printed by Expo. Without both public Supabase settings, the app enters a labeled synthetic demo. Demo uploads disappear on reload and do not run server OCR. Use fictional documents in demo mode.

For Android/iOS preview, run `pnpm start` with compatible Expo Go. `pnpm android` uses a configured Android emulator; a local iOS simulator requires macOS. Cloud native profiles are in `eas.json`.

## Connect PostgreSQL and storage

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

Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env`, then run `pnpm worker`.

The worker polls PostgreSQL jobs, validates file signatures/SHA-256, extracts text, and publishes unreviewed candidates. A bounded child process receives documents in memory without database credentials. Document content is excluded from logs. First OCR use downloads English/French models; `.cache/ocr-language` stores models only. Failed extraction preserves original-file access and supports retry.

`worker/Dockerfile` packages a continuously running worker for a container host:

```sh
docker build -f worker/Dockerfile -t folio-worker .
docker run --env-file .env --restart unless-stopped folio-worker
```

Use encrypted host environment settings for cloud secrets. The worker needs network access to Supabase and OCR models. Optional Azure OCR is enabled only when both Azure settings are configured and sends file bytes to that provider; review its region/data handling before enabling it.

## Build and deploy

```sh
pnpm build:web
pnpm build:all
```

Web output is `dist/`; `.openai/hosting.json` identifies the private Sites deployment. Publish the exact export through Sites. The Supabase backend and OCR worker are deployed separately.

Native EAS profiles are included. With your Expo account/signing setup, use `npx eas-cli build --platform android --profile preview` or its iOS equivalent. Expo/Apple accounts, signing credentials, and provider charges may be needed. No store submission is automatic.

## Verification and limits

Run `pnpm typecheck` and `pnpm test`. Tests cover SQL with auth/storage stubs, MFA/account isolation, transactions, revisions, calendar synchronization, uploads, comparisons, export escaping, real synthetic PDF/scan OCR, and ZIP output. They do not replace live Supabase or physical-device tests.

Before real records, verify registration/email/TOTP, account isolation, upload → worker → review, deletion, exports, and reminders on the deployed services/devices. Configure backups, email delivery, retention, and worker supervision. Originals are signature-checked; antivirus scanning is not included. Web authentication is memory-only; native tokens use SecureStore. No medical localStorage cache is used.

Reminders run on the device where an event is saved, require its local time zone, and are not web push or a cross-device reminder service. Search currently loads the whole authorized personal library; pagination/full-text indexing can be added for larger libraries.

## Files

| Path | Purpose |
| --- | --- |
| App.tsx, src/screens | Navigation and Documents/Compare/Calendar |
| src/dialogs.tsx, src/Auth.tsx | Forms and authenticator access |
| src/domain.ts | Validation, extraction, comparison, PDF HTML |
| src/backend.ts, src/device.ts, src/archive.ts | Database access, sharing/reminders, selected-original ZIP |
| supabase/migrations | Schema and ownership policies |
| worker | OCR processing/container |
| tests | Domain, database, OCR, archive checks |
| DATA_MODEL.md | Current schema/retrieval dictionary |

Patient entries belong in PostgreSQL/private storage. Markdown files document schema, never actual patient records.
