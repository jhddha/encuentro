# Runbooks operativos — P15

Procedimientos para operar el sistema durante y alrededor del Encuentro. Están escritos para ejecutarse bajo presión, así que cada uno empieza por lo que hay que hacer y deja la explicación después.

---

## 1. Despliegue

**Antes de empezar:** el gate de CI debe estar en verde en el commit que se va a desplegar. Un despliegue con pruebas rojas no es un despliegue, es una apuesta.

```bash
# En el VPS, desde el directorio del repositorio
git fetch --all && git checkout <commit-o-tag>
docker compose -f deploy/docker-compose.prod.yml build
docker compose -f deploy/docker-compose.prod.yml run --rm -e DATABASE_URL="$DATABASE_MIGRATION_URL" web pnpm exec prisma migrate deploy
docker compose -f deploy/docker-compose.prod.yml up -d
```

Las migraciones van **antes** de levantar los contenedores nuevos, y con `migrate deploy`, no `migrate dev`: `deploy` no genera migraciones ni pregunta nada, que es lo que se quiere en producción.

**Se ejecutan con `DATABASE_MIGRATION_URL`, no con la de la aplicación.** El rol de ejecución no es propietario de las tablas y por tanto no puede alterarlas: es justamente la protección que impide que un fallo de la aplicación pueda truncar la auditoría. Migrar exige el rol propietario, y solo durante este paso.

Tras una migración que cree tablas conviene volver a pasar `deploy/db-roles.sql`; es idempotente y confirma que los privilegios de la aplicación llegaron a lo nuevo.

**Verificación posterior, obligatoria:**

```bash
curl -fsS https://<dominio>/api/health
docker compose -f deploy/docker-compose.prod.yml ps
```

El health check consulta PostgreSQL. Si devuelve `degraded`, la aplicación está arriba pero no puede atender: no dé el despliegue por bueno.

---

## 2. Vuelta atrás

**Cuándo:** el health check falla, o aparece un error que afecta a cobros o inscripciones.

```bash
git checkout <commit-anterior>
docker compose -f deploy/docker-compose.prod.yml build
docker compose -f deploy/docker-compose.prod.yml up -d
```

**Aviso importante sobre las migraciones.** Volver atrás el código es sencillo; volver atrás una migración no lo es. Si el despliegue fallido incluía una migración que borra o transforma datos, revertir el código **no** deshace ese cambio.

Por eso: antes de cualquier despliegue con migración destructiva, tome un respaldo manual y verifique que existe.

```bash
docker compose -f deploy/docker-compose.prod.yml exec backup /usr/local/bin/backup.sh --once
```

---

## 3. Restauración desde respaldo

**RTO objetivo: 4 horas. RPO: 1 hora** (DEC-012).

Primero, **ensaye sobre una base desechable**, nunca directamente sobre producción:

```bash
docker compose -f deploy/docker-compose.prod.yml exec backup /usr/local/bin/restore-drill.sh --remote
```

`--remote` descarga el respaldo más reciente del destino externo y **verifica su suma antes de restaurar**. Es la forma que cuenta para DEC-012: ensayar con la copia que está en el mismo VPS demuestra que el volcado es legible, no que se pueda recuperar el sistema cuando el servidor ya no exista.

Para ensayar una copia concreta en vez de la última, añada su nombre:

```bash
docker compose -f deploy/docker-compose.prod.yml exec backup \
  /usr/local/bin/restore-drill.sh --remote encuentro-<marca>.dump.gpg
```

El ensayo contra la copia local sigue disponible pasando la ruta del fichero, y avisa de que no satisface DEC-012.

Si el ensayo pasa, restaure de verdad:

```bash
# 1. Detener lo que escribe, dejando la base en pie.
docker compose -f deploy/docker-compose.prod.yml stop web worker

# 2. Renombrar la base actual en vez de borrarla: si la restauración sale mal,
#    todavía existe algo a lo que volver.
docker compose -f deploy/docker-compose.prod.yml exec postgres \
  psql -U "$POSTGRES_USER" -c "ALTER DATABASE encuentro RENAME TO encuentro_previa_$(date -u +%Y%m%d%H%M)"

docker compose -f deploy/docker-compose.prod.yml exec postgres createdb -U "$POSTGRES_USER" encuentro

# 3. Restaurar.
docker compose -f deploy/docker-compose.prod.yml exec postgres bash -c \
  'gpg --batch --decrypt --passphrase "$BACKUP_PASSPHRASE" /backups/encuentro-<marca>.dump.gpg | pg_restore -d encuentro --no-owner --no-acl'

# 4. Levantar y verificar.
docker compose -f deploy/docker-compose.prod.yml up -d web worker
curl -fsS https://<dominio>/api/health
```

