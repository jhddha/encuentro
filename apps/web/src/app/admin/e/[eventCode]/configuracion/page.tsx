import { Card, PageHeader, ReadonlyState } from '@encuentro/ui';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Configuración de la gestión' };

/**
 * Configuración de gestión (design-system.md §6).
 *
 * EVT-007 y EVT-008: `start_at` y `end_at` son configurables y la UI calcula el
 * total de días. La referencia actual son 8 días, pero **no está fijada en
 * código** — de ahí que aquí se muestre como valor de referencia y no como
 * constante.
 *
 * HOS-001: el periodo de hospedaje tiene una cantidad fija y configurable de
 * noches; referencia actual 7. Misma regla.
 */
const REFERENCE_VALUES = [
  {
    label: 'Duración del evento',
    reference: '8 días',
    rule: 'Configurable vía start_at y end_at. La UI calcula el total (EVT-007, EVT-008).',
  },
  {
    label: 'Noches de hospedaje',
    reference: '7 noches',
    rule: 'Cantidad fija y configurable por gestión, desde la noche del día 1 (HOS-001).',
  },
  {
    label: 'Zona horaria',
    reference: 'events.timezone',
    rule: 'Las fechas se guardan en UTC y se muestran en la zona de la gestión.',
  },
  {
    label: 'Moneda',
    reference: 'ISO 4217',
    rule: 'Los importes son decimales exactos, nunca float.',
  },
] as const;

export default function EventConfigurationPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Configuración de la gestión"
        description="Los valores de referencia son configurables. Ninguno está fijado en código."
      />

      <Card>
        <dl className="flex flex-col gap-5">
          {REFERENCE_VALUES.map((item) => (
            <div key={item.label} className="flex flex-col gap-1">
              <dt className="text-sm font-medium">{item.label}</dt>
              <dd className="font-mono text-base">{item.reference}</dd>
              <dd className="text-sm">{item.rule}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <ReadonlyState
        title="Edición no disponible"
        description="Crear y editar gestiones, junto con las transiciones manuales auditadas, se implementa en P03."
      />
    </div>
  );
}
