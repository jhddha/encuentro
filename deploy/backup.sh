#!/usr/bin/env bash
#
# Respaldo cifrado de PostgreSQL — DEC-012.
#
# RPO 1 hora: se ejecuta cada `BACKUP_INTERVAL_SECONDS` (3600 por defecto).
#
# Tres reglas que este script cumple y conviene no relajar:
#
#   1. El volcado se cifra **antes** de tocar el disco. Nunca existe un fichero
#      con datos personales en claro, ni siquiera de forma transitoria.
#   2. La clave de cifrado llega por variable de entorno y **no vive en el
#      VPS**: si el servidor entero se ve comprometido, los respaldos que ya
#      salieron de él siguen siendo ilegibles.
#   3. La copia sale del VPS. Una copia en el mismo servidor no protege contra
#      la pérdida del servidor, que es justo lo que DEC-012 exige cubrir.
#
# Destino elegido: **Backblaze B2** por su API S3-compatible. La elección se
# expresa solo en variables de entorno: cambiar a OVH, Wasabi, Scaleway o MinIO
# no toca este script.
#
# **El destino externo debe estar en un proveedor distinto al que aloja el VPS.**
# Guardar los respaldos en la misma cuenta que el servidor protege contra perder
# el servidor, pero no contra perder la cuenta: una disputa de facturación o
# unas credenciales comprometidas se llevan las dos cosas a la vez.

set -euo pipefail

: "${PGDATABASE:?falta PGDATABASE}"
: "${BACKUP_PASSPHRASE:?falta BACKUP_PASSPHRASE}"

# El interruptor es obligatorio y no tiene valor por defecto a propósito.
#
# Lo peligroso no es carecer de respaldo externo: es creer que se tiene. Si esta
# variable pudiera quedar sin definir, un despliegue mal configurado guardaría
# copias solo en el disco del VPS sin que nadie se enterara, y eso se descubre
# el día que el VPS ya no está.
: "${BACKUP_REMOTE_ENABLED:?falta BACKUP_REMOTE_ENABLED (true|false). DEC-012 exige decidirlo de forma explícita}"

BACKUP_DIR="${BACKUP_DIR:-/backups}"
INTERVAL="${BACKUP_INTERVAL_SECONDS:-3600}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

mkdir -p "$BACKUP_DIR"

log() {
  printf '%s [backup] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

# ---------------------------------------------------------------------------
# Destino externo
# ---------------------------------------------------------------------------

remote_enabled() { [ "$BACKUP_REMOTE_ENABLED" = "true" ]; }

if remote_enabled; then
  : "${BACKUP_S3_ENDPOINT:?falta BACKUP_S3_ENDPOINT}"
  : "${BACKUP_S3_BUCKET:?falta BACKUP_S3_BUCKET}"
  : "${AWS_ACCESS_KEY_ID:?falta AWS_ACCESS_KEY_ID}"
  : "${AWS_SECRET_ACCESS_KEY:?falta AWS_SECRET_ACCESS_KEY}"
  BACKUP_S3_PREFIX="${BACKUP_S3_PREFIX:-encuentro}"
  export AWS_DEFAULT_REGION="${BACKUP_S3_REGION:-us-west-004}"
fi

s3() { aws --endpoint-url "$BACKUP_S3_ENDPOINT" "$@"; }

remote_key() { printf '%s/%s' "$BACKUP_S3_PREFIX" "$1"; }

# Tamaño del objeto remoto, o cadena vacía si no existe.
remote_size() {
  s3 s3api head-object \
    --bucket "$BACKUP_S3_BUCKET" \
    --key "$(remote_key "$1")" \
    --query 'ContentLength' --output text 2>/dev/null || true
}

# Sube el respaldo y su suma de comprobación, y verifica que llegó entero.
#
# La verificación compara tamaños porque el ETag de una subida multiparte no es
# el MD5 del fichero y compararlo daría falsos negativos. La comprobación fuerte
# —descargar y comparar sha256— la hace `restore-drill.sh`, que es donde tiene
# sentido: un respaldo solo está verificado de verdad cuando se ha restaurado.
upload_backup() {
  local file="$1" name sum_file local_size remote
  name="$(basename "$file")"
  sum_file="$file.sha256"

  sha256sum "$file" | awk '{print $1}' >"$sum_file"

  if ! s3 s3 cp "$file" "s3://$BACKUP_S3_BUCKET/$(remote_key "$name")" --only-show-errors; then
    log "ERROR: falló la subida de $name"
    return 1
  fi

  if ! s3 s3 cp "$sum_file" "s3://$BACKUP_S3_BUCKET/$(remote_key "$name.sha256")" --only-show-errors; then
    log "ERROR: falló la subida de la suma de $name"
    return 1
  fi

  local_size="$(stat -c%s "$file")"
  remote="$(remote_size "$name")"

  if [ "$remote" != "$local_size" ]; then
    log "ERROR: $name subió incompleto (local $local_size, remoto ${remote:-ausente})"
    return 1
  fi

  log "copia externa verificada: $name ($local_size bytes)"
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

  if remote_enabled; then
    upload_backup "$file"
  else
    log "AVISO: BACKUP_REMOTE_ENABLED=false. La copia NO sale del VPS y DEC-012 NO está cumplida"
  fi
}

prune_old() {
  # La retención local es corta a propósito: la copia que importa es la que
  # está fuera del VPS.
  #
  # Con destino externo activo, **solo se borra lo que está confirmado fuera**.
  # Sin esta comprobación, una subida fallida seguida del vencimiento de la
  # retención perdería el respaldo sin que nadie lo notara: el fichero local
  # desaparece y el remoto nunca llegó.
  local file name
  while IFS= read -r file; do
    [ -n "$file" ] || continue
    name="$(basename "$file")"

    if remote_enabled && [ "$(remote_size "$name")" != "$(stat -c%s "$file")" ]; then
      log "AVISO: $name venció la retención pero no está confirmado fuera; no se borra"
      continue
    fi

    rm -f "$file" "$file.sha256"
  done < <(find "$BACKUP_DIR" -name 'encuentro-*.dump.gpg' -mtime "+$RETENTION_DAYS")
}

if remote_enabled; then
  log "destino externo: s3://$BACKUP_S3_BUCKET/$BACKUP_S3_PREFIX vía $BACKUP_S3_ENDPOINT"
else
  log "AVISO: sin destino externo. DEC-012 NO está cumplida y el go/no-go no puede aprobarse"
fi

# Un respaldo suelto, sin arrancar el bucle. Lo exige el runbook antes de
# cualquier despliegue con migración destructiva: volver atrás el código no
# deshace una migración, así que la copia previa es la única vuelta atrás real.
# Devuelve código distinto de cero si el respaldo o su subida fallan, para que
# el operador no continúe creyendo que tiene una copia.
if [ "${1:-}" = "--once" ]; then
  log "respaldo puntual solicitado"
  take_backup
  log "respaldo puntual completado"
  exit 0
fi

log "servicio de respaldo iniciado; intervalo ${INTERVAL}s, retención ${RETENTION_DAYS}d"

while true; do
  take_backup || log "se reintentará en el siguiente ciclo"
  prune_old
  sleep "$INTERVAL"
done
