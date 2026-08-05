import type { NextConfig } from 'next';

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
