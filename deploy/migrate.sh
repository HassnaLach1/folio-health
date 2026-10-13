#!/bin/sh
set -eu
# Apply versioned schema only; no local accounts, documents or fixtures.
psql -X -v ON_ERROR_STOP=1 -q <<'SQL'
create schema if not exists folio_deploy;
revoke all on schema folio_deploy from public,anon,authenticated;
create table if not exists folio_deploy.migrations(version text primary key, checksum text not null, applied_at timestamptz not null default now());
SQL
for file in /migrations/*.sql; do
    version=$(basename "$file" .sql)
    checksum=$(sha256sum "$file" | cut -d ' ' -f 1)
    existing=$(psql -X -At -v ON_ERROR_STOP=1 -c "select checksum from folio_deploy.migrations where version='$version'")
    if [ -n "$existing" ]; then
        [ "$existing" = "$checksum" ] || { echo "Applied migration changed: $version" >&2; exit 1; }
        continue
    fi
    echo "Applying schema $version"
    # One transaction includes both the schema and its completion record.
    { printf 'BEGIN;\n'; cat "$file"; printf "\nINSERT INTO folio_deploy.migrations(version,checksum) VALUES ('%s','%s');\nCOMMIT;\n" "$version" "$checksum"; } | psql -X -v ON_ERROR_STOP=1 -q
done
