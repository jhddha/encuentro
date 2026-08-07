import { toDecimalString } from '@encuentro/domain';
import { EmptyState, PageHeader, ScrollableTable, StatusBadge } from '@encuentro/ui';
import type { Metadata } from 'next';

import { catalogRepository, eventRepository } from '@/lib/container';
import { requirePermission } from '@/lib/session';

export const metadata: Metadata = { title: 'Catálogo' };

export const dynamic = 'force-dynamic';

/**
 * Catálogo de la gestión.
 *
 * Incluye los paquetes `PRIVATE`, así que exige `catalog.private.assign`
 * además de estar dentro de administración. PKG-010: verlos y asignarlos es
 * una capacidad acotada, no algo que baste con llegar a la URL.
 */
export default async function CatalogPage({ params }: { params: Promise<{ eventCode: string }> }) {
  const { eventCode } = await params;
  const event = await eventRepository().findByCode(eventCode);

  if (event === null) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Catálogo" />
        <EmptyState title={`No existe la gestión ${eventCode}`} />
      </div>
    );
  }

  // La autorización se resuelve en servidor y contra esta gestión concreta.
  await requirePermission('catalog.read', { type: 'EVENT', eventId: event.id });

  const packages = await catalogRepository().listPackages(event.id, true);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Catálogo · ${event.name}`}
        description="Los precios anticipado y normal son importes explícitos, no un descuento derivado (PKG-012)."
      />

      {packages.length === 0 ? (
        <EmptyState
          title="Sin paquetes configurados"
          description="Un paquete necesita al menos una versión de precio para poder ofrecerse."
        />
      ) : (
        <div className="flex flex-col gap-6">
          {packages.map((pkg) => (
            <section key={pkg.id} className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="font-[family-name:var(--font-display)] text-xl">{pkg.name}</h2>
                <span className="font-mono text-sm">{pkg.code}</span>
                {pkg.visibility === 'PRIVATE' && <StatusBadge tone="warning">Privado</StatusBadge>}
              </div>

              {pkg.priceVersions.length === 0 ? (
                <p className="text-sm">Sin versiones de precio activas.</p>
              ) : (
                <ScrollableTable label={`Versiones de precio de ${pkg.name}`}>
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-[var(--color-ink)]/20 text-left">
                        <th scope="col" className="p-3">
                          Modalidad
                        </th>
                        <th scope="col" className="p-3">
                          Importe
                        </th>
                        <th scope="col" className="p-3">
                          Vigencia
                        </th>
                        <th scope="col" className="p-3">
                          Mínimo
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {pkg.priceVersions.map((version) => (
                        <tr key={version.id} className="border-b border-[var(--color-ink)]/10">
                          <td className="p-3">
                            {version.paymentMode === 'ADVANCE' ? 'Anticipado' : 'Al llegar'}
                          </td>
                          <td className="p-3 font-mono">
                            {toDecimalString(version.amount)} {version.amount.currency}
                          </td>
                          <td className="p-3">
                            {version.startsAt === undefined || version.endsAt === undefined
                              ? '—'
                              : `${version.startsAt.toISOString().slice(0, 10)} → ${version.endsAt.toISOString().slice(0, 10)}`}
                          </td>
                          <td className="p-3 font-mono">
                            {version.minPaymentPercent === undefined
                              ? '—'
                              : `${String(version.minPaymentPercent)}%`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollableTable>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
