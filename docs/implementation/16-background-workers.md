# P16 — Procesos de fondo: expiración de `HELD` y envío de correo

**Fecha:** 5 de agosto de 2026
**Alcance:** DEC-005 (expiración de retenciones) y GOV-007/GOV-008 + ADR-007 (envío de correo).
**Cierra:** el pendiente 3 de [`14-hardening-release.md`](14-hardening-release.md).

## 1. Qué faltaba

`apps/worker` existía desde P01, pero solo validaba el entorno, abría una conexión a Redis y apagaba limpio. No tenía ninguna cola. El despliegue de P14 daba por supuestos dos procesos que no existían:

- **La expiración de `HELD`.** Sin ella, DEC-005 es papel: una retención abandonada ocupa una cama indefinidamente y esa cama nunca vuelve al inventario.
- **El envío de correo.** GOV-008 exige que un fallo de integración no revierta una operación confirmada, y eso solo se cumple si el envío ocurre fuera de la petición que lo originó. La tabla `notifications` se llenaba y nadie la vaciaba.

## 2. Gate ejecutado

| Paso | Resultado |
|---|---|
| Validador de documentos | 65 IDs, 31 rutas, 55 permisos · exit 0 |
| Prettier · ESLint · `tsc --build` | exit 0 |
| Unitarias | **289** (273 previas + 16 nuevas) · exit 0 |
| Integración contra Postgres | **115** (102 previas + 13 nuevas) · exit 0 |
| `pnpm build` | exit 0 |
| Migración aplicada en local | `20260805143000_p16_background_workers` |
| **Arranque real del worker** | expiró una retención y reintentó un correo, verificado en base |

El worker no se probó solo con dobles. Se arrancó contra el Postgres y el Redis reales con una retención vencida sembrada a mano, y se comprobó el efecto en las tablas.

## 3. Las tres salvaguardas de la expiración

Este es el único mecanismo del sistema que cambia el estado de una reserva sin una persona detrás. Liberar de más significa vender dos veces la misma cama; liberar lo que no toca significa quitársela a alguien que ya pagó. De ahí que la regla se compruebe por partida doble.

**El estado se verifica tres veces**, no una: la base filtra por `status = 'HELD'`, el dominio lo vuelve a exigir con `shouldRelease`, y el `UPDATE` final lleva `status = 'HELD'` dentro del `WHERE`. Las dos últimas son redundantes en el caso normal. Cuestan nada y cierran el peor error posible de este worker, que sería expirar algo ya confirmado (HOS-012).

**El vencimiento se verifica por dos caminos distintos.** La base usa la columna `held_until`, escrita al crear la retención; el dominio recalcula desde `created_at` con la duración de DEC-005. Solo se expira si **ambos coinciden**. Si discrepan, la reserva no se toca y se cuenta como discrepancia en el log.

La asimetría es deliberada. Ante la duda no se libera: dejar una cama retenida de más se corrige solo en la pasada siguiente, mientras que liberarla de menos se la quita a alguien y no hay vuelta atrás automática.

**La escritura es compare-and-swap sobre `version`.** Una confirmación de pago que llegue en el mismo segundo gana la carrera y la expiración se retira. Quedar segundo es un resultado previsto, no un fallo: se cuenta como `lost` y se sigue con el lote.

### Un detalle que la base ya imponía

La migración de P06 tiene este CHECK:

```sql
CHECK (("status" = 'HELD' AND "held_until" IS NOT NULL)
    OR ("status" <> 'HELD' AND "held_until" IS NULL))
```

Es decir: la expiración **debe** poner `held_until` en `NULL` al mismo tiempo que cambia el estado, o la transacción entera falla. Quien escribió esa restricción en P06 estaba protegiendo precisamente contra un worker mal escrito, y funcionó. Hay una prueba de integración que lo comprueba explícitamente.

## 4. Correo: qué se reintenta y qué no

La distinción que gobierna el envío:

| Tipo de fallo | Ejemplo | Tratamiento |
|---|---|---|
| Transitorio | SMTP caído, timeout, `ECONNREFUSED` | Reintento con espera creciente: 1, 2, 4, 8 y 16 minutos |
| Determinista | Falta una variable en la plantilla | **Sin reintento.** Se marca `FAILED` y se registra |

Reintentar cinco veces una plantilla rota produce cinco veces el mismo error y retrasa toda la cola. Es el defecto habitual de las colas de correo: una plantilla mal configurada consume los reintentos de todos los envíos que la usan.

Además, una plantilla con una variable ausente **no se envía en absoluto**. Un correo que dice «Su pago de  ha sido aprobado» es peor que no enviar nada.

### Reclamar y leer son la misma operación

`claimDue` no lee y luego marca. Hace un `UPDATE ... RETURNING` sobre una subconsulta `FOR UPDATE SKIP LOCKED`:

```sql
UPDATE notifications SET status = 'SENDING'
 WHERE id IN (SELECT id FROM notifications
               WHERE status = 'PENDING' AND scheduled_at <= $1
               ORDER BY scheduled_at LIMIT $2
                 FOR UPDATE SKIP LOCKED)
RETURNING ...
```

Si fueran dos operaciones, dos réplicas del worker leerían las mismas filas entre una y otra, y el peregrino recibiría el correo dos veces. `SKIP LOCKED` es lo que permite añadir réplicas: en vez de esperar a una fila tomada por otro worker, la salta.

Un reintento vuelve a `PENDING` con `scheduled_at` en el futuro, en lugar de quedarse en `FAILED` esperando que alguien lo reencole. Así la cola tiene una sola consulta de lectura y no hay dos caminos por los que un envío pueda salir.

