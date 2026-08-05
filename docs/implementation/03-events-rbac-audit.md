# P03 — Events, RBAC y auditoría

**Fecha:** 5 de agosto de 2026
**Alcance:** ciclo manual de gestiones, duración configurable, permisos y scopes, auditoría append-only. Primera fase con base de datos.

## 1. Gate ejecutado

| Paso | Comando | Exit |
|---|---|---:|
| Validador documental | `python scripts/validate_canonical_docs.py` | 0 |
| Instalación congelada | `pnpm install --frozen-lockfile` | 0 |
| Formato | `pnpm format` | 0 |
| Lint | `pnpm lint` | 0 |
| Typecheck | `pnpm typecheck` | 0 |
| Unitarias | `pnpm test` — **112 pruebas, 8 archivos** | 0 |
| **Integración** | `pnpm test:integration` — **14 pruebas contra Postgres real** | 0 |
| Build | `pnpm build` | 0 |
| Accesibilidad y responsive | `pnpm test:e2e` — **165 pruebas** | 0 |

El gate propio de P03 es el de integración: transiciones válidas e inválidas, concurrencia y aislamiento.

## 2. Las invariantes viven en la base, no en el código

La decisión de diseño más relevante de esta fase: las reglas que no pueden romperse se imponen en Postgres. Una regla que solo existe en la capa de aplicación se rompe en cuanto alguien escribe por otra vía — una migración de datos, un script de soporte, `psql`.

La migración instala, además de las tablas:

| Invariante | Mecanismo | Requisito |
|---|---|---|
| Auditoría append-only | Trigger que rechaza `UPDATE` y `DELETE` | GOV-005, GOV-009 |
| Una sola gestión pública | Índice único parcial sobre `publicly_enabled` | EVT-006 |
| Fechas coherentes | `CHECK (end_at >= start_at)` | EVT-002 |
| Estados canónicos | `CHECK` contra los siete de `contracts/states.json` | §4.1 |
| Forma de cada scope | `CHECK` por tipo: `CASH` exige `cash_account_id`, `GLOBAL` los prohíbe todos | §10 |
| Código y año únicos | Índices únicos separados | EVT-001 |

Se verificaron una por una contra la base real. Las seis rechazaron los datos inválidos, incluida la auditoría ante un `UPDATE` lanzado por SQL directo.

El trigger se eligió en vez de revocar privilegios porque actúa igual sea cual sea el rol conectado, incluido el superusuario del entorno local.

### `publicly_enabled` es `TRUE` o `NULL`, nunca `FALSE`

Un índice único trata cada `NULL` como distinto. Con esa convención, un solo índice único parcial admite muchas gestiones sin publicar y como máximo una publicada. Con un booleano corriente haría falta un índice parcial adicional y la regla quedaría menos evidente en el esquema.

## 3. Autorización

`can(actor, permission, resource)` exige que **una misma asignación** aporte a la vez el permiso y el alcance. Comprobarlos por separado —tiene el permiso en algún sitio, y alcanza el recurso por otro rol— es una escalada clásica: permitiría a un cajero con `payment.collect` en su caja usarlo sobre otra donde solo tiene lectura. Hay una prueba dedicada a ese escenario.

La contención de scopes va de lo ancho a lo estrecho: `GLOBAL` alcanza todo, `EVENT` su gestión y lo que contiene, `COMMISSION` y `CASH` solo su propio identificador. Lo que importa es lo que **no** ocurre: un scope estrecho nunca alcanza hacia arriba ni hacia los lados.

El orden de comprobaciones en `transitionEvent` tampoco es casual. Autorización primero, antes de leer la gestión: a quien no puede operar sobre ella no se le dice si la transición sería válida, porque eso ya revela su estado. Y `FORBIDDEN` se usa tanto para «sin permiso» como para «no existe», de modo que el error no sirva para enumerar identificadores.

## 4. Concurrencia

El compare-and-swap ocurre en una sola sentencia: `UPDATE … WHERE id = ? AND version = ?`. La segunda transacción encuentra `count === 0` y se retira. Leer y luego escribir sin esa condición dejaría una ventana en la que ambas se creerían ganadoras.

