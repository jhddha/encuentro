import { Card } from './layout.js';

/**
 * Comparador de modalidad comercial.
 *
 * REG-001: el peregrino elige **exactamente una** modalidad. Se renderiza como
 * un grupo de radio, no como dos botones sueltos, para que la exclusividad sea
 * real también para lectores de pantalla y navegación por teclado.
 *
 * La modalidad **no es el canal de pago** (DEC-002, glosario de requirements.md
 * §1): el canal —QR Bolivia, cuenta EE. UU., efectivo, QR en caja— se elige
 * después y es un dato distinto.
 *
 * Los importes llegan desde `price_versions` (P05). Aquí no se calculan
 * descuentos: PKG-004 exige montos explícitos, no un porcentaje derivado.
 */

export type PaymentMode = 'ADVANCE' | 'ARRIVAL';

export interface PaymentModeOption {
  readonly mode: PaymentMode;
  readonly title: string;
  readonly amount: string;
  readonly currency: string;
  readonly points: readonly string[];
  /** Solo para la modalidad anticipada: fecha límite y mínimo de pago. */
  readonly deadline?: string;
  readonly minimumPaymentPercent?: number;
}

export function PaymentModeCards({
  options,
  name = 'paymentMode',
  selected,
}: {
  readonly options: readonly PaymentModeOption[];
  readonly name?: string;
  readonly selected?: PaymentMode;
}) {
  return (
    <fieldset className="border-0 p-0">
      <legend className="mb-4 font-[family-name:var(--font-display)] text-xl">
        Elige tu modalidad
      </legend>

      <div className="grid gap-4 md:grid-cols-2">
        {options.map((option) => {
          const inputId = `${name}-${option.mode}`;

          return (
            <Card key={option.mode} className="has-[:checked]:border-[var(--color-flame)]">
              <label htmlFor={inputId} className="flex cursor-pointer flex-col gap-3">
                <span className="flex items-start gap-3">
                  <input
                    id={inputId}
                    type="radio"
                    name={name}
                    value={option.mode}
                    defaultChecked={option.mode === selected}
                    className="mt-1 size-5 accent-[var(--color-flame)]"
                  />
                  <span className="font-[family-name:var(--font-display)] text-lg">
                    {option.title}
                  </span>
                </span>

                <span className="font-mono text-2xl">
                  {option.amount} {option.currency}
                </span>

                {option.deadline !== undefined && (
                  <span className="text-sm">
                    Vigente hasta <time dateTime={option.deadline}>{option.deadline}</time>
                    {option.minimumPaymentPercent !== undefined &&
                      `, con un pago mínimo del ${String(option.minimumPaymentPercent)}%.`}
                  </span>
                )}

                <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
                  {option.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </label>
            </Card>
          );
        })}
      </div>
    </fieldset>
  );
}
