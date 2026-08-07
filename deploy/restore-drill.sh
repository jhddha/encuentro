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
#   ./restore-drill.sh --remote                 # el más reciente del destino externo
#   ./restore-drill.sh --remote <nombre.dump.gpg>
#
# **La forma que cuenta para DEC-012 es `--remote`.** Ensayar con la copia que
# está al lado de la base demuestra que el volcado es legible, no que se pueda
# recuperar el sistema cuando el VPS ya no exista. Un ensayo local es una
# comprobación de integridad; solo el remoto es un ensayo de recuperación.

set -euo pipefail

: "${BACKUP_PASSPHRASE:?falta BACKUP_PASSPHRASE}"
: "${PGUSER:?falta PGUSER}"

log() { printf '%s [drill] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }

DOWNLOAD_DIR=""

cleanup_download() {
  [ -n "$DOWNLOAD_DIR" ] && rm -rf "$DOWNLOAD_DIR"
  return 0
}

# ---------------------------------------------------------------------------
# Origen del respaldo
# ---------------------------------------------------------------------------

s3() { aws --endpoint-url "$BACKUP_S3_ENDPOINT" "$@"; }

fetch_remote() {
  : "${BACKUP_S3_ENDPOINT:?falta BACKUP_S3_ENDPOINT}"
  : "${BACKUP_S3_BUCKET:?falta BACKUP_S3_BUCKET}"
  : "${AWS_ACCESS_KEY_ID:?falta AWS_ACCESS_KEY_ID}"
  : "${AWS_SECRET_ACCESS_KEY:?falta AWS_SECRET_ACCESS_KEY}"
  local prefix="${BACKUP_S3_PREFIX:-encuentro}"
  export AWS_DEFAULT_REGION="${BACKUP_S3_REGION:-us-west-004}"

  local name="${1:-}"
  if [ -z "$name" ]; then
    # El más reciente por nombre: la marca de tiempo UTC del fichero ordena
    # lexicográficamente igual que cronológicamente.
    name="$(s3 s3api list-objects-v2 \
      --bucket "$BACKUP_S3_BUCKET" --prefix "$prefix/encuentro-" \
      --query 'sort_by(Contents,&Key)[-1].Key' --output text 2>/dev/null | xargs -r basename)"
    [ -n "$name" ] && [ "$name" != "None" ] || {
      log "ERROR: el destino externo no contiene ningún respaldo"
      return 1
    }
  fi

  DOWNLOAD_DIR="$(mktemp -d)"
  trap cleanup_download EXIT

  log "descargando $name desde s3://$BACKUP_S3_BUCKET/$prefix"
  s3 s3 cp "s3://$BACKUP_S3_BUCKET/$prefix/$name" "$DOWNLOAD_DIR/$name" --only-show-errors
  s3 s3 cp "s3://$BACKUP_S3_BUCKET/$prefix/$name.sha256" "$DOWNLOAD_DIR/$name.sha256" --only-show-errors

  # Comprobación fuerte de integridad: aquí sí se compara el contenido, no el
  # tamaño. Un respaldo que llegó corrupto es indistinguible de uno bueno hasta
  # que alguien intenta usarlo, y ese momento no debe ser una emergencia.
  local esperado obtenido
  esperado="$(cat "$DOWNLOAD_DIR/$name.sha256")"
  obtenido="$(sha256sum "$DOWNLOAD_DIR/$name" | awk '{print $1}')"

  if [ "$esperado" != "$obtenido" ]; then
    log "ERROR: la suma no coincide. El respaldo remoto está corrupto"
    log "  esperada: $esperado"
    log "  obtenida: $obtenido"
    return 1
  fi

  log "integridad verificada contra la suma publicada junto al respaldo"
  BACKUP_FILE="$DOWNLOAD_DIR/$name"
}

if [ "${1:-}" = "--remote" ]; then
  ORIGEN="destino externo"
  fetch_remote "${2:-}"
else
  ORIGEN="copia local"
  BACKUP_FILE="${1:?uso: restore-drill.sh <fichero.dump.gpg> | --remote [nombre]}"
  log "AVISO: ensayo sobre copia local. DEC-012 exige ensayar con --remote"
fi

DRILL_DB="encuentro_drill_$(date -u +%Y%m%d%H%M%S)"

cleanup() {
  log "eliminando la base de ensayo $DRILL_DB"
  dropdb --if-exists "$DRILL_DB" || true
  cleanup_download
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

log "ensayo superado sobre $ORIGEN. El respaldo es restaurable y conserva sus garantías."
