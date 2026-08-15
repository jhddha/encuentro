# Sistema web ENCUENTRO — Requisitos funcionales y reglas de negocio v2.7

**Fuente canónica de producto**  
**Fecha:** 22 de julio de 2026

## 0. Propósito

Este documento define qué debe hacer el sistema. La arquitectura, contratos, diseño, prototipo, prompts, código y pruebas deben respetarlo. Ante un vacío, se registra una decisión; no se inventa comportamiento.

## 1. Glosario

| Término | Definición canónica |
|---|---|
| Gestión | Edición anual del Encuentro, identificada por `event_id`. |
| Pago anticipado | Modalidad con precio reducido, fecha límite y elección de hotel tras aprobación mínima del 50%. |
| Pago al llegar | Modalidad con precio normal y hotel según disponibilidad restante. |
| Canal de pago | Medio concreto: QR Bolivia, cuenta/enlace EE. UU., efectivo o QR en caja. |
| Comprobante bancario | Evidencia cargada por el peregrino; no confirma dinero por sí sola. |
| Comprobante de pago | Documento interno emitido por cada pago aprobado. |
| Estado de cuenta | Resumen dinámico de cargos, pagos y saldo. |
| Paquete privado | Paquete no visible al público, asignable solo por Inscripciones. |
| Reserva `HELD` | Retención temporal pendiente de confirmación, sujeta a DEC-005. |
| Reserva `CONFIRMED` | Reserva confirmada que no se libera por llegada tardía. |

## 2. Alcance v1

Incluye gestiones, usuarios/RBAC, preinscripción, inscripción presencial, catálogo, pagos manuales, cajas, hospedaje, transporte, alimentos, materiales, servidores, credenciales/QR, contabilidad simplificada, notificaciones, reportes, auditoría y observabilidad.

Excluye checkout automático, facturación fiscal, presupuestos, centros de costo visibles, microservicios, app nativa y prorrateo por días transcurridos.

## 3. Invariantes transversales

| ID | Regla | Criterio verificable |
|---|---|---|
| GOV-001 | Todo registro transaccional aplicable pertenece a una gestión. | Una operación sin contexto falla con `EVENT_CONTEXT_REQUIRED`. |
| GOV-002 | Las fechas no cambian automáticamente el estado. | El estado solo cambia por transición manual auditada. |
| GOV-003 | `ACTIVE` e `IN_PROGRESS` permiten nuevas inscripciones y pagos. | E2E antes del evento, día 1, día 3 y último día. |
| GOV-004 | Solo `OPERATIONALLY_CLOSED` y posteriores bloquean operaciones ordinarias. | UI y API usan el mismo error. |
| GOV-005 | Históricos financieros y operativos no se reescriben. | Corrección por reversión, ajuste o anulación. |
| GOV-006 | Toda mutación sensible valida permiso, scope, estado, versión e idempotencia. | La API rechaza bypass de UI. |
| GOV-007 | SMTP, reglas y plantillas son globales. | No llevan `event_id`. |
| GOV-008 | Una falla de integración no revierte una operación confirmada. | Trabajo reintentable en worker. |
| GOV-009 | No hay hard delete para pagos, recibos, asientos, cierres, entregas o auditoría. | Repositorios carecen de borrado físico. |
| GOV-010 | El agente no resuelve decisiones abiertas. | El validador y los prompts detienen el alcance dependiente. |

## 4. Estados canónicos

### 4.1 Gestión

`DRAFT -> READY -> ACTIVE -> IN_PROGRESS -> OPERATIONALLY_CLOSED -> FINANCIALLY_CLOSED -> ARCHIVED`

`READY -> DRAFT` se permite para corregir configuración. `ACTIVE -> OPERATIONALLY_CLOSED` exige motivo. No existe `REGISTRATION_CLOSED`.

### 4.2 Inscripción, pago y asistencia

