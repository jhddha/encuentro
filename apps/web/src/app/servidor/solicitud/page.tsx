import type { Metadata } from 'next';

import { PendingScreen, Shell } from '@/components/shell';

export const metadata: Metadata = { title: 'Solicitud de servicio' };

export const dynamic = 'force-dynamic';

/**
 * Solicitud de servidor — SRV-012, SRV-015.
 *
 * El formulario es el base más los campos que pida la comisión elegida
 * (`server_registrations.form_data`). Nueve de las comisiones reales piden
 * campos propios —placa y licencia en Transporte, colegiatura en Servicios
 * Médicos— y el resto no pide ninguno.
 *
 * El guardián lo pone `layout.tsx`. SRV-012 dice que el servidor se
 * autorregistra y **luego** solicita, así que quien llega aquí ya tiene cuenta
 * y correo verificado (DEC-013).
 */
export default function ServerRequestPage() {
  return (
    <Shell title="Solicitud de servicio">
      <PendingScreen
        title="Solicitud de servicio"
        phase="P11"
        scope="Formulario base más los campos que pida la comisión elegida (SRV-015)."
      />
    </Shell>
  );
}
