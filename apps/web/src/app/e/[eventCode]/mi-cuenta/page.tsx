import { Card, EmptyState, PageHeader, ScrollableTable, StatusBadge } from '@encuentro/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { accountStatement, eventRepository } from '@/lib/container';
import { requireActor } from '@/lib/session';

export const metadata: Metadata = { title: 'Mi cuenta' };

export const dynamic = 'force-dynamic';

/**
 * Estado de cuenta del peregrino — PAY-002, REG-017, DEC-008.
 *
 * Responde tres preguntas y ninguna más: qué debo, qué pagué y si estoy
 * inscrito. Las tres salen de la misma fuente que usa el resto del sistema
 * —`computeBalance` y `decideConfirmation`—, porque un estado de cuenta que
 * sume por su cuenta acaba discrepando del que ve tesorería, y entonces las dos
 * pantallas dejan de ser creíbles.
 *
 * El saldo **no se edita nunca** (PAY-002): se deriva de cargos y asignaciones.
 * Aquí no hay ninguna mutación.
 */

const REGISTRATION_TONE = {
  DRAFT: 'neutral',
  SUBMITTED: 'progress',
  CONFIRMED: 'success',
  CANCELLED: 'danger',
} as const;

const REGISTRATION_LABEL = {
  DRAFT: 'Borrador',
  SUBMITTED: 'Enviada',
  CONFIRMED: 'Confirmada',
  CANCELLED: 'Cancelada',
} as const;

const BALANCE_LABEL = {
  UNPAID: 'Sin pagos aplicados',
  PARTIAL: 'Pago parcial',
  PAID: 'Pagado',
  OVERPAID: 'Pagado de más',
  REFUNDED: 'Devuelto',
} as const;

const CONCEPT_LABEL: Readonly<Record<string, string>> = {
  PACKAGE: 'Paquete',
  LODGING: 'Hospedaje',
  TRANSPORT: 'Transporte',
};

const MODE_LABEL: Readonly<Record<string, string>> = {
  ADVANCE: 'Pago anticipado',
  ARRIVAL: 'Pago al llegar',
};