## 5. El actor de sistema

`audit_logs.actor_id` es obligatorio y referencia a `users`: toda escritura auditada tiene responsable (GOV-006). La expiración no tiene persona detrás, y las dos salidas habituales son malas:

- hacer `actor_id` nulo rompe la trazabilidad de toda la tabla y obliga a cada consulta a contemplar el caso;
- atribuir el cambio a quien creó la reserva es sencillamente falso.

La migración crea una cuenta de sistema con identificador fijo, visible y consultable. **No puede iniciar sesión**: no tiene fila en `accounts` —donde Better Auth guarda las credenciales— ni ninguna asignación de rol. Su correo usa el dominio `.invalid`, reservado por RFC 2606, de modo que un envío accidental falla en vez de llegar a un tercero.

## 6. Configuración del correo, partida a propósito

- **Host, puerto, remitente y TLS viven en `smtp_settings`.** Son configuración que un administrador cambia desde `/admin/configuracion/correo` sin desplegar. La tabla tiene un índice único que impide una segunda fila (GOV-007: la configuración es global).
- **La contraseña vive en el entorno.** Un secreto en base es un secreto en cada respaldo, en cada volcado y en cada pantalla de administración. La tabla ni siquiera tiene columna para ella.

Si nadie ha configurado SMTP, el worker **no falla**: registra que no está configurado y los envíos se acumulan en `PENDING`. Un sistema recién instalado sin correo es un estado legítimo.

## 7. Cadencias

| Trabajo | Intervalo | Por qué |
|---|---|---|
| `expirar-retenciones` | 60 s | DEC-005 fija 30 minutos; un minuto de imprecisión es un 3% del plazo |
| `enviar-notificaciones` | 30 s | Es la espera entre aprobar un pago y recibir el comprobante, y ahí sí se percibe |

Se programan con `upsertJobScheduler`, no con `add`. Verificado contra la documentación de BullMQ 6.0.7: es el reemplazo de los antiguos «repeatable jobs» y es idempotente entre despliegues. Con `add`, cada arranque crearía un programador nuevo y la carga se multiplicaría por el número de despliegues.

## 8. Evidencia del arranque real

Retención vencida hace 15 minutos y reserva confirmada de hace 40 días, sembradas en la base. SMTP apuntando a un puerto donde no escucha nadie:

```
{"msg":"worker ENCUENTRO iniciado","jobs":["expirar-retenciones","enviar-notificaciones"]}
{"examined":1,"expired":1,"lost":0,"disagreed":0,"msg":"retenciones procesadas"}
{"claimed":1,"sent":0,"retrying":1,"abandoned":0,"msg":"notificaciones procesadas"}
```

Estado resultante en base:

| Reserva | Estado | `held_until` | `version` |
|---|---|---|---|
| Vencida | `EXPIRED` | `NULL` | 2 |
| Confirmada de hace 40 días | `CONFIRMED` | `NULL` | 1 |

La confirmada no se tocó, que es el punto de HOS-012. La notificación quedó con `attempts = 1`, error `connect ECONNREFUSED 127.0.0.1:1025` y reprogramada al futuro. La auditoría registró `lodging.reservation.expire` a nombre del actor de sistema.

## 9. Dependencia añadida

`nodemailer@9.0.4` y `@types/nodemailer@8.0.1` en `@encuentro/infrastructure`. Verificado con Context7 antes de escribir el adaptador: `createTransport({host, port, secure, auth})` y `sendMail` con promesa.

## 10. Riesgos y pendientes

1. **La prueba de arranque usó un SMTP inexistente a propósito.** Se verificó el camino de fallo y reintento, no el de éxito contra un servidor real. Falta una prueba con un SMTP de verdad antes de producción.
2. **`apps/worker` no carga `.env` por sí solo.** En contenedor recibe el entorno del compose, pero `pnpm --filter @encuentro/worker dev` en local arranca sin variables. Se ejecutó con `node --env-file=.env`. Conviene alinear el script `dev`.
3. **El intervalo de reintento es inferencia**, no requisito. 1-2-4-8-16 minutos y cinco intentos vienen de `packages/domain/src/notifications.ts`, que ya lo declaraba inferido en P13. Sigue pendiente de confirmarse.
4. **`resetDatabase` de las pruebas de integración borra el actor de sistema**, porque hace `TRUNCATE` de `users`. Las pruebas lo reponen. En producción nadie trunca esa tabla, pero el vínculo existe y conviene saberlo.
5. **Quedan cinco de los seis pendientes de P14.** Este cierra el tercero. La subida del respaldo fuera del VPS, el rol no propietario, la prueba de carga y el firewall siguen abiertos, y el go/no-go sigue siendo **no-go**.

## 11. Archivos

| Archivo | Cambio |
|---|---|
| `packages/application/src/ports.ts` | Puertos `ReservationRepository`, `NotificationRepository`, `EmailSender` |
| `packages/application/src/expire-held-reservations.ts` | Caso de uso + 8 pruebas |
| `packages/application/src/dispatch-notifications.ts` | Caso de uso + 8 pruebas |
| `packages/infrastructure/src/reservation-repository.ts` | CAS y auditoría en transacción |
| `packages/infrastructure/src/notification-repository.ts` | Reclamo con `SKIP LOCKED` |
| `packages/infrastructure/src/email-sender.ts` | Adaptador nodemailer |
| `apps/worker/src/main.ts` | Dos colas, apagado limpio |
| `prisma/migrations/20260805143000_p16_background_workers/` | Actor de sistema |
| `tests/integration/workers.test.ts` | 13 pruebas contra Postgres |
