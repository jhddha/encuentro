# Actualización canónica v2.7

## Motivo

Unificar la documentación v2.6 y los parches posteriores en un solo paquete fuente, eliminar contradicciones y reflejar DEC-001 a DEC-004 como decisiones `APPROVED`.

## Cambios principales

1. Infraestructura productiva definida con OVHcloud VPS-3, Ubuntu Server 24.04 LTS, Docker y procesos web/worker separados.
2. Se elimina del alcance v1 el checkout automático. El pago anticipado es remoto pero manualmente verificado.
3. Se definen dos modalidades: pago anticipado con precio reducido y elección de hotel; pago al llegar con precio normal y hotel según disponibilidad restante.
4. Se formaliza el Comprobante de pago, su secuencia por gestión y su QR de verificación pública mínima.
5. Durante `IN_PROGRESS` no existe prorrateo ni tarifa tardía automática.
6. La duración del evento y las noches de hospedaje son configurables; referencia actual: 8 días y 7 noches.
7. Alimentos se configura por servicio, día, cantidad y horario.
8. Se incorporan paquetes `PRIVATE` asignables solo por Inscripciones.
9. Se actualizan contratos, rutas, permisos, prompts, reglas Claude, prototipo y pruebas.

## Estado de decisiones

- DEC-001: APPROVED
- DEC-002: APPROVED
- DEC-003: APPROVED
- DEC-004: APPROVED
- DEC-005 y posteriores: continúan pendientes según `decision-register.md`.
