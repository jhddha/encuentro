# Bloque 1 — el peregrino declara su pago

**Fecha:** 8 de agosto de 2026
**Alcance:** PAY-018, PAY-021, PAY-025, PAY-026, PAY-027, PAY-002, REG-017, DEC-008.
**Cierra:** el «Inmediato» del bloque 1. La mitad del revisor llegó en la sesión del 7 de agosto; esta es la otra mitad.

## 1. Qué faltaba

El revisor tenía bandeja, panel y las tres decisiones —aprobar, rechazar, pedir corrección—. Lo que no existía era **de dónde salía lo que revisaba**. Sin la carga de evidencias, la mitad de los seiscientos peregrinos que paga por anticipado no tenía forma de pagar, y la pantalla del revisor solo podía llenarse a mano desde un fixture.

Había además un circuito cortado que no se veía desde ninguno de los dos lados: el revisor podía **pedir una corrección que nadie podía hacer**. La evidencia quedaba en `CORRECTION_REQUESTED` para siempre, y ni la máquina de estados ni ninguna prueba protestaban, porque la transición de vuelta estaba declarada y no la ejercitaba nadie.

## 2. Gate ejecutado

| Paso | Resultado |
|---|---|
| Validador de documentos | 163 IDs, 31 rutas, 55 permisos · exit 0 |
| Prettier · ESLint | exit 0 |
| `tsc --build` + `tsc --noEmit` de la web | exit 0 |
| Unitarias | **411** (345 previas + 66 nuevas) · exit 0 |
| Integración | **147** (129 previas + 18 nuevas) contra Postgres, Redis y MinIO reales · exit 0 |
| `pnpm build` | exit 0 · 31 rutas |

Las nuevas de integración encontraron dos defectos en su primera ejecución (§10), y una revisión adversarial posterior encontró otros tres (§11). Ninguno de los cinco lo detectaba el gate.

## 3. La autorización del peregrino no es un permiso

El peregrino **no tiene ninguna asignación de rol**. No es un descuido: DEC-014 se apoya justamente en eso para eximirlo del segundo factor, y IAM-003 prohíbe una columna de rol en la tabla de usuarios. La consecuencia es que `can()` devuelve `false` para cualquier permiso que se le pregunte, y darle un rol para que pueda pagar lo suyo le daría alcance sobre lo ajeno.

Lo que le autoriza es **ser el titular**. PAY-021 lo dice literalmente —«el autoservicio solo paga cargos propios»— y separa ese caso del de caja y tesorería, que operan por permiso y con pagador explícito.

Así que el dominio gana una segunda primitiva junto a `authorize`:

```ts
owns(actor, ownerUserId)            // ¿es suya?
authorizeOwnership(actor, ownerUserId)
```

Dos detalles que importan:

- **`null` nunca autoriza.** IAM-012 admite inscribir presencialmente sin correo, y esas inscripciones tienen `person.user_id` nulo. Tratar el nulo como coincidencia las dejaría accesibles a cualquiera.
- **El mensaje de rechazo es el mismo que el de «no existe»**, igual que en `authorize`. Distinguirlos convertiría el error en un oráculo para enumerar inscripciones ajenas.

## 4. El archivo se guarda al final

El orden de las operaciones es la decisión de diseño con más consecuencias del módulo.

Lo natural sería subir el archivo, obtener su clave y llamar al caso de uso. Eso deja **un objeto huérfano en el almacén por cada intento rechazado**: importe mal escrito, referencia repetida, canal deshabilitado. Nadie los recogería, y el bucket privado acumularía comprobantes bancarios sin fila que los referencie.

Aquí el caso de uso valida todo primero y **después** invoca el puerto `EvidenceStore`. Tres pruebas lo fijan: no se guarda nada si la declaración se rechaza, no se guarda nada si el actor no es el titular, y se guarda exactamente una vez cuando todo vale.

El efecto secundario es que la lista blanca de tipos y el límite de 10 MB tuvieron que bajar al dominio (`EVIDENCE_CONTENT_TYPES`, `EVIDENCE_MAX_BYTES`). El almacén los vuelve a comprobar como última barrera, pero ya no es quien produce el mensaje: `ObjectStorageError` no es un `DomainError` y `runAction` lo dejaría escapar como pantalla de error genérica en vez de como una frase que el peregrino pueda actuar.

## 5. La referencia duplicada la decide el índice, no una consulta

