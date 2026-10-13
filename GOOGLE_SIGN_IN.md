# Google sign-in for Folio Health

## How it works

Folio → local Supabase Auth → Google's account chooser → Supabase callback → Folio.

Google verifies identity and supplies the basic name, email, and profile image associated with the Google account. Supabase creates the Folio account on the first Google sign-in and establishes a session on later visits. Existing database ownership rules still apply. Medical documents, birth date, height, and weight are not included in the Google sign-in request. No Gemini/Vertex AI service is used by this integration. Google metadata is not automatically copied into the editable Folio profile.

The app requests only `openid`, `email`, and `profile`. It uses PKCE to exchange a short-lived authorization code for a Supabase session. The Google client secret belongs to the local Auth server, never the frontend. The client ID identifies the app; it is not a password or a service-account key.

## 1. Choose a Google Cloud project

Open [Google Auth Platform](https://console.cloud.google.com/auth/overview). Select an existing project or create one named **Folio Health**. No compute instances, storage buckets, or AI model services are needed for this login integration.

## 2. Configure the consent screen

In Google Auth Platform:

1. **Branding:** app name **Folio Health**, your own support email, and your developer contact email.
2. **Audience:** choose **External** for personal Google accounts. Keep it in **Testing** while developing. Add your own Google email under **Test users** if the console requires a test-user list for your configuration.
3. **Data Access:** include only `openid`, `https://www.googleapis.com/auth/userinfo.email`, and `https://www.googleapis.com/auth/userinfo.profile`.
4. Leave optional public homepage/privacy-policy links unset for this local test if Google permits it. `localhost` is not a publicly accessible product site. A public release will need real product URLs and Google’s applicable publishing/verification steps.

Suggested app description: **Folio Health is a personal medical document organizer. Google sign-in identifies users so they can access their own private workspace. Google sign-in does not access medical documents.**

## 3. Create the OAuth client

Open **Clients → Create client**:

- Application type: **Web application**.
- Name: **Folio local development**.
- Authorized JavaScript origin: `http://localhost:8081`.
- Authorized redirect URI: **`http://localhost:54321/auth/v1/callback`**.

The Google redirect goes to Supabase on port **54321**, not the frontend on port 8081. It must exactly match `auth.external.google.redirect_uri` in `supabase/config.toml`, including host and path. Supabase then redirects back to the frontend on port **8081**. The official example uses `127.0.0.1`; this project deliberately uses `localhost` consistently. Do not mix them without updating the registered callback and local configuration.

Save the client ID and secret privately. Do not paste the client secret into chat or commit it to Git.

## 4. Connect the local Auth server

In the ignored project-root `.env`, add:

```dotenv
SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET=your-client-secret
```

Then change only `enabled = false` to `enabled = true` in the `[auth.external.google]` section of `supabase/config.toml`. The ID and secret are read from `.env`; never rename them with an `EXPO_PUBLIC_` prefix.

Restart the local Supabase services to load the configuration. A restart temporarily interrupts login, storage access, and the worker's connection; it preserves the local database volumes. Do not run `supabase db reset` or delete volumes.

```powershell
pnpm exec supabase stop
pnpm exec supabase start -x analytics,vector
./scripts/enable-local-password-only.ps1
```

The existing local password-only override is reapplied above. The web app checks the Auth server's public provider settings; after reloading, **Continue with Google** enables automatically. OAuth credentials do not require a frontend rebuild.

## 5. Test

1. Open [Folio](http://localhost:8081/) in a signed-out browser session.
2. Click **Continue with Google**, choose the intended account, and approve basic identity access.
3. Confirm the browser returns to Folio and the workspace opens.
4. In [Supabase Studio](http://localhost:54323/), open **Authentication → Users** and verify that the account has a Google identity. A new Google email creates a new workspace; do not expect records from a different email to transfer.
5. Sign out and repeat to check that the same identity opens the same workspace.

Email sign-up and recovery remain available. With PKCE, open confirmation/reset links in the same browser or installed app that started the request. Local confirmation emails appear in [Mailpit](http://localhost:54324/).

## Phone support

The native app opens the system browser and accepts `foliohealth://auth/callback`. This needs an installed development build or APK that owns that scheme; Expo Go is not the Google-login test target. A physical phone also needs a reachable backend. The desktop's `localhost` callback cannot serve a phone's browser. Google’s web OAuth callback rules require an appropriate registered HTTPS address for that configuration. We will configure that when phone authentication is requested; this local web setup does not deploy the app.

## Verification status

The frontend implementation can be checked before Google credentials exist. A disabled Google button means the Auth server has not enabled the provider (or its settings could not be reached). A successful Google account-chooser redirect and completed session exchange still need a real configured OAuth client to be verified.

References: [Supabase Google setup](https://supabase.com/docs/guides/auth/social-login/auth-google), [local secrets configuration](https://supabase.com/docs/guides/local-development/managing-config), [PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow), [Google OAuth callbacks](https://developers.google.com/identity/protocols/oauth2/web-server).

Local setup status, 2026-10-13: Google credentials are installed privately and the provider is enabled. End-to-end web sign-in passed: the user completed Google's account chooser, local Supabase recorded a Google identity and session, and Folio opened the authenticated workspace and remained signed in after a browser refresh. Android sign-in has not been tested.
