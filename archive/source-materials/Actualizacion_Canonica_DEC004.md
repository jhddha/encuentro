# Sistema web ENCUENTRO — Actualización canónica DEC-004

**Estado:** APPROVED  
**Fecha de aprobación:** 22 de julio de 2026  
**Alcance:** llegada durante `IN_PROGRESS`, duración de la gestión, hospedaje, alimentación, materiales y paquetes no públicos.

## 1. Decisión aprobada

1. Cuando la gestión está en `IN_PROGRESS`, **no existe prorrateo por días transcurridos**. La persona paga el importe completo del paquete aplicado, haya realizado o no un anticipo y sin importar el día de llegada.
2. No se crean tarifas tardías automáticas, descuentos por días restantes ni devoluciones por servicios no usados debido a llegada tardía.
3. Pueden existir **paquetes no públicos** con precios y beneficios propios. Solo los usuarios autorizados del área de Inscripciones pueden verlos y asignarlos. No se seleccionan automáticamente por la fecha de llegada.
4. La duración total del evento es configurable por gestión. La referencia actual es **8 días**, pero no debe fijarse en código.
5. El hospedaje usa un periodo fijo y configurable. La referencia actual es **7 noches**, desde la noche del día 1 hasta la noche del día 7.
6. La llegada tardía no reduce el rango de hospedaje, no reduce el precio y **no libera una reserva confirmada por ausencia**.
7. Alimentos configura servicios por día, tipo, cantidad y horario. La entrega QR valida fecha, inicio, fin, disponibilidad, beneficio y duplicidad.
8. Materiales no aplica restricciones automáticas por actividades pasadas. La elegibilidad depende del paquete, las reglas vigentes, el inventario y el historial de entrega.

## 2. Aclaración sobre DEC-005

DEC-005 continúa pendiente únicamente para la duración de un `HELD` antes de confirmar y otras reglas de retención todavía no definidas. Queda resuelta esta parte de la política:

- una reserva `CONFIRMED` no se libera automáticamente porque la persona llegue después del inicio del evento;
- la expiración automática solo puede aplicarse a un hold temporal no confirmado conforme a DEC-005.

## 3. Cambios en requisitos y reglas

### 3.1 Alcance y exclusiones

Reemplazar la exclusión sobre prorrateo por:

> El sistema no prorratea el precio por llegada tardía. DEC-004 está aprobada: durante `IN_PROGRESS` se conserva el importe completo del paquete aplicado.

### 3.2 Gobierno y gestión

Agregar:

- **EVT-016 — Duración configurable de la gestión.** `start_at` y `end_at` son configurables; la UI muestra el total de días y valida que el fin sea posterior al inicio. El total no se fija a 7 u 8 días en código.
- **EVT-017 — Configuración operativa derivada.** Hospedaje y Alimentos usan las fechas de la gestión, pero conservan sus propias configuraciones versionadas de noches y servicios.

### 3.3 Paquetes y precios

Actualizar `PKG-005`:

> Durante `IN_PROGRESS` no se prorratea el precio por días transcurridos. Una inscripción utiliza el importe completo de la versión de precio o paquete asignado.

Agregar:

- **PKG-009 — Visibilidad de paquete.** Cada paquete es `PUBLIC` o `PRIVATE`. Un paquete privado no aparece en landing, wizard ni endpoints públicos.
- **PKG-010 — Asignación privada.** Solo Inscripciones con permiso puede asignar un paquete privado; la acción registra actor, motivo y versión de precio.
- **PKG-011 — Sin tarifa tardía automática.** La fecha de llegada no selecciona descuentos, prorrateos ni paquetes privados.

### 3.4 Hospedaje

Agregar:

- **HOS-011 — Número de noches configurable.** La gestión define un número fijo de noches y su rango. Referencia actual: 7 noches.
- **HOS-012 — Reserva confirmada ante llegada tardía.** Una reserva confirmada no se libera ni reduce por llegar después del inicio.
- **HOS-013 — Rango fijo.** La reserva conserva el rango configurado de hospedaje; no se recalcula desde `actual_at` de la llegada.
- **HOS-014 — Fuente única.** La configuración de noches tiene una sola fuente versionada, editable desde Configuración de gestión y visible/administrable en Hospedaje según permiso.

