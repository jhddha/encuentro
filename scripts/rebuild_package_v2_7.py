from pathlib import Path
from textwrap import dedent
from datetime import date
import json, hashlib, zipfile, shutil, os, re

ROOT = Path(__file__).resolve().parents[1]
# Safe rebuild: overwrite generated files in place; never delete the package root.

# Directories
for d in [
    'docs/01-product', 'docs/02-architecture/adr', 'docs/03-design',
    'docs/04-delivery/decisions', 'docs/implementation', 'prototypes', 'prompts',
    'contracts', 'scripts', '.claude/rules', '.claude/agents', '.claude/skills', '.claude/hooks',
    'generated-docx'
]:
    (ROOT/d).mkdir(parents=True, exist_ok=True)

VERSION = '2.7'
DATE = '22 de julio de 2026'


def write(rel, text, executable=False):
    p = ROOT/rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(dedent(text).strip() + '\n', encoding='utf-8')
    if executable:
        p.chmod(0o755)
    return p

# -------------------- README / Version --------------------
write('VERSION', VERSION)
write('README.md', f'''
# Sistema web ENCUENTRO — paquete documental canónico v{VERSION}

**Fecha de consolidación:** {DATE}  
**Estado:** CANDIDATO CANÓNICO PARA REVISIÓN  
**Objetivo de reemplazo:** v2.6 y parches separados DEC-001..DEC-004, después de verificar la migración completa.

## Objeto

Este paquete reúne en una única versión sincronizada las fuentes humanas, contratos legibles por máquina, configuración para Claude Code, prompts, prototipo HTML y registro de decisiones del Sistema web ENCUENTRO.

La versión v{VERSION} incorpora expresamente:

- **DEC-001:** infraestructura productiva OVHcloud VPS-3 y despliegue cloud-first.
- **DEC-002:** pagos manuales en v1, dos modalidades comerciales y verificación humana.
- **DEC-003:** formato, numeración y verificación del Comprobante de pago.
- **DEC-004:** precio completo durante `IN_PROGRESS`, duración configurable, noches fijas, alimentación por día/horario y paquetes privados.

## Jerarquía de fuentes

1. `docs/01-product/requirements.md`
2. `docs/04-delivery/decision-register.md` y decisiones aprobadas
3. `docs/02-architecture/system-architecture.md`
4. `docs/02-architecture/data-api-rbac.md`
5. `docs/03-design/design-system.md`
6. `docs/04-delivery/execution-plan.md`
7. `contracts/`
8. `prototypes/` como referencia visual secundaria

Ante conflicto, una decisión `APPROVED` posterior prevalece sobre texto anterior. El silencio documental no autoriza al agente a inventar.

## Contenido

- Documentación fuente Markdown en `docs/`.
- Documentos Word consolidados en `generated-docx/`.
- Prompts P00–P20 en `prompts/`.
- Prototipo integral en `prototypes/`.
- Configuración Claude Code en `CLAUDE.md`, `.mcp.json` y `.claude/`.
- Contratos JSON/YAML en `contracts/`.
- Validador documental en `scripts/validate_canonical_docs.py`.

## Validación

```bash
python scripts/validate_canonical_docs.py
```

El validador comprueba estructura, versión, decisiones, rutas, permisos, estados y referencias mínimas entre contratos.

## Nota de reconstrucción

La estructura v2.7 fue consolidada a partir de la documentación canónica v2.6 disponible en la Biblioteca del proyecto, la arquitectura local y las decisiones aprobadas en conversación. No conserva maquetación ni texto literal de todas las versiones históricas; las reemplaza por una fuente autocontenida y coherente.
''')

write('README_ACTUALIZACION_v2.7.md', f'''
# Actualización canónica v{VERSION}

## Motivo

Unificar la documentación v2.6 y los parches posteriores en un solo paquete fuente, eliminar contradicciones y reflejar DEC-001 a DEC-004 como decisiones `APPROVED`.

## Cambios principales

1. Infraestructura productiva definida con OVHcloud VPS-3, Ubuntu Server 24.04 LTS, Docker y procesos web/worker separados.
2. Se elimina del alcance v1 el checkout automático. El pago anticipado es remoto pero manualmente verificado.
3. Se definen dos modalidades: pago anticipado con precio reducido y elección de hotel; pago al llegar con precio normal y hotel según disponibilidad restante.
4. Se formaliza el Comprobante de pago, su secuencia por gestión y su QR de verificación pública mínima.
5. Durante `IN_PROGRESS` no existe prorrateo ni tarifa tardía automática.
6. La duración del evento y las noches de hospedaje son configurables; referencia actual: 8 días y 7 noches.
7. Alimentos se configura por servicio, día, cantidad y horario.
8. Se incorporan paquetes `PRIVATE` asignables solo por Inscripciones.
9. Se actualizan contratos, rutas, permisos, prompts, reglas Claude, prototipo y pruebas.

## Estado de decisiones

- DEC-001: APPROVED
- DEC-002: APPROVED
- DEC-003: APPROVED
- DEC-004: APPROVED
- DEC-005 y posteriores: continúan pendientes según `decision-register.md`.
''')

# -------------------- Decisions --------------------
decisions = [
    {
        'id':'DEC-001','title':'Infraestructura productiva y estrategia de despliegue','status':'APPROVED','date':'2026-07-13',
        'decision': 'Usar OVHcloud VPS-3 como infraestructura productiva inicial. El servidor ejecutará Ubuntu Server 24.04 LTS, Docker Engine y Docker Compose v2. La aplicación Next.js y el worker BullMQ serán procesos/contenedores separados. PostgreSQL y Redis no se expondrán públicamente. El acceso público se limitará a 80/443 y SSH restringido. Cloudflare podrá actuar como DNS/CDN/WAF. Los respaldos cifrados se almacenarán fuera del VPS. La versión canónica se desplegará en la nube después de cada entrega aprobada; un entorno de desarrollo puede coexistir, pero no sustituye al despliegue verificable.',
        'consequences': ['El deploy deja de ser proveedor-neutral.', 'Se requieren runbooks de backup, restore, monitoreo y hardening.', 'El sistema conserva capacidad de migrar a otra infraestructura mediante Docker y contratos de puertos.']
    },
    {
        'id':'DEC-002','title':'Modalidades y canales de pago de v1','status':'APPROVED','date':'2026-07-14',
        'decision': 'v1 no tendrá checkout automático ni confirmación automática por pasarela. Existen dos modalidades comerciales: (1) pago anticipado, con precio reducido hasta una fecha configurable y derecho a escoger hotel después de aprobar al menos el 50%; y (2) pago al llegar, con precio normal y elección de hotel entre la disponibilidad restante. El pago anticipado se realiza mediante QR Simple bancario en Bolivia o cuenta/enlace externo de Estados Unidos. El peregrino carga comprobante y una persona autorizada lo aprueba o rechaza. El comprobante cargado dentro del plazo conserva la tarifa anticipada aunque la revisión ocurra después. El saldo restante tiene vencimiento configurable y puede pagarse al llegar sin repricing. Al llegar se aceptan efectivo y QR configurables por gestión.',
        'consequences': ['No se implementan webhooks ni proveedores automáticos en v1.', 'Se crea bandeja de evidencias, revisión humana, auditoría y detección de duplicados.', 'La modalidad comercial se separa del canal de pago.']
    },
    {
        'id':'DEC-003','title':'Comprobante de pago, numeración y verificación','status':'APPROVED','date':'2026-07-22',
        'decision': 'El documento emitido por el sistema se llama “Comprobante de pago” y su pie dice “Documento de control interno”. Se distinguen: comprobante bancario cargado, Comprobante de pago emitido y estado de cuenta. Cada pago aprobado genera un comprobante propio con secuencia única por gestión `REC-{EVENT_CODE}-{NNNNNN}`. En datos del peregrino solo aparecen nombre completo, código de inscripción y paquete. El QR usa token opaco y abre una verificación pública mínima sin autenticación; el detalle personal/financiero exige sesión y permiso. El documento emitido es inmutable; una corrección se resuelve por anulación auditada y nueva emisión.',
        'consequences': ['PDF como formato principal.', 'Vista térmica prevista en 80 mm, sujeta a DEC-010.', 'El QR no enlaza directamente al PDF ni expone PII.']
    },
    {
        'id':'DEC-004','title':'Llegada durante IN_PROGRESS, duración y servicios','status':'APPROVED','date':'2026-07-22',
        'decision': 'Durante `IN_PROGRESS` no hay prorrateo ni diferencia de costo por días transcurridos, exista o no anticipo. El importe completo corresponde al paquete asignado. No hay tarifas tardías automáticas. Pueden existir paquetes privados, no públicos, visibles y asignables solo por usuarios autorizados de Inscripciones. La duración total del evento es configurable; referencia actual: 8 días. El periodo de hospedaje tiene una cantidad fija y configurable de noches; referencia actual: 7 noches, desde la noche del día 1 hasta la noche del día 7. Una reserva `CONFIRMED` no se libera por llegada tardía. Alimentos configura por día cada servicio, cantidad y horario; el QR valida fecha y ventana horaria. Materiales no pierde elegibilidad automáticamente por actividades pasadas.',
        'consequences': ['DEC-005 queda limitado a duración/política de `HELD` y otros aspectos no definidos.', 'Los escenarios E2E de día 1, 3 y último día usan el mismo precio.', 'La configuración de evento, hospedaje y alimentos se vuelve explícita.']
    },
]

for d in decisions:
    bullets='\n'.join(f'- {x}' for x in d['consequences'])
    write(f"docs/04-delivery/decisions/{d['id']}.md", f'''
# {d['id']} — {d['title']}

**Estado:** {d['status']}  
**Fecha:** {d['date']}

## Decisión

{d['decision']}

## Consecuencias

{bullets}
''')

pending = [
('DEC-005','Duración de `HELD` y reglas restantes de hospedaje'),
('DEC-006','Menores, documento obligatorio y consentimiento'),
('DEC-007','Cancelaciones y reembolsos'),
('DEC-008','Tratamiento de sobrepagos'),
('DEC-009','Fuente y momento del tipo de cambio'),
('DEC-010','Equipo y tamaño exacto de credencial/recibo'),
('DEC-011','Retención y anonimización'),
('DEC-012','RPO/RTO y proveedor de backup'),
('DEC-013','Verificación de email obligatoria'),
('DEC-014','MFA para roles privilegiados'),
('DEC-015','Cierre formal del alcance QR Bolivia; v1 ya es manual por DEC-002'),
('DEC-016','Auth.js estable o alternativa'),
('DEC-017','Alcance y frecuencia de Google Sheets'),
]
reg = '# Registro de decisiones — Sistema web ENCUENTRO v2.7\n\n'
reg += '## Aprobadas\n\n| ID | Título | Estado | Fecha |\n|---|---|---|---|\n'
for d in decisions:
    reg += f"| [{d['id']}](decisions/{d['id']}.md) | {d['title']} | APPROVED | {d['date']} |\n"
reg += '\n## Pendientes\n\n| ID | Tema | Estado |\n|---|---|---|\n'
for i,t in pending:
    reg += f'| {i} | {t} | BLOCKING cuando aplique |\n'
write('docs/04-delivery/decision-register.md', reg)

