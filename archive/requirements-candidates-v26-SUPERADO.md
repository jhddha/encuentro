# Requisitos candidatos — brecha v2.6 → v2.7

**Estado: `CANDIDATE`. Ninguno de estos requisitos es canónico.**
**Fecha:** 5 de agosto de 2026
**Autor:** derivado por el agente a petición explícita del responsable del proyecto.

## 0. Qué es este documento y qué no es

`SOURCE_GAPS.md` deja constancia de que la v2.6 declaraba **185 requisitos** y que el contrato vigente (`contracts/requirements.json`) contiene **65**. Este documento cubre esa diferencia de **120** con requisitos **derivados**, no recuperados.

**No tuve acceso al ZIP v2.6 original.** Nada de lo que sigue es una transcripción de aquel documento. Cada línea se obtuvo por inferencia a partir de fuentes que sí están en el repositorio, y cada una declara de dónde salió y con cuánta confianza. Es material **para tu revisión**, no una fuente de verdad.

Por eso:

- este archivo **no** modifica `contracts/requirements.json`;
- este archivo **no** modifica `docs/01-product/requirements.md`;
- el validador **no** debe tratar estos identificadores como canónicos;
- ninguna implementación debe citarlos como justificación hasta que los apruebes.

La coincidencia numérica con 120 es aritmética, no evidencia. Es perfectamente posible que la v2.6 dijera otra cosa, que agrupara distinto, o que tuviera requisitos que aquí no aparecen. **Lo que este documento sirve es para que tú detectes ausencias y contradicciones leyendo, que es más rápido que reconstruir de memoria desde cero.**

## 1. Cómo leer la columna «Procedencia»

| Valor | Significado | Qué tan seguro es |
|---|---|---|
| `CÓDIGO` | El comportamiento ya está implementado y probado en este repositorio. El requisito describe lo que el sistema hace hoy. | Alta. Verificable ejecutando pruebas. |
| `CONTRATO` | Se deduce de `permissions.json`, `routes.json`, `states.json` o de un requisito canónico existente. | Alta. |
| `DEC` | Se deduce de una decisión aprobada DEC-001..017. | Alta. |
| `ALCANCE` | Se deduce de la lista de módulos de `requirements.md` §2, que nombra el módulo pero no lo detalla. | Media. El módulo existe; la regla concreta es mía. |
| `INFERIDO` | Inferencia sin anclaje documental. Es una propuesta razonable, nada más. | Baja. Revisar con atención. |

Las filas marcadas **`TBD`** son aquellas donde ni siquiera me atrevo a proponer un valor concreto, porque acertar depende de información que solo tú tienes. Requieren decisión tuya, no revisión.

## 2. Resumen por familia

| Familia | Ámbito | Nuevos | Procedencia dominante |
|---|---|---:|---|
| IDN | Identidad, cuentas y autenticación | 12 | DEC / CÓDIGO |
| RBAC | Permisos y scopes | 10 | CONTRATO |
| PRE | Preinscripción e inscripción presencial | 8 | ALCANCE |
| CASH | Cajas (extiende CASH-001..002) | 10 | ALCANCE |
| ACC | Contabilidad simplificada | 14 | CÓDIGO / **TBD** |
| NOT | Notificaciones | 10 | CONTRATO / CÓDIGO |
| CRD | Credenciales y QR | 12 | CONTRATO |
| TRA | Transporte | 8 | **INFERIDO** |
| SRV | Servidores y comisiones | 8 | ALCANCE |
| REP | Reportes y exportaciones | 8 | CONTRATO |
| AUD | Auditoría | 6 | CÓDIGO |
| PRV | Privacidad y retención | 6 | DEC |
| OPS | Operación y observabilidad | 8 | DEC |
| **Total** | | **120** | |

**Las dos familias que más atención necesitan son ACC y TRA.** ACC porque el núcleo contable sigue siendo una decisión tuya y aquí solo está la estructura. TRA porque es la que menos anclaje documental tiene: prácticamente todo es invención mía sobre un módulo que solo aparece nombrado.

---

## 3. IDN — Identidad, cuentas y autenticación

