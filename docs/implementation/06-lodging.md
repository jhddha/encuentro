# P06 — Hospedaje

**Fecha:** 5 de agosto de 2026
**Alcance:** HOS-011..008 y DEC-005.

## 1. Gate ejecutado

| Paso | Comando | Exit |
|---|---|---:|
| Validador documental | `python scripts/validate_canonical_docs.py` | 0 |
| Formato · Lint · Typecheck | | 0 |
| Unitarias | `pnpm test` — **193 pruebas** | 0 |
| **Integración** | `pnpm test:integration` — **54 pruebas** | 0 |
| Build | `pnpm build` | 0 |
| Accesibilidad | `pnpm test:e2e` — 165 pruebas | 0 |

## 2. Las tres reglas que van contra la costumbre

Un sistema de reservas corriente, ante alguien que llega tarde, recorta el rango, baja el precio y libera la habitación. Aquí las tres cosas están prohibidas, y el código está escrito para que romperlas sea difícil:

- **HOS-011**: la cantidad de noches es **configuración**, no un cálculo derivado de la llegada y la salida de cada persona. Referencia actual, 7 noches; el número no aparece en el código.
- **HOS-013**: `actual_arrival_at` no reescribe la reserva. Se registra como asistencia y nada más.
- **HOS-012**: una reserva `CONFIRMED` **no se libera nunca** por este mecanismo, y en particular no por ausencia el primer día.

`shouldRelease` recibe estado, creación y momento actual. **No recibe la fecha de llegada real**, y eso es deliberado: aceptarla invitaría a usarla, y usarla sería exactamente la regla que HOS-012 prohíbe. Una prueba fija la aridad.

## 3. `held_until` solo existe mientras la reserva esté en `HELD`

Un `CHECK` obliga a que `held_until` sea nulo en cualquier estado distinto de `HELD`. La razón es concreta: si una reserva `CONFIRMED` conservara una fecha de vencimiento, bastaría un worker mal escrito —uno que filtrara por `held_until <= now` sin comprobar el estado— para expirarla. El constraint hace que ese error sea imposible de cometer en los datos.

## 4. El último cupo

HOS-002 exige controlar la capacidad por inventario y no por un contador. La implementación modela cada plaza como una fila `(room_id, bed_index)` con un **índice único parcial** sobre las reservas vivas (`HELD` y `CONFIRMED`).

Consecuencias:

- Dos personas pidiendo la misma plaza a la vez: Postgres decide, y la segunda falla. Verificado con **diez intentos simultáneos** sobre una habitación de capacidad 1 — exactamente una reserva sobrevive.
- Liberar una reserva devuelve el cupo, porque el índice es parcial y `RELEASED` deja de contar.
- Un trigger comprueba que `bed_index` esté dentro de la capacidad de su habitación. No se puede expresar con un `CHECK` porque involucra otra tabla.
- Una inscripción no puede tener dos reservas vivas a la vez.

## 5. Un incidente de migración que conviene documentar

La migración de P06 falló a medias y dejó la base inconsistente. La causa raíz vale la pena registrarla porque volverá a aparecer:

En P05 añadí a mano `ALTER TABLE … ADD CONSTRAINT … UNIQUE` para sostener una clave foránea compuesta. Prisma modela esa garantía como un **índice único**, no como una restricción de tabla, así que la vio como deriva y trató de eliminarla. Al fallar el `DROP`, la migración quedó aplicada parcialmente y **se llevó por delante la clave foránea compuesta**.

Lo relevante: la clave foránea tampoco estaba declarada en el esquema Prisma, solo en SQL. Todo lo que la base tiene y el esquema no describe, Prisma lo considera deriva y lo borra en la siguiente migración.

La reparación fue quirúrgica, sin resetear la base:

1. Se eliminó el registro de la migración fallida.
2. Se convirtió la restricción en índice único, que es lo que Prisma modela.
3. Se sincronizó el checksum de la migración editada.
4. Se declaró la relación compuesta **en el esquema**: `@relation(fields: [priceVersionId, packageId], references: [id, packageId])`.

Con eso, la garantía está en el modelo y no volverá a desaparecer. La prueba de integración que la cubre —una inscripción no puede usar la versión de precio de otro paquete— fue la que detectó la pérdida.

**Lección para las fases siguientes:** cualquier invariante añadida por SQL suelto debe tener su reflejo en el esquema Prisma, o desaparecerá sola.

## 6. Qué NO se implementó, y por qué

| Omisión | Motivo |
|---|---|
| Worker que expira las retenciones | La consulta está probada, pero el proceso periódico pertenece a la infraestructura de colas. DEC-005 avisa de que 30 minutos no toleran un job horario. |
| Pantallas de hospedaje | La ruta existe desde P02; conectarla requiere el flujo de selección del peregrino, que depende del 50% aprobado (P07). |
| Selección de hotel por el peregrino | HOS-016 la sitúa después de aprobar el pago, que es P07. |
| Asignación de habitación | HOS-001 la reserva a Hospedaje con `lodging.assign_room`; el modelo lo soporta (`room_id` nullable), falta la interfaz. |

## 7. Riesgos y pendientes

1. **No hay worker de expiración.** Sin él, las retenciones `HELD` no se liberan solas y el inventario queda retenido. Es lo primero que hay que resolver cuando exista la selección de hotel.
2. **DEC-005 depende de una lectura del flujo.** 30 minutos funcionan porque HOS-016 pone la elección después de la aprobación. Si eso cambiara, el plazo sería insuficiente; queda escrito en el propio módulo para que se note.
3. La migración `p06b` existe solo para restaurar lo que `p06` borró. No se fusionaron porque el historial de migraciones no se reescribe.