# -------------------- Requirements --------------------
requirements_md = f'''
# Sistema web ENCUENTRO — Requisitos funcionales y reglas de negocio v{VERSION}

**Fuente canónica de producto**  
**Fecha:** {DATE}

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
| GOV-010 | Una decisión `BLOCKING` no puede ser resuelta por el agente. | El validador y los prompts detienen el alcance dependiente. |

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

## 5. Gestión y configuración

| ID | Requisito | Criterio |
|---|---|---|
| EVT-001 | ADMIN_MASTER crea una gestión con código y año únicos. | Duplicado falla. |
| EVT-002 | La gestión define nombre, fechas, zona horaria, moneda, duración, noches, oferta, métodos, cajas, comisiones y términos. | No pasa a READY con bloqueo crítico. |
| EVT-003 | Las transiciones son manuales, transaccionales y auditadas. | Actor, motivo, versión y fecha quedan registrados. |
| EVT-004 | `ACTIVE` publica y habilita inscripción/pago. | Landing resuelve una única gestión pública. |
| EVT-005 | `IN_PROGRESS` mantiene inscripción, pago y operación completa. | No crea una tarifa por día transcurrido. |
| EVT-006 | Solo una gestión puede estar públicamente habilitada. | Constraint/lock impide dos. |
| EVT-016 | `start_at` y `end_at` son configurables. | La UI calcula y muestra el total de días. |
| EVT-016 | La referencia actual es 8 días, sin valor fijo en código. | Prueba con otra duración. |
| EVT-009 | El cierre operativo valida cajas, sync y bloqueos. | No cierra con pendientes críticos. |
| EVT-010 | El cierre guarda snapshot inmutable. | Reproducible desde auditoría. |

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
| PAY-014 | Secuencia: `REC-{{EVENT_CODE}}-{{NNNNNN}}` única por gestión. | Concurrencia no duplica. |
| PAY-029 | Pie del documento: “Documento de control interno”. | Validación visual/PDF. |
| PAY-030 | Datos del peregrino: nombre, código de inscripción y paquete. | No incluye documento ni país. |
| PAY-031 | QR público verifica validez, número, evento, fecha, monto, moneda y estado sin PII. | Cualquier cámara abre la URL. |
| PAY-032 | Detalle completo requiere autenticación y `receipt.read_sensitive`. | Acceso anónimo no expone PII. |
| PAY-033 | El comprobante emitido es inmutable; corrección por anulación y nueva emisión. | Original permanece `VOID`. |
| PAY-011 | Todo cobro presencial ocurre en una sesión de caja abierta. | Sin sesión falla. |
| PAY-012 | Cierre compara esperado y contado por moneda/canal. | Diferencia exige motivo. |

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

## 9. Alimentos y materiales

| ID | Requisito | Criterio |
|---|---|---|
| FOD-001 | Alimentos configura servicios por fecha, tipo, hora inicial/final y cantidad disponible. | `ends_at > starts_at`. |
| FOD-006 | QR valida gestión, beneficio, fecha, horario, disponibilidad y duplicidad. | Fuera de ventana se rechaza. |
| FOD-002 | Pedido, recepción, desperdicio y entrega son movimientos separados. | Reporte reconciliable. |
| FOD-003 | Una persona recibe una vez cada servicio salvo override autorizado. | Constraint/idempotencia. |
| MAT-005 | Elegibilidad de materiales depende de paquete, inventario e historial. | No depende de actividad pasada. |
| MAT-004 | La llegada tardía no elimina automáticamente el material incluido. | Prueba día final. |
| MAT-003 | Entradas, salidas, ajustes, pérdidas y entregas son reconstruibles. | Stock deriva de movimientos. |

## 10. Seguridad, archivos, auditoría y no funcionales

- RBAC con scopes global, gestión, comisión y caja.
- PII enmascarada; evidencias y PDFs privados con URL firmada cuando corresponda.
- Tokens de QR almacenados por hash; no contienen PII.
- Montos usan decimal exacto, nunca `float`.
- Fechas se guardan en UTC y se muestran en la zona horaria de la gestión.
- Objetivo operativo: 99,9% durante la ventana del evento, sujeto a DEC-012.
- WCAG 2.2 AA en flujos críticos; viewports 390, 768, 1280, 1440 y 1920 px.
- Idempotencia y concurrencia obligatorias para pago, cupo, entrega, cierre y sincronización offline.

## 11. Decisiones

DEC-001 a DEC-004 están `APPROVED`. DEC-005 a DEC-017 permanecen en `docs/04-delivery/decision-register.md`.
'''
write('docs/01-product/requirements.md', requirements_md)

# -------------------- Architecture --------------------
architecture_md = f'''
# Sistema web ENCUENTRO — Arquitectura técnica maestra v{VERSION}

## 0. Decisión arquitectónica

Monorepo `pnpm`, aplicación Next.js y worker Node separados, monolito modular y PostgreSQL como fuente autoritativa. No se crean microservicios en v1.

## 1. Línea base tecnológica

| Capa | Línea base | Regla |
|---|---|---|
| Runtime | Node.js LTS | Patch exacto en `.nvmrc`, engines y CI. |
| Web | Next.js App Router | Versión exacta validada con Context7 y documentación oficial. |
| Lenguaje | TypeScript strict | Sin `any`, `ts-ignore` ni casts injustificados. |
| Datos | PostgreSQL + Prisma | Migraciones incrementales y probadas. |
| Async | Redis + BullMQ | Redis no es fuente autoritativa. |
| UI | Tailwind + componentes propios/shadcn adaptado | Sin dependencia runtime del catálogo externo. |
| QA | Vitest + Playwright | Tests versionados. |
| Archivos | S3 compatible o almacenamiento privado equivalente | Checksum, URL firmada y lifecycle. |
| Correo | Nodemailer + SMTP global | Envío por worker e historial. |

## 2. Infraestructura productiva — DEC-001

- OVHcloud VPS-3.
- Ubuntu Server 24.04 LTS.
- Docker Engine y Docker Compose v2.
- `apps/web` y `apps/worker` en procesos/contenedores separados.
- PostgreSQL y Redis en red privada Docker o servicio gestionado; nunca expuestos a Internet.
- Reverse proxy Caddy o Nginx; solo 80/443 públicos y SSH restringido.
- Cloudflare opcional como DNS/CDN/WAF.
- Backups cifrados externos al VPS y ensayo de restauración.
- Despliegue cloud-first tras cada entrega aprobada.

## 3. Topología

```text
Internet -> Cloudflare -> Reverse proxy -> apps/web
apps/web -> PostgreSQL / Redis / Object Storage
apps/worker -> PostgreSQL / Redis / SMTP / exportaciones
Estaciones PWA -> /api/v1/offline/sync -> cola local IndexedDB
```

## 4. Estructura del repositorio

```text
/apps/web
/apps/worker
/packages/domain
/packages/application
/packages/infrastructure
/packages/ui
/packages/config
/prisma/migrations
/docs/01-product
/docs/02-architecture
/docs/03-design
/docs/04-delivery
/tests/e2e
/contracts
/scripts
```

Dependencias: `presentation -> application -> domain`; infraestructura implementa puertos. No hay queries Prisma en componentes React ni reglas sustantivas en Route Handlers.

## 5. Módulos y ownership

| Módulo | Ownership |
|---|---|
| Identity | cuenta y sesión |
| RBAC | permisos y scopes |
| Events | ciclo, duración, configuración, cierres |
| Registration | persona, participación, términos, llegada |
| Catalog | paquetes, visibilidad, precios y beneficios |
| Lodging | hoteles, inventario, holds, reservas y habitaciones |
| Billing | cargos, evidencias, pagos, asignaciones, reembolsos y comprobantes |
| Cash | cuentas, sesiones y movimientos |
| Credentials | holders, QR, estaciones y scans |
| Transport | llegadas, vehículos, horarios y traslados |
| Food | servicios diarios, pedidos, recepción, desperdicio y entrega |
| Materials | inventario, kits y entregas |
| Servers | voluntarios, turnos y beneficios |
| Accounting | asientos, tesorería, rendiciones, donaciones y activos |
| Notifications | SMTP, reglas, plantillas, jobs e historial |
| Reporting/Audit | reportes, exportaciones, métricas y auditoría |

## 6. Cambios integrados DEC-002 a DEC-004

### 6.1 Catálogo e inscripción

`price_versions` representa montos explícitos por modalidad. La inscripción conserva `price_version_id`, modalidad y cargo snapshot. `PRIVATE` no aparece públicamente y requiere `catalog.private.assign`.

### 6.2 Pagos manuales

No existe proveedor automático productivo. `payment_proofs` es el agregado de evidencia y revisión. Solo una aprobación transaccional crea/confirma `payments` y `payment_allocations`. La modalidad anticipada se habilita por reglas versionadas; el canal es un dato separado.

### 6.3 Comprobante

`receipts` se emite por pago, con secuencia transaccional por gestión, snapshot de contenido y token opaco de verificación. El endpoint público devuelve un subconjunto seguro. El PDF completo permanece privado.

### 6.4 Duración, hospedaje y servicios

`events.start_at/end_at` definen duración. `event_lodging_policies` define `night_count`, `check_in_date` y `check_out_date`. `actual_arrival_at` no reescribe reserva. `meal_services` define fecha, ventana y cantidades. Materiales no usa fecha de actividad como regla de exclusión.

## 7. Transacciones críticas

- Aprobar evidencia: lock de evidencia, validar duplicado y fecha, crear pago, asignar a cargo, emitir secuencia/recibo y outbox en una transacción.
- Seleccionar hotel: validar elegibilidad y disponibilidad; reservar atómicamente.
- Último cupo: constraint/lock para que solo una solicitud confirme.
- Entrega QR: idempotencia por estación/operation UUID y unique persona/servicio.
- Cierre: compare-and-swap por versión y snapshot de checklist.

## 8. Seguridad

Autorización en servidor por permiso y scope. Archivos privados, logs redactados, tokens por hash, protección CSRF, rate limit, cookies seguras, rotación de secretos y principio de mínimo privilegio.

## 9. Operación y observabilidad

Health checks separados para web/worker, correlation ID, métricas de latencia/errores/colas, alertas, Sentry, backups, restore test, runbooks y despliegue reversible.
'''
write('docs/02-architecture/system-architecture.md', architecture_md)