- Inscripción: `DRAFT`, `SUBMITTED`, `CONFIRMED`, `CANCELLED`.
- Pago calculado: `UNPAID`, `PARTIAL`, `PAID`, `OVERPAID`, `REFUNDED`.
- Asistencia: `NOT_ARRIVED`, `CHECKED_IN`, `NO_SHOW`, `COMPLETED`.
- Evidencia de pago: `PENDING_UPLOAD`, `SUBMITTED`, `UNDER_REVIEW`, `APPROVED`, `REJECTED`, `CORRECTION_REQUESTED`, `REPLACED`, `CANCELLED`.
- Pago: `PENDING`, `SUCCEEDED`, `CANCELLED`, `PARTIALLY_REFUNDED`, `REFUNDED`.
- Reserva: `HELD`, `CONFIRMED`, `RELEASED`, `CANCELLED`, `EXPIRED`.
- Inscripción de servidor: `PENDING`, `REJECTED`, `AWAITING_PAYMENT`, `ACTIVE`, `SUSPENDED`, `WITHDRAWN`, `COMPLETED` (SRV-014).

## 5. Gestión y configuración

| ID | Requisito | Criterio |
|---|---|---|
| EVT-001 | ADMIN_MASTER crea una gestión con código y año únicos. | Duplicado falla. |
| EVT-002 | La gestión define nombre, fechas, zona horaria, moneda, duración, noches, oferta, métodos, cajas, comisiones y términos. | No pasa a READY con bloqueo crítico. |
| EVT-003 | Las transiciones son manuales, transaccionales y auditadas. | Actor, motivo, versión y fecha quedan registrados. |
| EVT-004 | `ACTIVE` publica y habilita inscripción/pago. | Landing resuelve una única gestión pública. |
| EVT-005 | `IN_PROGRESS` mantiene inscripción, pago, credencial y operación completa. | No crea una tarifa por día transcurrido. |
| EVT-006 | Solo una gestión puede estar públicamente habilitada. | Constraint/lock impide dos. |
| EVT-016 | `start_at` y `end_at` son configurables; la UI muestra el total de días y valida que el fin sea posterior al inicio. La referencia actual son 8 días, sin valor fijo en código. | Prueba con otra duración; la UI calcula y muestra el total. |
| EVT-009 | El cierre operativo valida cajas, sync y bloqueos. | No cierra con pendientes críticos. |
| EVT-010 | El cierre guarda snapshot inmutable. | Reproducible desde auditoría. |
| EVT-012 | El cierre financiero solo ocurre después del operativo. | Una transición inválida falla con `EVENT_TRANSITION_INVALID`. |
| EVT-014 | `ARCHIVED` es solo lectura. | Toda mutación falla con `EVENT_ARCHIVED`. |
| EVT-015 | El selector de gestión es obligatorio en los paneles privados. | Cambiar de gestión limpia filtros y caché dependiente. |
| EVT-017 | Hospedaje y Alimentos derivan las fechas de la gestión pero conservan sus propias configuraciones versionadas de noches y servicios. | Cambiar las fechas de la gestión no reescribe una configuración ya versionada. |
| EVT-007 | Una gestión futura puede existir en `DRAFT` o `READY` mientras otra está en curso. | No aparece en la landing ni mezcla datos con la gestión activa. |
| EVT-008 | La clonación de una gestión copia únicamente configuración versionada. | Cero peregrinos, pagos, comprobantes, credenciales, cajas, entregas o asientos heredados; tampoco asignaciones de rol. |

### 5.1 Qué copia la clonación y qué no

La regla de `EVT-008` está enunciada en negativo a propósito. El riesgo de clonar una gestión no es olvidar un hotel —eso se advierte de inmediato— sino arrastrar sin darse cuenta un peregrino, un pago o un asiento del año anterior.

| Se copia: configuración | No se copia: operación |
|---|---|
| Paquetes y sus versiones de precio | Inscripciones y reservas |
| Política de hospedaje | Evidencias, pagos y comprobantes |
| Hoteles y habitaciones | Sesiones de caja |
| Canales de pago | Credenciales |
| Servicios de alimentos | Entregas de alimentos y materiales |
| Artículos de inventario | Movimientos de inventario |
| Vehículos y estaciones | Traslados |
| Plan de cuentas | Asientos, notificaciones y auditoría |

**Las asignaciones de rol no se copian.** Los ámbitos de gestión, comisión y caja llevan `event_id`, así que un permiso concedido para una gestión no otorga nada en la siguiente: el acceso caduca solo al cambiar de edición. Copiarlas lo reactivaría sin que nadie lo revisara, y quien sirvió un año y no vuelve al siguiente conservaría el acceso. Además, `commissionId` y `cashAccountId` son códigos sin tabla propia, de modo que una asignación copiada apuntaría a lo que ese código signifique en la gestión nueva, que puede ser otra caja y otra comisión.

