import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Los paquetes del workspace se compilan desde su fuente TypeScript.
  transpilePackages: ['@encuentro/ui'],
  // DEC-001: el contenedor de producción se construye a partir de esta salida.
  output: 'standalone',
};

export default nextConfig;