# -------------------- Data/API/RBAC --------------------
contracts_md = f'''
# Sistema web ENCUENTRO — Contratos de datos, API y RBAC v{VERSION}

## 1. Convenciones

- API base: `/api/v1`.
- Rutas privadas llevan contexto de gestión en URL o recurso.
- Dinero: decimal/string + ISO currency.
- Fechas: ISO-8601 UTC; presentación en `events.timezone`.
- Mutaciones críticas requieren `Idempotency-Key` y `expectedVersion` cuando aplique.
- Errores devuelven `code`, `message`, `correlationId` y detalles seguros.

## 2. Tablas mínimas modificadas

| Tabla | Campos relevantes | Reglas |
|---|---|---|
| `events` | code, year, start_at, end_at, timezone, status, version | código/año únicos; duración calculada |
| `event_lodging_policies` | event_id, check_in_date, check_out_date, night_count, version | fechas coherentes; una activa por gestión |
| `packages` | event_id, code, name, visibility, status | `PUBLIC` o `PRIVATE` |
| `price_versions` | package_id, payment_mode, amount, currency, starts_at, ends_at, min_payment_percent, balance_due_at | histórico inmutable |
| `registrations` | event_id, person_id, package_id, price_version_id, payment_mode, status, attendance_status | unique persona/gestión |
| `charges` | registration_id, concept, amount, currency, snapshot_json | no se reescribe |
| `payment_channels` | event_id?, code, scope, currency, instructions, active | global o por gestión según aprobación |
| `payment_proofs` | registration_id, channel_id, declared_amount, currency, paid_at, reference, payer, file_id, status, submitted_at, reviewed_at, reviewed_by, review_reason | archivo privado; duplicado de referencia controlado |
| `payments` | event_id, registration_id?, amount, currency, method, status, source_proof_id?, cash_session_id? | confirmado e inmutable |
| `payment_allocations` | payment_id, charge_id, amount | total asignado <= pago/cargo según política |
| `receipts` | event_id, payment_id, sequence, number, snapshot_json, verification_token_hash, issued_at, voided_at, void_reason | unique event/sequence y event/number |
| `reservations` | event_id, registration_id, hotel_id, room_id?, check_in_date, check_out_date, night_count, status, version | `CONFIRMED` no expira por llegada tardía |
| `meal_services` | event_id, service_date, type, starts_at, ends_at, available_count, ordered_count, received_count, status, version | ventana válida y cantidades no negativas |
| `meal_deliveries` | service_id, holder_id, delivered_at, station_id, operation_uuid | unique servicio/holder |
| `inventory_items` | event_id, code, name, status | stock por movimientos |
| `audit_logs` | event_id?, actor_id, action, entity, entity_id, before_redacted, after_redacted, created_at | append-only |

## 3. Endpoints principales

### Gestión y configuración

- `GET/POST /events`
- `PATCH /events/{{id}}`
- `POST /events/{{id}}/transitions`
- `GET/PUT /events/{{id}}/lodging-policy`
- `GET/PUT /events/{{id}}/payment-settings`

### Catálogo e inscripción

- `GET/POST /events/{{id}}/packages`
- `POST /packages/{{id}}/price-versions`
- `POST /events/{{id}}/registrations`
- `PATCH /registrations/{{id}}`
- `POST /registrations/{{id}}/assign-private-package`
- `POST /registrations/{{id}}/check-in`

### Evidencias y pagos

- `POST /registrations/{{id}}/payment-proofs`
- `GET /events/{{id}}/payment-proofs`
- `POST /payment-proofs/{{id}}/review`
- `POST /events/{{id}}/cash-sessions`
- `POST /cash-sessions/{{id}}/payments`
- `POST /payments/{{id}}/allocations`
- `POST /payments/{{id}}/refunds` — bloqueado por DEC-007/008/009 cuando aplique

### Comprobantes

- `GET /receipts/{{id}}`
- `POST /receipts/{{id}}/void`
- `GET /public/receipts/verify/{{token}}`
- Ruta UI pública: `/verificar/comprobante/{{token}}`

### Hospedaje y alimentación

- `GET/POST /events/{{id}}/hotels`
- `POST /registrations/{{id}}/hotel-selection`
- `POST /reservations/{{id}}/assign-room`
- `GET/POST /events/{{id}}/meal-services`
- `POST /meal-services/{{id}}/deliveries`

## 4. DTO críticos

### Revisión de evidencia

```json
{{
  "decision": "APPROVE|REJECT|REQUEST_CORRECTION",
  "approvedAmount": "200.00",
  "currency": "USD",
  "reason": "texto obligatorio cuando no se aprueba",
  "expectedVersion": 3,
  "idempotencyKey": "uuid"
}}
```

### Configuración de precio

```json
{{
  "paymentMode": "ADVANCE|ARRIVAL",
  "amount": "350.00",
  "currency": "USD",
  "startsAt": "2026-07-01T00:00:00Z",
  "endsAt": "2026-10-15T23:59:59Z",
  "minPaymentPercent": 50,
  "balanceDueAt": "2026-11-01T23:59:59Z"
}}
```

### Servicio de alimentación

```json
{{
  "serviceDate": "2026-11-03",
  "type": "LUNCH",
  "startsAt": "2026-11-03T12:00:00-04:00",
  "endsAt": "2026-11-03T14:00:00-04:00",
  "availableCount": 500
}}
```

## 5. Errores añadidos/confirmados

| Código | HTTP | Uso |
|---|---:|---|
| `PAYMENT_PROOF_NOT_REVIEWABLE` | 422 | Estado no revisable. |
| `PAYMENT_PROOF_DUPLICATE_REFERENCE` | 409 | Referencia duplicada. |
| `ADVANCE_RATE_EXPIRED` | 422 | No se cargó evidencia dentro del plazo. |
| `ADVANCE_BENEFIT_NOT_UNLOCKED` | 422 | Pago aprobado menor al mínimo. |
| `PRIVATE_PACKAGE_FORBIDDEN` | 403 | Usuario no autorizado. |
| `RECEIPT_NOT_FOUND` | 404 | Token inexistente. |
| `RECEIPT_VOID` | 200 | Verificación pública informa anulado. |
| `MEAL_SERVICE_OUTSIDE_WINDOW` | 422 | Fecha/hora fuera de ventana. |
| `MEAL_SERVICE_CAPACITY_EXHAUSTED` | 409 | Sin disponibilidad. |

## 6. RBAC

| Dominio | Permisos principales |
|---|---|
| Eventos | `event.create`, `event.read`, `event.update`, `event.transition`, `event.close` |
| Catálogo | `catalog.read`, `catalog.manage`, `catalog.private.assign` |
| Inscripción | `registration.read`, `registration.create`, `registration.update`, `registration.check_in` |
| Pagos | `payment.read`, `payment.proof.review`, `payment.collect`, `payment.adjust`, `payment.refund` |
| Comprobantes | `receipt.issue`, `receipt.read`, `receipt.read_sensitive`, `receipt.void` |
| Caja | `cash.open`, `cash.collect`, `cash.count`, `cash.close` |
| Hospedaje | `lodging.read`, `lodging.manage`, `lodging.assign_room`, `lodging.override_capacity` |
| Alimentos | `food.read`, `food.manage`, `benefit.deliver` |
| Materiales | `materials.read`, `materials.manage`, `benefit.deliver` |
| Auditoría | `audit.read` |

## 7. Verificación pública de comprobante

La respuesta pública no incluye nombre, código de inscripción, archivo bancario, cuenta receptora, referencia ni usuario aprobador. El token es aleatorio, de alta entropía y se almacena por hash.
'''
write('docs/02-architecture/data-api-rbac.md', contracts_md)

# ADRs
adrs = {
'ADR-001':'Monolito modular con web y worker separados',
'ADR-002':'PostgreSQL como fuente autoritativa e idempotencia transaccional',
'ADR-003':'Contexto obligatorio de gestión y scopes RBAC',
'ADR-004':'Archivos privados y tokens opacos para QR/verificación',
'ADR-005':'Pagos manuales en v1 y separación modalidad/canal',
'ADR-006':'Catálogo versionado y cargos snapshot',
'ADR-007':'SMTP global y notificaciones por outbox/worker',
'ADR-008':'PWA offline con operaciones idempotentes',
'ADR-009':'Contratos machine-readable y validador contra deriva',
}
for num,title in adrs.items():
    body=f'''# {num} — {title}

**Estado:** ACCEPTED  
**Versión:** 2.7

## Contexto

El Sistema web ENCUENTRO requiere operación anual, trazabilidad financiera, concurrencia y trabajo asistido por agentes IA sin permitir que estos inventen reglas.

## Decisión

{title}. Esta decisión se implementa conforme a requisitos, contratos y decisiones aprobadas de la versión 2.7.

## Consecuencias

- Se privilegia integridad, auditabilidad y operación verificable.
- Una modificación estructural requiere nueva ADR y actualización de contratos.
- Los tests y el validador documental son parte del gate.
'''
    write(f'docs/02-architecture/adr/{num}.md', body)

# -------------------- Design system --------------------
design_md = f'''
# Sistema web ENCUENTRO — Identidad digital y UX v{VERSION}

## 1. Dirección visual

Sobria, carismática, contemporánea, cálida y operacionalmente clara. La Mansión es la marca institucional y el Encuentro identifica la gestión.

## 2. Tipografía

- Títulos: Playfair Display; fallback Georgia/serif.
- UI, tablas y formularios: Source Sans 3; fallback Segoe UI/Arial/sans-serif.
- Datos monoespaciados: `ui-monospace`.

## 3. Tokens

| Token | Hex | Uso |
|---|---|---|
| `--color-ink` | `#171312` | texto/navegación |
| `--color-ivory` | `#F7F2EA` | fondo |
| `--color-flame` | `#D63B2F` | CTA |
| `--color-fire` | `#F08A24` | acento |
| `--color-gold` | `#D6A12E` | en curso |
| `--color-wine` | `#5B2328` | superficies solemnes |
| `--color-success` | `#2E7D32` | éxito |
| `--color-warning` | `#D98E04` | pendiente |
| `--color-danger` | `#C62828` | error |
| `--color-info` | `#2563EB` | información |

Nunca depender solo del color.

## 4. Responsive y accesibilidad

390+ móvil, 768+ tableta, 1280+ laptop y 1440/1920 escritorio. Área táctil mínima 44×44 px. WCAG 2.2 AA en flujos críticos. Tablas hacen scroll dentro del componente.

## 5. Rutas y navegación

- Público: `/`, `/e/[eventCode]`, `/e/[eventCode]/inscripcion`, `/verificar/comprobante/[token]`.
- Peregrino: `/e/[eventCode]/mi-cuenta`, `/pagos`, `/hospedaje`, `/credencial`, `/notificaciones`.
- Administración: `/admin`, `/admin/e/[eventCode]/...`.
- Comisión: `/comision/e/[eventCode]/[commissionCode]/...`.
- Caja: `/caja/e/[eventCode]/[cashCode]`.

## 6. Pantallas modificadas por DEC-001..004

### Comparador de modalidad

Dos tarjetas exclusivas:

1. **Pago anticipado** — precio especial, fecha límite, pago mínimo, canales disponibles, derecho a escoger hotel tras aprobación.
2. **Pago al llegar** — precio normal, efectivo/QR y hotel entre disponibilidad restante.

No usar “pago online” como sinónimo de pago automático.

### Catálogo administrativo

Campos: visibilidad `PUBLIC/PRIVATE`, precio anticipado, precio normal, vigencia, mínimo 50%, vencimiento del saldo, hoteles habilitados y estado.

### Configuración de gestión

Muestra fechas, zona horaria, total calculado de días, periodo de hospedaje y cantidad de noches. Valores de referencia visibles, nunca fijados en código.

### Hospedaje

El peregrino selecciona hotel; la habitación se muestra como “Asignada por Hospedaje”. Una reserva confirmada no muestra mensajes de liberación por llegada tardía.

### Alimentación

Calendario por día con servicio, tipo, hora inicial/final, pedido, recibido, disponible, entregado y desperdicio.

### Comprobante de pago

Título exacto, número, datos mínimos del peregrino, detalle del pago, saldo, QR y pie “Documento de control interno”. La vista pública muestra datos mínimos; el botón de detalle administrativo exige autenticación.

## 7. Componentes obligatorios

`PaymentModeCards`, `PriceVersionEditor`, `PrivatePackageBadge`, `PaymentProofUploader`, `ProofReviewPanel`, `BalanceSummary`, `HotelAvailabilityPicker`, `LodgingPolicyForm`, `MealServiceEditor`, `ReceiptView`, `ReceiptVerificationResult`, `AuditTrail`.

## 8. Microcopy

- `IN_PROGRESS`: “El evento está en curso. Las inscripciones y pagos continúan habilitados.”
- Anticipado pendiente: “Recibimos tu comprobante. El beneficio se habilitará cuando sea aprobado.”
- Anticipado aprobado: “Tu tarifa especial está confirmada. Ya puedes escoger hotel según disponibilidad.”
- Pago al llegar: “Pagarás el precio normal y escogerás hotel entre las opciones disponibles al llegar.”
- Fuera de horario de comida: “Este servicio no está disponible en este horario.”
'''
write('docs/03-design/design-system.md', design_md)

