#!/usr/bin/env bash
# Prueba la migración de la comunidad en un Postgres local (16+):
#   PGUSER=postgres ./scripts/test-sql.sh
# Crea una base temporal, carga un "auth" de mentira, la migración y las pruebas.
set -euo pipefail
export PGOPTIONS="-c client_min_messages=warning"
cd "$(dirname "$0")/.."
DB="lectia_test_$$"
createdb "$DB"
trap 'dropdb --if-exists "$DB"' EXIT
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f supabase/tests/auth_stub.sql
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f supabase/migrations/20261006000000_comunidad.sql
# La migración debe poder aplicarse dos veces sin errores.
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f supabase/migrations/20261006000000_comunidad.sql
psql -v ON_ERROR_STOP=1 -qtA -o /dev/null -d "$DB" -f supabase/tests/comunidad_test.sql
echo "Pruebas SQL: OK"