Copiar asignaciones desde la gestión anterior es una acción aparte, explícita y auditada, no un efecto secundario de clonar. Las asignaciones de ámbito global no se ven afectadas, porque no llevan `event_id`.

## 6. Catálogo, inscripción y precios

| ID | Requisito | Criterio |
|---|---|---|
| PKG-001 | Cada paquete pertenece a una gestión y tiene versiones históricas. | Cambiar precio no altera cargos existentes. |
| PKG-009 | `visibility` admite `PUBLIC` y `PRIVATE`. | El portal solo lista `PUBLIC`. |
| PKG-010 | Paquetes privados solo pueden ser vistos/asignados por Inscripciones con permiso. | Intento sin permiso falla y asignación queda auditada. |
| PKG-012 | Cada paquete puede definir tarifa anticipada y tarifa normal. | Ambas son montos explícitos, no descuento calculado obligatorio. |
| PKG-013 | La tarifa anticipada tiene inicio/fin, moneda, mínimo de pago y vencimiento de saldo. | Configuración versionada. |
| REG-019 | El peregrino selecciona exactamente una modalidad: anticipado o al llegar. | No se confunde con canal de pago. |
| PAY-001 | El cargo congela paquete, versión de precio, moneda e importe. | Histórico inmutable. |
| REG-020 | El pago anticipado aprobado al 50% conserva tarifa y habilita elección de hotel. | La carga sin aprobación no habilita. |
| REG-021 | Comprobante cargado dentro del plazo conserva tarifa aunque se revise después. | Prueba de borde de fecha. |
| REG-022 | Saldo restante puede pagarse al llegar sin repricing. | Mantiene el cargo original. |
| REG-023 | Durante `IN_PROGRESS` el importe no se prorratea. | Día 1, 3 y último día cobran el paquete completo. |
| PKG-011 | No existen tarifas tardías automáticas. | Solo paquete normal o privado previamente configurado. |
| HOS-015 | El peregrino elige hotel; Hospedaje asigna habitación. | UI pública no promete habitación específica. |
| PKG-003 | Los beneficios son datos estructurados, no texto libre exclusivo. | El QR valida un código de beneficio. |
| PKG-008 | Un beneficio no incluido se rechaza con código explicativo. | El escáner muestra `BENEFIT_NOT_INCLUDED`. |
| REG-009 | Cancelar una inscripción no elimina pagos, cargos, credenciales ni trazabilidad. | La credencial se revoca y el importe queda como saldo a favor (DEC-007). |
| REG-010 | El check-in registra actor, estación, fecha y gestión. | Un segundo check-in es idempotente. |
| REG-011 | `NO_SHOW` solo puede marcarse tras el final del evento o por acción autorizada. | Fecha validada y acción auditada. |
| REG-017 | `CONFIRMED` exige saldo requerido igual a cero o exención total aprobada; el pago parcial permanece `SUBMITTED`. | Política única de dominio, sin confirmación manual dispersa. |
| REG-018 | Un beneficio ya entregado no se elimina retroactivamente al cambiar de paquete. | Se crean revisión, ajuste, cargos correspondientes y auditoría. |

## 7. Pagos, evidencias, cajas y comprobantes

