import { fileURLToPath } from 'node:url';

import { config as loadEnvFile } from 'dotenv';
import type { NextConfig } from 'next';

/*
 * El `.env` vive en la raíz del monorepo, no en `apps/web`, para que web,
 * worker, Prisma y las pruebas compartan una única fuente. Next solo busca en
 * el directorio de la app, así que hay que señalárselo.
 */
loadEnvFile({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Los paquetes del workspace se compilan desde su fuente TypeScript.
  transpilePackages: ['@encuentro/ui'],
  // DEC-001: el contenedor de producción se construye a partir de esta salida.
  // Se activa solo al empaquetar, porque `next start` no funciona con
  // standalone y las pruebas E2E arrancan el servidor de esa forma.
  ...(process.env.BUILD_STANDALONE === '1' ? { output: 'standalone' as const } : {}),
};

export default nextConfig;
