import { EmptyState, PageHeader, ScrollableTable } from '@encuentro/ui';
import type { Metadata } from 'next';

import { eventRepository, prisma } from '@/lib/container';
import { requirePermission } from '@/lib/session';

export const metadata: Metadata = { title: 'Áreas y comisiones' };

export const dynamic = 'force-dynamic';

/**
 * Áreas y comisiones — SRV-005, SRV-006, SRV-008.
 *
 * Aquí se nombrarán encargados y coordinadores. Hoy solo lista lo que hay,
 * porque las comisiones ya existen —las cuarenta y dos de la organización, en
 * sus siete áreas, cargadas desde su plan contable— y verlas es útil aunque
 * todavía no se puedan editar.
 *
 * **El área no es una tabla.** Es una columna de texto en `commissions`, y así
 * se queda: DEC-020 define al encargado de área como un coordinador de todas
 * las comisiones de su área, de modo que no hace falta ni un ámbito `AREA` en
 * el RBAC ni un encargado guardado en ninguna parte. Su alcance es la unión de
 * sus asignaciones.
 *
 * El filo de esa decisión, y conviene que esta pantalla lo resuelva cuando gane
 * la edición: al crear una comisión dentro de un área, **su encargado no la
 * recibe solo**. Hay que asignársela en el mismo paso, o el olvido se descubre
 * cuando alguien no ve una comisión que cree suya.
 */
export default async function CommissionsPage({
  params,
}: {
  params: Promise<{ eventCode: string }>;
}) {
  const { eventCode } = await params;
  const event = await eventRepository().findByCode(eventCode);

  if (event === null) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Áreas y comisiones" />
        <EmptyState title={`No existe la gestión ${eventCode}`} />
      </div>
    );
  }

  await requirePermission('server.read', { type: 'EVENT', eventId: event.id });

  const comisiones = await prisma().commission.findMany({
    where: { eventId: event.id },
    orderBy: [{ area: 'asc' }, { name: 'asc' }],
    select: { id: true, code: true, name: true, area: true, active: true },
  });

  const areas = [...new Set(comisiones.map((c) => c.area))];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Áreas y comisiones · ${event.name}`}
        description={
          comisiones.length === 0
            ? 'Esta gestión todavía no tiene comisiones.'
            : `${String(comisiones.length)} comisiones en ${String(areas.length)} áreas.`
        }
      />

      {comisiones.length === 0 ? (
        <EmptyState
          title="Sin comisiones"
          description="Se cargan al preparar la gestión, junto al plan de cuentas."
        />
      ) : (
        <ScrollableTable label="Comisiones de la gestión">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--color-ink)]/20 text-left">
                <th scope="col" className="p-3">
                  Área
                </th>
                <th scope="col" className="p-3">
                  Código
                </th>
                <th scope="col" className="p-3">
                  Comisión
                </th>
                <th scope="col" className="p-3">
                  Estado
                </th>
              </tr>
            </thead>
            <tbody>
              {comisiones.map((comision) => (
                <tr key={comision.id} className="border-b border-[var(--color-ink)]/10">
                  <td className="p-3">{comision.area}</td>
                  <td className="p-3 font-mono">{comision.code}</td>
                  <td className="p-3">{comision.name}</td>
                  <td className="p-3">{comision.active ? 'Activa' : 'Retirada'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollableTable>
      )}

      <p className="text-sm opacity-80">
        Nombrar encargados y coordinadores todavía no se hace desde aquí. Mientras tanto, los
        permisos se conceden con <code className="font-mono">pnpm rol:conceder</code>.
      </p>
    </div>
  );
}