# -------------------- Execution plan --------------------
execution_md = f'''
# Sistema web ENCUENTRO — Auditoría y plan de ejecución v{VERSION}

## 1. Estado de consolidación

La v2.7 elimina la fragmentación entre v2.6 y parches posteriores. DEC-001 a DEC-004 están integradas en requisitos, arquitectura, contratos, diseño, prompts, decisiones y prototipo.

## 2. Definition of Ready

- Requisito y criterio identificados.
- Decisiones bloqueantes resueltas.
- Tabla/DTO/API/permiso/estado definidos.
- Migración y rollback evaluados.
- Pruebas y estados UI previstos.
- Validador documental en verde.

## 3. Definition of Done

- Alcance limitado.
- Lint, typecheck, unit, integración, E2E y build pertinentes en verde.
- Migración desde base vacía y fixture existente.
- Pruebas negativas de autorización.
- Idempotencia/concurrencia donde aplica.
- Auditoría, errores de dominio, a11y y responsive.
- Contratos, trazabilidad y documentación actualizados.
- `DELIVERY_REPORT` con evidencia real.
- Despliegue cloud-first aprobado y health checks verificados cuando corresponda.

## 4. Fases

| Fase | Alcance | Gate |
|---:|---|---|
| 0 | Gobierno, decisiones, ADR, contratos y baseline | validador documental |
| 1 | Monorepo, toolchain, CI, Docker local y Claude Code | install frozen + build |
| 2 | Tokens, shells, rutas y componentes | responsive/a11y smoke |
| 3 | Events, RBAC, auditoría y auth spike | transiciones + matriz |
| 4 | Personas, inscripciones, catálogo, modalidades y cargos | E2E anticipado/al llegar + IN_PROGRESS |
| 5 | Hospedaje, política de noches y cupos | último cupo + reserva confirmada no liberada |
| 6 | Evidencias, pagos manuales, cajas y comprobantes | revisión, parcial, secuencia y QR |
| 7 | Check-in, credencial y cierre operativo | llegada tardía sin repricing |
| 8 | QR/PWA offline | idempotencia multiestación |
| 9 | Transporte | capacidad/horarios |
| 10 | Alimentos, materiales y servidores | horario/cantidad/entrega única |
| 11 | Contabilidad, tesorería y rendiciones | cuadre/reversión/cierre |
| 12 | SMTP, notificaciones, reportes/exportaciones | singleton/colas/histórico |
| 13 | Hardening, carga, backup y DR | security review + restore |
| 14 | UAT, capacitación y release | go/no-go firmado |

## 5. Escenarios obligatorios añadidos

1. Tarifa anticipada válida y evidencia aprobada al 50%.
2. Evidencia cargada antes del corte y aprobada después.
3. Evidencia cargada después del corte: no conserva tarifa.
4. Saldo anticipado pagado al llegar sin repricing.
5. Pago al llegar usa precio normal y no reserva hotel.
6. Paquete privado invisible al peregrino y asignable por Inscripciones.
7. Día 1, 3 y último día en `IN_PROGRESS` mantienen precio completo.
8. Evento configurado con duración distinta de 8 días.
9. Política de hospedaje configurada con noches distintas de 7.
10. Reserva `CONFIRMED` permanece ante llegada tardía.
11. Comida fuera de fecha u horario se rechaza.
12. Dos aprobaciones concurrentes no duplican pago ni número de comprobante.
13. QR público no expone PII y refleja anulación.

## 6. Go/no-go

No-go si existe decisión necesaria sin resolver, seguridad crítica/alta, migración o restore no ensayados, pago/QR/cierre sin idempotencia, secretos visibles, base/Redis expuestos, pruebas de `IN_PROGRESS` fallidas o documentación/contratos divergentes.

## 7. Trazabilidad DEC

| Decisión | Dominios | Pruebas mínimas |
|---|---|---|
| DEC-001 | Infraestructura, CI/CD, backup, observabilidad | deploy, health, firewall, restore |
| DEC-002 | Catálogo, inscripción, pagos, caja, hospedaje | 50%, fecha, saldo, dos modalidades |
| DEC-003 | Pagos, comprobantes, QR, auditoría | secuencia, anulación, verificación pública |
| DEC-004 | Events, catálogo, hospedaje, alimentos, materiales | día 1/3/final, noches, horarios, privado |
'''
write('docs/04-delivery/execution-plan.md', execution_md)

traceability_md = '''
# Matriz de trazabilidad v2.7

| Regla | Requisitos | Arquitectura/contrato | UI | Prueba |
|---|---|---|---|---|
| Dos modalidades | REG-019..005, PAY-022..003 | price_versions, payment_channels | PaymentModeCards | E2E anticipado/al llegar |
| 50% habilita hotel | REG-020, HOS-016 | allocations + entitlement | BalanceSummary/HotelPicker | pago parcial aprobado |
| Comprobante por pago | PAY-028..015 | receipts + verify endpoint | ReceiptView | secuencia/anulación/PII |
| Sin prorrateo | REG-023/007 | cargo snapshot | resumen de inscripción | días 1/3/final |
| Duración/noches configurables | EVT-016/008, HOS-011 | events + lodging_policy | Event/Lodging forms | valores alternativos |
| Reserva confirmada no se libera | HOS-012 | reservation policy | estado de reserva | worker no expira |
| Alimentos por horario | FOD-001..004 | meal_services | MealServiceEditor | fuera de ventana |
| Paquete privado | PKG-009/003 | visibility + permission | badge privado | IDOR/RBAC |
'''
write('docs/04-delivery/traceability.md', traceability_md)
write('docs/04-delivery/change-log-v2.7.md', '''
# Changelog v2.7

- Consolidación de DEC-001..004.
- Sustitución de pago automático por evidencias manuales.
- Modalidades anticipado/al llegar y beneficios asociados.
- Comprobante de pago con QR público mínimo.
- Duración/noches configurables, sin prorrateo.
- Servicios de alimentación por fecha/horario.
- Paquetes privados para Inscripciones.
- Actualización de contratos, prompts, Claude Code y prototipo.
''')
write('docs/implementation/README.md', '''
# Implementación

Los informes de ejecución se crean aquí por fase. No se considera implementado ningún requisito solo por existir en esta documentación.
''')

# -------------------- Claude config --------------------
write('CLAUDE.md', f'''
# CLAUDE.md — Sistema web ENCUENTRO v{VERSION}

## Fuentes de verdad

1. `docs/01-product/requirements.md`
2. `docs/04-delivery/decision-register.md`
3. `docs/02-architecture/system-architecture.md`
4. `docs/02-architecture/data-api-rbac.md`
5. `docs/03-design/design-system.md`
6. `docs/04-delivery/execution-plan.md`
7. `contracts/`

## Reglas permanentes

- No inventes reglas, proveedores, estados, rutas, permisos o descuentos.
- DEC-001..004 están aprobadas y deben aplicarse.
- DEC-005..017 permanecen pendientes cuando afecten el alcance.
- v1 usa pagos manuales; no agregues checkout automático.
- Modalidad y canal de pago son conceptos distintos.
- No prorratees por llegada tardía.
- No liberes una reserva `CONFIRMED` por llegada tardía.
- No expongas PII en QR, logs, URLs ni respuestas públicas.
- No uses `float` para dinero.
- No hagas commit, push, deploy, publicación, migración productiva, refund real o comando destructivo sin autorización explícita.
- Antes de usar APIs/librerías, verifica la versión instalada con Context7 y documentación oficial.

## Protocolo

Antes de editar: emite `READINESS_REPORT`.  
Después: ejecuta pruebas/validador y emite `DELIVERY_REPORT` con archivos, migraciones, comandos, resultados, riesgos y pendientes.
''')

write('.mcp.json', '''
{
  "mcpServers": {
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp"]
    },
    "playwright": {
      "command": "npx",
      "args": ["-y", "@playwright/mcp"]
    }
  }
}
''')

write('.claude/settings.json', '''
{
  "permissions": {
    "deny": [
      "Bash(rm -rf /:*)",
      "Bash(git reset --hard:*)",
      "Bash(prisma migrate reset:*)",
      "Bash(docker system prune -a:*)"
    ],
    "ask": [
      "Bash(git commit:*)",
      "Bash(git push:*)",
      "Bash(docker compose up -d:*)",
      "Bash(pnpm run deploy:*)"
    ]
  }
}
''')

rules = {
'00-sources.md':'Lee fuentes en jerarquía. Una DEC aprobada posterior prevalece. No uses prototipo como fuente de negocio.',
'01-no-guessing.md':'Si falta definición, registra TBD/DEC, detén solo el alcance afectado y continúa con partes independientes.',
'02-domain-boundaries.md':'Respeta presentation -> application -> domain. No Prisma en React ni imports internos entre módulos.',
'03-security-rbac.md':'Autoriza en servidor por permiso y scope. Prueba IDOR. Redacta PII y secretos.',
'04-data-integrity.md':'Dinero decimal, UTC, idempotencia, constraints y transacciones para pagos/cupos/entregas/cierres.',
'05-ui-accessibility.md':'WCAG 2.2 AA, responsive 390/768/1280/1440/1920, estados loading/empty/error/success/readonly.',
'06-delivery-gates.md':'No declares DONE sin comandos y evidencia. Actualiza contratos, trazabilidad y documentación afectada.',
}
for fn,txt in rules.items():
    write(f'.claude/rules/{fn}', f'# Regla\n\n{txt}\n')

agents = {
'architecture-reviewer.md':'Revisa límites modulares, dependencias, eventos, idempotencia, despliegue VPS y coherencia con ADR.',
'database-reviewer.md':'Revisa esquema, constraints, índices, migraciones, concurrencia, dinero y UTC.',
'security-reviewer.md':'Revisa RBAC/scopes, IDOR, secretos, uploads, tokens, rate limit y logs.',
'payments-reviewer.md':'Revisa modalidades manuales, evidencias, 50%, asignaciones, caja, recibos y auditoría.',
'frontend-reviewer.md':'Revisa rutas, componentes, responsive, a11y, microcopy y estados.',
'qa-reviewer.md':'Revisa cobertura, E2E, integración, carga, regresión y evidencias del DELIVERY_REPORT.',
}
for fn,txt in agents.items():
    write(f'.claude/agents/{fn}', f'# Agente: {fn[:-3]}\n\n## Misión\n\n{txt}\n\n## Salida\n\nHallazgos por severidad, evidencia, requisito/contrato afectado y recomendación. No modifica negocio.\n')

skills = {
'encounter-domain':('Dominio ENCUENTRO','Aplicar estados, ciclo de gestión, modalidades, ausencia de prorrateo y reglas por comisión.'),
'rbac-scopes':('RBAC y scopes','Diseñar/verificar permisos globales, gestión, comisión, caja y propietario.'),
'prisma-migrations':('Prisma y migraciones','Crear migraciones incrementales, constraints, índices y pruebas de upgrade.'),
'manual-payments':('Pagos manuales','Implementar evidencia, revisión, asignación, caja, comprobante y conciliación sin checkout automático.'),
'qr-offline':('QR y offline','Implementar tokens opacos, estaciones, idempotencia y sincronización segura.'),
'ui-ux':('UI/UX','Implementar tokens, componentes, responsive, a11y y estados canónicos.'),
'release':('Release','Ejecutar gates, backup/restore, seguridad, carga, despliegue y rollback.'),
}
for slug,(title,desc) in skills.items():
    write(f'.claude/skills/{slug}/SKILL.md', f'''---
name: {slug}
description: {desc}
---

# {title}

## Entradas

Requisitos, decisiones, contratos y alcance de la tarea.

## Proceso

1. Validar Ready y decisiones.
2. Identificar invariantes, permisos, transacciones y pruebas.
3. Ejecutar cambio mínimo.
4. Actualizar contratos/trazabilidad.
5. Ejecutar gates.

## Salida

Resumen, archivos, migraciones, comandos, resultados, riesgos y pendientes.
''')

write('.claude/hooks/preflight.sh', '''
#!/usr/bin/env bash
set -euo pipefail
python scripts/validate_canonical_docs.py
if git diff --name-only | grep -E '(^|/)(requirements|decision-register|data-api-rbac|routes|permissions)' >/dev/null 2>&1; then
  echo "Aviso: cambio canónico detectado; actualice trazabilidad y contratos." >&2
fi
''', executable=True)

