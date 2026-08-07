import { MICROCOPY, PageHeader, PaymentModeCards, ReadonlyState } from '@encuentro/ui';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Inscripción' };

/**
 * Comparador de modalidad (design-system.md §6).
 *
 * Los importes y la fecha límite salen de `price_versions` y llegan en P05.
 * Los valores mostrados aquí son ilustrativos del comparador, no una oferta:
 * mientras no exista catálogo, la pantalla no envía nada y lo dice.
 */
export default function RegistrationPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Inscripción"
        description="Elige una modalidad. El canal de pago se escoge después y es un dato distinto."
      />

      <PaymentModeCards
        selected="ADVANCE"
        options={[
          {
            mode: 'ADVANCE',
            title: 'Pago anticipado',
            amount: '—',
            currency: '',
            points: [
              'Precio especial hasta la fecha límite configurada.',
              'Canales: QR Simple Bolivia, cuenta o enlace de Estados Unidos.',
              'Cargas tu comprobante y una persona autorizada lo revisa.',
              MICROCOPY.advancePending,
              'Al aprobar al menos el mínimo, puedes escoger hotel.',
            ],
          },
          {
            mode: 'ARRIVAL',
            title: 'Pago al llegar',
            amount: '—',
            currency: '',
            points: [
              MICROCOPY.arrivalMode,
              'Canales: efectivo o QR en caja, según habilite la gestión.',
              'No reserva hotel por anticipado (HOS-017).',
            ],
          },
        ]}
      />

      <ReadonlyState
        title="Catálogo aún no disponible"
        description="Los precios, la fecha límite y el pago mínimo provienen de las versiones de precio del catálogo. Esta pantalla se conecta en P05."
      />
    </div>
  );
}
