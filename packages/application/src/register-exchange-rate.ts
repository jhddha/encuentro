import { authorize, parseRate, type Actor, type ExchangeRate } from '@encuentro/domain';

/**
 * Registro de la tasa de cambio del día — DEC-009, cierra TBD-001.
 *
 * La tasa la fija una persona con permiso, no una fuente externa. El número
 * acaba impreso en un comprobante y sostiene una conciliación: tiene que haber
 * alguien que responda por él, y eso es lo que este caso de uso conserva —
 * quién y cuándo.
 *
 * El texto se interpreta **aquí y no en la pantalla**: aceptar millonésimas ya
 * calculadas dejaría que el llamador decidiera el redondeo, y el redondeo de
 * una tasa no es cosa de un formulario.
 */

export interface RegisterExchangeRateInput {
  readonly eventId: string;
  /** Moneda extranjera. La de destino es siempre la de la gestión. */
  readonly currency: string;
  /** Tal como se tecleó: admite coma o punto decimal. */
  readonly rate: string;
  /** Día civil de la gestión, en `YYYY-MM-DD`. */
  readonly effectiveOn: string;
  readonly actorId: string;
}

export interface ExchangeRateRecord {
  readonly currency: string;
  readonly rateMicros: number;
  readonly effectiveOn: string;
  readonly registeredBy: string;
  readonly registeredAt: Date;
}

export interface ExchangeRateRepository {
  /** Tasa vigente para una moneda en un día civil, o `null` si no hay. */
  findForDay(eventId: string, currency: string, day: string): Promise<ExchangeRate | null>;

  /** Últimas tasas registradas de la gestión, de la más reciente hacia atrás. */
  listRecent(eventId: string, limit: number): Promise<readonly ExchangeRateRecord[]>;

  /**
   * Deja registrada la tasa del día, sustituyendo la que hubiera.
   *
   * Corregir una tasa recién tecleada es legítimo —un dedo se equivoca— y no
   * afecta a lo ya cobrado: el comprobante congeló su copia. Lo que sí queda es
   * el rastro de quién la dejó como está.
   */
  save(input: {
    readonly eventId: string;
    readonly currency: string;
    readonly rateMicros: number;
    readonly effectiveOn: string;
    readonly actorId: string;
  }): Promise<void>;
}

export interface RegisterExchangeRateDeps {
  readonly rates: ExchangeRateRepository;
  readonly actor: Actor;
}

export async function registerExchangeRate(
  deps: RegisterExchangeRateDeps,
  input: RegisterExchangeRateInput,
): Promise<ExchangeRate> {
  /*
   * `event.update` y no `event.read`: leer la configuración y cambiarla son
   * permisos distintos, y esto último mueve dinero — la tasa decide cuánto vale
   * cada cobro en moneda extranjera.
   */
  authorize(deps.actor, 'event.update', { type: 'EVENT', eventId: input.eventId });

  const tasa = parseRate(input.rate, input.currency);

  await deps.rates.save({
    eventId: input.eventId,
    currency: tasa.currency,
    rateMicros: tasa.rateMicros,
    effectiveOn: input.effectiveOn,
    actorId: input.actorId,
  });

  return tasa;
}
