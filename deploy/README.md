# AWS deployment

Status: source is backed up on `codex/folio-full-backup`; web and worker Docker images are built; an isolated fresh Supabase stack passed integration checks. The AWS template passed CloudFormation validation. AWS resources have not been launched yet.

Use one Amazon Linux 2023 EC2 `t3a.medium` in Ireland, Docker Compose, an encrypted 40 GB gp3 disk and one Elastic IP. The verified EC2 price on 2026-10-13 is $0.0408/hour ($29.78 at 730 hours); disk and IPv4 bring the infrastructure estimate to about $37/month, plus ECR storage, transfer and Bedrock usage. The requested $50 monthly budget is a cost monitor, not a spending cap. T3 CPU credits use standard mode to avoid unlimited CPU surplus charges.

`ec2.yaml` creates the host, firewall, persistent IP, two private encrypted ECR repositories, an instance role and the $50 cost budget. The instance role permits Systems Manager administration, pulls from only the two Folio repositories, and invocation of only the EU Haiku 4.5 profile and its six verified destination model ARNs. It does not store a long-lived AWS key. Containers can use the host's instance credentials, so the entire host remains one trust boundary.

The hostname can initially be `folio-PUBLIC_IP.sslip.io`, a free DNS name resolving to the Elastic IP. Caddy issues and renews a public HTTPS certificate. This depends on the external sslip.io DNS service. Later replace APP_HOST and the public URLs with your own domain and rebuild the web image. Google OAuth needs the final HTTPS origin and callback registered in Google Auth Platform.

## Components and access

The pinned official Supabase `self-hosted/v0.8.2` configuration supplies database, Auth, REST, Storage, imgproxy, postgres-meta and Studio images. Folio adds its web and worker images, a schema initialization job and Caddy. Realtime, Edge Functions and the database pooler are disabled because Folio does not use them here. The local Supabase CLI stack is not deployed.

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
  -f deploy/supabase/docker-compose.yml -f deploy/compose.aws.yaml up -d
```

The migration job waits for Auth and Storage schema initialization. The worker and web wait for application migrations; the proxy waits for healthy web/gateway. No medical fixtures are inserted.

Use the same Compose arguments with `ps` to inspect status and `stop` to suspend services. Restarting the containers preserves volumes. Stopping an EC2 server stops compute charges but disk and allocated public IP charges continue. The disk and ECR repositories are retained when the CloudFormation stack is deleted. Review and back up cloud records before any volume deletion. This initial deployment has one host, without automatic failover or scheduled backups; arrange backups before relying on it as the sole record archive.

## Verification

The isolated `folio-deploytest` stack uses separate empty volumes and loopback ports 18081/15423; it does not touch the existing local Supabase stack. `verify-local.mjs` uses only fictional data and refuses remote URLs. With the isolated environment loaded, it verified admin-route blocking, foreign-origin rejection, anonymous denial, TOTP enforcement, profile/onboarding persistence, original upload, worker PDF extraction and `review` status. Fictional files/accounts are removed at the end. Both Folio images built successfully. Public HTTPS, cloud Google OAuth and role-based Bedrock processing still require verification after launch.
