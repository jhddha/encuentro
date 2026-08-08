# Triage de alcance: qué tiene que existir el día del Encuentro

**Fecha:** 7 de agosto de 2026
**Estado:** en revisión — requiere decisiones del responsable del proyecto

## Por qué existe este documento

El contrato declara **163 requisitos** desde la migración de la línea base v2.6. El sistema no cambió al migrar: lo que cambió es que ahora se ve lo que falta.

Este documento no es una lista de deseos ni un plan. Es el inventario verificado de qué está construido, para poder responder a una sola pregunta: **¿qué tiene que ser verdad el día del Encuentro?**

## El estado real, verificado en el código

No es «faltan cincuenta requisitos». Es más concreto y más desigual que eso.

| Capa | Estado |
|---|---|
| **Esquema de base de datos** | Completo: 40 modelos con sus constraints, triggers de inmutabilidad e índices de concurrencia |
| **Dominio** | Extenso: 12 módulos de reglas puras con 289 pruebas unitarias |
| **Capa de aplicación** | **4 casos de uso** — crear inscripción, transicionar gestión, expirar `HELD`, enviar notificaciones |
| **Pantallas** | 31 rutas: **12 con contenido real, 19 marcadores** |

Los informes de implementación fueron honestos sobre esto. El de P07 dice literalmente, en su apartado «Qué NO se implementó»: *«Pantallas de pagos, comprobantes y caja — las rutas existen desde P02»*. Las fases entregaron esquema, invariantes y reglas de dominio, y aplazaron deliberadamente la superficie operable.

**La consecuencia práctica:** hay cimientos sólidos y casi nada con lo que operar. Cobrar, revisar una evidencia, asignar una habitación, escanear una credencial o entregar una comida no tienen hoy ni pantalla ni caso de uso.

## Lo que ya funciona

| Ruta | Qué hace |
|---|---|
| `/` | Landing, resuelve la gestión pública |
| `/e/[eventCode]/inscripcion` | Formulario público de preinscripción |
| `/ingresar`, `/verificar-correo`, `/configurar-mfa` | Identidad completa: sesión, verificación y segundo factor |
| `/verificar/comprobante/[token]` | Verificación pública del comprobante, sin PII |
| `/admin/eventos`, `/admin/e/…/configuracion` | Alta y configuración de gestiones |
| `/admin/e/…/catalogo` | Paquetes y versiones de precio |
| `/admin/e/…/inscripciones` | Consulta de inscripciones |
| `/admin/e/…/dashboard`, `/auditoria` | Panel y consulta de auditoría |

Más los dos procesos de fondo de P16: expiración de `HELD` y envío de correo.

## Lo que falta, ordenado por el momento en que se necesita

### Antes del evento

| Falta | Ruta | Sin esto… |
|---|---|---|
| Panel del peregrino | `/e/…/mi-cuenta` | No puede consultar su estado de cuenta |
| Subir evidencia de pago | `/e/…/mi-cuenta/pagos` | **Nadie puede pagar por anticipado** |
| Revisar evidencias | `/admin/e/…/comprobantes`, `/pagos` | **Nadie puede aprobar un pago** |
| Elegir y asignar hotel | `/e/…/mi-cuenta/hospedaje`, `/admin/e/…/hospedaje` | El hospedaje se gestiona fuera del sistema |
| Confirmar inscripción | — | `REG-017` no está implementado: **el sistema no sabe decidir si alguien está inscrito** |

### En la llegada

| Falta | Ruta | Sin esto… |
|---|---|---|
| Caja y cobro presencial | `/caja/e/…/[cashCode]` | No se puede cobrar en el lugar |
| Credencial del peregrino | `/e/…/mi-cuenta/credencial` | No hay QR que escanear |
| Check-in | — | `REG-010` sin implementar |

### Durante el evento

| Falta | Ruta | Sin esto… |
|---|---|---|
| Escáner de credenciales | `/scanner/e/…/[stationCode]` | **No hay entrega controlada de comidas ni materiales** |
| Operación offline | — | Los ocho requisitos `QR-004` … `QR-013`: si falla la señal, se para la entrega |
| Alimentos y materiales | `/admin/e/…/alimentos`, `/materiales` | No hay control de inventario ni de duplicados |
| Transporte | `/admin/e/…/transporte` | Los ocho de `TRN` |
| Panel de comisión | `/comision/e/…/[commissionCode]` | Cada comisión trabaja fuera del sistema |