| ID | Requisito | Criterio verificable | Procedencia |
|---|---|---|---|
| IDN-001 | Toda persona con acceso tiene exactamente una cuenta, identificada por correo único. | Alta con correo existente falla; no crea segunda cuenta. | CÓDIGO |
| IDN-002 | El correo debe verificarse antes de cualquier operación (DEC-013). | Sesión no verificada solo alcanza `/verificar-correo`. | DEC |
| IDN-003 | Toda cuenta con al menos un permiso asignado exige MFA (DEC-014). | Con permiso y sin MFA, la API rechaza mutaciones y la UI redirige a `/configurar-mfa`. | DEC |
| IDN-004 | El peregrino sin permisos no está obligado a MFA. | Accede a `/mi-cuenta` con correo verificado y sin segundo factor. | INFERIDO |
| IDN-005 | El restablecimiento de MFA es presencial, autorizado y auditado. | Queda registro con actor, sujeto, motivo y fecha. | DEC (riesgo DEC-014) |
| IDN-006 | La sesión expira por inactividad y por antigüedad máxima. | Prueba de expiración en ambos cortes. | INFERIDO · **TBD duraciones** |
| IDN-007 | El orden de comprobación es sesión → correo verificado → MFA → permiso → scope → estado de gestión. | Cada corte devuelve el error del primer fallo, no del último. | CÓDIGO |
| IDN-008 | Cerrar sesión la invalida en servidor, no solo en el navegador. | Reutilizar la cookie posterior al cierre falla. | CÓDIGO |
| IDN-009 | Los intentos fallidos se limitan por cuenta y por origen. | Tras el umbral responde error de exceso de intentos. | INFERIDO · **TBD umbral y ventana** |
| IDN-010 | Cambiar de correo exige verificar el nuevo antes de sustituir al anterior. | Hasta verificar, el correo de contacto sigue siendo el viejo. | INFERIDO |
| IDN-011 | Las credenciales y los segundos factores nunca aparecen en logs ni en auditoría. | Redacción probada sobre el logger. | CÓDIGO |
| IDN-012 | Una cuenta se desactiva, nunca se borra (GOV-009). | Desactivada no inicia sesión; su histórico permanece íntegro. | CONTRATO |

## 4. RBAC — Permisos y scopes

| ID | Requisito | Criterio verificable | Procedencia |
|---|---|---|---|
| RBAC-001 | La autorización se evalúa siempre en servidor. | Llamada directa a la API, sin pasar por la UI, se rechaza igual. | CONTRATO (GOV-006) |
| RBAC-002 | Existen cuatro tipos de scope: global, gestión, comisión y caja. | Prueba por cada tipo. | CONTRATO |
| RBAC-003 | Un permiso en un scope no se propaga a otro del mismo tipo. | El cajero de la caja A no puede cobrar en la caja B. Prueba IDOR. | CONTRATO |
| RBAC-004 | El catálogo de permisos es cerrado. | Un permiso fuera de `permissions.json` hace fallar al validador. | CÓDIGO |
| RBAC-005 | Solo el scope global concede `event.create`. | Un administrador de gestión no puede crear otra gestión. | CONTRATO |
| RBAC-006 | Los roles son composiciones de permisos, no listas codificadas. | Cambiar la composición de un rol no exige desplegar. | INFERIDO |
| RBAC-007 | Conceder o revocar un permiso queda auditado. | Actor, sujeto, permiso, scope y fecha. | CONTRATO (GOV-006) |
| RBAC-008 | El acceso a PII sensible exige permiso propio, no pertenencia al módulo. | `receipt.read_sensitive` es independiente de `receipt.read`. | CONTRATO |
| RBAC-009 | El scope de comisión limita a los datos de esa comisión. | La comisión de alimentos no accede a pagos. | CONTRATO |
| RBAC-010 | Ningún permiso permite reescribir histórico financiero. | No existe permiso de edición sobre pagos, asientos, cierres ni entregas. | CONTRATO (GOV-005) |

## 5. PRE — Preinscripción e inscripción presencial

