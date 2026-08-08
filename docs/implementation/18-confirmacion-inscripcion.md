# Registrar la confirmación de la inscripción

**Fecha:** 8 de agosto de 2026
**Alcance:** REG-017, con GOV-005, GOV-006 y DEC-008.
**Cierra:** el pendiente 1 de [`17-bloque1-pagos-peregrino.md`](17-bloque1-pagos-peregrino.md).

## 1. Qué faltaba, y no era solo el llamador

`confirmRegistration` e `inspectConfirmation` se escribieron el 7 de agosto, con sus pruebas. Al mirar de cerca, el hueco era mayor de lo que decía el traspaso:

- **El puerto no tenía adaptador.** `RegistrationConfirmationRepository` estaba declarado en la capa de aplicación y no lo implementaba nadie. No es que faltara quien llamara: no había nada debajo.
- **Quien aprueba pagos no tenía el permiso.** `confirmRegistration` exige `registration.update`, y TESORERIA no lo lleva — solo INSCRIPCIONES. Pero en v1 el saldo únicamente puede llegar a cero al aprobar una evidencia, y eso lo hace tesorería.

Así que «llamar a la función» era en realidad una decisión: **quién dispara la confirmación**. REG-017 fija el criterio —«política única de dominio, sin confirmación manual dispersa»— pero no dice quién la ejecuta ni cuándo, y las fuentes tampoco. Se consultó al responsable, que eligió **los dos caminos**.

## 2. Gate ejecutado

| Paso | Resultado |
|---|---|
| Validador de documentos | 163 IDs, 31 rutas, 55 permisos · exit 0 |
| Prettier · ESLint · `tsc` | exit 0 |
| Unitarias | **418** (411 previas + 7 nuevas) · exit 0 |
| Integración | **162** (147 previas + 15 nuevas) · exit 0 |
| `pnpm build` | exit 0 |

Sin migraciones y **sin permisos nuevos**.

## 3. Los dos caminos

| | Derivado | Manual |
|---|---|---|
| Dónde | dentro de la transacción de `approve()` | `/admin/e/…/inscripciones` |
| Cuándo | el pago deja el saldo en cero | alguien pulsa |
| Permiso | `payment.proof.review`, el ya validado | `registration.update` |
| Actor auditado | el revisor | quien pulsa |
| Rastro | `registration.confirm` con `derivedFrom` | `registration.confirm` sin él |

La acción de auditoría es **la misma** a propósito, para que un reporte cuente juntas ambas vías; el payload dice cuál fue cuál.

### Por qué el derivado no necesita `registration.update`

Porque no está editando la inscripción: está aplicando una consecuencia que el dominio deriva del dinero. La alternativa —dar `registration.update` a TESORERIA— le habría dado también la capacidad de editar inscripciones en general, que es mucho más de lo que hace falta para que un pago saldado confirme una plaza.

### Por qué el derivado va dentro de la transacción

Porque las dos cosas son el mismo hecho: si el dinero entró y ya no se debe nada, la persona está inscrita. Separarlas dejaría una ventana en la que el peregrino ve saldo cero e inscripción sin confirmar, y esa ventana duraría **para siempre** si el proceso muriera en medio.

El saldo se relee de la base con las asignaciones recién escritas dentro. Calcularlo con lo que el caso de uso vio antes de escribir daría un número de hace milisegundos, y esto decide si alguien está inscrito.

## 4. Una aprobación de pago no puede reventar por el estado de la inscripción

`decideConfirmation` lanza `REGISTRATION_TRANSITION_INVALID` cuando la transición a `CONFIRMED` no existe. Eso es correcto para el camino manual y **catastrófico** para el derivado: si la inscripción ya estaba confirmada —porque el botón se adelantó— o se canceló mientras el comprobante estaba en revisión, la excepción revertiría la transacción entera y **se perdería un cobro legítimo**.

De ahí `shouldConfirm`, que contesta sí o no sobre la misma regla y no lanza nunca. No es una segunda política: delega en `decideConfirmation` y solo cambia la forma de responder, que es lo que REG-017 exige al pedir una única fuente.