| ID | Requisito | Criterio |
|---|---|---|
| PAY-022 | v1 procesa pagos manuales, no checkout automático. | No existen webhooks productivos ni SDK obligatorio de pasarela. |
| PAY-023 | Canales anticipados: `BOLIVIA_QR_MANUAL`, `US_ACCOUNT_MANUAL`, `US_PAYMENT_LINK_MANUAL`. | Configurables y auditados. |
| PAY-024 | Canales al llegar: efectivo y QR, habilitables por gestión/caja. | Cajero solo usa canales activos. |
| PAY-018 | Evidencia registra monto, moneda, fecha, banco/plataforma, referencia, pagador y archivo privado. | Archivo no público; checksum. |
| PAY-025 | Subir evidencia no confirma el pago. | Solo `APPROVED` crea/confirma pago y asignación. |
| PAY-026 | Revisión registra aprobador, fecha, resultado y motivo. | Auditoría completa. |
| PAY-027 | Referencia duplicada se bloquea o marca para revisión. | `PAYMENT_DUPLICATE`. |
| PAY-002 | Un pago puede asignarse parcial o totalmente a cargos. | Saldo calculado, nunca editado manualmente. |
| PAY-028 | Cada pago aprobado genera un Comprobante de pago. | Un pago parcial produce su propio comprobante. |
| PAY-014 | Secuencia: `REC-{EVENT_CODE}-{NNNNNN}` única por gestión. | Concurrencia no duplica. |
| PAY-029 | Pie del documento: “Documento de control interno”. | Validación visual/PDF. |
| PAY-030 | Datos del peregrino: nombre, código de inscripción y paquete. | No incluye documento ni país. |
| PAY-031 | QR público verifica validez, número, evento, fecha, monto, moneda y estado sin PII. | Cualquier cámara abre la URL. |
| PAY-032 | Detalle completo requiere autenticación y `receipt.read_sensitive`. | Acceso anónimo no expone PII. |
| PAY-033 | El comprobante emitido es inmutable; corrección por anulación y nueva emisión. | Original permanece `VOID`. |
| PAY-011 | Todo cobro presencial ocurre en una sesión de caja abierta. | Sin sesión falla. |
| PAY-012 | Cierre compara esperado y contado por moneda/canal. | Diferencia exige motivo. |
| PAY-006 | Todo comando de cobro acepta clave de idempotencia. | Un reintento devuelve el mismo resultado. |
| PAY-019 | No se permiten importes negativos en pagos ni en asignaciones. | Constraint en base y validación en dominio. |
| PAY-020 | Una asignación no supera el saldo disponible del pago ni del cargo, salvo crédito explícito. | La transacción rechaza la carrera. |
| PAY-021 | El autoservicio solo paga cargos propios; caja y tesorería pueden aplicar un pago a varias inscripciones con permiso, pagador explícito y desglose. | No existe asignación transversal silenciosa. |

## 8. Hospedaje

| ID | Requisito | Criterio |
|---|---|---|
| HOS-011 | La gestión configura cantidad fija de noches y fechas de hospedaje. | Referencia actual 7 noches, modificable. |
| HOS-013 | La llegada tardía no reduce automáticamente el rango ni el precio. | `actual_arrival_at` no reescribe reserva. |
| HOS-012 | Una reserva `CONFIRMED` no se libera por ausencia al inicio. | Worker no la expira por no-show. |
| HOS-003 | `HELD` puede expirar únicamente según DEC-005. | Sin DEC-005 no se fija duración productiva. |
| HOS-016 | El anticipado aprobado habilita elegir hotel según disponibilidad. | Selección transaccional. |
| HOS-017 | Pago al llegar no reserva hotel anticipadamente. | Hotel se elige entre disponibilidad restante. |
| HOS-001 | La habitación la asigna Hospedaje. | Permiso y auditoría. |
| HOS-002 | Capacidad se controla por inventario/rango, no por contador desincronizable. | Prueba de último cupo concurrente. |
| HOS-005 | El cambio de habitación libera y reserva en una sola transacción. | No queda plaza perdida ni duplicada si el cambio falla a medias. |
| HOS-006 | La sobreasignación manual exige permiso, motivo y advertencia crítica. | Sin `lodging.override_capacity` la operación falla; con él queda auditada. |
| HOS-014 | La configuración de noches tiene una sola fuente versionada. | Editable desde Configuración de gestión y visible en Hospedaje según permiso; no hay dos valores en conflicto. |

## 9. Alimentos y materiales

| ID | Requisito | Criterio |
|---|---|---|
| FOD-001 | Alimentos configura servicios por fecha, tipo, hora inicial/final y cantidad disponible. | `ends_at > starts_at`. |
| FOD-006 | QR valida gestión, beneficio, fecha, horario, disponibilidad y duplicidad. | Fuera de ventana se rechaza. |
| FOD-002 | Pedido, recepción, desperdicio y entrega son movimientos separados. | Reporte reconciliable. |
| FOD-003 | Una persona recibe una vez cada servicio salvo override autorizado. | Constraint/idempotencia. |
| MAT-005 | Elegibilidad de materiales depende de paquete, inventario e historial. | No depende de actividad pasada. |
| MAT-004 | La llegada tardía no elimina automáticamente el material incluido. | Prueba día final. |
| MAT-003 | Entradas, salidas, ajustes, pérdidas, sobrantes y entregas son movimientos distintos y reconstruibles. | Stock deriva de movimientos; el sobrante no se confunde con un ajuste. |
| MAT-002 | La entrega de kit es única por tipo y persona, salvo override autorizado. | Constraint e idempotencia, como en `FOD-003`. |
| FOD-005 | El origen comprado, donado o pendiente se conserva en cada partida. | Un asiento de compra no puede confundirse con uno de donación en especie. |

