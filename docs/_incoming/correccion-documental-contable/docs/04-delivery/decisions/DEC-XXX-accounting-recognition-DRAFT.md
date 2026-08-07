# DEC-XXX — Reconocimiento contable y matriz de asientos

**Estado:** BORRADOR — NO ASIGNAR NÚMERO HASTA VERIFICAR EL SIGUIENTE DEC LIBRE  
**Fecha:** pendiente  
**Responsables:** Administración, Contabilidad y equipo técnico

## Contexto

El sistema dispone de estructuras para registrar asientos de partida doble y verificar que cuadren. Sin embargo, la documentación todavía no define de forma aprobada qué operación de negocio dispara cada asiento, qué estado debe alcanzar, qué importe se usa ni cómo se revierte.

Sin esta decisión, el motor contable puede almacenar asientos técnicamente válidos pero económicamente incorrectos o inconsistentes entre módulos.

## Decisión propuesta

1. Adoptar una base de efectivo modificada para la contabilidad administrativa del evento.
2. Reconocer ingresos cuando el pago esté confirmado y aplicado.
3. Registrar pagos no aplicados y sobrepagos como anticipos o saldos a favor.
4. Registrar desembolsos a responsables como anticipos por rendir.
5. Reconocer gastos de rendición únicamente al ser aprobados.
6. Permitir cuentas por pagar para compras y reembolsos aprobados pendientes de pago.
7. Registrar donaciones en especie y servicios como asientos no monetarios con valoración aprobada.
8. Gestionar inventario mediante entradas y salidas diferenciadas.
9. No calcular depreciación automática en la primera versión.
10. Bloquear conversión multimoneda automática hasta una decisión específica.
11. Usar roles contables configurables, no números de cuenta codificados.
12. Hacer inmutables los asientos contabilizados y corregirlos por reversión.
13. Aplicar idempotencia por evento, fuente, identificador, tipo de asiento y versión de regla.

## Alcance

Esta decisión regula el registro administrativo y la trazabilidad financiera del evento. No declara al sistema como solución fiscal, tributaria o de libros legales.

## Consecuencias

### Positivas

- Evita que cada módulo invente sus propios asientos.
- Permite pruebas deterministas e idempotentes.
- Facilita auditoría, reversión y conciliación.
- Mantiene el plan de cuentas configurable por evento.

### Costos y riesgos

- Requiere revisar estados y disparadores de todos los módulos económicos.
- Puede exigir migraciones de asientos previamente generados.
- Necesita aprobación funcional de Contabilidad antes de activar automatismos.
- Multimoneda, sobrepagos y cierre permanecerán bloqueados hasta sus decisiones específicas.

## Matriz vinculada

La matriz inicial se encuentra en:

- `docs/01-product/accounting-policy.md`
- `contracts/accounting-rules.json`

La versión DRAFT incluida en el paquete no debe copiarse como aprobada sin revisión.

## Criterios de aceptación

- Cada operación económica tiene una regla o una declaración explícita de “no genera asiento”.
- Cada regla identifica estado disparador, importe, débito, crédito, reversión e idempotencia.
- Los asientos contabilizados son inmutables.
- Las pruebas cubren ejecución repetida, reversión, pagos parciales y cierre.
- No existen números de cuenta rígidos en la lógica de dominio.
- El validador documental detecta reglas sin cuenta, sin reversión o con decisiones bloqueantes pendientes.

## Estado de aprobación

Pendiente de revisión y aprobación expresa.
