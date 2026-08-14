ENCUENTRO DE LA MANSIÓN
Módulo de Servidores — Versión consolidada (jerarquía, registro y pagos)
Este documento reemplaza y amplía la primera ficha del módulo de Servidores. Integra la jerarquía real de áreas y comisiones, el mecanismo de cuentas para encargados/coordinadores, el flujo de solicitud y aprobación de servidores, el pago de inscripción configurable, y la auditoría de actividad. Queda listo para pasar a esquema de base de datos y pantallas.
## 1. Jerarquía y niveles de cuenta

| Nivel | Alcance | Cómo obtiene acceso |
|---|---|---|
| Administrador master | Todo el sistema | Cuenta creada al desplegar el sistema (Dirección / Coordinación general). |
| Encargado de área | Todas las comisiones de su área | Usuario temporal creado por el administrador master (ver sección 2). |
| Coordinador de comisión | Solo su comisión | Usuario temporal creado por el administrador master o por el encargado de su área. |
| Servidor | Su propio panel y tarea | Autorregistro público + solicitud a una comisión (ver sección 3). |

Los encargados y coordinadores no pasan por el flujo de solicitud: son nombrados desde la organización del encuentro (ver documento "Estructura de Áreas y Comisiones") y se les da acceso directo. Los servidores base sí pasan por solicitud y aprobación, porque son quienes se inscriben libremente.
## 2. Usuarios temporales para encargados y coordinadores
Admin master registra a la persona (nombre, correo, área/comisión)  →  Sistema genera usuario + contraseña temporal  →  Se envía por correo (o se muestra para entregar en persona)  →  Primer login: cambio de contraseña obligatorio  →  Acceso habilitado a su(s) panel(es)
El usuario temporal expira si no se usa en un plazo definido (ej. 7 días), y el admin master puede regenerarlo.
Un encargado de área puede, a su vez, crear usuarios temporales para los coordinadores de su área (delegación), sin necesidad de pasar siempre por el admin master.
Si una persona coordina más de una comisión (ej. Ingrid Barranco en Liturgia y Logística), su mismo usuario se vincula a ambas comisiones — no se le crean cuentas duplicadas.
## 3. Flujo de registro y aprobación del servidor
Servidor crea su cuenta  →  Completa datos base + elige comisión  →  Formulario específico según comisión  →  Envía solicitud  →  Solicitud pendiente
Coordinador revisa la solicitud  →  Rechaza → notifica motivo  →  Acepta → ¿pago de servidor activado?
No requiere pago  →  Activo directamente  →  Credencial QR + turnos
Sí requiere pago  →  Aceptado, pendiente de pago  →  Paga (online o en caja)  →  Activo  →  Credencial QR + turnos
El pago se pide después de que el coordinador aprueba, no antes — así no se cobra a alguien que finalmente no encaja en la comisión.
## Estados de la solicitud/servidor
Solicitud pendiente
Rechazado
Aceptado — pendiente de pago (solo si el pago está activado)
Activo
Suspendido
De baja
Finalizado
## 4. Pago de inscripción de servidor
Decisión: un solo interruptor global por evento (no por comisión), configurable por el administrador master.

| Configuración | Detalle |
|---|---|
| Interruptor | Inscripción de servidores: Gratuita / De pago |
| Monto y moneda | Si es "De pago", el admin master define un monto único aplicable a todos los servidores |
| Motor de pago | Reutiliza el mismo motor que peregrinos: pasarela internacional, QR Simple Bolivia, o caja presencial (efectivo Bs/USD/QR) |
| Momento | Se solicita solo después de que el coordinador aprueba la solicitud del servidor |
| Reportes | Los pagos de servidores se registran con un tipo distinto ("inscripción de servidor") para no mezclarse con los pagos de peregrinos, aunque comparten el motor |

Si en el futuro se necesita diferenciar el monto por comisión, la tabla server_payment_config puede extenderse con un commission_id opcional sin romper el diseño actual — se deja como posible mejora futura, no como parte de esta fase.
## 5. Auditoría de actividad
Toda acción de encargados, coordinadores y servidores queda registrada (quién, qué acción, sobre qué, cuándo). Ejemplos:
Encargado entra al panel de una comisión de su área.
Coordinador acepta o rechaza una solicitud de servidor.
Coordinador asigna o modifica un turno.
Servidor escanea un QR (alimentos, materiales, transporte).
Administrador master activa/desactiva el pago de servidores o cambia el monto.
Cualquier cambio de estado (aprobación, pago confirmado, suspensión, baja).
El administrador master ve la auditoría completa; el encargado de área ve solo la auditoría de su área.
## 6. Catálogo de roles por comisión (comisiones reales)
La mayoría de comisiones solo necesita el formulario base (datos personales + rol/función simple). Un grupo más pequeño necesita campos adicionales porque su trabajo implica recursos físicos (vehículos, habitaciones, dinero, alimentos) o datos profesionales.
## Comisiones con formulario especializado