## 10. Identidad, cuentas y permisos

| ID | Requisito | Criterio |
|---|---|---|
| IAM-001 | El correo normalizado es único; el correo visible conserva su formato original. | Un alta duplicada no revela a un usuario anónimo si la cuenta existe. |
| IAM-002 | Una persona puede participar en varias gestiones sin duplicar la cuenta. | Existe una inscripción por gestión y persona. |
| IAM-003 | No existe un rol en la tabla de usuarios; los roles se asignan con alcance. | La matriz de permisos se resuelve por asignaciones de rol, no por una columna. |
| IAM-004 | Acceso, recuperación y cambios sensibles tienen límite de intentos y auditoría. | Las pruebas de abuso reciben rechazo por exceso de intentos, sin enumerar cuentas. |
| IAM-005 | Las contraseñas se almacenan con hash resistente aprobado, nunca con cifrado reversible. | Ningún registro ni respuesta contiene una contraseña. |
| IAM-007 | Las sesiones pueden revocarse globalmente o por dispositivo. | Cambiar la contraseña revoca las sesiones según la política. |
| IAM-008 | Deshabilitar una cuenta impide nuevas sesiones y conserva el histórico. | Las operaciones previas siguen siendo atribuibles. |
| IAM-009 | ADMIN_MASTER no puede retirarse a sí mismo el último acceso global. | El intento falla con `LAST_ADMIN_REQUIRED`. |
| IAM-010 | Los permisos se verifican en la aplicación y los repositorios filtran por scope. | Pruebas negativas por rol. |
| IAM-011 | El autoservicio exige una cuenta con correo único; no se generan correos ficticios. | El formulario público rechaza el alta sin correo y no crea marcadores de posición. |
| IAM-012 | El personal autorizado puede crear persona e inscripción presencial sin cuenta ni correo. | El registro funciona sin cuenta; la vinculación posterior exige verificación y auditoría. |

El hueco en la numeración es deliberado: el requisito de v2.6 sobre segundo factor para roles privilegiados era un *gate* y quedó resuelto por **DEC-014**, así que su alcance vive en esa decisión y no se reescribe aquí. La equivalencia está registrada en [`requirement-migration-v2.6-to-current.md`](../04-delivery/requirement-migration-v2.6-to-current.md).

`IAM-003` omite deliberadamente la vigencia de las asignaciones de rol: no existe caso de uso de roles con caducidad y queda registrada como pendiente.

## 11. Auditoría

| ID | Requisito | Criterio |
|---|---|---|
| AUD-001 | El registro de auditoría es append-only. | La aplicación no expone actualización ni borrado. |
| AUD-002 | Registra actor, acción, entidad, antes y después limitados, motivo, IP, identificador de correlación y fecha. | Los eventos sensibles quedan completos. |
| AUD-003 | Los secretos y los datos excesivos no se guardan en auditoría. | Redacción probada. |
| AUD-004 | Las consultas de auditoría son paginadas y por permiso. | El rol auditor solo lee. |

`AUD-002` omite la cláusula de impersonación de v2.6: el sistema no tiene función de impersonar y registrar un campo para algo inexistente sería inventar estructura. Se recuperará si esa función llega a existir.

## 12. Credenciales y operación offline

