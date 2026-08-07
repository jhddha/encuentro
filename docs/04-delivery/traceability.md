# Matriz de trazabilidad v2.7

| Regla | Requisitos | Arquitectura/contrato | UI | Prueba |
|---|---|---|---|---|
| Dos modalidades | REG-019..005, PAY-022..003 | price_versions, payment_channels | PaymentModeCards | E2E anticipado/al llegar |
| 50% habilita hotel | REG-020, HOS-016 | allocations + entitlement | BalanceSummary/HotelPicker | pago parcial aprobado |
| Comprobante por pago | PAY-028..015 | receipts + verify endpoint | ReceiptView | secuencia/anulación/PII |
| Sin prorrateo | REG-023/007 | cargo snapshot | resumen de inscripción | días 1/3/final |
| Duración/noches configurables | EVT-016/008, HOS-011 | events + lodging_policy | Event/Lodging forms | valores alternativos |
| Reserva confirmada no se libera | HOS-012 | reservation policy | estado de reserva | worker no expira |
| Alimentos por horario | FOD-001..004 | meal_services | MealServiceEditor | fuera de ventana |
| Paquete privado | PKG-009/003 | visibility + permission | badge privado | IDOR/RBAC |