| Comisión | Campos adicionales |
|---|---|
| Transporte | Tipo de vehículo (auto/camioneta/vagoneta/minibús/bus/camión), placa, capacidad de pasajeros, licencia profesional, zona de cobertura, horario y días de servicio |
| Hospedaje | Hotel(es) asignado, función (recepción/limpieza/control de acceso), disponibilidad para turnos nocturnos |
| Alimentación (las 5 subcomisiones) | Función (cocina/reparto/lavado/inventario), turno (desayuno/almuerzo/cena/refrescos), manipulación de alimentos (carnet de sanidad) |
| Material Peregrino | Función (armado/entrega/inventario), vehículo propio para carga (sí/no) |
| Inscripción | Función (caja/registro/atención de fila), maneja efectivo (sí/no), idiomas que habla |
| Servicios Médicos | Profesión, N.º de colegiatura/licencia, especialidad, disponibilidad para guardia nocturna |
| Cambio de Moneda | Monedas que maneja, experiencia contable/cajero |
| Orden y Seguridad | Experiencia en seguridad (sí/no), zona asignada |
| Apoyo Logístico y Lector QR | Punto/zona de control de escaneo |

## Comisiones con formulario base (sin campos especiales)
Sanación Interior, Intercesión y Don de Lenguas, Adoración al Santísimo (Espiritualidad y Liturgia), Sacristía, Ministros de Comunión, Lectores en Misa, Ornamento y Altar, Arreglo Floral del Altar, Confecciones, Ministerios de Canto, Limpieza, Jardinería, Web y Redes, Apoyo Estudio La Mansión, Planificación y Radio, Talleres, Informaciones, Jornada de Sanación y Adoración, Desayuno/Almuerzo Sacerdotes, Venta de Poleras, Venta de Libros y Souvenirs, Administración de Alimento, Acogida, Maletas.
## 7. Estructura de base de datos (actualización)

| Tabla | Campos clave | Notas |
|---|---|---|
| areas | id, event_id, name, manager_user_id | Encargado de área. |
| commissions | id, area_id, event_id, name, needs_specialized_form | Catálogo de comisiones reales. |
| commission_coordinators | id, commission_id, user_id | Permite 1 a 3 coordinadores por comisión. |
| temp_credentials | id, user_id, temp_password_hash, must_change_password, expires_at | Usuarios temporales de encargados/coordinadores. |
| server_requests | id, user_id, commission_id, form_data (jsonb), status, reviewed_by, reviewed_at, rejection_reason | Solicitud de servidor con datos dinámicos según comisión. |
| server_payment_config | event_id, is_paid, amount, currency | Interruptor global de pago de servidor. |
| server_payments | id, server_id, amount, currency, method, channel, status | Reutiliza estructura de payments con type = inscripción de servidor. |
| audit_logs | id, user_id, action, entity, entity_id, timestamp | Ya definida en la arquitectura general; se refuerza su uso aquí. |

## 8. Pantallas nuevas o actualizadas
Admin master: interruptor y monto de pago de inscripción de servidor.
Admin master: gestión de áreas y comisiones (crear/editar, asignar encargados y coordinadores, generar usuario temporal).
Pantalla de primer login / cambio de contraseña obligatorio (encargados y coordinadores).
Formulario de solicitud de servidor (dinámico: base + campos según comisión elegida).
Panel del coordinador: bandeja de solicitudes pendientes (aceptar/rechazar) + seguimiento de pagos pendientes de su comisión.
Panel del servidor: estado de su solicitud (pendiente / aceptado, pendiente de pago / activo / rechazado) y botón de pago si corresponde.
Reporte de auditoría (admin master: todo; encargado de área: su área).
## Próximos pasos
Con esto, el módulo de Servidores queda completo a nivel de diseño: jerarquía, cuentas, registro, pago condicional, auditoría y roles por comisión. El siguiente paso natural es convertir esto en el esquema de Prisma definitivo y las pantallas de Next.js para incorporarlo al proyecto final, junto con los demás módulos ya definidos (peregrino, pagos, comisiones operativas).