### Después del evento

| Falta | Ruta | Sin esto… |
|---|---|---|
| Contabilidad | `/admin/e/…/contabilidad` | Diez requisitos `ACC` habilitados por DEC-018 y sin motor que los aplique |
| Reportes y exportaciones | `/admin/e/…/reportes` | No hay cierre con números |
| Configuración de correo | `/admin/configuracion/correo` | SMTP solo configurable por base de datos |
| Notificaciones del peregrino | `/e/…/mi-cuenta/notificaciones` | — |

## Lo que necesito saber para clasificar

Puedo verificar qué está construido; eso es leer código. Lo que no está en el repositorio es **cómo se opera el Encuentro de verdad**, y sin eso cualquier prioridad que yo proponga sería inventada:

1. **¿Para cuándo es el Encuentro?** Los datos de prueba dicen noviembre de 2026, pero son datos de prueba.
2. **¿Cuántos peregrinos se esperan?** Con ochenta personas, media operación se lleva a mano; con ochocientas, no.
3. **¿Hay señal fiable donde se entregan comidas y materiales?** Es lo que decide si los ocho requisitos de operación offline son imprescindibles o prescindibles.
4. **¿Se organizan traslados?** `TRN` son ocho requisitos y tablas ya creadas, o trabajo innecesario.
5. **¿Los servidores se coordinan por el sistema o por fuera?** Lo mismo para `SRV`.
6. **¿El cobro presencial es masivo o excepcional?** Si casi todos pagan por anticipado, la caja puede esperar; si se cobra en la puerta, no.

## Respuestas del responsable del proyecto — 7 de agosto de 2026

| Pregunta | Respuesta | Consecuencia |
|---|---|---|
| Conectividad en el lugar | **Wifi o datos estables** | El escáner puede funcionar solo en línea. **Se aplazan los ocho requisitos `QR-004`, `QR-006` … `QR-009`, `QR-011` … `QR-013`** |
| Modalidad de cobro | **Mitad anticipado, mitad en caja** | **Ambos circuitos son imprescindibles**: evidencia y revisión, y caja con arqueo |
| Transporte | **Se opera por el sistema** | Los ocho de `TRN` entran |
| Servidores y comisiones | **Se operan por el sistema** | Los cuatro de `SRV` y el panel de comisión entran |
| Hospedaje con asignación | **Se opera por el sistema** | Elección de hotel y asignación de habitación entran |
| Alimentos y materiales | **Se operan por el sistema** | Control de entrega única e inventario entran |

### Riesgo aceptado sobre la operación offline

Aplazar `QR-004` … `QR-013` descansa por completo en que la señal no falle durante el evento. **No hay plan B**: si la conectividad cae en el punto de entrega, la entrega controlada se detiene y solo queda el papel.

Añadir el modo offline más tarde no es un añadido: cambia el modelo de datos del cliente y la forma de confirmar una entrega. Queda registrado como decisión consciente, no como olvido.

### Lo que implica el resto de las respuestas

De los diecinueve marcadores de pantalla, **dieciocho siguen siendo necesarios**. Se aplaza únicamente el modo offline dentro de la ruta del escáner, que sigue haciendo falta en su versión en línea.

Y la capa de aplicación tiene hoy **cuatro casos de uso**. Cobrar, revisar una evidencia, emitir un comprobante, abrir y cerrar caja, asignar habitación, registrar llegada, emitir y revocar credencial, escanear una entrega, mover inventario, asignar transporte y contabilizar son todos casos de uso que no existen.

**Falta el dato que decide si este alcance es viable: la fecha del Encuentro.**

## Qué haremos con las respuestas

Clasificar cada área en tres grupos, con el mismo método que funcionó en la migración —resolver lo evidente y consultar lo dudoso—:

- **Imprescindible:** sin ello el evento no se puede operar con el sistema.
- **Diferible:** se necesita, pero después del evento.
- **Manual:** se opera fuera del sistema y se acepta como tal, por escrito.

El resultado es una lista corta contra la que sí se puede juzgar un go, en vez de 163 requisitos en bruto y 19 pantallas por construir.