| ID | Requisito | Criterio |
|---|---|---|
| QR-001 | El QR contiene un identificador opaco, nunca PII. | Decodificarlo no revela nombre ni documento. |
| QR-002 | Las credenciales pueden revocarse y reemitirse. | La anterior queda inválida sin borrar el histórico. |
| QR-003 | Las estaciones se registran por gestión, dispositivo y función. | Una estación revocada no sincroniza. |
| QR-004 | Cada operación usa identificador idempotente, gestión, estación y `captured_at`. | Repetirla devuelve el resultado original. |
| QR-005 | El servidor es autoritativo sobre beneficio, duplicidad y cierre. | El cliente no confirma por sí solo. |
| QR-006 | Una operación capturada antes del cierre puede sincronizar después, dentro de una ventana segura. | Prueba de corte temporal. |
| QR-007 | Una operación capturada después del cierre se rechaza. | Código `EVENT_OPERATIONALLY_CLOSED`. |
| QR-008 | No se confía exclusivamente en el reloj del dispositivo. | La sesión de estación incluye desfase o concesión firmada. |
| QR-009 | El almacenamiento local guarda solo los mínimos operativos. | Auditoría de PII local. |
| QR-010 | La entrega única se protege con constraint de base de datos. | Dos dispositivos producen una aceptación y un duplicado. |
| QR-011 | Los estados offline son visibles y accesibles. | Texto e icono además del color. |
| QR-012 | La cola local no se borra hasta la confirmación del servidor. | Recuperación tras un cierre abrupto. |
| QR-013 | El modo offline usa un manifiesto firmado, limitado por estación, función y gestión, y con expiración. | Datos manipulados o manifiesto vencido se rechazan; el resultado local se muestra como pendiente de sincronización. |

## 13. Transporte

| ID | Requisito | Criterio |
|---|---|---|
| TRN-001 | Vehículo y chofer tienen disponibilidad y capacidad. | Un conflicto o un exceso se rechaza. |
| TRN-002 | La llegada del peregrino puede actualizarse y dispara reevaluación. | La asignación afectada queda advertida. |
| TRN-003 | El traslado conserva origen, destino, horario, vehículo, chofer y pasajeros. | Histórico completo. |
| TRN-004 | Recogida y entrega se confirman por QR o por acción autorizada. | Actor, estación y fecha quedan registrados. |
| TRN-005 | Las carreras extra distinguen pagada, donada u otro concepto aprobado. | El impacto contable no se duplica. |
| TRN-006 | Un traslado completado no se edita; se corrige con un evento de ajuste. | Auditoría y estado histórico. |
| TRN-007 | Después del cierre no se crean traslados ordinarios. | La excepción requiere ventana autorizada. |
| TRN-008 | El coordinador solo ve su gestión y su comisión. | Prueba negativa. |

## 14. Servidores y comisiones

| ID | Requisito | Criterio |
|---|---|---|
| SRV-001 | El servidor tiene inscripción propia, comisión, función, horario y vigencia. | Un cambio no altera el histórico anterior: cierra la asignación vigente y abre otra, y solo hay una vigente a la vez. |
| SRV-002 | Los beneficios de servidor son explícitos y validables por QR. | No se asumen por rol genérico. |
| SRV-003 | Un servidor sin asignación no opera una estación restringida. | La API deniega. |
| SRV-004 | Una persona se inscribe en la gestión como peregrino **o** como servidor, nunca como ambos. | La base lo impide entre las dos tablas de inscripción, no solo la pantalla. |

### Jerarquía y cuentas

Los cuatro niveles vienen del documento de administración del 14 de agosto de 2026 ([`_incoming/modulo-servidores`](../_incoming/modulo-servidores/documento-administracion-2026-08-14.md)) y su forma técnica la fija [DEC-020](../04-delivery/decisions/DEC-020.md).

| ID | Requisito | Criterio |
|---|---|---|
| SRV-005 | El acceso tiene cuatro niveles: administrador master, encargado de área, coordinador de comisión y servidor. | Prueba negativa por nivel: ninguno alcanza lo del nivel superior. |
| SRV-006 | El encargado de área es coordinador de todas las comisiones de su área; su alcance es la unión de ellas. | No existe ámbito `AREA`; el alcance se comprueba comisión por comisión (DEC-020). |
| SRV-007 | Encargados y coordinadores reciben acceso directo, sin pasar por solicitud. | La solicitud es solo para el servidor base. |
| SRV-008 | Una comisión admite de uno a tres coordinadores. | El cuarto se rechaza. |
| SRV-009 | Quien coordina varias comisiones lo hace con una sola cuenta. | No se crean cuentas duplicadas por comisión. |
| SRV-010 | La credencial de acceso de encargados y coordinadores exige cambio en el primer uso y caduca si no se usa. | Caducada, no da acceso; el administrador puede regenerarla. |
| SRV-011 | El encargado de área puede crear la credencial de los coordinadores de su área. | Sin pasar por el administrador master. |

### Solicitud y aprobación del servidor

