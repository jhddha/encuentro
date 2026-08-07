import { DomainError } from './errors.js';

/**
 * Entrega de beneficios: alimentos y materiales.
 *
 * Requisitos reales: FOD-001..004 y MAT-005..003. Las reglas de este módulo
 * están en el contrato, no inferidas.
 *
 * Dos de ellas van contra la intuición y conviene tenerlas presentes:
 *
 *  - **MAT-004**: llegar tarde **no** elimina el material incluido en el
 *    paquete. Quien llega el último día conserva su derecho.
 *  - **MAT-005**: la elegibilidad depende de paquete, inventario e historial de
 *    entregas. **No** depende de haber participado en actividades pasadas.
 */

/** Ventana de un servicio de alimentación — FOD-001. */
export interface MealService {
  readonly id: string;
  readonly serviceDate: Date;
  readonly type: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly availableCount: number;
  readonly deliveredCount: number;
}

/**
 * ¿Puede entregarse este servicio ahora?
 *
 * FOD-006: el QR valida gestión, beneficio, fecha, horario, disponibilidad y
 * duplicidad. Fuera de la ventana se rechaza — el microcopy aprobado dice
 * «Este servicio no está disponible en este horario».
 *
 * La comparación es inclusiva en el inicio y en el fin: quien llega justo a la
 * hora de cierre alcanza a comer.
 */
export function isWithinServiceWindow(service: MealService, moment: Date): boolean {
  return moment >= service.startsAt && moment <= service.endsAt;
}

export function hasServiceAvailability(service: MealService): boolean {
  return service.deliveredCount < service.availableCount;
}

export type DeliveryRejection =
  'OUTSIDE_WINDOW' | 'CAPACITY_EXHAUSTED' | 'ALREADY_DELIVERED' | 'NOT_ELIGIBLE';

export interface DeliveryDecision {
  readonly allowed: boolean;
  readonly reason?: DeliveryRejection;
}

/**
 * Decide si se entrega una comida.
 *
 * FOD-003: una persona recibe **una vez** cada servicio, salvo override
 * autorizado. El orden de comprobaciones importa para que el operador de la
 * estación reciba el motivo más útil: primero elegibilidad, luego duplicado,
 * después horario y por último disponibilidad.
 *
 * `alreadyDelivered` lo resuelve un índice único en base; comprobarlo aquí solo
 * evita una excepción en el caso corriente.
 */
export function decideMealDelivery(input: {
  readonly service: MealService;
  readonly moment: Date;
  readonly isEligible: boolean;
  readonly alreadyDelivered: boolean;
}): DeliveryDecision {
  if (!input.isEligible) return { allowed: false, reason: 'NOT_ELIGIBLE' };
  if (input.alreadyDelivered) return { allowed: false, reason: 'ALREADY_DELIVERED' };
  if (!isWithinServiceWindow(input.service, input.moment)) {
    return { allowed: false, reason: 'OUTSIDE_WINDOW' };
  }
  if (!hasServiceAvailability(input.service)) {
    return { allowed: false, reason: 'CAPACITY_EXHAUSTED' };
  }

  return { allowed: true };
}

/**
 * Elegibilidad de material — MAT-005, MAT-004.
 *
 * Depende del paquete, del inventario y de si ya se entregó. **No** depende de
 * la fecha de llegada ni de haber asistido a actividades previas: MAT-004 es
 * explícito en que la llegada tardía no elimina el material incluido.
 *
 * La firma no acepta fecha de llegada, por la misma razón que `chargeAmount` en
 * `pricing.ts`: recibirla invitaría a usarla.
 */
export function decideMaterialDelivery(input: {
  readonly includedInPackage: boolean;
  readonly stockAvailable: boolean;
  readonly alreadyDelivered: boolean;
}): DeliveryDecision {
  if (!input.includedInPackage) return { allowed: false, reason: 'NOT_ELIGIBLE' };
  if (input.alreadyDelivered) return { allowed: false, reason: 'ALREADY_DELIVERED' };
  if (!input.stockAvailable) return { allowed: false, reason: 'CAPACITY_EXHAUSTED' };

  return { allowed: true };
}

/**
 * Stock derivado de movimientos — MAT-003.
 *
 * «Stock deriva de movimientos»: entradas, salidas, ajustes, pérdidas y
 * entregas. No hay una columna de existencias que alguien pueda corregir a
 * mano, igual que no hay columna de saldo en facturación.
 */
export type MovementKind = 'RECEIPT' | 'ISSUE' | 'ADJUSTMENT' | 'LOSS' | 'DELIVERY';

export interface InventoryMovement {
  readonly kind: MovementKind;
  readonly quantity: number;
}

export function stockFromMovements(movements: readonly InventoryMovement[]): number {
  return movements.reduce((total, movement) => {
    switch (movement.kind) {
      case 'RECEIPT':
        return total + movement.quantity;
      case 'ISSUE':
      case 'LOSS':
      case 'DELIVERY':
        return total - movement.quantity;
      case 'ADJUSTMENT':
        // Un ajuste puede sumar o restar; su cantidad lleva el signo.
        return total + movement.quantity;
    }
  }, 0);
}

/**
 * Clave de idempotencia de una entrega — ADR-008.
 *
 * Una estación offline puede reintentar el mismo escaneo al recuperar la
 * conexión. La operación se identifica por estación y UUID de operación, de
 * modo que reenviarla no entrega dos veces.
 */
export function deliveryIdempotencyKey(stationCode: string, operationUuid: string): string {
  if (stationCode.trim() === '' || operationUuid.trim() === '') {
    throw new DomainError(
      'DELIVERY_IDEMPOTENCY_INVALID',
      'La entrega necesita estación y UUID de operación para ser idempotente.',
    );
  }

  return `${stationCode}:${operationUuid}`;
}
