# Agent instructions

- Keep changes focused on the user's request.
- Read existing files before editing, and follow the project's established conventions.
- Update `README.md` when setup, usage, or project structure changes.
- Run relevant checks when available and report what was or was not verified.
- Do not add dependencies or tooling unless they are needed for the task.

## Project direction and communication

- Prioritize a working local MVP. Deployment, Render, and paid hosting are deferred until the user requests them.
- The user will install Docker Desktop on Windows and confirm when it is ready. Wait for that confirmation before pulling images or starting the local Supabase stack.
- Use local Supabase (PostgreSQL, authentication, storage, and Studio) for development. Reuse the versioned schema migrations and document actual local connection details when configured. Do not require a hosted Supabase account for local development.
- Explain steps in simple language. Provide clickable URLs for tools and running services, including where to view tables in Supabase Studio. Distinguish planned addresses from services verified to be running.
- Prioritize the phone experience. Keep React Native with Expo as the current frontend and support an installable Android APK; web is a secondary development preview. Test on a phone when available and do not equate a JavaScript export with a tested APK.
- Before setting up or enabling an OCR library/service, research a Docker-compatible option and ask the user. Explain what it does and the effect of accepting or declining. Existing OCR code is not approval to activate it.
- Keep extraction approaches replaceable so a vision model can be evaluated alongside OCR. Ask before enabling paid processing or sending medical documents to an external model provider.
- Give progress updates naming the feature being worked on and report when it is complete, including verification limits.