### 3.5 Alimentos

Actualizar `FOD-001`:

> Cada servicio de comida define gestión, fecha, tipo/turno, cantidad disponible, hora de inicio y hora de fin.

Agregar:

- **FOD-006 — Ventana de entrega.** El servidor rechaza una entrega fuera de la fecha o del horario configurado.
- **FOD-007 — Disponibilidad.** La entrega se rechaza cuando se agotó la cantidad disponible, salvo override autorizado.
- **FOD-008 — Offline temporal.** Una captura offline conserva `captured_at`; al sincronizar, el servidor valida que la captura ocurrió dentro de la ventana del servicio y bajo una lease válida.

### 3.6 Materiales

Agregar:

- **MAT-004 — Llegada tardía.** No se deshabilita un material por haber pasado una actividad. La entrega depende de paquete, regla, inventario y no duplicidad.

## 4. Cambios en arquitectura y datos

### 4.1 Events / configuración

`events` conserva:

- `start_at`
- `end_at`
- `timezone`

El total de días debe calcularse de forma consistente para UI y reportes. No deben existir valores contradictorios entre `end_at` y un contador editable independiente.

`event_settings` agrega o formaliza:

- `lodging_night_count`
- `lodging_start_date`
- `lodging_end_date`
- `version`
- `updated_at`
- `updated_by`

Regla: `lodging_end_date - lodging_start_date = lodging_night_count` según convención de noches aprobada.

### 4.2 Packages

`packages` agrega:

- `visibility`: `PUBLIC | PRIVATE`
- `status`

Índices/constraints:

- consultas públicas filtran obligatoriamente `visibility=PUBLIC` y `status=ACTIVE`;
- asignar `PRIVATE` requiere `catalog.private.assign` o permiso equivalente;
- se registra auditoría con paquete, inscripción, actor y motivo.

### 4.3 Lodging

`lodging_reservations` conserva:

- `check_in_date`
- `check_out_date`
- `night_count`
- `status`
- `version`

Reglas:

- `actual_arrival_at` no modifica automáticamente estas fechas;
- `CONFIRMED` no pasa a `RELEASED` o `EXPIRED` por ausencia al inicio;
- `HELD` sí puede expirar según DEC-005.

### 4.4 Meal services

`meal_services` debe incluir:

- `event_id`
- `service_date`
- `type`
- `starts_at`
- `ends_at`
- `available_count`
- `ordered_count`
- `received_count`
- `status`
- `version`

Constraints:

- `ends_at > starts_at`;
- cantidad no negativa;
- servicio único por gestión/fecha/tipo/ventana según política;
- una entrega por persona/servicio salvo override autorizado.

## 5. Cambios API/RBAC

### Gestión

- `PATCH /events/{id}` permite modificar fechas en estados autorizados y con control de versión.
- `PUT /events/{id}/lodging-settings` administra número y rango de noches.

Permisos:

- `event.update`
- `lodging.settings.manage`

### Catálogo

- `GET /events/{id}/packages` acepta vista pública o interna; la pública nunca devuelve paquetes privados.
- `POST /registrations/{id}/assign-private-package` requiere permiso, motivo e idempotency key.

Permiso nuevo sugerido:

- `catalog.private.assign`

### Alimentos

- `GET/POST /events/{id}/meal-services` incluye cantidad y ventana horaria.
- `POST /meal-services/{id}/deliveries` valida el tiempo capturado y el tiempo autoritativo.

Errores de dominio sugeridos:

- `MEAL_SERVICE_NOT_STARTED`
- `MEAL_SERVICE_ENDED`
- `MEAL_SERVICE_UNAVAILABLE`
- `PACKAGE_NOT_PUBLIC`
- `PRIVATE_PACKAGE_ASSIGNMENT_FORBIDDEN`
- `LODGING_RANGE_INVALID`