# -------------------- Prompts --------------------
prompts = f'''
# Prompts para Claude Code — Sistema web ENCUENTRO v{VERSION}

## Preámbulo obligatorio

Lee `CLAUDE.md`, fuentes canónicas, decisiones, contratos y git diff. DEC-001..004 están aprobadas. No implementes checkout automático, prorrateo, liberación de reserva confirmada por llegada tardía ni exposición pública de PII. Usa Context7/documentación oficial para APIs técnicas. Ejecuta el validador antes y después.

## P00 — Auditoría documental determinista

Solo lectura. Comprueba versiones, decisiones, requisitos, rutas, permisos, estados, mapas y configuración Claude. Genera `docs/implementation/00-document-audit.md`. Gate: validador 0.

## P01 — Toolchain, monorepo y CI

Crea workspace, web, worker, paquetes, Docker local, CI, env schema y comandos. No implementes auth productiva si DEC-016 sigue pendiente. Gate: install frozen, lint, typecheck, unit, build y docs validate.

## P02 — Sistema visual, rutas y shells

Implementa tokens, shells y rutas exactas de `contracts/routes.json`. Incluye verificación pública de comprobante y pantallas de modalidad/configuración. Gate: responsive/a11y.

## P03 — Events, RBAC y auditoría

Implementa ciclo manual, duración configurable, selector de gestión, permisos/scopes y auditoría append-only. Gate: transiciones válidas/invalidas, concurrencia y aislamiento.

## P04 — Identidad y autenticación

Ejecuta spike de Auth.js; no selecciones alternativa sin ADR. Implementa cuenta, sesiones, recuperación y protección. Gate: IDOR, enumeración, cookies y revocación.

## P05 — Inscripción, catálogo, modalidades y cargos

Implementa paquetes `PUBLIC/PRIVATE`, versiones de precio anticipado/normal, modalidad separada del canal, cargo snapshot, 50% y fecha límite. Durante `IN_PROGRESS` no prorratees ni crees tarifa tardía. Gate: anticipado/al llegar, evidencia en borde de fecha, días 1/3/final y paquete privado.

## P06 — Hospedaje

Implementa política configurable de noches, hoteles, inventario, `HELD`/`CONFIRMED`, selección de hotel y asignación de habitación. No liberes `CONFIRMED` por llegada tardía. La expiración de `HELD` queda bloqueada por DEC-005. Gate: último cupo y llegada tardía.

## P07 — Evidencias, pagos manuales, caja y comprobantes

Implementa canales manuales, carga privada, revisión, duplicados, pagos, asignaciones, caja y Comprobante de pago. No agregues proveedor automático. Emite `REC-{{EVENT_CODE}}-{{NNNNNN}}`, QR público mínimo y detalle autenticado. Gate: parcial, concurrencia, anulación, no PII.

## P08 — Check-in, credenciales y cierre operativo

Implementa check-in sin repricing, credenciales y cierre. Gate: llegada tardía con cargo intacto y bloqueo post-cierre.

## P09 — QR/PWA offline

Implementa estación, lease, manifiesto, cola, sync e idempotencia. Gate: doble entrega multiestación y reloj no confiable.

## P10 — Transporte

Vehículos, choferes, horarios, asignaciones y QR. Gate: solapamientos/capacidad.

## P11 — Alimentos, materiales y servidores

Alimentos por día, ventana, cantidades y movimientos; materiales por inventario/beneficio sin restricción por actividad pasada. Gate: fuera de horario, entrega única y stock reconstruible.

## P12 — Contabilidad y tesorería

Partida doble simplificada, cuentas, conciliaciones, rendiciones, donaciones y activos. Sin presupuestos/centros de costo. Respeta DEC-008/009.

## P13 — SMTP, notificaciones y reportes

SMTP singleton global, plantillas versionadas, jobs, historial y reportes por gestión. Caída SMTP no revierte negocio.

## P14 — Hardening, carga, backup y DR

Configura OVH VPS-3, Docker, firewall, reverse proxy, secretos, monitoreo, backup externo y restore test. No expongas PostgreSQL/Redis. Gate: seguridad, carga y rollback.

## P15 — UAT, capacitación y release

Ejecuta UAT, piloto, runbooks, capacitación y go/no-go. Despliegue cloud-first solo con autorización.

## P16 — Cambio funcional

Analiza impacto en requisitos, decisiones, ADR, esquema, API, permisos, rutas, notificaciones, pruebas, prompts y versión. Primero actualiza documentación canónica; luego implementa.

## P17 — Bugfix trazable

Reproduce, vincula requisito/contrato, escribe prueba fallida, corrige mínimo y ejecuta regresión. No cambies negocio para hacer pasar la prueba.

## P18 — Resolver decisión

No implementes. Prepara dossier, espera aprobación humana y luego actualiza registro, ADR, requisitos, contratos, diseño, trazabilidad y pruebas.

## P19 — Auditoría de entrega

Compara con fuentes, decisiones, contratos y DoD. Prioriza adivinación, scopes, lifecycle, mutabilidad, idempotencia, RBAC, PII, offline y migraciones.

## P20 — Continuidad

Lee fuentes, decisiones, git, migraciones y pruebas. Resume fase real, evidencia, deuda, bloqueos y siguiente tarea Ready antes de editar.
'''
write('prompts/Prompts_Claude_Code_IA_First_v2.7.md', prompts)

# -------------------- Contracts JSON/YAML --------------------
req_ids = re.findall(r'\| ([A-Z]+-\d{3}) \|', requirements_md)
requirements_json = {
    'version': VERSION,
    'source': 'docs/01-product/requirements.md',
    'requirements': [{'id':i, 'status':'CANONICAL'} for i in sorted(set(req_ids))]
}
write('contracts/requirements.json', json.dumps(requirements_json, ensure_ascii=False, indent=2))
write('contracts/decisions.json', json.dumps({'version':VERSION,'decisions':decisions + [{'id':i,'title':t,'status':'BLOCKING'} for i,t in pending]}, ensure_ascii=False, indent=2))

routes = [
'/', '/e/[eventCode]', '/e/[eventCode]/inscripcion', '/verificar/comprobante/[token]',
'/e/[eventCode]/mi-cuenta', '/e/[eventCode]/mi-cuenta/pagos', '/e/[eventCode]/mi-cuenta/hospedaje', '/e/[eventCode]/mi-cuenta/credencial', '/e/[eventCode]/mi-cuenta/notificaciones',
'/admin', '/admin/eventos', '/admin/configuracion/correo', '/admin/e/[eventCode]/dashboard', '/admin/e/[eventCode]/configuracion', '/admin/e/[eventCode]/catalogo', '/admin/e/[eventCode]/inscripciones', '/admin/e/[eventCode]/pagos', '/admin/e/[eventCode]/comprobantes', '/admin/e/[eventCode]/hospedaje', '/admin/e/[eventCode]/alimentos', '/admin/e/[eventCode]/materiales', '/admin/e/[eventCode]/transporte', '/admin/e/[eventCode]/contabilidad', '/admin/e/[eventCode]/reportes', '/admin/e/[eventCode]/auditoria',
'/caja/e/[eventCode]/[cashCode]', '/comision/e/[eventCode]/[commissionCode]', '/scanner/e/[eventCode]/[stationCode]'
]
write('contracts/routes.json', json.dumps({'version':VERSION,'routes':routes}, ensure_ascii=False, indent=2))

permissions = sorted(set(re.findall(r'`([a-z_]+(?:\.[a-z_]+)+)`', contracts_md)))
write('contracts/permissions.json', json.dumps({'version':VERSION,'permissions':permissions}, ensure_ascii=False, indent=2))
write('contracts/states.json', json.dumps({
'version':VERSION,
'event':['DRAFT','READY','ACTIVE','IN_PROGRESS','OPERATIONALLY_CLOSED','FINANCIALLY_CLOSED','ARCHIVED'],
'registration':['DRAFT','SUBMITTED','CONFIRMED','CANCELLED'],
'paymentComputed':['UNPAID','PARTIAL','PAID','OVERPAID','REFUNDED'],
'attendance':['NOT_ARRIVED','CHECKED_IN','NO_SHOW','COMPLETED'],
'paymentProof':['PENDING_UPLOAD','SUBMITTED','UNDER_REVIEW','APPROVED','REJECTED','CORRECTION_REQUESTED','REPLACED','CANCELLED'],
'lodging':['HELD','CONFIRMED','RELEASED','CANCELLED','EXPIRED']
}, ensure_ascii=False, indent=2))

phase_map = {
'0':['GOV-010'], '3':['EVT-001','EVT-002','EVT-003','EVT-004','EVT-005','EVT-006','EVT-016','EVT-016','EVT-009','EVT-010'],
'4':['PKG-001','PKG-009','PKG-010','PKG-012','PKG-013','REG-019','PAY-001','REG-020','REG-021','REG-022','REG-023','PKG-011','HOS-015'],
'5':['HOS-011','HOS-013','HOS-012','HOS-003','HOS-016','HOS-017','HOS-001','HOS-002'],
'6':['PAY-022','PAY-023','PAY-024','PAY-018','PAY-025','PAY-026','PAY-027','PAY-002','PAY-028','PAY-014','PAY-029','PAY-030','PAY-031','PAY-032','PAY-033','PAY-011','PAY-012'],
'10':['FOD-001','FOD-006','FOD-002','FOD-003','MAT-005','MAT-004','MAT-003']
}
write('contracts/phase-requirement-map.json', json.dumps({'version':VERSION,'phases':phase_map}, ensure_ascii=False, indent=2))
write('contracts/prompt-requirement-map.json', json.dumps({'version':VERSION,'prompts':{'P03':phase_map['3'],'P05':phase_map['4'],'P06':phase_map['5'],'P07':phase_map['6'],'P11':phase_map['10']}}, ensure_ascii=False, indent=2))

openapi = '''
openapi: 3.1.0
info:
  title: ENCUENTRO API
  version: 2.7.0
paths:
  /api/v1/registrations/{id}/payment-proofs:
    post:
      summary: Cargar evidencia de pago manual
      responses:
        '201': { description: Evidencia recibida }
  /api/v1/payment-proofs/{id}/review:
    post:
      summary: Aprobar, rechazar o pedir corrección
      responses:
        '200': { description: Revisión aplicada }
  /api/v1/public/receipts/verify/{token}:
    get:
      summary: Verificación pública mínima de Comprobante de pago
      responses:
        '200': { description: Resultado seguro }
        '404': { description: No encontrado }
  /api/v1/events/{id}/lodging-policy:
    put:
      summary: Configurar periodo y noches de hospedaje
      responses:
        '200': { description: Política actualizada }
  /api/v1/events/{id}/meal-services:
    post:
      summary: Crear servicio de alimentación con fecha, horario y cantidad
      responses:
        '201': { description: Servicio creado }
'''
write('contracts/openapi.yaml', openapi)

# -------------------- Env and docker --------------------
write('.env.example', '''
NODE_ENV=development
APP_URL=http://localhost:3000
DATABASE_URL=postgresql://encuentro:encuentro@localhost:5432/encuentro
REDIS_URL=redis://localhost:6379
OBJECT_STORAGE_ENDPOINT=http://localhost:9000
OBJECT_STORAGE_BUCKET=encuentro-private
OBJECT_STORAGE_ACCESS_KEY=change-me
OBJECT_STORAGE_SECRET_KEY=change-me
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
RECEIPT_VERIFICATION_SECRET=change-me
SESSION_SECRET=change-me
''')
write('docker-compose.example.yml', '''
services:
  postgres:
    image: postgres:17
    environment:
      POSTGRES_DB: encuentro
      POSTGRES_USER: encuentro
      POSTGRES_PASSWORD: encuentro
    volumes: [pgdata:/var/lib/postgresql/data]
  redis:
    image: redis:7-alpine
  minio:
    image: minio/minio
    command: server /data --console-address :9001
    environment:
      MINIO_ROOT_USER: change-me
      MINIO_ROOT_PASSWORD: change-me-too
volumes:
  pgdata:
''')

