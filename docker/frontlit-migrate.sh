#!/bin/sh
# Apply FrontLit Drizzle SQL onto Postgres and record the same hashes
# drizzle-orm's migrator writes, so a later host `db:migrate` is a no-op.
set -eu

MIGRATIONS_FOLDER="${MIGRATIONS_FOLDER:-/migrations}"

psql -v ON_ERROR_STOP=1 -c "CREATE EXTENSION IF NOT EXISTS vector;"
psql -v ON_ERROR_STOP=1 -c "CREATE SCHEMA IF NOT EXISTS drizzle;"
psql -v ON_ERROR_STOP=1 -c "
CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
    id SERIAL PRIMARY KEY,
    hash text NOT NULL,
    created_at bigint
);"

for sql in "$MIGRATIONS_FOLDER"/*.sql; do
    [ -f "$sql" ] || continue
    hash=$(openssl dgst -sha256 -r "$sql" | awk '{ print $1 }')
    applied=$(psql -tAc "SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = '$hash'")
    if [ "$applied" = "1" ]; then
        echo "skip $(basename "$sql")"
        continue
    fi
    echo "apply $(basename "$sql")"
    psql -v ON_ERROR_STOP=1 -f "$sql"
    created_at=$(date +%s)000
    psql -v ON_ERROR_STOP=1 -c \
        "INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('$hash', $created_at)"
done

echo "FrontLit migrations applied."
