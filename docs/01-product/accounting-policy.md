# Política contable

**Estado:** `APPROVED` por [DEC-018](../04-delivery/decisions/DEC-018.md) el 7 de agosto de 2026
**Alcance:** contabilidad administrativa y control financiero del evento
**No sustituye:** libros fiscales, declaraciones tributarias ni contabilidad legal de la institución (`ACC-001`)

## Dónde vive cada cosa

La matriz operación→asiento **existe en un solo sitio canónico**, deliberadamente. Copiarla a tres documentos garantiza que los tres diverjan y que nadie sepa cuál manda.

| Qué | Dónde |
|---|---|
| La decisión, su razonamiento y la matriz legible | [`DEC-018`](../04-delivery/decisions/DEC-018.md) |
| Las reglas en forma ejecutable | [`contracts/accounting-rules.json`](../../contracts/accounting-rules.json) |
| Los requisitos que gobiernan el módulo | `requirements.md` §16, `ACC-001` a `ACC-016` |

Este documento recoge lo que no es ni decisión ni regla: cómo se opera la política y qué sigue abierto.

## Base de reconocimiento

**Efectivo modificado.** El ingreso se reconoce cuando un pago está aprobado **y aplicado** a un concepto. Un pago aprobado sin aplicar es pasivo, no ingreso. Un desembolso a un responsable es activo por rendir hasta que la rendición se aprueba.

Crear un cargo, una inscripción o una reserva no genera asiento. En v1 nada confirma un pago salvo una persona revisando una evidencia (DEC-002, DEC-015).

## Roles, no cuentas

La política fija **veintidós roles contables**, no números de cuenta. Eran veintiuno en DEC-018; [DEC-020](../04-delivery/decisions/DEC-020.md) añadió `SERVER_REGISTRATION_REVENUE` al abrir el módulo de servidores. La organización asigna a cada rol una cuenta de su plan, por gestión.

**Sin esa asignación el motor no puede resolver ningún asiento.** Es el requisito operativo previo a contabilizar, y conviene tratarlo como parte de la puesta en marcha de cada gestión, junto a paquetes, hoteles y canales de pago.

Ningún número de cuenta debe aparecer en el código. Un rol sin cuenta asignada es un error de configuración que el sistema debe reportar, no un asiento que se inventa.

## Puesta en marcha de una gestión

1. Crear el plan de cuentas de la gestión.
2. Asignar una cuenta a cada uno de los veintidós roles.
3. Verificar que ningún rol quede sin cuenta antes de habilitar cobros.

La clonación de una gestión copia el plan de cuentas (`EVT-008`), así que a partir de la segunda edición este paso se reduce a revisar.

## Qué sigue abierto

Estos puntos **no** los resuelve DEC-018 y deben decidirse antes de que afecten a un asiento real:

| Tema | Requisito afectado | Cuándo urge |
|---|---|---|
| Método de valoración de donaciones en especie | `ACC-006` | Antes de aceptar la primera donación en especie |
| Tratamiento de la diferencia de cambio bancaria | — | Antes del primer cierre financiero con dos monedas |
| Umbrales y responsables de aprobación de egresos | `ACC-007` | Antes del primer desembolso |
| Depreciación de activos | `ACC-011` | Fuera de alcance en v1 |

## Moneda funcional: resuelto

**Los libros se llevan en bolivianos.** La organización lo confirmó el 11 de agosto de 2026 y el sistema ya lo aplica: `ENC2026` tiene `currency = BOB`, y solo **caja y bancos** existen por duplicado —una cuenta por divisa— porque son los únicos que guardan dinero real en cada una. Ingresos, gastos y pasivos viven en bolivianos.

Un cobro en dólares entra convertido con la tasa que se congeló al cargar la evidencia (DEC-009). La conversión ocurre **en un solo punto**, al aprobar: `requireBookedAmount` en `packages/domain/src/billing.ts`. A partir de ahí, el pago, su reparto, el saldo y el comprobante están en bolivianos, y la evidencia conserva el dólar original porque es lo que dice el extracto bancario de la persona.

Una evidencia multimoneda sin tasa congelada **no es aprobable**: se rechaza con `EXCHANGE_RATE_MISSING` y el mensaje explica el remedio, que no es evidente —registrar la tasa ahora no rellena una evidencia ya cargada; hay que registrarla y pedir corrección.

Lo que sigue abierto es solo la otra mitad: **la diferencia de cambio bancaria**, la que aparece cuando el banco acredita a una cotización distinta de la congelada. Es un hecho posterior y de otro origen —conciliación bancaria, no revisión de comprobantes— y no tendrá asiento hasta que exista el motor contable.

## Lo que la política prohíbe

- Reconocer como ingreso un pago no aplicado.
- Marcar como gasto un desembolso cuya rendición no está aprobada.
- Editar un asiento contabilizado; la corrección es por reversión enlazada (`ACC-003`).
- Contabilizar dos veces la misma fuente: lo impide un índice único, no la disciplina del código (`ACC-002`).
- Devolver dinero. DEC-007 y DEC-008 no lo admiten en v1: la cancelación y el sobrepago dejan saldo a favor.