**Después de restaurar, y antes de reabrir las cajas:** hasta 1 hora de operación puede haberse perdido. Los comprobantes emitidos en esa ventana existen en papel pero no en la base. Reconcilie contra los comprobantes físicos antes de seguir cobrando, o habrá cobros duplicados.

---

## 4. Restablecimiento del segundo factor

**Cuándo:** una persona del equipo perdió su dispositivo y no tiene códigos de recuperación.

DEC-014 lo dice explícitamente: **no existe recuperación automática por correo**. El procedimiento es presencial y lo autoriza un ADMIN_MASTER.

1. Verificar la identidad **en persona**. Un mensaje pidiendo restablecer MFA es exactamente lo que enviaría alguien intentando entrar.
2. El ADMIN_MASTER elimina el segundo factor de esa cuenta.
3. La persona vuelve a registrar su factor en el siguiente inicio de sesión — el guardián la redirige sola.
4. La operación queda auditada con actor y motivo.

Durante el evento esto pasará. Tenga a un ADMIN_MASTER localizable.

---

## 5. Caída de SMTP

**No es una emergencia.** GOV-008 garantiza que una falla de correo no revierte ninguna operación confirmada: los pagos siguen aprobados y las inscripciones siguen creadas.

Los envíos se acumulan en la cola con estado `PENDING` o `FAILED` y se reintentan solos, hasta 5 veces con espera creciente.

```bash
# Cuántos envíos esperan
docker compose -f deploy/docker-compose.prod.yml exec postgres \
  psql -U "$POSTGRES_USER" -d encuentro -c \
  "SELECT status, count(*) FROM notifications GROUP BY status"
```

Si se agotaron los reintentos tras arreglar el SMTP, devuélvalos a la cola:

```sql
UPDATE notifications SET status = 'PENDING', attempts = 0
WHERE status = 'FAILED';
```

---

## 6. Sospecha de compromiso

1. **Revocar todas las sesiones.** Se persisten en base, así que borrarlas surte efecto inmediato:

   ```sql
   DELETE FROM sessions;
   ```

2. Rotar `SESSION_SECRET` y `RECEIPT_VERIFICATION_SECRET` en el entorno, y reiniciar `web` y `worker`.

3. Revisar la auditoría. Es append-only, así que un atacante **no ha podido borrar su rastro**:

   ```sql
   SELECT created_at, actor_id, action, entity, entity_id
   FROM audit_logs ORDER BY created_at DESC LIMIT 200;
   ```

4. **No rote `BACKUP_PASSPHRASE` sin conservar la anterior.** Los respaldos ya escritos siguen cifrados con la clave vieja; perderla los vuelve inservibles.

---

## 7. Cierre del evento

1. Cerrar todas las sesiones de caja con su arqueo. EVT-009 impide el cierre operativo con pendientes críticos.
2. Verificar que no queden evidencias en `SUBMITTED` o `UNDER_REVIEW`.
3. Transición manual a `OPERATIONALLY_CLOSED`, con motivo si viene de `ACTIVE`.
4. Tomar un respaldo y **ensayarlo** antes de dar por cerrado el evento.
5. Conciliar caja contra los asientos contables.

```sql
-- Evidencias sin resolver
SELECT status, count(*) FROM payment_proofs
WHERE status IN ('SUBMITTED','UNDER_REVIEW','CORRECTION_REQUESTED') GROUP BY status;

-- Cajas abiertas
SELECT cash_account_code FROM cash_sessions WHERE status = 'OPEN';
```

---

## 8. Comprobaciones diarias durante el evento

```bash
curl -fsS https://<dominio>/api/health
docker compose -f deploy/docker-compose.prod.yml ps
ls -lh /var/lib/docker/volumes/encuentro_backups/_data | tail -3
df -h
```

El último respaldo no debe tener más de una hora (RPO). Si el disco pasa del 80%, actúe antes de que Postgres deje de aceptar escrituras: quedarse sin espacio durante el evento significa dejar de cobrar.
