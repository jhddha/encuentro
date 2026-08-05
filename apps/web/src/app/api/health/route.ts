import { prisma } from '@/lib/container';

export const dynamic = 'force-dynamic';

/**
 * Health check de `apps/web` — arquitectura §9.
 *
 * Comprueba la conexión a PostgreSQL, no solo que el proceso responda. Un
 * health check que solo devuelve 200 porque Node sigue vivo hace que un
 * orquestador mantenga en rotación un contenedor que no puede atender nada.
 *
 * No expone versiones, cadenas de conexión ni detalles del error: es un
 * endpoint sin autenticación.
 */
export async function GET(): Promise<Response> {
  try {
    await prisma().$queryRaw`SELECT 1`;
    return Response.json({ status: 'ok' }, { status: 200 });
  } catch {
    return Response.json({ status: 'degraded' }, { status: 503 });
  }
}