# -------------------- Validator --------------------
validator = r'''#!/usr/bin/env python3
from pathlib import Path
import json, sys, re
root = Path(__file__).resolve().parents[1]
errors=[]
required=[
 'VERSION','README.md','CLAUDE.md','.mcp.json','.claude/settings.json',
 'docs/01-product/requirements.md','docs/02-architecture/system-architecture.md',
 'docs/02-architecture/data-api-rbac.md','docs/03-design/design-system.md',
 'docs/04-delivery/execution-plan.md','docs/04-delivery/decision-register.md',
 'contracts/requirements.json','contracts/decisions.json','contracts/routes.json',
 'contracts/permissions.json','contracts/states.json','contracts/openapi.yaml'
]
for rel in required:
    if not (root/rel).exists(): errors.append(f'MISSING {rel}')
version=(root/'VERSION').read_text().strip()
for rel in required:
    p=root/rel
    if p.suffix in {'.md','.json','.yaml'} and p.exists() and rel!='VERSION':
        txt=p.read_text(encoding='utf-8')
        if rel not in {'.mcp.json','.claude/settings.json','contracts/openapi.yaml'} and version not in txt:
            errors.append(f'VERSION_NOT_REFERENCED {rel}')
req=json.loads((root/'contracts/requirements.json').read_text())
decs=json.loads((root/'contracts/decisions.json').read_text())
routes=json.loads((root/'contracts/routes.json').read_text())
perms=json.loads((root/'contracts/permissions.json').read_text())
states=json.loads((root/'contracts/states.json').read_text())
ids=[x['id'] for x in req['requirements']]
if len(ids)!=len(set(ids)): errors.append('DUPLICATE_REQUIREMENT_ID')
for d in ['DEC-001','DEC-002','DEC-003','DEC-004']:
    found=[x for x in decs['decisions'] if x['id']==d and x.get('status')=='APPROVED']
    if not found: errors.append(f'DEC_NOT_APPROVED {d}')
    if not (root/f'docs/04-delivery/decisions/{d}.md').exists(): errors.append(f'DEC_FILE_MISSING {d}')
if '/verificar/comprobante/[token]' not in routes['routes']: errors.append('RECEIPT_PUBLIC_ROUTE_MISSING')
for p in ['catalog.private.assign','payment.proof.review','receipt.read_sensitive','receipt.void']:
    if p not in perms['permissions']: errors.append(f'PERMISSION_MISSING {p}')
if 'IN_PROGRESS' not in states['event']: errors.append('STATE_MISSING IN_PROGRESS')
text=(root/'docs/01-product/requirements.md').read_text(encoding='utf-8')
for phrase in ['no se prorratea','50%','Documento de control interno','7 noches','8 días','Paquetes privados']:
    if phrase.lower() not in text.lower(): errors.append(f'REQUIREMENT_PHRASE_MISSING {phrase}')
if errors:
    print('\n'.join(errors))
    sys.exit(1)
print(f'OK ENCUENTRO docs v{version}: {len(ids)} requirement IDs, {len(routes["routes"])} routes, {len(perms["permissions"])} permissions')
'''
write('scripts/validate_canonical_docs.py', validator, executable=True)

# -------------------- Prototype HTML --------------------
html = r'''<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ENCUENTRO — Prototipo integral v2.7</title>
<style>
:root{--ink:#171312;--ivory:#F7F2EA;--flame:#D63B2F;--fire:#F08A24;--gold:#D6A12E;--wine:#5B2328;--stone:#D9D3CB;--ok:#2E7D32;--warn:#D98E04;--info:#2563EB;--white:#fff;--shadow:0 8px 30px rgba(23,19,18,.08)}*{box-sizing:border-box}body{margin:0;font-family:"Source Sans 3",Segoe UI,Arial,sans-serif;background:var(--ivory);color:var(--ink)}button,input,select{font:inherit}.layout{display:grid;grid-template-columns:280px 1fr;min-height:100vh}.side{background:var(--wine);color:white;padding:24px;position:sticky;top:0;height:100vh;overflow:auto}.brand{font-family:Georgia,serif;font-size:25px;font-weight:700}.brand small{display:block;font:600 12px/1.4 Arial;letter-spacing:.12em;color:#f4dba3;margin-top:7px}.nav{display:grid;gap:7px;margin-top:28px}.nav button{border:0;background:transparent;color:#fff;text-align:left;padding:11px 12px;border-radius:10px;cursor:pointer}.nav button:hover,.nav button.active{background:rgba(255,255,255,.14)}main{padding:24px 28px 64px;max-width:1440px;width:100%}.top{display:flex;gap:12px;align-items:center;justify-content:space-between;margin-bottom:24px}.event{background:white;border:1px solid var(--stone);padding:10px 13px;border-radius:12px}.badge{display:inline-flex;padding:4px 8px;border-radius:999px;font-weight:700;font-size:12px;background:#fff3cd;color:#6b4f00}.screen{display:none}.screen.active{display:block}h1,h2,h3{font-family:Georgia,serif}h1{font-size:32px;margin:0 0 8px}.lead{color:#625b57;margin-top:0}.grid{display:grid;grid-template-columns:repeat(12,1fr);gap:16px}.card{background:white;border:1px solid var(--stone);border-radius:16px;padding:18px;box-shadow:var(--shadow)}.span4{grid-column:span 4}.span6{grid-column:span 6}.span8{grid-column:span 8}.span12{grid-column:span 12}.metric strong{display:block;font-size:28px;margin-top:4px}.btn{border:0;border-radius:10px;padding:11px 15px;font-weight:700;cursor:pointer}.primary{background:var(--flame);color:white}.secondary{background:white;border:1px solid var(--stone)}.choice{border:2px solid var(--stone);cursor:pointer}.choice.selected{border-color:var(--flame);box-shadow:0 0 0 3px rgba(214,59,47,.12)}.price{font-size:30px;font-weight:800}.muted{color:#6b7280}.ok{color:var(--ok)}.warn{color:var(--warn)}.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.field{display:grid;gap:6px}.field input,.field select{padding:10px 11px;border:1px solid var(--stone);border-radius:9px;background:white}.form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.table-wrap{overflow:auto}.table{width:100%;border-collapse:collapse;min-width:720px}.table th,.table td{padding:11px;border-bottom:1px solid var(--stone);text-align:left}.table th{background:#eef3f8}.pill{display:inline-block;padding:4px 8px;border-radius:999px;font-size:12px;font-weight:700}.public{background:#e8f5e9;color:#1b5e20}.private{background:#fce4ec;color:#880e4f}.code{font-family:ui-monospace,Consolas,monospace;background:#f4f4f4;padding:3px 6px;border-radius:6px}.receipt{max-width:680px;margin:auto;border:1px solid var(--stone);background:#fff;padding:28px}.receipt .qr{width:120px;height:120px;background:repeating-linear-gradient(45deg,#111 0 5px,#fff 5px 10px);border:10px solid white;outline:1px solid #111}.footer-note{text-align:center;border-top:1px solid var(--stone);margin-top:20px;padding-top:14px;font-weight:700}.mobile{display:none}@media(max-width:900px){.layout{grid-template-columns:1fr}.side{position:static;height:auto}.nav{grid-template-columns:repeat(2,1fr)}main{padding:18px}.span4,.span6,.span8{grid-column:span 12}.form{grid-template-columns:1fr}.top{align-items:flex-start}.desktop-only{display:none}.mobile{display:block}}
</style>
</head><body><div class="layout"><aside class="side"><div class="brand">ENCUENTRO<small>LA MANSIÓN · PROTOTIPO v2.7</small></div><div class="nav" id="nav"></div></aside><main><div class="top"><div><strong>Gestión seleccionada</strong><div class="event">ENCUENTRO 2026 · <span class="badge">IN_PROGRESS</span></div></div><div class="muted">8 días · 7 noches configuradas</div></div>
<section id="dashboard" class="screen active"><h1>Panel general</h1><p class="lead">Vista integrada de las 16 áreas del sistema.</p><div class="grid"><div class="card span4 metric">Inscripciones<strong>1.248</strong><span class="ok">+83 durante IN_PROGRESS</span></div><div class="card span4 metric">Pagos anticipados<strong>62%</strong><span class="muted">50% mínimo aprobado</span></div><div class="card span4 metric">Hoteles disponibles<strong>214</strong><span class="muted">cupos restantes</span></div><div class="card span12"><h2>Módulos</h2><div class="grid" id="moduleCards"></div></div></div></section>
<section id="modalidades" class="screen"><h1>Modalidades de pago</h1><p class="lead">Solo existen dos modalidades comerciales; los canales se configuran por separado.</p><div class="grid"><div class="card span6 choice selected" data-mode="advance"><h2>Pago anticipado</h2><div class="price">USD 350</div><p class="muted">Disponible hasta 15 de octubre de 2026.</p><ul><li>Precio reducido.</li><li>50% aprobado confirma la tarifa.</li><li>Permite escoger hotel según disponibilidad.</li><li>QR Bolivia o cuenta/enlace EE. UU. con comprobante.</li></ul><button class="btn primary">Elegir anticipado</button></div><div class="card span6 choice" data-mode="arrival"><h2>Pago al llegar</h2><div class="price">USD 400</div><p class="muted">Disponible durante la llegada y el evento.</p><ul><li>Precio normal.</li><li>Efectivo o QR en caja.</li><li>Hotel entre la disponibilidad restante.</li><li>No reserva hotel antes de llegar.</li></ul><button class="btn secondary">Elegir al llegar</button></div><div class="card span12" id="modeSummary"><strong>Seleccionado:</strong> Pago anticipado · mínimo inicial USD 175.</div></div></section>
<section id="catalogo" class="screen"><h1>Paquetes y precios</h1><div class="grid"><div class="card span12"><div class="row"><button class="btn primary">Nuevo paquete</button><button class="btn secondary">Nueva versión de precio</button></div><div class="table-wrap"><table class="table"><thead><tr><th>Paquete</th><th>Visibilidad</th><th>Anticipado</th><th>Normal</th><th>Vigencia</th><th>Mínimo</th></tr></thead><tbody><tr><td>General</td><td><span class="pill public">PUBLIC</span></td><td>USD 350</td><td>USD 400</td><td>Hasta 15/10</td><td>50%</td></tr><tr><td>Servidor invitado</td><td><span class="pill private">PRIVATE</span></td><td>USD 250</td><td>USD 250</td><td>Asignación interna</td><td>100%</td></tr></tbody></table></div></div></div></section>
<section id="evento" class="screen"><h1>Configuración del evento</h1><div class="grid"><div class="card span8"><div class="form"><label class="field">Inicio<input id="start" type="date" value="2026-11-02"></label><label class="field">Fin<input id="end" type="date" value="2026-11-09"></label><label class="field">Noches de hospedaje<input id="nights" type="number" min="1" value="7"></label><label class="field">Zona horaria<select><option>America/La_Paz</option></select></label></div><p><strong>Duración calculada:</strong> <span id="days">8</span> días · <span id="nightOut">7</span> noches.</p><button class="btn primary">Guardar versión</button></div><div class="card span4"><h3>Regla DEC-004</h3><p>No existe prorrateo durante <span class="code">IN_PROGRESS</span>. Los valores 8/7 son referencias modificables.</p></div></div></section>
<section id="pagos" class="screen"><h1>Revisión de comprobantes</h1><div class="grid"><div class="card span8"><h2>Comprobante recibido</h2><p><strong>Inscripción:</strong> ENC-2026-001248 · Paquete General</p><p><strong>Declarado:</strong> USD 175 · Cuenta EE. UU. · REF 923847</p><p><strong>Cargado:</strong> 15/10/2026 22:31 — dentro del plazo</p><div class="row"><button class="btn primary" id="approve">Aprobar</button><button class="btn secondary">Solicitar corrección</button><button class="btn secondary">Rechazar</button></div></div><div class="card span4"><h3>Resultado</h3><p id="proofState" class="warn">UNDER_REVIEW</p><p id="benefit">El hotel todavía no está habilitado.</p></div></div></section>
<section id="hospedaje" class="screen"><h1>Hospedaje</h1><div class="grid"><div class="card span6"><h2>Política</h2><p>Periodo fijo: 02/11/2026 al 09/11/2026 · 7 noches.</p><p>Una reserva <span class="code">CONFIRMED</span> no se libera por llegada tardía.</p></div><div class="card span6"><h2>Selección de hotel</h2><label class="field">Hotel<select><option>Hotel Los Tajibos — 42 cupos</option><option>Hotel Camino Real — 18 cupos</option></select></label><p class="muted">La habitación será asignada por Hospedaje.</p><button class="btn primary">Confirmar hotel</button></div></div></section>
<section id="alimentos" class="screen"><h1>Configuración de alimentos</h1><div class="card"><div class="table-wrap"><table class="table"><thead><tr><th>Día</th><th>Servicio</th><th>Inicio</th><th>Fin</th><th>Disponible</th><th>Entregado</th><th>Estado QR</th></tr></thead><tbody><tr><td>Día 1</td><td>Almuerzo</td><td>12:00</td><td>14:00</td><td>500</td><td>431</td><td><span class="pill public">ABIERTO</span></td></tr><tr><td>Día 1</td><td>Cena</td><td>19:00</td><td>21:00</td><td>520</td><td>0</td><td><span class="pill private">FUERA DE HORARIO</span></td></tr></tbody></table></div><p>El QR valida fecha, horario, beneficio, disponibilidad y duplicidad.</p></div></section>
<section id="recibo" class="screen"><h1>Comprobante de pago</h1><div class="receipt"><div class="row" style="justify-content:space-between"><div><h2>Comprobante de pago</h2><div class="code">REC-ENC2026-000247</div></div><div class="qr" title="QR ilustrativo"></div></div><hr><p><strong>Nombre completo:</strong> María Pérez</p><p><strong>Código de inscripción:</strong> ENC-2026-001248</p><p><strong>Paquete:</strong> General</p><hr><p><strong>Monto aprobado:</strong> USD 175</p><p><strong>Canal:</strong> Cuenta EE. UU.</p><p><strong>Total acumulado:</strong> USD 175 · <strong>Saldo:</strong> USD 175</p><div class="footer-note">Documento de control interno</div></div></section>
<section id="verificacion" class="screen"><h1>Verificación pública</h1><div class="grid"><div class="card span6"><h2 class="ok">Comprobante válido</h2><p>Número: REC-ENC2026-000247</p><p>Evento: ENCUENTRO 2026</p><p>Emitido: 16/10/2026</p><p>Monto: USD 175</p><p>Estado: APROBADO</p></div><div class="card span6"><h3>Privacidad</h3><p>Esta vista no muestra nombre, código de inscripción, evidencia bancaria ni referencia.</p><button class="btn secondary">Ver detalle administrativo</button></div></div></section>
</main></div><script>
const screens=[['dashboard','Panel general'],['modalidades','Modalidades'],['catalogo','Catálogo'],['evento','Evento'],['pagos','Pagos'],['hospedaje','Hospedaje'],['alimentos','Alimentos'],['recibo','Comprobante'],['verificacion','Verificación QR']];const nav=document.getElementById('nav');screens.forEach(([id,label],i)=>{const b=document.createElement('button');b.textContent=label;b.className=i===0?'active':'';b.onclick=()=>{document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));document.querySelectorAll('.nav button').forEach(x=>x.classList.remove('active'));document.getElementById(id).classList.add('active');b.classList.add('active')};nav.appendChild(b)});const modules=['Identity','RBAC','Events','Registration','Catalog','Lodging','Billing','Cash','Credentials','Transport','Food','Materials','Servers','Accounting','Notifications','Reporting/Audit'];document.getElementById('moduleCards').innerHTML=modules.map(x=>`<div class="card span4"><strong>${x}</strong></div>`).join('');document.querySelectorAll('.choice').forEach(c=>c.onclick=()=>{document.querySelectorAll('.choice').forEach(x=>x.classList.remove('selected'));c.classList.add('selected');document.getElementById('modeSummary').innerHTML='<strong>Seleccionado:</strong> '+(c.dataset.mode==='advance'?'Pago anticipado · mínimo inicial USD 175.':'Pago al llegar · total USD 400.')});function calc(){const a=new Date(start.value+'T00:00:00'),b=new Date(end.value+'T00:00:00');days.textContent=Math.round((b-a)/86400000)+1;nightOut.textContent=nights.value}start.onchange=end.onchange=nights.oninput=calc;approve.onclick=()=>{proofState.textContent='APPROVED';proofState.className='ok';benefit.textContent='Tarifa anticipada confirmada. Hotel habilitado.'}
</script></body></html>'''
write('prototypes/Encuentro_Prototipo_Integral_v2.7.html', html)

