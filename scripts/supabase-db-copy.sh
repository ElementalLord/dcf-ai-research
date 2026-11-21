#!/usr/bin/env bash
# Back up the database, or copy it into a brand-new Supabase project.
#
# Only needed when the Supabase project is NOT transferred with the built-in
# "Transfer project" button (see docs/transfer-vercel-supabase.md, Plan B), or to take
# a backup before transferring. It never prints passwords.
#
#   scripts/supabase-db-copy.sh backup  "$OLD_DB_URL"                # writes ./supabase-backup-<date>/
#   scripts/supabase-db-copy.sh restore "$NEW_DB_URL" <backup-dir>   # loads a backup into an EMPTY project
#
# DB URLs come from Supabase → project → Connect → "Session pooler" (works over IPv4):
#   postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
# Put the URL in quotes. Requires pg_dump/psql at least as new as the project's Postgres
# (Supabase → Project Settings → Infrastructure shows the version).
set -euo pipefail

# Schemas this app owns. Supabase manages auth, storage and the rest itself.
SCHEMAS=(public corpus_verification_audit removed_unconfirmed_2026_11_10)

usage() { sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'; exit 1; }
need() { command -v "$1" >/dev/null || { echo "Missing $1. Install the PostgreSQL client tools (e.g. 'brew install libpq' or 'apt install postgresql-client')." >&2; exit 1; }; }
need pg_dump; need psql

mode="${1:-}"; db_url="${2:-}"
[[ -n "$mode" && -n "$db_url" ]] || usage

server_major() { psql "$db_url" -Atc "show server_version_num" | cut -c1-2; }
client_major() { pg_dump --version | grep -oE '[0-9]+' | head -1; }
schema_list() { local IFS=,; echo "{${SCHEMAS[*]}}"; }
# Exact row count of every table in the app's schemas, one "schema.table count" per line.
counts() {
  psql "$db_url" -Atc "select table_schema||'.'||table_name||' '||(xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text from information_schema.tables where table_type = 'BASE TABLE' and table_schema = any('$(schema_list)') order by 1"
}
check_versions() {
  local server client; server="$(server_major)"; client="$(client_major)"
  if (( client < server )); then
    echo "pg_dump $client is older than the database (Postgres $server). Install client tools version $server or newer." >&2; exit 1
  fi
}

case "$mode" in
  backup)
    check_versions
    dir="supabase-backup-$(date +%Y%m%d-%H%M%S)"; mkdir -p "$dir"
    schema_args=(); for s in "${SCHEMAS[@]}"; do schema_args+=(--schema="$s"); done
    echo "Dumping schema…"
    pg_dump "$db_url" "${schema_args[@]}" --schema-only --no-owner --quote-all-identifiers --file "$dir/schema.raw.sql"
    # Every Supabase project already has the public schema; drop the statements that recreate it.
    grep -vE '^(CREATE SCHEMA "public";|COMMENT ON SCHEMA "public" IS)' "$dir/schema.raw.sql" > "$dir/schema.sql" && rm "$dir/schema.raw.sql"
    echo "Dumping data (this can take a few minutes)…"
    pg_dump "$db_url" "${schema_args[@]}" --data-only --no-owner --quote-all-identifiers --file "$dir/data.sql"
    counts > "$dir/row-counts.txt"
    echo "Backup written to $dir/ ($(du -sh "$dir" | cut -f1)). Keep it somewhere private: it holds all project data."
    ;;
  restore)
    dir="${3:-}"; [[ -d "$dir" && -f "$dir/schema.sql" && -f "$dir/data.sql" ]] || { echo "Give the backup folder as the third argument." >&2; exit 1; }
    check_versions
    existing="$(psql "$db_url" -Atc "select count(*) from pg_tables where schemaname = 'public'")"
    if [[ "$existing" != "0" ]]; then
      echo "The target project already has $existing table(s) in public. Restore only into a new, empty project." >&2; exit 1
    fi
    read -r -p "Load $dir into the database at ${db_url##*@}? Type yes: " ok; [[ "$ok" == "yes" ]] || exit 1
    psql "$db_url" --quiet -v ON_ERROR_STOP=1 -c "create extension if not exists vector with schema extensions"
    psql "$db_url" --quiet --single-transaction -v ON_ERROR_STOP=1 \
      --file "$dir/schema.sql" \
      --command "set session_replication_role = replica" \
      --file "$dir/data.sql"
    if diff <(counts) "$dir/row-counts.txt" >/dev/null; then
      echo "Restored. Every table has the same number of rows as the backup ($(wc -l < "$dir/row-counts.txt") tables)."
    else
      echo "Restored, but some row counts differ from the backup:" >&2; diff <(counts) "$dir/row-counts.txt" >&2 || true; exit 1
    fi
    echo "Next: copy stored photos with  node scripts/supabase-storage-copy.mjs"
    ;;
  *) usage ;;
esac