| ID | Requisito | Criterio verificable | Procedencia |
|---|---|---|---|
| PRE-001 | La preinscripción pública crea la inscripción en `DRAFT` y no ocupa cupo. | Un `DRAFT` no descuenta inventario de hospedaje ni de paquete. | CONTRATO |
| PRE-002 | Pasar a `SUBMITTED` exige datos obligatorios completos y aceptación de términos de la gestión. | Falta de cualquiera bloquea la transición. | ALCANCE |
| PRE-003 | Se rechaza activamente a menores de edad (DEC-006). | El rechazo ocurre antes de persistir datos, no como aviso. | DEC |
| PRE-004 | La edad se evalúa contra `start_at` de la gestión. | Quien cumple la mayoría de edad entre el registro y el evento. | INFERIDO · **TBD: ¿fecha de registro o de inicio?** |
| PRE-005 | La inscripción presencial la realiza personal con `registration.create` en nombre del peregrino. | Queda registrado quién inscribió a quién. | CONTRATO |
| PRE-006 | La inscripción presencial produce el mismo modelo de datos que la pública. | Ambas rutas convergen en el mismo caso de uso. | CÓDIGO |
| PRE-007 | El código de inscripción es único por gestión y estable durante toda la vida del registro. | Cancelar y reactivar no lo cambia. | CONTRATO (PAY-012) |
| PRE-008 | `registration.check_in` es idempotente. | Un segundo check-in no duplica asistencia ni entrega. | CONTRATO |

## 6. CASH — Cajas (extiende CASH-001..002)

| ID | Requisito | Criterio verificable | Procedencia |
|---|---|---|---|
| CASH-003 | Una caja pertenece a una gestión y tiene código único dentro de ella. | Duplicado falla. | ALCANCE |
| CASH-004 | Una caja admite como máximo una sesión abierta a la vez. | Segunda apertura falla mientras haya una abierta. | ALCANCE |
| CASH-005 | La apertura registra fondo inicial por moneda. | Sin fondo declarado no abre. | ALCANCE |
| CASH-006 | Todo cobro queda ligado a sesión, cajero y canal. | Ningún cobro huérfano de sesión. | CONTRATO (CASH-001) |
| CASH-007 | El arqueo se cuenta por moneda y canal por separado. | El cierre no suma monedas distintas. | CONTRATO (CASH-002) |
| CASH-008 | Una diferencia de arqueo no impide cerrar, pero exige motivo y queda auditada. | Cierre con diferencia y sin motivo falla. | CONTRATO (CASH-002) |
| CASH-009 | Una sesión cerrada no admite cobros nuevos ni retroactivos. | Intento posterior al cierre falla. | ALCANCE |
| CASH-010 | El cierre operativo de la gestión exige que no queden sesiones abiertas. | Coherente con EVT-009. | CONTRATO |
| CASH-011 | Los canales disponibles se habilitan por gestión y por caja. | El cajero solo ve canales activos (PAY-003). | CONTRATO |
| CASH-012 | Efectivo y QR en caja producen el mismo comprobante numerado. | Misma secuencia `REC-{EVENT_CODE}-{NNNNNN}`. | CONTRATO (PAY-010) |

## 7. ACC — Contabilidad simplificada

> **Esta familia contiene los dos TBD que hoy impiden llevar libros reales.** Todo lo demás es estructura ya construida y probada.

| ID | Requisito | Criterio verificable | Procedencia |
|---|---|---|---|
| ACC-001 | Todo asiento cuadra: débitos igual a créditos. | Constraint en la base, no solo validación en código. | CÓDIGO |
| ACC-002 | Los asientos son append-only; se corrigen por reversión. | No existe update ni delete sobre asientos. | CONTRATO (GOV-005/009) |
| ACC-003 | Cada asiento pertenece a una gestión y a un período. | Asiento sin contexto falla con `EVENT_CONTEXT_REQUIRED`. | CONTRATO (GOV-001) |
| ACC-004 | **El plan de cuentas es configuración de la organización, no del código.** | Cambiar el plan no exige desplegar. | **TBD — bloqueante** |
| ACC-005 | **Cada operación de negocio tiene definido qué asiento produce.** | Existe una matriz operación→asiento aprobada y probada. | **TBD — bloqueante** |
| ACC-006 | Un pago aprobado genera asiento con la tasa congelada al cargar la evidencia. | El asiento conserva la tasa, no la del día de aprobación (DEC-009). | DEC |
| ACC-007 | La anulación de un comprobante genera asiento de reversión, nunca borrado. | El original permanece `VOID` (PAY-015). | CONTRATO |
| ACC-008 | Un sobrepago no genera obligación de devolución; queda como saldo a favor. | No aparece cuenta por pagar al peregrino (DEC-008). | DEC |
| ACC-009 | Una cancelación no genera egreso; el saldo permanece a favor. | No hay asiento de salida de dinero (DEC-007). | DEC |
| ACC-010 | Los importes se guardan en decimal exacto, con moneda explícita. | Ningún `float` en el módulo. | CÓDIGO |
| ACC-011 | Una conversión conserva importe original, tasa aplicada y resultado. | Los tres campos son reconstruibles. | DEC (DEC-009) |
| ACC-012 | El cierre financiero congela el período. | Tras cerrar, no se admite asiento con fecha de ese período. | CONTRATO (EVT-010) |
| ACC-013 | La conciliación compara comprobantes emitidos, asientos y arqueos de caja. | Las tres fuentes deben coincidir; la diferencia se reporta. | ALCANCE |
| ACC-014 | Los reportes contables son reproducibles. | Mismo período consultado dos veces produce el mismo resultado. | ALCANCE |