PAY-027 se cumple con `@@unique([event_id, reference])` y nada más. La alternativa —comprobar antes y escribir después— deja una ventana en la que dos envíos simultáneos pasan los dos.

El repositorio traduce la violación `P2002` a un resultado tipado, y el caso de uso lo convierte en `PAYMENT_PROOF_DUPLICATE_REFERENCE`. Se filtra por el nombre del índice: cualquier otra colisión única es un fallo distinto, y presentarla como referencia duplicada le diría al peregrino algo falso sobre su comprobante.

La prueba de integración lanza dos cargas simultáneas con la misma referencia y comprueba que queda **una sola fila**.

## 6. La corrección es la misma fila

`CORRECTION_REQUESTED -> SUBMITTED` estaba en la máquina de estados desde el origen. Se implementa como actualización de la fila existente, no como evidencia nueva, por dos razones que apuntan al mismo sitio:

- La referencia bancaria es única por gestión. Volver a declarar el mismo comprobante corregido como fila nueva chocaría contra el índice.
- La evidencia es **una transferencia**, no un intento. Duplicarla al corregirla haría que el revisor viera dos comprobantes donde hubo un pago.

El motivo del rechazo se limpia de la fila al corregir —dejarlo haría que el revisor leyera como pendiente algo ya atendido— pero **sobrevive en `audit_logs`**, que no se reescribe (GOV-009). Hay una prueba que lo comprueba explícitamente.

El compare-and-swap incluye el estado, no solo la versión: dos correcciones enviadas a la vez traen la misma versión esperada, y la segunda debe encontrar la fila ya en `SUBMITTED`.

## 7. El saldo a favor no estaba donde parecía

`computeBalance` compara **cargos contra asignaciones**, y `PAY-020` impide asignar a un cargo más de lo que debe. Por tanto ese saldo no puede salir negativo: el sobrepago no aparecía por ningún lado.

El sobrepago vive en la parte del **pago** que no se repartió. Al aprobar una evidencia por más de lo debido, `reviewPaymentProof` deja el excedente sin asignar a propósito (DEC-008) y lo anota en el snapshot del comprobante — pero ninguna consulta lo recuperaba.

De ahí `creditBalance(pagos, asignaciones, moneda)`: la diferencia entre lo cobrado y lo repartido. Es lo que el estado de cuenta muestra como «Saldo a favor», con la frase que DEC-007 obliga a decir en voz alta: no se devuelve en efectivo.

## 8. Lo que estas pantallas dicen y no ocultan

Dos cosas que el estado de cuenta afirma y conviene que consten:

1. **REG-017 explicado, no solo aplicado.** Quien ha pagado la mitad ve «Enviada» y la frase que dice por qué: la confirmación exige saldo cero. Sin ella no sabría si falta algo suyo o algo de la organización. La decisión la toma `decideConfirmation`, la misma función que usaría el caso de uso que confirma — no una copia de la regla.

2. **Nadie confirma inscripciones todavía.** `confirmRegistration` existe desde el 7 de agosto y **no lo invoca nadie**. Cuando el saldo llega a cero, la pantalla dice que la organización registra la confirmación, en vez de mostrar «Confirmada» y afirmar algo que la base no dice. Queda como pendiente 1 de §10.

## 9. Cuatro citas a requisitos que no existen

Al leer el módulo aparecieron citas a dos familias que **no están en el contrato**: una de privacidad, en tres archivos —el almacén de evidencias, su prueba de integración y la bandeja del revisor—, y otra de control de acceso, en el traductor de acciones de servidor. Cuatro citas en total, inventadas en su día y nunca detectadas.

Lo incómodo no es la cita, sino dónde estaba el fallo. La comprobación 3 del validador —«ninguna cita del repositorio apunta a un requisito inexistente»— **no podía detectarlas**: su expresión regular enumeraba las familias una a una, y ninguna de las dos figuraba. Buscaba citas inventadas y solo encontraba las de las familias que ya conocía. Es el mismo error que el validador existe para impedir, dentro del validador.

Ahora acepta cualquier prefijo de dos a cuatro mayúsculas y excluye por lista lo que no es un requisito (`DEC`, `ADR`, `TBD`, `SHA`, `REF`…). Al activarla salieron exactamente esas cuatro y ninguna más. Sustituidas por las canónicas: `PAY-018` para el archivo privado, `PAY-032` y la regla `03-security-rbac` para la ausencia de PII en las claves, `IAM-010` para la verificación de permisos en la aplicación.

