# Matriz de trazabilidad v2.7

| Regla | Requisitos | Arquitectura/contrato | UI | Prueba |
|---|---|---|---|---|
| Dos modalidades | REG-001..005, PAY-001..003 | price_versions, payment_channels | PaymentModeCards | E2E anticipado/al llegar |
| 50% habilita hotel | REG-003, HOS-005 | allocations + entitlement | BalanceSummary/HotelPicker | pago parcial aprobado |
| Comprobante por pago | PAY-009..015 | receipts + verify endpoint | ReceiptView | secuencia/anulación/PII |
| Sin prorrateo | REG-006/007 | cargo snapshot | resumen de inscripción | días 1/3/final |
| Duración/noches configurables | EVT-007/008, HOS-001 | events + lodging_policy | Event/Lodging forms | valores alternativos |
| Reserva confirmada no se libera | HOS-003 | reservation policy | estado de reserva | worker no expira |
| Alimentos por horario | FOOD-001..004 | meal_services | MealServiceEditor | fuera de ventana |
| Paquete privado | PKG-002/003 | visibility + permission | badge privado | IDOR/RBAC |
