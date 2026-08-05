# Sistema web ENCUENTRO — Contratos de datos, API y RBAC v2.7

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
- `PATCH /events/{id}`
- `POST /events/{id}/transitions`
- `GET/PUT /events/{id}/lodging-policy`
- `GET/PUT /events/{id}/payment-settings`

### Catálogo e inscripción

- `GET/POST /events/{id}/packages`
- `POST /packages/{id}/price-versions`
- `POST /events/{id}/registrations`
- `PATCH /registrations/{id}`
- `POST /registrations/{id}/assign-private-package`
- `POST /registrations/{id}/check-in`

### Evidencias y pagos

- `POST /registrations/{id}/payment-proofs`
- `GET /events/{id}/payment-proofs`
- `POST /payment-proofs/{id}/review`
- `POST /events/{id}/cash-sessions`
- `POST /cash-sessions/{id}/payments`
- `POST /payments/{id}/allocations`
- `POST /payments/{id}/refunds` — bloqueado por DEC-007/008/009 cuando aplique

### Comprobantes

- `GET /receipts/{id}`
- `POST /receipts/{id}/void`
- `GET /public/receipts/verify/{token}`
- Ruta UI pública: `/verificar/comprobante/{token}`

### Hospedaje y alimentación

- `GET/POST /events/{id}/hotels`
- `POST /registrations/{id}/hotel-selection`
- `POST /reservations/{id}/assign-room`
- `GET/POST /events/{id}/meal-services`
- `POST /meal-services/{id}/deliveries`

## 4. DTO críticos

### Revisión de evidencia

```json
{
  "decision": "APPROVE|REJECT|REQUEST_CORRECTION",
  "approvedAmount": "200.00",
  "currency": "USD",
  "reason": "texto obligatorio cuando no se aprueba",
  "expectedVersion": 3,
  "idempotencyKey": "uuid"
}
```

### Configuración de precio

```json
{
  "paymentMode": "ADVANCE|ARRIVAL",
  "amount": "350.00",
  "currency": "USD",
  "startsAt": "2026-07-01T00:00:00Z",
  "endsAt": "2026-10-15T23:59:59Z",
  "minPaymentPercent": 50,
  "balanceDueAt": "2026-11-01T23:59:59Z"
}
```

### Servicio de alimentación

```json
{
  "serviceDate": "2026-11-03",
  "type": "LUNCH",
  "startsAt": "2026-11-03T12:00:00-04:00",
  "endsAt": "2026-11-03T14:00:00-04:00",
  "availableCount": 500
}
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
| Transporte | `transport.read`, `transport.manage`, `transport.assign` |
| Contabilidad | `accounting.read`, `accounting.manage`, `accounting.reconcile`, `accounting.close` |
| Reportes | `report.read`, `report.export` |
| Notificaciones | `notification.read`, `notification.manage`, `notification.send` |
| Credenciales | `credential.read`, `credential.issue`, `credential.revoke`, `credential.scan` |
| Servidores | `server.read`, `server.manage`, `server.shift.assign` |

Los permisos de Eventos incluyen además `event.timezone.update`, que gobierna el cambio de zona horaria de una gestión ya publicada.

Los siete últimos dominios se incorporaron el 5 de agosto de 2026 para cerrar el hallazgo H-06 de la auditoría P00: sus módulos tenían rutas administrativas sin ningún permiso que las protegiera. Siguen la convención `<dominio-singular>.<acción>` del resto.

## 7. Verificación pública de comprobante

La respuesta pública no incluye nombre, código de inscripción, archivo bancario, cuenta receptora, referencia ni usuario aprobador. El token es aleatorio, de alta entropía y se almacena por hash.
