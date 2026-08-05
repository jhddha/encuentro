#!/usr/bin/env bash
#
# Respaldo cifrado de PostgreSQL — DEC-012.
#
# RPO 1 hora: se ejecuta cada `BACKUP_INTERVAL_SECONDS` (3600 por defecto).
#
# Dos reglas que este script cumple y conviene no relajar:
#
#   1. El volcado se cifra **antes** de tocar el disco. Nunca existe un fichero
#      con datos personales en claro, ni siquiera de forma transitoria.
#   2. La clave de cifrado llega por variable de entorno y **no vive en el
#      VPS**: si el servidor entero se ve comprometido, los respaldos que ya
#      salieron de él siguen siendo ilegibles.
#
# Lo que este script **no** hace: subir la copia fuera del VPS. Esa parte
# depende del proveedor de almacenamiento externo y se documenta en el runbook.
# Sin ese paso, DEC-012 **no está cumplida**: una copia en el mismo servidor no
# protege contra la pérdida del servidor.

set -euo pipefail

: "${PGDATABASE:?falta PGDATABASE}"
: "${BACKUP_PASSPHRASE:?falta BACKUP_PASSPHRASE}"

BACKUP_DIR="${BACKUP_DIR:-/backups}"
INTERVAL="${BACKUP_INTERVAL_SECONDS:-3600}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

mkdir -p "$BACKUP_DIR"

log() {
  printf '%s [backup] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

take_backup() {
  local stamp file
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  file="$BACKUP_DIR/encuentro-$stamp.dump.gpg"

  log "iniciando volcado de $PGDATABASE"

  # El volcado va por tubería directa al cifrado: nunca se escribe en claro.
  # `--format=custom` permite restaurar tablas sueltas, que es lo que hace útil
  # un ensayo de restauración parcial.
  if pg_dump --format=custom --no-owner --no-acl \
    | gpg --batch --yes --symmetric --cipher-algo AES256 \
          --passphrase-fd 3 --output "$file" 3<<<"$BACKUP_PASSPHRASE"
  then
    log "respaldo escrito: $(basename "$file") ($(stat -c%s "$file") bytes)"
  else
    # Un fallo no debe dejar un fichero truncado que parezca válido.
    rm -f "$file"
    log "ERROR: el respaldo falló y se eliminó el fichero parcial"
    return 1
  fi

  # Un respaldo de tamaño sospechosamente pequeño suele ser un volcado vacío
  # por credenciales incorrectas. Es mejor gritar que acumular copias inútiles.
  if [ "$(stat -c%s "$file")" -lt 1024 ]; then
    log "AVISO: el respaldo pesa menos de 1 KB; compruebe la conexión"
  fi
}

prune_old() {
  # La retención local es corta a propósito: la copia que importa es la que
  # está fuera del VPS.
  find "$BACKUP_DIR" -name 'encuentro-*.dump.gpg' -mtime "+$RETENTION_DAYS" -delete
}

log "servicio de respaldo iniciado; intervalo ${INTERVAL}s, retención ${RETENTION_DAYS}d"

while true; do
  take_backup || log "se reintentará en el siguiente ciclo"
  prune_old
  sleep "$INTERVAL"
done