**Este informe no nombra los identificadores retirados, y es deliberado.** `handoff.md` está exento de la comprobación porque explica una colisión de numeración y necesita nombrar las dos numeraciones a la vez. Un informe de implementación no: es justo el tipo de documento que más cita requisitos y donde menos conviene abrir un hueco. Nombrar las familias en vez de los ordinales dice lo mismo sin pedir una excepción, y los números siguen en el historial de git.

## 10. Lo que encontraron las pruebas de integración

Dos defectos, ambos en código que compilaba, pasaba ESLint y pasaba las 394 unitarias.

**La traducción de PAY-027 no funcionaba.** El repositorio buscaba las columnas en conflicto en `meta.target`, que es donde las pone Prisma clásico. Con **Prisma 7 y el driver adapter de Postgres** ese campo viene sin definir: las columnas están en `meta.driverAdapterError.cause.constraint.fields`. El `P2002` escapaba sin traducir y el peregrino habría recibido una pantalla de error genérica en lugar de «esa referencia ya existe».

Las unitarias no podían verlo: el doble de prueba devolvía el resultado tipado que el caso de uso esperaba, así que verificaban la traducción del resultado, no su detección. La forma real del error se comprobó con una sonda contra la base antes de corregir, y ahora se leen ambas formas para que una actualización de Prisma en cualquier dirección no lo rompa otra vez en silencio.

**`Decimal.toString()` quita los ceros finales.** Una columna `Decimal(12, 2)` que guarda `420.00` devuelve `"420"`. Es indiferente para operar —`money("420", "USD")` da el mismo importe— pero no para mostrar: la pantalla enseñaría «420 USD» junto a «210.50 USD» y las columnas dejarían de alinearse.

**Es un defecto que ya existía**: `listProofsPendingReview` y `findProofDetail` lo arrastran desde que se escribieron, así que la bandeja del revisor viene enseñando importes sin céntimos. Corregido en los tres sitios con `decimalText`, que convierte a través del dominio y no con `toFixed`: `toFixed` opera en coma flotante, que es exactamente lo que NFR-014 prohíbe para dinero.

## 11. Lo que encontró la revisión adversarial

Con el gate ya en verde, el cambio pasó por cinco revisores independientes —seguridad, dinero, concurrencia, viabilidad de las pruebas y fidelidad a los requisitos— y cada hallazgo por un verificador cuyo encargo era refutarlo. De veintiséis hallazgos, sobrevivieron tres. Los tres eran reales y los tres están corregidos.

### El límite de 1 MB hacía inalcanzable el máximo de 10 MB que la pantalla promete

Toda la evidencia viaja como `FormData` a una acción de servidor, y **Next corta el cuerpo en 1 MB por defecto**: responde 413 en texto plano antes de ejecutar nada, así que ni el caso de uso ni `DomainError` intervenían. Una foto de comprobante hecha con el móvil pesa entre 2 y 5 MB.

El resultado habría sido el peor posible: la carga fallando para la mayoría de los peregrinos, sin ningún mensaje —la promesa rechazada subía al *error boundary*, no a `setError`— y con la pantalla diciendo «hasta 10 MB» al lado. El límite del dominio existía y era inalcanzable por encima de un megabyte.

Corregido en tres puntos: `experimental.serverActions.bodySizeLimit` a 12 MB —con margen sobre los 10 del dominio por la sobrecarga del multipart, verificado contra la documentación de Next 16—, un `try/catch` alrededor de la llamada para que cualquier fallo de transporte se convierta en mensaje, y una comprobación de tamaño en el cliente para no subir diez megas y que los rechacen al llegar. La autoridad sigue siendo el dominio; lo demás es cortesía.

### El autoservicio aceptaba canales de caja

PAY-024 reserva el efectivo y el QR para caja, y PAY-011 exige que todo cobro presencial ocurra en una sesión de caja abierta. El código lo sabía en tres comentarios y lo aplicaba **en un solo sitio: la consulta que llena el desplegable**.

Pero el identificador del canal viaja en el formulario, y el endpoint que Next genera para la acción de servidor es invocable directamente. `resolveChannel` comprobaba que el canal existiera, fuera de esta gestión y estuviera activo — nunca que fuera anticipado. Presentar el identificador de un canal `CASH` producía una evidencia perfectamente aprobable cuyo pago **nunca pasaba por ningún arqueo**, y que aun así bajaba el saldo del peregrino y podía llevarlo a cero.

