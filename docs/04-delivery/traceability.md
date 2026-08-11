# Matriz de trazabilidad v2.7

| Regla | Requisitos | Arquitectura/contrato | UI | Prueba |
|---|---|---|---|---|
| Dos modalidades | REG-019, PAY-001, REG-020, REG-021, REG-022, PAY-022, PAY-023, PAY-024 | price_versions, payment_channels | PaymentModeCards | E2E anticipado/al llegar |
| 50% habilita hotel | REG-020, HOS-016 | allocations + entitlement | BalanceSummary/HotelPicker | pago parcial aprobado |
| Comprobante por pago | PAY-028, PAY-014, PAY-029, PAY-030, PAY-031, PAY-032, PAY-033 | receipts + verify endpoint | ReceiptView | secuencia/anulación/PII |
| Sin prorrateo | REG-023, PKG-011 | cargo snapshot | resumen de inscripción | días 1/3/final |
| Duración/noches configurables | EVT-016, HOS-011 | events + lodging_policy | Event/Lodging forms | valores alternativos |
| Reserva confirmada no se libera | HOS-012 | reservation policy | estado de reserva | worker no expira |
| Alimentos por horario | FOD-001, FOD-006, FOD-002, FOD-003 | meal_services | MealServiceEditor | fuera de ventana |
| Paquete privado | PKG-009, PKG-010 | visibility + permission | badge privado | IDOR/RBAC |