Dos pruebas de integración lo fijan: con la inscripción ya confirmada y con la inscripción cancelada, la aprobación termina, el pago se crea y el comprobante se emite.

## 5. La carrera, y lo que descubrí al probarla

Con dos caminos al mismo estado hay que decidir qué pasa cuando ambos corren. Anuncié que el compare-and-swap lo resolvería y que el camino manual recibiría «la inscripción cambió, recárguela».

**Estaba equivocado, y la prueba de integración lo demostró.** El compare-and-swap nunca llega a ejecutarse: el dominio se adelanta, porque `CONFIRMED → CONFIRMED` no es una transición legal. Quien pulsaba el botón habría leído *«No existe transición de CONFIRMED a CONFIRMED»* — un mensaje que describe un error de programación y no lo que ocurrió.

Corregido en `confirmRegistration`: cuando la transición no existe, se traduce a `EVENT_VERSION_CONFLICT` con el mensaje de recarga. Con dos caminos hacia el mismo estado, perder la carrera es un resultado previsto, no un fallo. Una inscripción cancelada entretanto recibe la misma respuesta y por la misma razón: lo que la persona necesita saber es que su pantalla está vieja.

## 6. El defecto que esto destapó en la sesión anterior

Al escribir la bandeja apareció que `decideConfirmation` **también lanza para `DRAFT`**: `CONFIRMED` solo es alcanzable desde `SUBMITTED`.

`findAccountStatement` —commiteado esta misma mañana— preguntaba por `DRAFT` y `SUBMITTED`. Una inscripción en `DRAFT` habría hecho reventar el estado de cuenta del peregrino con una excepción sin traducir.

La revisión adversarial de la sesión anterior lo señaló y su verificador lo refutó por inalcanzable: hoy ningún camino de producción crea inscripciones en `DRAFT`. La refutación era correcta sobre la alcanzabilidad y equivocada sobre el código: **`DRAFT` es el valor por defecto de la columna en el esquema**, así que cualquier fila creada sin estado explícito —un fixture, el alta presencial de IAM-012 cuando exista, un `INSERT` a mano— cae ahí. Preguntar por `DRAFT` no era una precaución, era un error.

Corregido en los dos sitios que lo hacían: el estado de cuenta y la bandeja nueva.

## 7. La bandeja no consulta fila por fila

Preguntar con `inspectConfirmation` registro a registro daría tres consultas por inscripción; con seiscientas, mil ochocientas para pintar una tabla. `listRegistrationsWithBalance` lo resuelve en una pasada y aplica `decideConfirmation`, la misma función del dominio. «Política única» es sobre la regla, no sobre cuántas veces se consulta la base.

La bandeja muestra además el saldo junto al estado, porque son la misma pregunta, y dice «Falta saldo por cubrir» cuando la regla se niega: sin esa frase, quien mira no sabe si falta dinero o falta que alguien pulse.

El botón solo aparece a quien tiene `registration.update`. El caso de uso lo rechazaría igual, pero ofrecer un botón que siempre falla es peor que no ofrecerlo.

## 8. Riesgos y pendientes

1. **El camino manual apenas tiene casos.** Hoy solo alcanza a una inscripción cuyo saldo llegó a cero por una vía que no fue la aprobación —en la práctica, una sin cargos—. Su razón de ser real es la exención total de REG-017, cuyo mecanismo es alcance aplazado y no existe. Conviene revisar si sigue justificándose cuando llegue la caja (bloque 3), que será el segundo disparador del camino derivado.
2. **La cancelación no revierte la confirmación.** REG-009 dice que cancelar no elimina pagos ni trazabilidad, y `CONFIRMED → CANCELLED` es legal, pero **nadie cancela inscripciones todavía**: no hay caso de uso ni pantalla. Cuando lo haya, habrá que decidir qué pasa con el saldo a favor que DEC-007 deja.
3. **`attendanceStatus` sigue sin tocarse.** Confirmar la inscripción no registra llegada: REG-010 es otra operación, del bloque 3.