## 8. NOT — Notificaciones

| ID | Requisito | Criterio verificable | Procedencia |
|---|---|---|---|
| NOT-001 | La configuración SMTP es global y única, sin `event_id`. | Coherente con GOV-007. | CONTRATO |
| NOT-002 | Las plantillas son globales y versionadas. | Cambiar una plantilla no altera los envíos ya realizados. | CÓDIGO |
| NOT-003 | El envío ocurre en el worker; un fallo de correo nunca revierte la operación. | Coherente con GOV-008. | CONTRATO |
| NOT-004 | Todo envío es reintentable, con espera creciente y máximo de intentos. | Agotados los intentos queda en estado de fallo visible. | CONTRATO (GOV-008) |
| NOT-005 | Cada envío registra destinatario por identificador, plantilla, resultado y fecha. | El registro no guarda el cuerpo ni el correo en claro. | CONTRATO (PII) |
| NOT-006 | Un mismo hecho de negocio no envía dos veces el mismo correo. | Idempotencia por clave de evento. | CONTRATO (GOV-006) |
| NOT-007 | El peregrino consulta sus notificaciones en `/mi-cuenta/notificaciones`. | La ruta existe en el contrato. | CONTRATO |
| NOT-008 | Los correos transaccionales no admiten baja; los informativos sí. | Distinción por tipo de plantilla. | INFERIDO · **TBD: ¿existen informativos en v1?** |
| NOT-009 | No hay integración con Google Sheets ni con mensajería externa en v1. | Coherente con DEC-017 y DEC-015. | DEC |
| NOT-010 | Una caída de SMTP es visible en el panel, no solo en logs. | Existe indicador de estado del canal de correo. | ALCANCE |

## 9. CRD — Credenciales y QR

| ID | Requisito | Criterio verificable | Procedencia |
|---|---|---|---|
| CRD-001 | Solo una inscripción `CONFIRMED` puede emitir credencial. | Emisión sobre `SUBMITTED` falla. | INFERIDO |
| CRD-002 | El token de credencial es opaco y no contiene PII. | Inspeccionar el QR no revela nombre, documento ni correo. | CONTRATO |
| CRD-003 | El token se almacena por hash, nunca en claro. | Un volcado de base no permite reconstruir tokens. | CONTRATO |
| CRD-004 | Revocar una credencial invalida el token y permite emitir otro. | El token viejo deja de validar de inmediato. | CONTRATO |
| CRD-005 | El escaneo valida gestión, vigencia, estado de inscripción y estación. | Cada corte produce su propio error. | ALCANCE |
| CRD-006 | El escaneo es idempotente por token, beneficio y ventana. | Doble escaneo no produce doble entrega (FOOD-004). | CÓDIGO |
| CRD-007 | Las estaciones de escaneo se identifican y autorizan por código. | La ruta `/scanner/e/[eventCode]/[stationCode]` exige `credential.scan`. | CONTRATO |
| CRD-008 | El escáner opera sin conexión y sincroniza al recuperarla. | Prueba con red caída durante el escaneo. | ALCANCE |
| CRD-009 | La sincronización no puede producir entregas duplicadas. | Reenviar el mismo lote dos veces es inocuo. | CONTRATO (GOV-006) |
| CRD-010 | El tamaño de credencial y comprobante es configurable. | Coherente con DEC-010. | DEC |
| CRD-011 | La verificación pública no revela PII. | Coherente con PAY-013. | CONTRATO |
| CRD-012 | Las URL con token quedan fuera de buscadores. | `robots.txt` y cabecera `noindex`. | CÓDIGO |

## 10. TRA — Transporte

> **La familia con menos anclaje documental de todo el documento.** El módulo solo aparece nombrado en `requirements.md` §2 y en los permisos `transport.*`. Casi todo lo que sigue lo escribí yo. Léela con más desconfianza que las demás.

