$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$config = Get-Content -LiteralPath (Join-Path $root 'supabase/config.toml') -Raw
if ($config -notmatch '(?m)^project_id = "([a-zA-Z0-9_]+)"') { throw 'Local Supabase project ID not found.' }
$container = 'supabase_db_' + $Matches[1]
$sql = Get-Content -LiteralPath (Join-Path $root 'supabase/local/password_only.sql') -Raw
$sql | docker exec -i $container psql -v ON_ERROR_STOP=1 -U postgres -d postgres
if ($LASTEXITCODE -ne 0) { throw 'Could not apply the local password-only override.' }
Write-Output 'Local password-only sign-in is ready.'
