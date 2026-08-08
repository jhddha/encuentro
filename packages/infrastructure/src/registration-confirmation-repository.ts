import type {
  ConfirmRegistrationInput,
  RegistrationConfirmationRepository,
  RegistrationForConfirmation,
} from '@encuentro/application';
import {
  computeBalance,
  decideConfirmation,
  money,
  toDecimalString,
  type ConfirmationDecision,
  type EventState,
  type RegistrationState,
} from '@encuentro/domain';

import type { PrismaClient } from './prisma.js';

/**
 * Confirmación de inscripciones — REG-017, camino manual.
 *
 * El puerto existía desde el 7 de agosto y no tenía adaptador: el sistema sabía
 * decidir si alguien estaba inscrito y no podía escribirlo en ninguna parte.
 *
 * Hay **dos** caminos hacia `CONFIRMED` y este es el explícito. El otro es
 * derivado: la aprobación de un pago confirma en su misma transacción cuando el
 * saldo llega a cero (`confirmIfSettled`, en `payment-proof-repository.ts`).
 * Los dos aplican la misma regla del dominio y el compare-and-swap decide quién
 * llega primero.
 */

export function createRegistrationConfirmationRepository(
  prisma: PrismaClient,
): RegistrationConfirmationRepository {
  return {
    async findForConfirmation(registrationId): Promise<RegistrationForConfirmation | null> {
      const row = await prisma.registration.findUnique({
        where: { id: registrationId },
        select: {
          id: true,
          eventId: true,
          status: true,
          version: true,
          event: { select: { status: true, currency: true } },
        },
      });

      if (row === null) return null;

      const { charges, allocations } = await balanceInputs(prisma, registrationId, {
        currency: row.event.currency,
      });

      return {
        id: row.id,
        eventId: row.eventId,
        eventStatus: row.event.status as EventState,
        status: row.status as RegistrationState,
        currency: row.event.currency,
        charges,
        allocations,
        // Alcance aplazado; ver `packages/domain/src/registration.ts`.
        fullExemptionApproved: false,
        version: row.version,
      };
    },

    async confirm(input: ConfirmRegistrationInput): Promise<boolean> {
      return await prisma.$transaction(async (tx) => {
        /*
         * El estado va en el `where` además de la versión. El camino derivado
         * puede haber confirmado esta misma inscripción mientras alguien tenía
         * la pantalla abierta; encontrar cero filas es la respuesta correcta y
         * el caso de uso la traduce a «recárguela e inténtelo de nuevo».
         */
        const updated = await tx.registration.updateMany({
          where: { id: input.registrationId, version: input.expectedVersion, status: 'SUBMITTED' },
          data: { status: 'CONFIRMED', version: { increment: 1 } },
        });

        if (updated.count === 0) return false;

        const registration = await tx.registration.findUniqueOrThrow({
          where: { id: input.registrationId },
          select: { eventId: true },
        });

        await tx.auditLog.create({
          data: {
            eventId: registration.eventId,
            actorId: input.actorId,
            action: 'registration.confirm',
            entity: 'registration',
            entityId: input.registrationId,
            // Sin `derivedFrom`: esta la pulsó una persona. La acción es la
            // misma para que un reporte cuente juntas ambas vías.
            afterRedacted: { status: 'CONFIRMED' },
          },
        });

        return true;
      });
    },
  };
}

/** Fila de la bandeja de inscripciones, con su saldo y su veredicto. */
export interface RegistrationRow {
  readonly id: string;
  readonly code: string;
  readonly status: RegistrationState;
  readonly attendanceStatus: string;
  readonly paymentMode: string;
  readonly version: number;
  readonly currency: string;
  readonly charged: string;
  readonly outstanding: string;
  /** Nulo cuando la pregunta no tiene sentido: ya confirmada o cancelada. */
  readonly confirmation: ConfirmationDecision | null;
}

/**
 * Inscripciones de una gestión con su saldo y si son confirmables.
 *
 * En **una** pasada, no una consulta por fila. Preguntar registro a registro
 * con `inspectConfirmation` daría tres consultas por inscripción, y con
 * seiscientas eso es mil ochocientas para pintar una tabla.
 *
 * El veredicto lo sigue dando `decideConfirmation`, la misma función que usa el
 * caso de uso que confirma: REG-017 pide «política única de dominio», y eso es
 * sobre la regla, no sobre cuántas veces se consulta la base.
 */
export async function listRegistrationsWithBalance(
  prisma: PrismaClient,
  eventId: string,
): Promise<readonly RegistrationRow[]> {
  const event = await prisma.event.findUniqueOrThrow({
    where: { id: eventId },
    select: { currency: true },
  });

  const rows = await prisma.registration.findMany({
    where: { eventId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      code: true,
      status: true,
      attendanceStatus: true,
      paymentMode: true,
      version: true,
      charges: { select: { id: true, amount: true, currency: true } },
    },
  });

  const chargeIds = rows.flatMap((row) => row.charges.map((charge) => charge.id));

  const allocated = await prisma.paymentAllocation.groupBy({
    by: ['chargeId'],
    where: { chargeId: { in: chargeIds } },
    _sum: { amount: true },
  });

  const paidByCharge = new Map(
    allocated.map((row) => [row.chargeId, row._sum.amount?.toString() ?? '0.00']),
  );

  return rows.map((row) => {
    const balance = computeBalance({
      charges: row.charges.map((charge) => money(charge.amount.toString(), charge.currency)),
      allocations: row.charges.map((charge) =>
        money(paidByCharge.get(charge.id) ?? '0.00', event.currency),
      ),
      currency: event.currency,
    });

    const status = row.status as RegistrationState;

    return {
      id: row.id,
      code: row.code,
      status,
      attendanceStatus: row.attendanceStatus,
      paymentMode: row.paymentMode,
      version: row.version,
      currency: event.currency,
      charged: toDecimalString(balance.charged),
      outstanding: toDecimalString(balance.outstanding),
      /*
       * Solo desde `SUBMITTED`, el único estado desde el que `CONFIRMED` es
       * alcanzable. `decideConfirmation` lanza en los demás, y eso incluye
       * `DRAFT`, que es el valor por defecto de la columna: una sola fila en ese
       * estado haría reventar la bandeja entera. Aquí una inscripción cancelada
       * o ya confirmada no es un error, es una fila que no ofrece el botón.
       */
      confirmation:
        status === 'SUBMITTED'
          ? decideConfirmation({
              state: status,
              outstanding: balance.outstanding,
              fullExemptionApproved: false,
            })
          : null,
    };
  });
}

async function balanceInputs(
  prisma: PrismaClient,
  registrationId: string,
  options: { currency: string },
) {
  const charges = await prisma.charge.findMany({
    where: { registrationId },
    select: { id: true, amount: true, currency: true },
  });

  const allocated = await prisma.paymentAllocation.groupBy({
    by: ['chargeId'],
    where: { chargeId: { in: charges.map((charge) => charge.id) } },
    _sum: { amount: true },
  });

  return {
    charges: charges.map((charge) => money(charge.amount.toString(), charge.currency)),
    allocations: allocated.map((row) =>
      money(row._sum.amount?.toString() ?? '0.00', options.currency),
    ),
  };
}