Es el error que mis propios comentarios dicen evitar: la interfaz filtra, el servidor no. Ahora `resolveChannel` rechaza cualquier canal fuera de `ADVANCE_CHANNELS`, con prueba unitaria para los dos canales de caja y prueba de integración con el canal realmente creado en la base.

### La fecha de hoy se rechazaba por futura a primera hora

`assertDeclarableEvidence` comparaba `paidAt` contra el instante actual, y la fecha declarada se anclaba a mediodía UTC. En La Paz (UTC−4), entre medianoche y las ocho de la mañana el ancla del día en curso queda **por delante del reloj**: el peregrino declaraba el pago que acababa de hacer y recibía «la fecha del pago no puede ser futura».

La causa de fondo no era el anclaje sino la duplicación: el tope del campo (`max`) se calculaba en la zona de la gestión y la validación en UTC. Dos respuestas distintas a «¿qué día es hoy?».

Ahora hay una sola. `packages/domain/src/civil-date.ts` resuelve días civiles en una zona, y de él salen tanto el tope del formulario como el «hoy» contra el que compara la regla. La comparación pasó de instantes a días, con pruebas de borde en ambas direcciones —La Paz al oeste, Yakarta al este— y el rechazo de días que no existen, que `new Date` convierte silenciosamente al mes siguiente.

### Los veintitrés descartados

Vale la pena decir por qué se descartaron, porque varios describían el código correctamente y aun así no eran defectos: escenarios inalcanzables —ninguna inscripción llega nunca a `DRAFT` ni a `CANCELLED` porque no existe todavía quien las transicione—, invariantes que el sistema no tiene por diseño —un objeto en el almacén sin fila que lo apunte es normal, no una anomalía—, y cuestiones ajenas al cambio, como la falta de un índice sobre `payment_proofs.registration_id`. Uno señaló que la referencia bancaria distingue mayúsculas: es cierto, y queda anotado como pendiente 7.

## 12. Riesgos y pendientes

1. **Nadie confirma inscripciones.** `confirmRegistration` no tiene llamador. El sistema sabe decidir si alguien está inscrito y no lo registra en ninguna parte. Es el siguiente eslabón del bloque 1, no del 2.
2. **TBD-001, la tasa de cambio.** DEC-009 dice congelarla al cargar la evidencia y no hay ninguna tasa configurada en el esquema. La rama multimoneda se detiene en `assertDeclarableEvidence` con un mensaje explícito, en vez de atravesar el sistema y morir al repartir. Mientras siga abierto, un canal que cobre en moneda distinta a la de la gestión no sirve.
3. **Nadie ha recorrido estas pantallas a mano.** `pnpm db:fixture` ahora acepta un segundo correo y monta también el lado del peregrino —los diez pasos que imprime recorren declarar, revisar, pedir corrección, corregir y aprobar—, pero el recorrido no se ha hecho. Hasta que ocurra, «funciona» sigue significando «pasa las pruebas».
4. **La accesibilidad de estas dos pantallas no está verificada automáticamente.** `tests/e2e/routes.ts` recorre `/e/ENC2026/mi-cuenta/pagos`, pero sin sesión: comprueba la redirección a `/ingresar`, no el formulario. Es el mismo hueco que ya tenían las rutas de administración, y ahora cuesta más dejarlo así porque estas dos pantallas sí tienen contenido que auditar.
5. **El archivo anterior de una evidencia corregida no se borra.** Es deliberado —forma parte de por qué se pidió la corrección— pero significa que el almacén crece con cada corrección y no hay política de retención escrita. Relacionado con DEC-011.
6. **Los importes sin céntimos pueden estar en más sitios.** Se corrigieron los tres que salen a pantalla en el circuito de pagos, pero cualquier otra consulta que haga `.toString()` sobre una columna `Decimal` tiene el mismo defecto. Merece un barrido cuando se construyan las pantallas de caja y contabilidad.
7. **La referencia bancaria distingue mayúsculas.** `@@unique([event_id, reference])` es sensible a la caja, así que `TRF-88213` y `trf-88213` conviven como evidencias distintas y PAY-027 no las ve como duplicadas. Corregirlo no es un parche local: exige migrar la columna a `CITEXT` o crear un índice único funcional, normalizar la caja al escribir y alinear el recuento de duplicados del lado de la revisión. Queda anotado, no hecho.
