import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

/**
 * Cliente Prisma.
 *
 * Prisma 7 exige un driver adapter explícito; ya no basta la URL en
 * `schema.prisma`. Verificado contra la documentación oficial, no supuesto.
 */
export function createPrismaClient(connectionString: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

export type { PrismaClient };
