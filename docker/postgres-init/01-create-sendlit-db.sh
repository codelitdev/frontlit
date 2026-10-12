#!/bin/sh
# Runs once, on first container init (docker-entrypoint-initdb.d convention).
# One Postgres server hosts both products' databases in self-hosted setups
# (architecture.md §10.4): `frontlit` (created by POSTGRES_DB, pgvector
# enabled by its own migrations) and `sendlit` (created here, plain
# relational — pgvector is harmless but unused on this DB).
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    SELECT 'CREATE DATABASE sendlit OWNER ${POSTGRES_USER}'
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'sendlit')\gexec
EOSQL
