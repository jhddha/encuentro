# P05 — Catálogo, inscripción, modalidades y cargos

**Fecha:** 5 de agosto de 2026
**Alcance:** PKG-001, PKG-009, PKG-010, PKG-012, PKG-013, REG-019, PAY-001, REG-020, REG-021, REG-022, REG-023, PKG-011, HOS-015 y DEC-006.

## 1. Gate ejecutado

| Paso | Comando | Exit |
|---|---|---:|
| Validador documental | `python scripts/validate_canonical_docs.py` | 0 |
| Formato | `pnpm format` | 0 |
| Lint | `pnpm lint` | 0 |
| Typecheck | `pnpm typecheck` | 0 |
| Unitarias | `pnpm test` — **175 pruebas** | 0 |
| **Integración** | `pnpm test:integration` — **40 pruebas** | 0 |
| Build | `pnpm build` | 0 |
| Accesibilidad | `pnpm test:e2e` — 165 pruebas | 0 |

## 2. Dinero

Los importes se representan como **enteros de centavos**, no como decimales de coma flotante. `requirements.md` §10 lo exige, y la razón es demostrable: `0.10 + 0.20` en coma flotante da `0.30000000000000004`. Una prueba suma un céntimo cien veces y exige exactamente `1.00`.

Sumar monedas distintas sin conversión explícita **lanza** en lugar de producir un número. Un estado de cuenta que mezcla BOB y USD en silencio es peor que uno que falla.

`meetsMinimumPercent` compara `pagado × 100 >= total × porcentaje` **sin dividir**, así que la regla que decide si alguien gana su derecho a escoger hotel no arrastra error de redondeo. Probado con un total de 33.33, donde dividir sería ambiguo.

## 3. Tres decisiones de diseño que conviene conocer

### `chargeAmount` no recibe ninguna fecha

REG-023 prohíbe prorratear y PKG-011 prohíbe tarifas tardías automáticas. Si la función aceptara la fecha de llegada, le estaría entregando a quien la modifique en el futuro justo el parámetro necesario para romper ambas reglas. Una prueba fija la aridad para que añadirlo falle de forma visible.

### La tarifa anticipada se evalúa por la fecha de **carga**

REG-021: quien sube su comprobante dentro del plazo conserva la tarifa aunque la revisión llegue semanas después. Por eso `isAdvanceRateAvailable` recibe el momento de la carga y no el de la aprobación. Hay pruebas de borde en el último segundo del plazo y en el primero fuera de él.

### La edad se evalúa contra el inicio del evento

DEC-006 no admite menores. La comparación es contra `events.start_at`, no contra la fecha de inscripción: quien tiene 17 al inscribirse pero cumple 18 antes de que empiece el Encuentro sí puede participar, porque lo que importa es su edad mientras asiste.

## 4. Invariantes en la base

Dos merecen mención porque protegen contra errores que de otro modo pasarían inadvertidos:

- **Clave foránea compuesta** `(price_version_id, package_id)`. Sin ella, un fallo de código podría congelar un cargo usando el precio de otro paquete, y el histórico quedaría incoherente sin que nadie lo notara.
- **`price_versions_advance_is_complete`** rechaza una fila `ADVANCE` sin ventana de vigencia o sin mínimo de pago. Sin esos datos el dominio no puede decidir si la tarifa sobrevive (REG-021) ni si desbloquea la elección de hotel (REG-020), y tendría que adivinar.

`charges` lleva el mismo trigger append-only que `audit_logs`: PAY-001 congela el snapshot y GOV-005 prohíbe reescribir histórico, así que la regla la impone Postgres y no el próximo repositorio que alguien escriba. Verificado con `UPDATE` y `DELETE` por SQL directo.

## 5. Numeración de inscripciones

El correlativo se calcula **dentro** de la transacción y el índice único `(event_id, code)` decide la carrera: si dos altas simultáneas calculan el mismo número, la segunda falla al hacer commit en lugar de duplicar el código. Contarlo fuera de la transacción no daría esa garantía.

## 6. Un defecto en mis propias pruebas

Al escribir las pruebas del caso de uso descubrí que cinco aserciones negativas eran **vacías**: `expect(fn).toMatchObject({ code })` compara el objeto función, no lo que lanza, y pasa siempre. El contador de pruebas subía sin comprobar nada.

Se reemplazaron por un helper `expectDomainError` que exige que haya excepción y verifica su código. Vale la pena tenerlo presente: una prueba que pasa no es lo mismo que una prueba que comprueba.

## 7. Qué NO se implementó, y por qué

| Omisión | Motivo |
|---|---|
| Formulario público de inscripción funcional | La pantalla de modalidad existe desde P02 y el caso de uso está probado, pero el alta desde el portal requiere el flujo de cuenta del peregrino, que se apoya en la verificación de correo de P04 y aún no tiene interfaz de registro. |
| Alta y edición de paquetes desde la interfaz | El catálogo se muestra y se lee; crearlo desde pantalla pertenece a un flujo administrativo que no tiene requisito propio en el contrato. |
| Elección de hotel al desbloquear el 50% | `unlocksHotelSelection` está implementado y probado, pero la reserva es P06. |

## 8. Riesgos y pendientes

1. **El portal público todavía no inscribe.** La lógica está completa y probada; falta la interfaz y el registro de cuenta del peregrino.
2. **Las pantallas de administración siguen fuera de la cobertura de accesibilidad automática**, por la misma razón que en P04: redirigen sin sesión. Hace falta un fixture de sesión de Playwright.
3. **`persons` guarda documento y país sin que ningún requisito los enumere.** Se añadieron porque PAY-030 dice que el Comprobante **no** los muestra, lo que implica que existen. Es una inferencia razonable, pero es una inferencia.
4. La interfaz de MFA sigue incompleta desde P04.