| ID | Requisito | Criterio |
|---|---|---|
| SRV-012 | El servidor se autorregistra y solicita a una comisión concreta. | Verificación de correo obligatoria (DEC-013), sin segundo factor (DEC-019). |
| SRV-013 | El coordinador acepta o rechaza la solicitud; el rechazo exige motivo y se notifica. | Sin motivo no se rechaza; el motivo llega a quien solicitó. |
| SRV-014 | La solicitud recorre los estados: pendiente, rechazada, aceptada pendiente de pago, activo, suspendido, de baja y finalizado. | La máquina de estados los declara y no admite saltos. |
| SRV-015 | El formulario de solicitud es el base más los campos que su comisión exija. | Una comisión sin campos propios no pide ninguno. |
| SRV-016 | El coordinador solo ve y resuelve las solicitudes de su comisión. | Prueba negativa contra la solicitud de otra comisión. |

### Pago de inscripción del servidor

| ID | Requisito | Criterio |
|---|---|---|
| SRV-017 | El importe de inscripción de servidor es único por gestión y **cero significa gratuito**. | No hay un interruptor aparte: el estado «cobra sin monto» no se puede escribir. |
| SRV-018 | El importe no se configura por comisión. | Un solo valor para todos los servidores de la gestión. |
| SRV-019 | El pago se solicita solo después de que el coordinador acepta la solicitud. | Nunca antes: no se cobra a quien no encaja en la comisión. |
| SRV-020 | El pago de servidor usa el mismo circuito manual que el del peregrino, sin checkout automático. | Canal, evidencia, revisión y comprobante (DEC-002, DEC-015, DEC-020). |
| SRV-021 | El ingreso por inscripción de servidor se reconoce en su propia cuenta, separado del ingreso por peregrinos. | Rol contable `SERVER_REGISTRATION_REVENUE` (DEC-020). |

### Auditoría del módulo

| ID | Requisito | Criterio |
|---|---|---|
| SRV-022 | Toda acción de encargados, coordinadores y servidores queda auditada con actor, acción, entidad e instante. | Incluye cambios de estado, resolución de solicitudes, turnos y escaneos. |
| SRV-023 | El administrador master ve la auditoría completa; el encargado de área, solo la de sus comisiones. | Prueba negativa contra la auditoría de otra área. |

## 15. Notificaciones

| ID | Requisito | Criterio |
|---|---|---|
| NTF-001 | Existe una única configuración SMTP global. | Singleton lógico y sin `event_id`. |
| NTF-002 | Solo ADMIN_MASTER modifica SMTP, reglas y plantillas. | Los demás roles reciben denegación. |
| NTF-003 | La contraseña SMTP nunca se almacena en la base ni se vuelve a mostrar. | Respuestas, registros y auditoría sin el secreto. |
| NTF-005 | Las plantillas son globales, versionadas y validan las variables permitidas. | El historial conserva la versión renderizada. |
| NTF-008 | Los trabajos son idempotentes y los procesa el worker. | Un evento repetido crea una sola entrega. |
| NTF-009 | Un fallo temporal se reintenta con espera creciente; uno permanente termina en cola muerta. | No revierte la operación de origen. |
| NTF-015 | Deshabilitar el correo no deshabilita las notificaciones internas ni el negocio. | Las operaciones continúan. |

`NTF-003` diverge del texto de v2.6, que pedía cifrar el secreto con clave externa a la base. La implementación es más estricta: la contraseña vive solo en el entorno y la tabla no tiene columna para ella.

## 16. Contabilidad

