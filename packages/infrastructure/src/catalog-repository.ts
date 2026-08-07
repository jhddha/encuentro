import {
  money,
  type PackageVisibility,
  type PaymentMode,
  type PriceVersion,
} from '@encuentro/domain';

import type { PrismaClient } from './prisma.js';

/**
 * Catálogo de una gestión.
 *
 * Los importes cruzan la frontera como `Decimal` de Prisma y entran al dominio
 * como `Money` en centavos enteros. La conversión ocurre aquí, en el borde, y
 * pasa por `toFixed(2)` para no perder precisión al atravesar un `number`.
 */

export interface PackageRecord {
  readonly id: string;
  readonly eventId: string;
  readonly code: string;
  readonly name: string;
  readonly visibility: PackageVisibility;
  readonly status: string;
  readonly priceVersions: readonly PriceVersion[];
}

interface PriceVersionRow {
  id: string;
  packageId: string;
  paymentMode: string;
  amount: { toFixed: (digits: number) => string };
  currency: string;
  startsAt: Date | null;
  endsAt: Date | null;
  minPaymentPercent: number | null;
  balanceDueAt: Date | null;
}

function toPriceVersion(row: PriceVersionRow): PriceVersion {
  return {
    id: row.id,
    packageId: row.packageId,
    paymentMode: row.paymentMode as PaymentMode,
    amount: money(row.amount.toFixed(2), row.currency),
    ...(row.startsAt === null ? {} : { startsAt: row.startsAt }),
    ...(row.endsAt === null ? {} : { endsAt: row.endsAt }),
    ...(row.minPaymentPercent === null ? {} : { minPaymentPercent: row.minPaymentPercent }),
    ...(row.balanceDueAt === null ? {} : { balanceDueAt: row.balanceDueAt }),
  };
}

export interface CatalogRepository {
  /**
   * Paquetes de una gestión.
   *
   * `includePrivate` es explícito y por defecto `false`: quien quiera ver los
   * privados tiene que pedirlo, de modo que olvidar el parámetro nunca los
   * filtre al portal público (PKG-009).
   */
  listPackages(eventId: string, includePrivate?: boolean): Promise<readonly PackageRecord[]>;
  findPriceVersion(id: string): Promise<PriceVersion | null>;
}

export function createCatalogRepository(prisma: PrismaClient): CatalogRepository {
  return {
    async listPackages(eventId, includePrivate = false) {
      const rows = await prisma.package.findMany({
        where: {
          eventId,
          status: 'ACTIVE',
          ...(includePrivate ? {} : { visibility: 'PUBLIC' }),
        },
        include: { priceVersions: { where: { status: 'ACTIVE' } } },
        orderBy: { code: 'asc' },
      });

      return rows.map((row) => ({
        id: row.id,
        eventId: row.eventId,
        code: row.code,
        name: row.name,
        visibility: row.visibility as PackageVisibility,
        status: row.status,
        priceVersions: row.priceVersions.map(toPriceVersion),
      }));
    },

    async findPriceVersion(id) {
      const row = await prisma.priceVersion.findUnique({ where: { id } });
      return row === null ? null : toPriceVersion(row);
    },
  };
}