| ID | Requisito | Criterio verificable | Procedencia |
|---|---|---|---|
| TRA-001 | Una ruta pertenece a una gestión y define origen, destino, fecha y hora. | Ruta sin gestión falla. | ALCANCE |
| TRA-002 | Un vehículo tiene capacidad y no admite asignaciones por encima de ella. | Prueba de última plaza concurrente. | INFERIDO |
| TRA-003 | Una persona no puede estar en dos rutas que se solapan en el tiempo. | Asignación solapada falla. | INFERIDO · **revisar: puede ser demasiado estricto** |
| TRA-004 | Asignar transporte exige `transport.assign` y queda auditado. | Actor, pasajero, ruta y fecha. | CONTRATO |
| TRA-005 | El transporte no altera el precio del paquete. | El cargo congelado no cambia al asignar ruta. | CONTRATO (REG-002) |
| TRA-006 | La llegada tardía no elimina automáticamente el transporte incluido. | Coherente con MAT-002 y DEC-004. | DEC |
| TRA-007 | El control de abordaje usa la misma credencial QR. | No existe un segundo tipo de token. | INFERIDO |
| TRA-008 | El listado de pasajeros es exportable con el mínimo de datos necesarios. | Sin documento ni domicilio. | INFERIDO · **TBD: ¿el conductor necesita teléfono de contacto?** |

## 11. SRV — Servidores y comisiones

| ID | Requisito | Criterio verificable | Procedencia |
|---|---|---|---|
| SRV-001 | Un servidor es una persona con rol operativo dentro de una comisión de la gestión. | Sin comisión no hay rol de servidor. | ALCANCE |
| SRV-002 | Las comisiones se configuran por gestión. | La ruta `/comision/e/[eventCode]/[commissionCode]` existe. | CONTRATO |
| SRV-003 | Un servidor puede pertenecer a más de una comisión. | Los permisos se acumulan por scope. | INFERIDO · **TBD: ¿lo permite el negocio?** |
| SRV-004 | Un turno define comisión, fecha, hora inicial y final. | `ends_at > starts_at`, como en FOOD-001. | ALCANCE |
| SRV-005 | Asignar turno exige `server.shift.assign` y queda auditado. | Permiso presente en el contrato. | CONTRATO |
| SRV-006 | Una persona puede ser servidor y peregrino a la vez. | Son roles distintos sobre la misma identidad; no se duplica la persona. | INFERIDO |
| SRV-007 | El acceso del servidor se limita al scope de su comisión. | Coherente con RBAC-009. | CONTRATO |
| SRV-008 | Dar de baja a un servidor conserva su histórico de turnos y entregas. | Coherente con GOV-009. | CONTRATO |

## 12. REP — Reportes y exportaciones

| ID | Requisito | Criterio verificable | Procedencia |
|---|---|---|---|
| REP-001 | Todo reporte se calcula sobre una gestión explícita. | Coherente con GOV-001. | CONTRATO |
| REP-002 | Los reportes leen del histórico, no de contadores desincronizables. | Coherente con HOS-008 y MAT-003. | CONTRATO |
| REP-003 | Exportar exige `report.export`, distinto de `report.read`. | Ambos permisos existen por separado. | CONTRATO |
| REP-004 | Toda exportación queda auditada con actor, reporte, filtros y fecha. | Registro presente tras exportar. | ALCANCE |
| REP-005 | Las exportaciones con PII se sirven con URL firmada y caducidad. | Coherente con PAY-004. | CONTRATO |
| REP-006 | Un reporte sobre gestión cerrada devuelve el snapshot, no un recálculo. | Coherente con EVT-010. | CONTRATO |
| REP-007 | Los reportes muestran fechas en la zona horaria de la gestión. | Almacenamiento en UTC, presentación local. | CONTRATO |
| REP-008 | Todo importe indica su moneda. | Ninguna cifra sin moneda en la exportación. | CONTRATO |

## 13. AUD — Auditoría