Quedar segundo devuelve `null`, no una excepción: perder una carrera es un resultado previsto, no un fallo. La capa de aplicación lo traduce a `EVENT_VERSION_CONFLICT` con un mensaje que dice qué hacer.

Verificado con **diez transiciones simultáneas** sobre la misma versión: exactamente una se aplica, la versión avanza una sola vez, y hay **un solo registro de auditoría** — las perdedoras no dejan rastro de un cambio que no ocurrió.

La escritura del estado y la de su auditoría comparten transacción. Separarlas permitiría que un cambio quedara sin rastro si el proceso muere entre ambas.

## 5. Duración configurable

`totalDays` no contiene ninguna constante `8`. El único número presente es el `1` de «el día de inicio cuenta como día 1», que es la definición de contar días inclusivos.

Cuenta **días naturales en UTC**, no bloques de 24 horas: un evento de las 18:00 del día 1 a las 09:00 del día 2 abarca dos días, aunque la resta dé 15 horas. Probado con duraciones de 1, 5, 8, 12 y 30 días, cruce de mes, cruce de año y 29 de febrero.

`dayNumber` devuelve `null` fuera del rango en vez de un número negativo o mayor al total, para que quien lo use decida qué mostrar. Sirve para «día 3 de 8», nunca para calcular importe: REG-006 prohíbe prorratear y DEC-004 fija el paquete completo sea cual sea el día de llegada.

## 6. Redacción de auditoría

`redact` trabaja sobre la forma del objeto, no sobre una lista de rutas concretas, así que un campo anidado nuevo con nombre sensible queda cubierto sin tocar el código. Probado con un campo añadido a tres niveles de profundidad.

## 7. Interpretación que requiere confirmación

**EVT-001 dice «código y año únicos» y admite dos lecturas.** Se implementó como **dos índices únicos separados** —un código nunca se repite y hay como mucho una gestión por año— porque el glosario define gestión como «edición anual del Encuentro».

La alternativa sería un único índice compuesto `(code, year)`, que permitiría dos gestiones distintas en 2026. Esa lectura contradice el glosario, pero la frase original no lo cierra del todo. **Si la interpretación es incorrecta, cambiarla exige una migración.** Conviene confirmarla antes de P05.

## 8. Qué NO se implementó, y por qué

| Omisión | Motivo |
|---|---|
| Autenticación | DEC-016 sigue BLOCKING. Hay `users`, `roles` y asignaciones —la identidad— pero **ninguna credencial, sesión ni token**: eso es el mecanismo, que es justo lo que la decisión bloquea. |
| Mutaciones desde la interfaz | Sin sesión no hay actor real. Las pantallas administrativas son de solo lectura y lo declaran en pantalla con un aviso visible; la lógica de transición está implementada y probada, lista para conectarse en P04. |
| `event_lodging_policies` | Pertenece a P06 con su política de noches. |
| Permisos de Transporte, Contabilidad, Reportes, Notificaciones, Credenciales y Servidores | Hallazgo H-06 de P00: no existen en el contrato y decidirlos requiere criterio humano. |

## 9. Riesgos y pendientes

1. **El shell administrativo es accesible sin sesión.** Es consecuencia directa de DEC-016 y está declarado en pantalla, pero es un riesgo real mientras dure: cualquiera con acceso de red ve la lista de gestiones y su auditoría. No expone PII —la redacción se aplica antes de escribir— pero sí metadatos operativos. **No desplegar a un entorno accesible desde Internet hasta cerrar P04.**
2. **`TRUNCATE` esquiva el trigger append-only.** Los triggers de fila no se disparan con `TRUNCATE`, que además exige ser propietario de la tabla. Se dejó así a propósito para poder limpiar entre pruebas de integración. **Mitigación obligatoria en P14: el rol de la aplicación no debe ser propietario de las tablas.**
3. **La interpretación de EVT-001 está sin confirmar** (§7).
4. Siguen abiertos H-02 a H-06 de la auditoría P00.
5. El seed crea un usuario administrador sin credenciales. Cuando P04 añada autenticación, hay que revisar que no quede una cuenta accesible por defecto.