# -------------------- DOCX generation --------------------
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.enum.section import WD_SECTION_START
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

BLUE = '35679A'; LIGHT='EAF0F6'; WINE='5B2328'; GRAY='6B7280'; WHITE='FFFFFF'

def set_cell_shading(cell, fill):
    tcPr=cell._tc.get_or_add_tcPr(); shd=tcPr.find(qn('w:shd'))
    if shd is None:
        shd=OxmlElement('w:shd'); tcPr.append(shd)
    shd.set(qn('w:fill'), fill)

def set_cell_margins(cell, top=80, start=80, bottom=80, end=80):
    tc=cell._tc; tcPr=tc.get_or_add_tcPr(); tcMar=tcPr.first_child_found_in('w:tcMar')
    if tcMar is None:
        tcMar=OxmlElement('w:tcMar'); tcPr.append(tcMar)
    for m,v in [('top',top),('start',start),('bottom',bottom),('end',end)]:
        node=tcMar.find(qn('w:'+m))
        if node is None:
            node=OxmlElement('w:'+m); tcMar.append(node)
        node.set(qn('w:w'), str(v)); node.set(qn('w:type'),'dxa')

def setup_doc(title, subtitle):
    doc=Document(); sec=doc.sections[0]
    sec.top_margin=Inches(.7);sec.bottom_margin=Inches(.65);sec.left_margin=Inches(.7);sec.right_margin=Inches(.7)
    styles=doc.styles
    styles['Normal'].font.name='Liberation Sans';styles['Normal'].font.size=Pt(9.5)
    for s,size,color in [('Title',24,WINE),('Heading 1',16,BLUE),('Heading 2',13,BLUE),('Heading 3',11,WINE)]:
        st=styles[s];st.font.name='Liberation Sans';st.font.size=Pt(size);st.font.color.rgb=RGBColor.from_string(color);st.font.bold=True
    p=doc.add_paragraph();p.alignment=WD_ALIGN_PARAGRAPH.CENTER
    r=p.add_run(title);r.bold=True;r.font.size=Pt(23);r.font.color.rgb=RGBColor.from_string(BLUE);r.font.name='Liberation Sans'
    p=doc.add_paragraph();p.alignment=WD_ALIGN_PARAGRAPH.CENTER
    r=p.add_run(subtitle);r.italic=True;r.bold=True;r.font.size=Pt(11);r.font.color.rgb=RGBColor.from_string(WINE)
    p=doc.add_paragraph();p.alignment=WD_ALIGN_PARAGRAPH.CENTER
    p.add_run(f'Versión {VERSION} · {DATE}').font.color.rgb=RGBColor.from_string(GRAY)
    doc.add_paragraph()
    footer=sec.footer.paragraphs[0];footer.alignment=WD_ALIGN_PARAGRAPH.CENTER
    footer.add_run(f'Sistema web ENCUENTRO · v{VERSION}').font.size=Pt(8)
    return doc

def add_table(doc, headers, rows, widths=None):
    t=doc.add_table(rows=1, cols=len(headers));t.alignment=WD_TABLE_ALIGNMENT.CENTER;t.style='Table Grid'
    for i,h in enumerate(headers):
        c=t.rows[0].cells[i];c.text=str(h);set_cell_shading(c,BLUE);set_cell_margins(c)
        for r in c.paragraphs[0].runs:r.font.color.rgb=RGBColor(255,255,255);r.bold=True;r.font.size=Pt(8.5)
    for ri,row in enumerate(rows):
        cells=t.add_row().cells
        for i,val in enumerate(row):
            cells[i].text=str(val);set_cell_margins(cells[i]);cells[i].vertical_alignment=WD_CELL_VERTICAL_ALIGNMENT.CENTER
            if ri%2: set_cell_shading(cells[i],LIGHT)
            for p in cells[i].paragraphs:
                for r in p.runs:r.font.size=Pt(8.2)
    return t

def add_bullets(doc, items):
    for x in items:
        doc.add_paragraph(x, style='List Bullet')

def add_mdish_sections(doc, sections):
    for title, body in sections:
        doc.add_heading(title, level=1)
        if isinstance(body, str):
            for para in [p.strip() for p in body.split('\n\n') if p.strip()]:
                doc.add_paragraph(para)
        else:
            for item in body:
                doc.add_paragraph(item, style='List Bullet')

# Requirements DOCX
req_doc=setup_doc('Sistema web ENCUENTRO — Requisitos y reglas','Fuente de producto consolidada — candidato canónico')
req_doc.add_heading('0. Propósito y alcance',1)
req_doc.add_paragraph('Esta versión integra DEC-001 a DEC-004 como candidato canónico. No sustituye definitivamente v2.6 hasta completar la migración de todos sus requisitos; el silencio no autoriza a inventar.')
req_doc.add_heading('1. Decisiones aprobadas',1)
add_table(req_doc,['ID','Decisión','Estado'],[(d['id'],d['title'],'APPROVED') for d in decisions])
req_doc.add_heading('2. Invariantes transversales',1)
gov_rows=[]
for m in re.finditer(r'\| (GOV-\d{3}) \| ([^|]+) \| ([^|]+) \|',requirements_md):gov_rows.append(m.groups())
add_table(req_doc,['ID','Regla','Criterio'],gov_rows)
for sec_title,prefixes in [('3. Gestión y configuración',['EVT-']),('4. Catálogo, inscripción y precios',['PKG-','REG-']),('5. Pagos, cajas y comprobantes',['PAY-','CASH-']),('6. Hospedaje',['HOS-']),('7. Alimentos y materiales',['FOOD-','MAT-'])]:
    req_doc.add_heading(sec_title,1); rows=[]
    for m in re.finditer(r'\| ([A-Z]+-\d{3}) \| ([^|]+) \| ([^|]+) \|',requirements_md):
        if any(m.group(1).startswith(p) for p in prefixes): rows.append(m.groups())
    add_table(req_doc,['ID','Requisito','Criterio'],rows)
req_doc.add_heading('8. Estados canónicos',1)
add_table(req_doc,['Dimensión','Estados'],[
('Gestión','DRAFT, READY, ACTIVE, IN_PROGRESS, OPERATIONALLY_CLOSED, FINANCIALLY_CLOSED, ARCHIVED'),
('Inscripción','DRAFT, SUBMITTED, CONFIRMED, CANCELLED'),('Pago calculado','UNPAID, PARTIAL, PAID, OVERPAID, REFUNDED'),('Asistencia','NOT_ARRIVED, CHECKED_IN, NO_SHOW, COMPLETED'),('Evidencia','PENDING_UPLOAD, SUBMITTED, UNDER_REVIEW, APPROVED, REJECTED, CORRECTION_REQUESTED, REPLACED, CANCELLED'),('Reserva','HELD, CONFIRMED, RELEASED, CANCELLED, EXPIRED')])
req_doc.add_heading('9. Exclusiones',1);add_bullets(req_doc,['Checkout automático en v1.','Prorrateo por días transcurridos.','Facturación fiscal, presupuestos y centros de costo visibles.','Microservicios y aplicación móvil nativa.'])
# Compactar el documento para evitar una última página casi vacía.
req_doc.sections[0].top_margin=Inches(.55); req_doc.sections[0].bottom_margin=Inches(.5)
req_doc.styles['Normal'].font.size=Pt(8.8)
for table in req_doc.tables:
    for row in table.rows:
        for cell in row.cells:
            for p in cell.paragraphs:
                p.paragraph_format.space_before=Pt(0); p.paragraph_format.space_after=Pt(0)
                for r in p.runs: r.font.size=Pt(7.7)
req_doc.save(ROOT/'generated-docx/Encuentro_Requisitos_y_Reglas_v2.7.docx')

