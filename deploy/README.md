# AWS deployment

Status, 2026-10-13: deployed at [Folio Health](https://folio-52.209.35.92.sslip.io/). Source is backed up on [codex/folio-full-backup](https://github.com/HassnaLach1/folio-health/tree/codex/folio-full-backup). The approved stack `folio-health-free` uses a Free Plan eligible t3.small and reuses the two ECR repositories retained after the original launch failed. The account remains on the Free Plan.

## Live deployment

| Resource | Current configuration |
| --- | --- |
| Web app | https://folio-52.209.35.92.sslip.io/ |
| Public API | https://folio-52.209.35.92.sslip.io/api |
| Google callback | https://folio-52.209.35.92.sslip.io/api/auth/v1/callback |
| Region / EC2 | eu-west-1 / i-059ccdd8014b75a85 |
| Elastic IP | 52.209.35.92 |
| Web image | 073276525160.dkr.ecr.eu-west-1.amazonaws.com/folio-health-web:c3c1ce3 |
| Worker image | 073276525160.dkr.ecr.eu-west-1.amazonaws.com/folio-health-worker:9a0625f |
| Server directory | /opt/folio |

Google sign-in is enabled; email sign-in is hidden because no cloud SMTP service is configured. First sign-in requires an authenticator and onboarding. The existing Google client includes the deployed origin and callback, while retaining local addresses. Google credentials and fresh cloud secrets are in the encrypted SSM SecureString `/folio-health-free/config`, compressed and encoded, and the server's mode-0600 environment file. They are excluded from image layers, Git, and SSM command text. EC2 uses its role for ECR and Bedrock instead of a temporary console key.

Use one Amazon Linux 2023 EC2 `t3.small` in Ireland, Docker Compose, an encrypted 40 GB gp3 disk and one Elastic IP. The verified EC2 price on 2026-10-13 is $0.0228/hour ($16.64 at 730 hours); disk and IPv4 bring the infrastructure estimate to about $24/month, plus ECR storage, transfer and Bedrock usage. The requested $50 monthly budget is a cost monitor, not a spending cap. T3 CPU credits use standard mode to avoid unlimited CPU surplus charges.

`ec2.yaml` creates the host, firewall, persistent IP, two private encrypted ECR repositories, an instance role and the $50 cost budget. The instance role permits Systems Manager administration, pulls from only the two Folio repositories, and invocation of only the EU Haiku 4.5 profile and its six verified destination model ARNs. It does not store a long-lived AWS key. Containers can use the host's instance credentials, so the entire host remains one trust boundary.

The hostname can initially be `folio-PUBLIC_IP.sslip.io`, a free DNS name resolving to the Elastic IP. Caddy issues and renews a public HTTPS certificate. This depends on the external sslip.io DNS service. Later replace APP_HOST and the public URLs with your own domain and rebuild the web image. Google OAuth needs the final HTTPS origin and callback registered in Google Auth Platform.

## Components and access

The pinned official Supabase `self-hosted/v0.8.2` configuration supplies database, Auth, REST, Storage, imgproxy, postgres-meta and Studio images. Folio adds its web and worker images, a schema initialization job and Caddy. `compose.free-tier.yaml` runs only database, Auth, REST and Storage continuously. Studio/meta use the optional admin profile; image transformation, Realtime, Edge Functions and the pooler stay off. Memory and connection pools are bounded for the 2 GB server, which also has 2 GB of swap on its encrypted EBS disk. This configuration targets a low-traffic MVP. The local Supabase CLI stack is not deployed.

Only TCP 80 (certificate validation and HTTPS redirects) and 443 are public. The worker, gateway, REST, Auth, Storage, database and meta have no public host ports. Studio listens on server loopback port 54323 and is available through an authenticated Systems Manager tunnel. There is no public SSH port. Caddy exposes only `/api/auth/v1/`, `/api/rest/v1/` and `/api/storage/v1/`, rejects unrelated browser origins, and forwards the web app at `/`. Account authentication, TOTP and owner policies enforce medical record access. A web browser connects from the user's network, so API restriction to the frontend server's IP would break the app; Origin/CORS is an additional browser control, not authentication.

Named volumes preserve cloud database, originals, OCR model cache and TLS certificates. Cloud data starts empty. The migration job applies only versioned SQL and remembers completed checksums; changing an applied migration is rejected. Neither local database dumps nor local user accounts/files are deployed. The local password-only override is excluded; production retains TOTP.

## Configure and run

Commands run from the repository root on the server. They require Docker Compose 2.24.4 or newer for `!reset` and `!override`.

1. Generate fresh configuration once: `node deploy/generate-env.mjs folio-PUBLIC_IP.sslip.io`. This writes the ignored `deploy/.env.production` with fresh database/JWT/storage secrets and does not print them. Refuses to overwrite an existing environment. Legacy HS256 API keys are valid for one year and must be rotated before expiry.
2. Set GOOGLE_CLIENT_ID and GOOGLE_SECRET privately; set GOOGLE_ENABLED=true. In Google Auth Platform add origin `https://folio-PUBLIC_IP.sslip.io` and callback `https://folio-PUBLIC_IP.sslip.io/api/auth/v1/callback`. Do not remove localhost entries while local testing continues. Email signup is disabled until an actual SMTP service is configured.
3. Set WEB_IMAGE and WORKER_IMAGE to immutable ECR image tags. Build the web image with the generated public API URL and anon key. Only public settings enter the web image; the service key and OAuth secret stay in server configuration. Push both images to ECR. The registry login token must go through stdin and never into logs.
4. Authenticate Docker to ECR using the EC2 role, then start:

```sh
docker compose --env-file deploy/.env.production -p folio-cloud \
  -f deploy/supabase/docker-compose.yml -f deploy/compose.aws.yaml \
  -f deploy/compose.free-tier.yaml up -d
```

The migration job waits for Auth and Storage schema initialization. The worker and web wait for application migrations; the proxy waits for healthy web/gateway. No medical fixtures are inserted.

Use the same Compose arguments with `ps` to inspect status and `stop` to suspend services. Restarting the containers preserves volumes. Stopping an EC2 server stops compute charges but disk and allocated public IP charges continue. The disk and ECR repositories are retained when the CloudFormation stack is deleted. Review and back up cloud records before any volume deletion. This initial deployment has one host, without automatic failover or scheduled backups; arrange backups before relying on it as the sole record archive.

## Verification

The reduced stack also passed the same integration checks, with roughly 400 MB total container memory after the fictional extraction. Studio can be started temporarily with the admin profile when needed.

The isolated `folio-deploytest` stack uses separate empty volumes and loopback ports 18081/15423; it does not touch the existing local Supabase stack. `verify-local.mjs` uses only fictional data and refuses remote URLs. It verified admin-route blocking, foreign-origin rejection, anonymous denial, actual TOTP enrollment/challenge, profile/onboarding persistence, original upload, worker PDF extraction and `review` status. Both Folio images built successfully.

The explicit `verify-cloud.mjs` check passed against the public HTTPS API: Google provider enabled, admin routes blocked, foreign origins rejected, anonymous and aal1 access denied, aal2 owner access allowed, profile/onboarding persistence, upload, signed original download with matching checksum, and actual role-based Bedrock Haiku 4.5 extraction. A fictional three-page PDF produced two panels: kidney function spanning pages 1–2 and liver function on page 3. Values remained unreviewed and the document entered `review`. The check removes its own fictional account and file. All 22 schema migrations applied to an empty cloud database.

The updated frontend was verified in the browser with only the enabled Google option. Clicking it opened Google's account chooser with the deployed callback, without a redirect mismatch. The final audit found all eight services running, 22 applied migrations, and zero accounts, documents or stored originals after test cleanup. The temporary isolated local test containers were stopped; the normal local application remains separate.

The cloud policy check uses short-lived administrator-signed test claims; it does not prove a real user's Google session and authenticator enrollment. Local Google sign-in was verified previously; the deployed real-account Google/TOTP flow still needs the user to complete it. Synthetic extraction does not establish accuracy across real medical documents. Android/APK behavior remains untested.
