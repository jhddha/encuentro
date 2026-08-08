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

  /*
   * Tamaño máximo del cuerpo de una acción de servidor.
   *
   * Next corta en **1 MB por defecto** y responde 413 en texto plano **antes**
   * de ejecutar la acción: ni el caso de uso ni `DomainError` llegan a
   * intervenir. La evidencia de pago viaja como `FormData` a una acción de
   * servidor, y `EVIDENCE_MAX_BYTES` promete 10 MB — una foto de comprobante
   * hecha con el móvil pesa entre 2 y 5 MB, así que con el valor por defecto la
   * carga fallaba para la mayoría de los peregrinos.
   *
   * 12 MB deja margen sobre los 10 del dominio para la sobrecarga del multipart
   * y los campos de texto. El límite real de negocio sigue siendo el del
   * dominio, que es quien produce el mensaje.
   *
   * Verificado contra la documentación de Next 16: la opción vive en
   * `experimental.serverActions.bodySizeLimit`.
   */
  experimental: { serverActions: { bodySizeLimit: '12mb' } },
  // DEC-001: el contenedor de producción se construye a partir de esta salida.
  // Se activa solo al empaquetar, porque `next start` no funciona con
  // standalone y las pruebas E2E arrancan el servidor de esa forma.
  ...(process.env.BUILD_STANDALONE === '1' ? { output: 'standalone' as const } : {}),
};

export default nextConfig;