# Architecture DOCX
arch_doc=setup_doc('Sistema web ENCUENTRO — Arquitectura técnica maestra','Monolito modular, worker y operación cloud-first')
add_mdish_sections(arch_doc,[
('0. Decisión arquitectónica','Monorepo pnpm, aplicación Next.js y worker Node separados. Monolito modular con PostgreSQL como fuente autoritativa.'),
('1. Infraestructura productiva', ['OVHcloud VPS-3.','Ubuntu Server 24.04 LTS.','Docker Engine y Docker Compose v2.','Web y worker separados.','PostgreSQL/Redis privados.','Cloudflare y reverse proxy.','Backups cifrados externos.','Despliegue cloud-first después de cada entrega aprobada.']),
('2. Límites internos',['presentation -> application -> domain.','Infraestructura implementa puertos.','No Prisma en React.','No reglas sustantivas en Route Handlers.','Comunicación entre módulos por casos de uso/eventos.'])])
arch_doc.add_heading('3. Módulos',1)
mods=[('Identity','Cuenta y sesión'),('RBAC','Permisos/scopes'),('Events','Gestión, duración y cierres'),('Registration','Participación y llegada'),('Catalog','Paquetes/precios/beneficios'),('Lodging','Hoteles/reservas'),('Billing','Cargos/evidencias/pagos/comprobantes'),('Cash','Cajas/cuentas'),('Credentials','QR/scans'),('Transport','Traslados'),('Food','Servicios y entregas'),('Materials','Inventario/kits'),('Servers','Voluntarios/turnos'),('Accounting','Contabilidad/tesorería'),('Notifications','SMTP/jobs'),('Reporting/Audit','Reportes/auditoría')]
add_table(arch_doc,['Módulo','Responsabilidad'],mods)
arch_doc.add_heading('4. Integración DEC-002 a DEC-004',1)
add_bullets(arch_doc,['Pagos manuales mediante evidencias; modalidad separada del canal.','Precio anticipado/normal versionado; 50% aprobado habilita hotel.','Comprobante por pago con secuencia y token opaco.','Duración y noches configurables; reserva confirmada no se libera por llegada tardía.','Alimentos por fecha/horario/cantidad; paquetes privados por RBAC.'])
arch_doc.add_heading('5. Transacciones críticas',1);add_bullets(arch_doc,['Aprobación de evidencia, pago, asignación y comprobante en una transacción/outbox.','Último cupo de hotel protegido por lock/constraint.','Entrega QR idempotente.','Cierre con versión y snapshot.'])
arch_doc.save(ROOT/'generated-docx/Encuentro_Arquitectura_Maestra_v2.7.docx')

# Contracts DOCX
con_doc=setup_doc('Sistema web ENCUENTRO — Contratos de datos, API y RBAC','Modelo, endpoints, errores y permisos consolidados')
con_doc.add_heading('1. Entidades principales',1)
entity_rows=[]
contracts_entity_section=contracts_md.split('## 3. Endpoints principales')[0]
for m in re.finditer(r'\| `([^`]+)` \| ([^|]+) \| ([^|]+) \|',contracts_entity_section):entity_rows.append(m.groups())
add_table(con_doc,['Tabla','Campos relevantes','Reglas'],entity_rows)
con_doc.add_heading('2. Endpoints críticos',1)
endpoint_rows=[
('POST','/registrations/{id}/payment-proofs','Cargar evidencia'),('POST','/payment-proofs/{id}/review','Revisar evidencia'),('POST','/cash-sessions/{id}/payments','Cobro presencial'),('GET','/public/receipts/verify/{token}','Verificación pública'),('PUT','/events/{id}/lodging-policy','Configurar noches'),('POST','/events/{id}/meal-services','Crear servicio de comida'),('POST','/registrations/{id}/assign-private-package','Asignar paquete privado')]
add_table(con_doc,['Método','Ruta','Uso'],endpoint_rows)
con_doc.add_heading('3. Permisos',1);add_table(con_doc,['Dominio','Permisos'],[(x.split(' | ')[0].strip('| '),x.split(' | ')[1].strip()) for x in []] or [('Catálogo','catalog.read, catalog.manage, catalog.private.assign'),('Pagos','payment.read, payment.proof.review, payment.collect'),('Comprobantes','receipt.issue, receipt.read, receipt.read_sensitive, receipt.void'),('Hospedaje','lodging.read, lodging.manage, lodging.assign_room'),('Alimentos/Materiales','food.manage, materials.manage, benefit.deliver'),('Auditoría','audit.read')])
con_doc.add_heading('4. Errores',1)
add_table(con_doc,['Código','HTTP','Uso'],[('PAYMENT_PROOF_DUPLICATE_REFERENCE','409','Referencia duplicada'),('ADVANCE_RATE_EXPIRED','422','Evidencia fuera de plazo'),('PRIVATE_PACKAGE_FORBIDDEN','403','Sin permiso'),('MEAL_SERVICE_OUTSIDE_WINDOW','422','Fuera de fecha/horario'),('LODGING_CAPACITY_EXCEEDED','409','Sin cupo'),('PAYMENT_NOT_EDITABLE','422','Pago confirmado inmutable')])
con_doc.save(ROOT/'generated-docx/Encuentro_Contratos_Datos_API_RBAC_v2.7.docx')

# Design DOCX
des_doc=setup_doc('Sistema web ENCUENTRO — Identidad digital y UX','Diseño, componentes, pantallas y estados')
add_mdish_sections(des_doc,[('1. Dirección visual','Sobria, carismática, contemporánea, cálida y operacionalmente clara.'),('2. Tipografía',['Playfair Display para títulos.','Source Sans 3 para UI.','ui-monospace para códigos.']),('3. Responsive y accesibilidad',['390, 768, 1280, 1440 y 1920 px.','Área táctil mínima 44×44.','WCAG 2.2 AA.','No depender solo del color.'])])
des_doc.add_heading('4. Tokens',1);add_table(des_doc,['Token','Hex','Uso'],[('--color-ink','#171312','texto'),('--color-ivory','#F7F2EA','fondo'),('--color-flame','#D63B2F','CTA'),('--color-gold','#D6A12E','en curso'),('--color-wine','#5B2328','superficie'),('--color-success','#2E7D32','éxito'),('--color-warning','#D98E04','pendiente'),('--color-danger','#C62828','error')])
des_doc.add_heading('5. Pantallas nuevas/modificadas',1);add_bullets(des_doc,['Comparador de dos modalidades.','Editor de precio anticipado/normal y paquete privado.','Configuración de duración/noches.','Bandeja de evidencias y revisión.','Selección de hotel sin habitación pública.','Servicios de alimento por día/horario.','Comprobante de pago y verificación pública mínima.'])
des_doc.add_heading('6. Microcopy aprobada',1);add_table(des_doc,['Contexto','Mensaje'],[('IN_PROGRESS','El evento está en curso. Las inscripciones y pagos continúan habilitados.'),('Anticipado pendiente','Recibimos tu comprobante. El beneficio se habilitará cuando sea aprobado.'),('Anticipado aprobado','Tu tarifa especial está confirmada. Ya puedes escoger hotel según disponibilidad.'),('Pago al llegar','Pagarás el precio normal y escogerás hotel entre las opciones disponibles al llegar.'),('Comida fuera de horario','Este servicio no está disponible en este horario.')])
des_doc.save(ROOT/'generated-docx/Encuentro_Manual_Identidad_Digital_v2.7.docx')

# Execution DOCX
exe_doc=setup_doc('Sistema web ENCUENTRO — Auditoría y plan de ejecución','Fases, gates, pruebas y go/no-go')
add_mdish_sections(exe_doc,[('1. Estado','DEC-001 a DEC-004 están integradas en una sola versión. DEC-005 y posteriores siguen pendientes cuando apliquen.'),('2. Definition of Ready',['Requisito y criterio identificados.','Decisiones resueltas.','Contratos definidos.','Pruebas previstas.','Validador en verde.']),('3. Definition of Done',['Pruebas y build pertinentes en verde.','Migración probada.','RBAC negativo e idempotencia.','A11y/responsive.','Documentación/trazabilidad actualizada.','Despliegue cloud-first autorizado y verificado.'])])
exe_doc.add_heading('4. Fases',1)
phase_rows=[('0','Gobierno/decisiones/contratos','validador'),('1','Monorepo/CI/Claude','build'),('2','Diseño/rutas','a11y'),('3','Events/RBAC','transiciones'),('4','Inscripción/catálogo','modalidades + IN_PROGRESS'),('5','Hospedaje','último cupo'),('6','Pagos/caja/recibos','parcial + QR'),('7','Check-in/cierre','sin repricing'),('8','QR offline','idempotencia'),('9','Transporte','capacidad'),('10','Alimentos/materiales','horario + stock'),('11','Contabilidad','cuadre'),('12','SMTP/reportes','colas'),('13','Hardening/DR','restore'),('14','UAT/release','go/no-go')]
add_table(exe_doc,['Fase','Alcance','Gate'],phase_rows)
exe_doc.add_heading('5. Escenarios DEC-001..004',1);add_bullets(exe_doc,['50% aprobado habilita hotel.','Evidencia antes del corte revisada después conserva tarifa.','Saldo se paga al llegar sin repricing.','Paquete privado no visible al público.','Día 1/3/final mismo precio.','Duración/noches alternativas.','Reserva confirmada no expira por llegada tardía.','Comida fuera de horario se rechaza.','Secuencia de comprobante concurrente no duplica.'])
exe_doc.save(ROOT/'generated-docx/Encuentro_Auditoria_y_Plan_de_Ejecucion_v2.7.docx')

# Master DOCX
master=setup_doc('Sistema web ENCUENTRO — Documentación maestra consolidada','Resumen ejecutivo y fuente única v2.7')
master.add_heading('1. Estado de la versión',1);master.add_paragraph('La v2.7 integra DEC-001 a DEC-004 en una línea base candidata. Debe verificarse contra la totalidad de v2.6 antes de sustituir o archivar las fuentes anteriores.')
master.add_heading('2. Decisiones aprobadas',1);add_table(master,['ID','Título','Fecha'],[(d['id'],d['title'],d['date']) for d in decisions])
master.add_heading('3. Reglas de negocio consolidadas',1);add_bullets(master,['Dos modalidades: anticipado y al llegar.','50% anticipado aprobado confirma precio y habilita hotel.','Pago manual con evidencia y revisión humana.','Comprobante de pago por cada pago aprobado.','No prorrateo durante IN_PROGRESS.','Duración y noches configurables; referencia 8 días/7 noches.','Reserva CONFIRMED no se libera por llegada tardía.','Alimentos por día/horario/cantidad.','Paquetes privados solo para Inscripciones.'])
master.add_heading('4. Arquitectura',1);add_bullets(master,['OVHcloud VPS-3, Ubuntu 24.04 LTS y Docker.','Next.js web + worker BullMQ.','PostgreSQL/Redis privados.','Monolito modular de 16 dominios.','Outbox, idempotencia, auditoría y archivos privados.'])
master.add_heading('5. Documentos del paquete',1);add_table(master,['Documento','Función'],[('Requisitos y reglas','Qué debe hacer el sistema.'),('Arquitectura maestra','Cómo se estructura técnicamente.'),('Contratos datos/API/RBAC','Modelo, endpoints, errores y permisos.'),('Identidad digital y UX','Interacción, pantallas, componentes y accesibilidad.'),('Auditoría y plan','Orden, gates, pruebas y release.'),('Prompts Claude','Procedimiento para agentes.'),('Prototipo HTML','Referencia visual navegable.')])
master.add_heading('6. Pendientes',1);add_bullets(master,[f'{i}: {t}' for i,t in pending])
master.save(ROOT/'generated-docx/Encuentro_Documentacion_Maestra_Consolidada_v2.7.docx')

# Copy prompts/readme to root aliases
shutil.copy2(ROOT/'prompts/Prompts_Claude_Code_IA_First_v2.7.md', ROOT/'Prompts_Claude_Code_IA_First_v2.7.md')
shutil.copy2(ROOT/'prototypes/Encuentro_Prototipo_Integral_v2.7.html', ROOT/'Encuentro_Prototipo_Integral_v2.7.html')

# Source gap note
write('SOURCE_GAPS.md', '''
# Nota de procedencia

La versión 2.7 es una consolidación autocontenida y no una copia binaria del ZIP v2.6 original, porque dicho ZIP no estaba montado en el entorno de trabajo. Se reconstruyó a partir de los documentos canónicos v2.6 disponibles para lectura, la arquitectura local y las decisiones aprobadas DEC-001..004. Debe revisarse como nueva línea base candidata antes de sustituir las versiones anteriores.
''')

# -------------------- Manifest --------------------
def sha256(p):
    h=hashlib.sha256()
    with p.open('rb') as f:
        for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
    return h.hexdigest()

files=[]
for p in sorted(ROOT.rglob('*')):
    if p.is_file() and p.name!='MANIFEST.sha256' and not any(part.startswith('_qa_') for part in p.relative_to(ROOT).parts):
        files.append((p.relative_to(ROOT).as_posix(),sha256(p),p.stat().st_size))
write('MANIFEST.sha256','\n'.join(f'{h}  {rel}' for rel,h,_ in files))

print(ROOT)