| ID | Requisito | Criterio |
|---|---|---|
| ACC-001 | La contabilidad es simplificada, por partida doble y no fiscal. | Todo asiento contabilizado cuadra débito contra crédito. |
| ACC-002 | Los asientos automáticos son únicos por tipo de fuente, identificador de fuente y tipo de asiento. | Un reintento no duplica. |
| ACC-003 | Un asiento contabilizado no se edita. | La reversión enlazada conserva el original. |
| ACC-013 | No existen presupuestos ni centros de costo visibles en v1. | Ni la interfaz ni el esquema los exigen. |
| ACC-015 | El cierre financiero bloquea nuevos asientos ordinarios. | Los ajustes posteriores usan periodo de ajuste. |
| ACC-016 | El rol auditor tiene lectura sin capacidad de aprobar ni modificar. | Prueba negativa. |
| ACC-004 | Los ingresos de inscripción nacen de pagos aprobados y de sus asignaciones, conforme a **DEC-018**. | El asiento se deriva del pago; no hay doble digitación. |
| ACC-005 | Una donación monetaria afecta a la cuenta financiera y genera asiento. | Cuadre contra la cuenta financiera. |
| ACC-006 | Una donación en especie o de servicio registra valoración y método, sin afectar caja. | Reporte económico separado del monetario. |
| ACC-007 | Todo egreso exige beneficiario, categoría, comisión, responsable y evidencia cuando aplique. | Campos y permisos validados. |
| ACC-008 | Un desembolso genera saldo por rendir. | No se marca gasto hasta la aprobación correspondiente. |
| ACC-009 | La rendición cuadra: desembolso igual a gastos aprobados más devolución más diferencia resuelta. | No se liquida si no cuadra. |
| ACC-010 | El reembolso de recursos propios exige aprobación y pago posterior. | Gasto y obligación quedan separados. |
| ACC-011 | Los activos registran origen, costo o valor, custodio, ubicación, estado y movimientos. | Una baja no elimina el historial. |
| ACC-012 | La conciliación compara la cuenta del sistema con el extracto o el conteo. | Toda diferencia tiene causa y resolución. |
| ACC-014 | La clasificación usa gestión, comisión, responsable, categoría y cuenta. | Los reportes filtran por esas dimensiones. |

Las reglas de reconocimiento —qué asiento genera cada operación— están fijadas por **DEC-018**: veintiún roles contables, tres resolvedores y una matriz de veintidós reglas. La decisión fija roles, no números de cuenta: la organización asigna a cada rol su cuenta del plan de la gestión, y **sin esa asignación el motor no puede resolver ningún asiento**.

## 17. No funcionales y observabilidad

| ID | Requisito | Criterio |
|---|---|---|
| NFR-001 | Disponibilidad durante el evento. | Objetivo del 99,9 % en la ventana operativa, con exclusiones documentadas. |
| NFR-002 | Rendimiento web. | p95 de lectura < 500 ms y de mutación común < 900 ms bajo carga aprobada, sin contar proveedor externo. |
| NFR-003 | Rendimiento del escáner. | Respuesta online p95 < 800 ms; offline confirma el guardado local en < 300 ms. |
| NFR-004 | Concurrencia. | Pruebas de último cupo, doble pago, doble entrega y doble cierre. |
| NFR-005 | Accesibilidad. | WCAG 2.2 AA en los flujos críticos. |
| NFR-006 | Responsive. | 390, 768, 1280, 1440 y 1920 px sin desbordamiento global. |
| NFR-007 | Seguridad. | OWASP ASVS nivel 2 como guía; los hallazgos críticos y altos bloquean el release. |
| NFR-011 | Navegadores. | Últimas dos versiones estables de Chrome, Edge, Firefox y Safari; la PWA prioriza Chromium sobre Android. |
| NFR-012 | Localización. | Español por defecto; fechas y moneda según la zona y la gestión. |
| NFR-013 | Zona horaria. | Almacenar en UTC y mostrar en la zona de la gestión; nunca la hora local del servidor. |
| NFR-014 | Dinero. | Decimal exacto; prohibido `float`. |
| NFR-015 | Migraciones. | Incrementales, reversibles cuando sea seguro, y probadas desde base vacía y con datos existentes. |
| OBS-001 | Los registros estructurados incluyen identificador de correlación, gestión cuando aplique y severidad. | Trazabilidad de petición a trabajo. |
| OBS-002 | Las métricas incluyen errores, latencia, colas, SMTP, sincronizaciones y disponibilidad. | Panel y alertas. |

Los huecos en la numeración son deliberados: los requisitos de v2.6 sobre respaldo, restauración y retención eran *gates* y quedaron resueltos por **DEC-012** y **DEC-011**, así que su alcance vive en esas decisiones. La equivalencia está en [`requirement-migration-v2.6-to-current.md`](../04-delivery/requirement-migration-v2.6-to-current.md).

`OBS-002` omite las métricas de *webhooks* porque **DEC-015** dejó esa integración fuera de alcance.

## 18. Decisiones

DEC-001 a DEC-017 están `APPROVED` en `docs/04-delivery/decision-register.md`. La política de reconocimiento contable sigue pendiente de decisión.
