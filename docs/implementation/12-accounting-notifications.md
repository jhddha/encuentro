# P12–P13 — Contabilidad y notificaciones

**Fecha:** 5 de agosto de 2026

## ⚠ Procedencia de las reglas

Estas dos fases **no tienen ningún requisito** en `contracts/requirements.json`. Se construyeron por inferencia por decisión explícita del responsable del proyecto, tras plantearle la alternativa de recuperar antes los requisitos v2.6. Esta tabla es la que permite auditar qué es qué.

### Del contrato — **no** es inferencia

| Regla | Fuente |
|---|---|
| **La partida doble.** Débitos igualan créditos | Definición del método contable, no una decisión de este proyecto |
| SMTP, reglas y plantillas son **globales**, sin `event_id` | GOV-007 |
| Una falla de integración **no revierte** una operación confirmada | GOV-008 |
| El envío ocurre por outbox y worker, nunca en la petición | ADR-007 |
| La contabilidad no se reescribe | GOV-005 |
| Sin presupuestos ni centros de costo visibles | requirements.md §2 |
| El cierre de caja compara esperado contra contado | PAY-012 |

### Inferido — **debe validarse antes de producción**

| Regla inferida | Base de la inferencia | Riesgo si es incorrecta |
|---|---|---|
| Cinco tipos de cuenta (`ASSET`, `LIABILITY`, `EQUITY`, `INCOME`, `EXPENSE`) | Método contable estándar | Bajo |
| Estructura de `journal_entries` y `journal_lines` | Prompt P12, «partida doble simplificada» | Medio |
| **El plan de cuentas concreto** | Ninguna. No se define ninguno. | **Alto si se inventara** — por eso no se inventó |
| Qué asiento genera cada operación de negocio | Ninguna | **Alto** — no implementado |
| Máquina de estados de notificación | Prompt P13 y ADR-007 | Medio |
| 5 reintentos con retroceso exponencial acotado | Práctica habitual | Bajo |
| Sintaxis de plantilla `{{variable}}` | Ninguna | Bajo |

**Lo que deliberadamente NO se inventó:** el plan de cuentas de la organización y las reglas de qué asiento produce cada cobro, cada anulación o cada donación. Eso es el núcleo del módulo contable, y equivocarse ahí significa que los libros no reflejan la realidad. La infraestructura queda lista; las reglas de negocio contables siguen pendientes de la documentación v2.6.

## 1. Gate ejecutado

| Paso | Exit |
|---|---:|
| Validador · Formato · Lint · Typecheck | 0 |
| Unitarias — **273 pruebas** | 0 |
| **Integración** — **102 pruebas** | 0 |
| Build · Accesibilidad | 0 |

## 2. El cuadre lo impone la base, no el código

Un asiento descuadrado no puede guardarse. El trigger es `DEFERRABLE INITIALLY DEFERRED` porque las líneas se insertan una a una: comprobar en cada `INSERT` haría imposible guardar la primera. La verificación ocurre **al hacer commit**, que es cuando el asiento está completo.

Verificado que se rechaza:

- un descuadre de un céntimo,
- un asiento de una sola línea,
- un importe negativo en una línea.

Y que la corrección se hace con un **asiento de reversión**, dejando ambos en el histórico — no editando el original, que los triggers impiden.

## 3. SMTP como singleton global

GOV-007 dice que SMTP es global. Se implementa con una columna `singleton` que siempre vale `true` bajo un índice único: **la base garantiza que no pueda existir una segunda fila**, en lugar de confiar en una comprobación de código que alguien pueda saltarse.

Las plantillas tampoco llevan `event_id`, y una prueba lo verifica leyendo las claves del registro.

## 4. Dos decisiones de diseño en plantillas

- **Una variable ausente falla en lugar de renderizarse vacía.** Un correo que dice «Su pago de  ha sido aprobado» es peor que no enviarlo. El error nombra todas las variables que faltan, no solo la primera.
- **El contenido de una variable no puede inyectar otra.** La sustitución es de una sola pasada, así que un valor que contenga `{{otra}}` se inserta literalmente.

## 5. Un defecto encontrado en la infraestructura de pruebas

`resetDatabase` enumeraba las tablas a mano. Al añadir `smtp_settings`, la fila singleton sobrevivía entre pruebas y hacía fallar la siguiente **por un motivo que no era el real** — el mensaje hablaba de una restricción única cuando el problema era estado sucio.

Se cambió por descubrimiento dinámico en `pg_tables`. Con la lista escrita a mano, cada fase nueva habría dejado tablas sin limpiar.

## 6. Qué NO se implementó

| Omisión | Motivo |
|---|---|
| Plan de cuentas | Sin documentar. Inventarlo sería adivinar sobre dinero. |
| Asientos automáticos por operación | Depende del plan de cuentas. |
| Rendiciones, donaciones y activos | El prompt P12 los nombra sin definirlos. |
| Envío real por SMTP | La cola y el modelo existen; el worker de envío no. |
| Reportes y exportaciones | Sin requisitos que definan qué reportes. |

## 7. Riesgos

1. **El módulo contable es una infraestructura sin reglas de negocio.** Puede registrar asientos cuadrados y garantiza que no se reescriban, pero nadie ha definido qué asiento corresponde a cada operación. **No es utilizable para llevar la contabilidad real** hasta que eso se defina.
2. **No hay worker de envío**, así que la cola se llena y nadie la vacía.
3. Siguen faltando 120 requisitos de la v2.6. Estas dos fases son las que más lo sufren.
