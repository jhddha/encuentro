import { SkipLink } from '@encuentro/ui';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Encuentro',
    template: '%s · Encuentro',
  },
  description: 'Sistema web ENCUENTRO',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-dvh">
        <SkipLink />
        {children}
      </body>
    </html>
  );
}