| ID | Requisito | Criterio verificable | Procedencia |
|---|---|---|---|
| AUD-001 | La auditoría es append-only a nivel de base. | Trigger de inmutabilidad, no solo disciplina del código. | CÓDIGO |
| AUD-002 | Cada registro guarda actor, acción, entidad, versión, motivo y fecha UTC. | Los seis campos presentes. | CÓDIGO |
| AUD-003 | La PII se redacta en el registro de auditoría. | Un volcado de auditoría no expone datos personales. | CÓDIGO |
| AUD-004 | Leer la auditoría exige `audit.read`. | Permiso presente en el contrato. | CONTRATO |
| AUD-005 | El rol de la aplicación no es propietario de las tablas auditadas. | `TRUNCATE` desde el rol de aplicación falla. | **PENDIENTE desde P03** |
| AUD-006 | Los triggers de inmutabilidad sobreviven a la restauración de un respaldo. | Ya verificado por `restore-drill.sh`. | CÓDIGO |

## 14. PRV — Privacidad y retención

| ID | Requisito | Criterio verificable | Procedencia |
|---|---|---|---|
| PRV-001 | La retención de datos personales es indefinida en v1. | Coherente con DEC-011. | DEC |
| PRV-002 | Debe poder anonimizarse una persona sin romper la integridad contable. | Los asientos sobreviven a la anonimización. | INFERIDO · **TBD — riesgo abierto de DEC-011** |
| PRV-003 | Los archivos de evidencia son privados, con URL firmada. | Acceso directo sin firma falla. | CONTRATO (PAY-004) |
| PRV-004 | La PII no viaja en URL, query string, QR ni logs. | Revisión automatizada de rutas y del logger. | CÓDIGO |
| PRV-005 | Los datos de menores no llegan a almacenarse. | El rechazo de DEC-006 precede a la persistencia. | DEC |
| PRV-006 | Los respaldos se cifran antes de escribirse a disco. | Nunca existe un volcado en claro, ni transitoriamente. | CÓDIGO |

## 15. OPS — Operación y observabilidad

| ID | Requisito | Criterio verificable | Procedencia |
|---|---|---|---|
| OPS-001 | PostgreSQL y Redis no publican puertos al exterior. | Solo Caddy expone 80 y 443 (DEC-001). | CÓDIGO |
| OPS-002 | El arranque falla si falta una variable de entorno crítica. | `${VAR:?}` en todas las críticas. | CÓDIGO |
| OPS-003 | RPO de 1 hora y RTO de 4 horas. | Coherente con DEC-012. | DEC |
| OPS-004 | El respaldo se copia fuera del VPS. | Existe copia verificable en almacenamiento externo. | **PENDIENTE — bloquea el go** |
| OPS-005 | La restauración se ensaya sobre base desechable, sin tocar producción. | `restore-drill.sh` ya lo hace. | CÓDIGO |
| OPS-006 | Existe endpoint de salud que no expone información sensible. | Responde `ok` sin detalles de infraestructura. | CÓDIGO |
| OPS-007 | Los procesos de fondo corren en el worker, separados de web. | Expiración de `HELD` y envío de correo fuera del proceso web. | DEC (DEC-001) |
| OPS-008 | La disponibilidad objetivo durante el evento es 99,9%. | Coherente con `requirements.md` §10. | CONTRATO |

---

## 16. Qué necesito de ti

Ordenado por lo que más cambia el resultado:

1. **ACC-004 y ACC-005.** El plan de cuentas y la matriz operación→asiento. Sin esto el módulo contable no lleva libros, solo cuadra números. Es el pendiente de mayor impacto de todo el proyecto.
2. **La familia TRA completa.** Si tienes las reglas reales de transporte, descarta lo que escribí y sustitúyelo. TRA-003 en particular puede estar prohibiendo algo perfectamente legítimo.
3. **Los ocho `TBD`** repartidos: IDN-006, IDN-009, PRE-004, NOT-008, TRA-003, TRA-008, SRV-003, PRV-002.
4. **Las ausencias.** Lo más valioso que puedes aportar leyendo esto no es corregir lo que está, sino notar lo que falta. Un módulo entero de la v2.6 que aquí no aparezca es un hallazgo mayor que cualquier corrección de redacción.

## 17. Cómo promover un requisito a canónico

Cuando apruebes uno:

1. Mueve su texto a `docs/01-product/requirements.md`, en la sección que le corresponda.
2. Añade su identificador a `contracts/requirements.json` con `"status": "CANONICAL"`.
3. Actualiza `contracts/phase-requirement-map.json` con la fase que lo implementa.
4. Elimínalo de este documento.

Este archivo desaparece cuando esté vacío. Mientras exista, es constancia de que la migración desde la v2.6 sigue incompleta.
