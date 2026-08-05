#!/usr/bin/env bash
#
# Ensayo de restauración — DEC-012.
#
# «Un respaldo no verificado no cuenta como respaldo.» Este script restaura una
# copia sobre una base **desechable** y comprueba que los datos están completos.
#
# Restaura sobre una base temporal y nunca sobre la productiva: un ensayo que
# pueda destruir producción no se ejecutará nunca por miedo, y un ensayo que no
# se ejecuta no sirve de nada.
#
# Uso:
#   ./restore-drill.sh /backups/encuentro-20261103T120000Z.dump.gpg

set -euo pipefail

BACKUP_FILE="${1:?uso: restore-drill.sh <fichero.dump.gpg>}"
: "${BACKUP_PASSPHRASE:?falta BACKUP_PASSPHRASE}"
: "${PGUSER:?falta PGUSER}"

DRILL_DB="encuentro_drill_$(date -u +%Y%m%d%H%M%S)"

log() { printf '%s [drill] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }

cleanup() {
  log "eliminando la base de ensayo $DRILL_DB"
  dropdb --if-exists "$DRILL_DB" || true
}
trap cleanup EXIT

log "creando base de ensayo $DRILL_DB"
createdb "$DRILL_DB"

log "descifrando y restaurando $BACKUP_FILE"
gpg --batch --quiet --decrypt --passphrase-fd 3 "$BACKUP_FILE" 3<<<"$BACKUP_PASSPHRASE" \
  | pg_restore --dbname="$DRILL_DB" --no-owner --no-acl

# ---------------------------------------------------------------------------
# Comprobaciones. Restaurar sin errores no significa que los datos estén bien:
# un volcado de una base vacía también restaura sin errores.
# ---------------------------------------------------------------------------

check() {
  local label="$1" query="$2" expectation="$3"
  local result
  result="$(psql --dbname="$DRILL_DB" --tuples-only --no-align --command="$query")"

  if [ "$result" = "$expectation" ]; then
    log "OK  $label"
  else
    log "FALLO  $label: se esperaba '$expectation', se obtuvo '$result'"
    return 1
  fi
}

failures=0

# Las tablas críticas deben existir.
for table in events registrations payments receipts audit_logs journal_entries; do
  check "existe la tabla $table" \
    "SELECT to_regclass('public.$table') IS NOT NULL" "t" || failures=$((failures + 1))
done

# Los triggers de inmutabilidad deben haber viajado con el volcado. Si se
# perdieran, la base restaurada aceptaría reescribir el histórico financiero.
check "trigger append-only de auditoría" \
  "SELECT count(*) > 0 FROM pg_trigger WHERE tgname = 'audit_logs_no_update'" "t" \
  || failures=$((failures + 1))

check "trigger de inmutabilidad de pagos" \
  "SELECT count(*) > 0 FROM pg_trigger WHERE tgname = 'payments_no_update'" "t" \
  || failures=$((failures + 1))

check "trigger de cuadre contable" \
  "SELECT count(*) > 0 FROM pg_trigger WHERE tgname = 'journal_lines_balance'" "t" \
  || failures=$((failures + 1))

# Coherencia financiera: todo comprobante emitido apunta a un pago existente.
check "ningún comprobante huérfano" \
  "SELECT count(*) FROM receipts r LEFT JOIN payments p ON p.id = r.payment_id WHERE p.id IS NULL" \
  "0" || failures=$((failures + 1))

# Los asientos restaurados siguen cuadrando.
check "todos los asientos cuadran" \
  "SELECT count(*) FROM (
     SELECT entry_id FROM journal_lines GROUP BY entry_id
     HAVING SUM(CASE WHEN side='DEBIT' THEN amount ELSE -amount END) <> 0
   ) AS descuadrados" "0" || failures=$((failures + 1))

log "filas restauradas: eventos=$(psql -d "$DRILL_DB" -tAc 'SELECT count(*) FROM events'), inscripciones=$(psql -d "$DRILL_DB" -tAc 'SELECT count(*) FROM registrations'), pagos=$(psql -d "$DRILL_DB" -tAc 'SELECT count(*) FROM payments')"

if [ "$failures" -gt 0 ]; then
  log "ENSAYO FALLIDO: $failures comprobaciones no pasaron"
  exit 1
fi

log "ensayo superado. El respaldo es restaurable y conserva sus garantías."
