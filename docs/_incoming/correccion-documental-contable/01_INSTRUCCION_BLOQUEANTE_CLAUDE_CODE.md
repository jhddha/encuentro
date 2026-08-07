# INSTRUCCIÓN BLOQUEANTE PARA CLAUDE CODE

## Contexto confirmado

1. La v2.7 RC1 no puede declararse canónica definitiva porque contiene 65 requisitos, mientras la fuente v2.6 declaraba 185.
2. Los 120 requisitos restantes deben localizarse, compararse y migrarse antes de continuar con fases dependientes.
3. El módulo contable tiene estructura de partida doble y puede comprobar que los asientos cuadren, pero todavía falta una política explícita, versionada y aprobada que determine qué asiento genera cada operación.
4. No inventes cuentas, reglas de reconocimiento, estados disparadores ni asientos productivos.
5. La contabilidad del sistema es administrativa y de control del evento; no debe presentarse como sustituto de la contabilidad fiscal o legal de la institución.

## DETÉN TEMPORALMENTE

- La implementación o modificación de automatizaciones contables.
- La contabilización automática de pagos, rendiciones, donaciones, inventarios o activos.
- La declaración de P12 o de cualquier fase contable dependiente como `Ready` o `Done`.
- La eliminación, renumeración o reemplazo masivo de requisitos v2.6.
- Cualquier migración destructiva de datos contables.

# PARTE A — RESTAURAR Y TRAZAR LOS 185 REQUISITOS

Reconstruye una versión documental consolidada posterior a v2.7 RC1 usando como fuentes:

- Los 185 requisitos de v2.6 disponibles en el repositorio o paquete fuente.
- Las decisiones aprobadas posteriores a v2.6.
- DEC-001 a DEC-005 que realmente existan y estén aprobados en el repositorio.
- Las reglas incorporadas en v2.7 RC1.
- La implementación y contratos actuales del repositorio, únicamente como evidencia; el código no reemplaza una decisión documental.

## Obligaciones

1. Extrae los 185 IDs originales de v2.6.
2. Compara cada ID contra los 65 IDs validados en v2.7 RC1.
3. Clasifica cada requisito con exactamente uno de estos estados:
   - `CONSERVADO`
   - `MODIFICADO`
   - `REEMPLAZADO`
   - `PENDIENTE_DE_MIGRACION`
   - `CONFLICTO`
   - `ELIMINADO_POR_DECISION_APROBADA`
4. No renumeres requisitos existentes.
5. No dupliques requisitos equivalentes.
6. Conserva trazabilidad hacia la fuente v2.6 y hacia cada DEC posterior.
7. Actualiza de forma sincronizada, cuando los archivos existan:
   - `docs/01-product/requirements.md`
   - `requirements.json`
   - `traceability.md`
   - `phase-requirement-map.json`
   - `prompt-requirement-map.json`
   - `execution-plan.md`
   - documentos Word generados
   - validador documental
8. El validador debe exigir el nuevo total canónico y comprobar que cada requisito tenga, como mínimo: criterio de aceptación, fase, prompt y trazabilidad.
9. Completa `docs/04-delivery/requirement-migration-v2.6-to-current.md` a partir de la plantilla incluida.
10. No declares finalizada esta parte mientras exista un requisito sin clasificación o sin evidencia de procedencia.
11. Si el paquete fuente v2.6 no está disponible, detén la migración y reporta exactamente qué archivo o fuente falta; no reconstruyas los 120 requisitos por inferencia.

# PARTE B — POLÍTICA DE CONTABILIZACIÓN

Usa como punto de partida, sin implementarlo todavía:

- `docs/01-product/accounting-policy-DRAFT.md`
- `contracts/accounting-rules.schema.json`
- `contracts/accounting-rules.DRAFT.json`
- `docs/04-delivery/decisions/DEC-XXX-accounting-recognition-DRAFT.md`

Antes de asignar el DEC definitivo, verifica cuál es el siguiente identificador libre en el registro de decisiones.

## La propuesta debe resolver explícitamente

1. Base de reconocimiento.
2. Plan de cuentas mínimo por roles contables configurables.
3. Matriz operación → estado disparador → débito → crédito.
4. Pagos parciales, asignaciones, saldos a favor y sobrepagos.
5. Compras pagadas y compras pendientes.
6. Donaciones monetarias, en especie y servicios.
7. Desembolsos, rendiciones, devoluciones y diferencias.
8. Reembolsos de recursos propios.
9. Inventarios comprados y donados.
10. Consumo, desperdicio, pérdida y sobrante de inventarios.
11. Activos comprados y donados.
12. Cajas, bancos, QR, pasarelas y transferencias.
13. Comisiones de pasarela.
14. Reversiones y correcciones.
15. Conciliaciones y diferencias.
16. Cierre financiero y periodos de ajuste.
17. Idempotencia mediante `source_type + source_id + entry_kind`.
18. Tratamiento multimoneda bloqueado hasta una decisión aprobada.
19. Tratamiento de sobrepagos bloqueado o limitado según la decisión aprobada.
20. Operaciones que no generan asiento.

## Reglas técnicas

Cada regla machine-readable debe contener como mínimo:

- `rule_code`
- `version`
- `source_type`
- `source_status`
- `entry_kind`
- `recognition_event`
- `debit_account_role`
- `credit_account_role`
- `amount_source`
- `currency_policy`
- `event_scope`
- `commission_policy`
- `responsible_policy`
- `non_cash`
- `reversal_rule_code`
- `idempotency_key_expression`
- `blocking_decisions`
- `effective_from`
- `effective_to`
- `status`

No escribas números de cuenta rígidos en código. Usa roles contables o códigos configurables resueltos por el plan de cuentas del evento.

# PARTE C — INFORME PREVIO OBLIGATORIO

Antes de modificar el motor contable o declarar completada la migración, entrega un `READINESS_REPORT.md` que incluya:

- Total de requisitos encontrados en v2.6.
- Total de requisitos actuales.
- Requisitos conservados.
- Requisitos modificados.
- Requisitos reemplazados.
- Requisitos pendientes.
- Conflictos.
- Requisitos eliminados por decisión aprobada.
- Reglas contables propuestas.
- Decisiones todavía bloqueantes.
- Archivos que se modificarían.
- Partes del código que deben permanecer detenidas.
- Pruebas y validadores que se agregarían.
- Riesgos de migración y estrategia de reversión.

# CRITERIO DE SALIDA

No implementes las reglas contables hasta recibir aprobación expresa de:

1. La política de reconocimiento.
2. La matriz completa de asientos.
3. El plan de cuentas mínimo.
4. Las reglas de reversión e idempotencia.
5. La resolución de multimoneda, sobrepagos y cierre.
6. El informe de migración de los 185 requisitos.