export default async function MyAccountPage({
  params,
}: {
  params: Promise<{ eventCode: string }>;
}) {
  const { eventCode } = await params;
  const event = await eventRepository().findByCode(eventCode);

  if (event === null) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Mi cuenta" />
        <EmptyState title={`No existe la gestión ${eventCode}`} />
      </div>
    );
  }

  const actor = await requireActor();
  const statement = await accountStatement(event.id, actor.userId);

  if (statement === null) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Mi cuenta" />
        <EmptyState
          title="Todavía no está inscrito en esta gestión"
          description="Cuando complete su inscripción, aquí verá qué debe, qué pagó y su saldo."
          action={
            <Link href={`/e/${eventCode}/inscripcion`} className="text-sm underline">
              Ir a la inscripción
            </Link>
          }
        />
      </div>
    );
  }

  const { currency } = statement;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Mi cuenta"
        description={`${event.name} · inscripción ${statement.registrationCode}`}
        actions={
          <Link href={`/e/${eventCode}/mi-cuenta/pagos`} className="text-sm underline">
            Declarar un pago
          </Link>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <dl className="flex flex-col gap-1">
            <dt className="text-sm">Total de cargos</dt>
            <dd className="text-2xl tabular-nums">
              {statement.charged} <span className="text-base">{currency}</span>
            </dd>
          </dl>
        </Card>

        <Card>
          <dl className="flex flex-col gap-1">
            <dt className="text-sm">Aplicado a sus cargos</dt>
            <dd className="text-2xl tabular-nums">
              {statement.allocated} <span className="text-base">{currency}</span>
            </dd>
          </dl>
        </Card>

        <Card>
          <dl className="flex flex-col gap-1">
            <dt className="text-sm">Saldo pendiente</dt>
            <dd className="text-2xl tabular-nums">
              {statement.outstanding} <span className="text-base">{currency}</span>
            </dd>
            <dd>
              <StatusBadge tone={statement.outstanding === '0.00' ? 'success' : 'progress'}>
                {BALANCE_LABEL[statement.balanceState]}
              </StatusBadge>
            </dd>
          </dl>
        </Card>
      </div>

      {/*
        DEC-007 y DEC-008: v1 no devuelve dinero. Lo que se pagó de más queda a
        favor de la persona, y decirlo aquí evita que lo reclame como devolución.
      */}
      {statement.credit !== '0.00' && (
        <Card>
          <h2 className="text-lg font-semibold">Saldo a favor</h2>
          <p className="mt-1 text-2xl tabular-nums">
            {statement.credit} <span className="text-base">{currency}</span>
          </p>
          {/*
            Decía «se usará en lo que quede pendiente», y eso no es cierto:
            DEC-008 dice que aplicar el saldo a otro cargo es **una acción
            explícita de una persona autorizada, no un efecto automático**. Nadie
            va a ver ese saldo aplicarse solo. Prometerlo produce exactamente la
            reclamación en mostrador que el aviso pretendía evitar.
          */}
          <p className="mt-2 text-sm">
            Es dinero cobrado que todavía no se aplicó a ningún cargo. Queda registrado a su favor y
            no se devuelve en efectivo. Para aplicarlo a un cargo pendiente, pídalo a la
            organización: no se aplica solo.
          </p>
        </Card>
      )}

      <section aria-labelledby="inscripcion" className="flex flex-col gap-3">
        <h2 id="inscripcion" className="text-lg font-semibold">
          Su inscripción
        </h2>

        <Card>
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr]">
            <dt className="text-sm font-medium">Estado</dt>
            <dd>
              <StatusBadge tone={REGISTRATION_TONE[statement.registrationStatus]}>
                {REGISTRATION_LABEL[statement.registrationStatus]}
              </StatusBadge>
            </dd>

            <dt className="text-sm font-medium">Paquete</dt>
            <dd className="text-sm">{statement.packageName}</dd>

            <dt className="text-sm font-medium">Modalidad</dt>
            <dd className="text-sm">
              {MODE_LABEL[statement.paymentMode] ?? statement.paymentMode}
            </dd>
          </dl>

          {/*
            REG-017 explicado, no solo aplicado.
            «`CONFIRMED` exige saldo requerido igual a cero […]; el pago parcial
            permanece `SUBMITTED`». Sin esta frase, quien ha pagado la mitad ve
            «Enviada» y no sabe si falta algo suyo o algo de la organización.
          */}
          {statement.confirmation?.outcome === 'STAY_SUBMITTED' && (
            <p className="mt-4 text-sm">
              Su inscripción se confirmará cuando el saldo pendiente llegue a cero. El pago parcial
              conserva su tarifa, pero todavía no confirma la plaza.
            </p>
          )}

          {/*
            Camino poco frecuente, y por eso conviene nombrarlo: la aprobación de
            un pago confirma en su misma transacción, así que un saldo cubierto
            suele llegar aquí ya como «Confirmada». Quedarse en «Enviada» con
            saldo cero significa que llegó a cero por otra vía, y entonces sí
            falta que alguien lo registre desde Inscripciones.
          */}
          {statement.confirmation?.outcome === 'CONFIRM' && (
            <p className="mt-4 text-sm">
              Su saldo está cubierto y la plaza se confirmará en cuanto la organización lo registre.
              Si tarda, consúltelo con ellos.
            </p>
          )}
        </Card>
      </section>

      <section aria-labelledby="cargos" className="flex flex-col gap-3">
        <h2 id="cargos" className="text-lg font-semibold">
          Cargos
        </h2>

        {statement.charges.length === 0 ? (
          <EmptyState title="No tiene cargos registrados" />
        ) : (
          <ScrollableTable label="Cargos de la inscripción">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--color-ink)]/20 text-left">
                  <th scope="col" className="p-3">
                    Concepto
                  </th>
                  <th scope="col" className="p-3">
                    Importe
                  </th>
                  <th scope="col" className="p-3">
                    Pagado
                  </th>
                  <th scope="col" className="p-3">
                    Pendiente
                  </th>
                </tr>
              </thead>
              <tbody>
                {statement.charges.map((charge) => (
                  <tr key={charge.id} className="border-b border-[var(--color-ink)]/10">
                    <td className="p-3">{CONCEPT_LABEL[charge.concept] ?? charge.concept}</td>
                    <td className="p-3 tabular-nums">{charge.amount}</td>
                    <td className="p-3 tabular-nums">{charge.paid}</td>
                    <td className="p-3 tabular-nums">{charge.outstanding}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollableTable>
        )}
      </section>

      <section aria-labelledby="pagos" className="flex flex-col gap-3">
        <h2 id="pagos" className="text-lg font-semibold">
          Pagos aprobados
        </h2>

        {statement.payments.length === 0 ? (
          <EmptyState
            title="Todavía no hay pagos aprobados"
            description="Cargar un comprobante no confirma el pago: aparecerá aquí cuando alguien lo revise y lo apruebe."
            action={
              <Link href={`/e/${eventCode}/mi-cuenta/pagos`} className="text-sm underline">
                Ver mis comprobantes
              </Link>
            }
          />
        ) : (
          <ScrollableTable label="Pagos aprobados">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--color-ink)]/20 text-left">
                  <th scope="col" className="p-3">
                    Fecha
                  </th>
                  <th scope="col" className="p-3">
                    Importe
                  </th>
                  <th scope="col" className="p-3">
                    Comprobante
                  </th>
                </tr>
              </thead>
              <tbody>
                {statement.payments.map((payment) => (
                  <tr key={payment.id} className="border-b border-[var(--color-ink)]/10">
                    <td className="p-3">
                      {/* NFR-013: se guarda en UTC y se muestra en la zona de la gestión. */}
                      {payment.approvedAt.toLocaleDateString('es', { timeZone: event.timezone })}
                    </td>
                    <td className="p-3 tabular-nums">
                      {payment.amount} {currency}
                    </td>
                    <td className="p-3 font-mono">
                      {payment.receiptNumber ?? '—'}
                      {payment.receiptVoided && (
                        // PAY-033: el comprobante anulado no desaparece.
                        <span className="ml-2 font-sans not-italic">(anulado)</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollableTable>
        )}
      </section>
    </div>
  );
}