## 6. Cambios de interfaz

### Configuración de gestión

Agregar una sección **Fechas y duración**:

- inicio del evento;
- fin del evento;
- total de días calculado;
- número de noches de hospedaje;
- primera noche;
- última noche / fecha de salida calculada;
- advertencia de impacto si ya existen reservas o servicios.

### Catálogo

Agregar:

- visibilidad pública/privada;
- badge `Paquete interno`;
- filtro por visibilidad;
- mensaje de que un paquete privado solo puede asignarse desde Inscripciones.

### Inscripciones

Agregar la acción:

- **Asignar paquete interno**;
- selector solo de paquetes privados activos;
- motivo obligatorio;
- resumen del precio y beneficios antes de confirmar.

### Hospedaje

Agregar:

- tarjeta con periodo fijo de hospedaje;
- número de noches;
- rango de fechas;
- permiso para editar o enlace a Configuración de gestión;
- aviso: “La llegada tardía no libera una reserva confirmada”.

### Alimentos

Agregar una pantalla o sección **Servicios diarios**:

- día del evento y fecha;
- tipo de comida;
- cantidad disponible;
- inicio y fin de entrega;
- estado;
- pedido, recibido, entregado y desperdicio;
- vista previa del mensaje que verá el scanner fuera de horario.

## 7. Cambios en prompts y ejecución

### P05

Reemplazar “No prorratees mientras DEC-004 no esté APPROVED” por:

> DEC-004 está aprobada. En `IN_PROGRESS` aplica el importe completo del paquete; no calcules prorrateo ni tarifa tardía. Implementa paquetes `PUBLIC/PRIVATE` y asignación privada autorizada/auditada.

Gate adicional:

- día 1, día 3 y último día producen el mismo importe para la misma versión de paquete;
- un paquete privado nunca aparece en autoservicio;
- usuario sin permiso no puede asignarlo.

### P06

Agregar:

- periodo de noches configurable;
- reserva confirmada conservada ante llegada tardía;
- llegada real no reescribe el rango;
- solo `HELD` expira conforme a DEC-005.

### P11

Agregar:

- `starts_at`, `ends_at` y `available_count` por servicio;
- pruebas antes, dentro y después de la ventana;
- sync offline con `captured_at` válido/inválido;
- materiales sin bloqueo automático por actividad pasada.

## 8. Pruebas obligatorias

1. Misma versión de paquete en día 1, día 3 y último día: mismo cargo.
2. Con y sin anticipo: no cambia el importe por fecha de llegada.
3. Paquete privado no aparece en landing, portal ni endpoint público.
4. Inscripciones autorizado asigna paquete privado y queda auditado.
5. Usuario sin permiso recibe 403/código de dominio.
6. Evento de 8 días muestra 8; al cambiar fechas recalcula correctamente.
7. Hospedaje configurado en 7 noches genera el rango exacto.
8. Llegada en día 3 no reduce, libera ni refecha una reserva confirmada.
9. Hold no confirmado expira únicamente según DEC-005.
10. Entrega de comida antes del horario: rechazada.
11. Entrega dentro del horario: aceptada.
12. Entrega después del horario: rechazada.
13. Cantidad agotada: rechazada o override autorizado.
14. Dos dispositivos entregan la misma comida: una aceptación y un duplicado.
15. Operación offline capturada dentro del horario y sincronizada después: se evalúa por `captured_at` y lease.
16. Material incluido puede entregarse aunque la persona llegue tarde, sujeto a inventario y no duplicidad.

## 9. Decision register

Actualizar:

```text
DEC-004 | APPROVED | No hay prorrateo ni tarifa tardía automática durante IN_PROGRESS. El precio es el importe completo del paquete aplicado. La duración del evento y las noches de hospedaje son configurables; una reserva confirmada no se libera por llegada tardía. Alimentos se configura por día/cantidad/horario. Paquetes especiales son privados y solo Inscripciones puede asignarlos.
```
