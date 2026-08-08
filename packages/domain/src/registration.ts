import { DomainError } from './errors.js';
import { isNegative, isZero, type Money } from './money.js';
import { canTransitionRegistration, type RegistrationState } from './states.js';

/**
 * Confirmación de la inscripción — REG-017.
 *
 * Es **la única** regla que decide si alguien está inscrito. El criterio de
 * aceptación de v2.6 lo pide así de literal: «política única de dominio, sin
 * confirmación manual dispersa». Si cada pantalla decidiera por su cuenta, dos
 * caminos distintos acabarían dando respuestas distintas sobre la misma
 * persona, y eso en un evento se descubre en la puerta.
 *
 * La regla: `CONFIRMED` exige saldo requerido igual a cero, o exención total
 * aprobada. **El pago parcial permanece `SUBMITTED`.**
 *
 * El punto que más se presta a confusión: pagar el 50% de una tarifa anticipada
 * da derecho a **elegir hotel** (REG-020, `unlocksHotelSelection`), no a estar
 * inscrito. Son dos derechos distintos que se ganan con el mismo dinero en
 * momentos distintos, y mezclarlos confirmaría inscripciones a medio pagar.
 */

export interface ConfirmationInput {
  readonly state: RegistrationState;

  /** Saldo pendiente, tal como lo devuelve `computeBalance`. */
  readonly outstanding: Money;

  /**
   * Exención total aprobada.
   *
   * REG-017 la nombra como alternativa al saldo cero. **El mecanismo para
   * concederla todavía no existe**: el requisito de v2.6 sobre descuentos y
   * becas —con tipo, importe, motivo y aprobador— quedó con alcance aplazado en
   * la migración de la línea base, así que no está en el contrato vigente. Ver
   * `docs/04-delivery/requirement-migration-v2.6-to-current.md`.
   *
   * Hasta que se implemente, este parámetro solo puede llegar como `false`.
   * Está aquí para que la regla no tenga que reescribirse cuando llegue.
   */
  readonly fullExemptionApproved: boolean;
}

export type ConfirmationDecision =
  | { readonly outcome: 'CONFIRM' }
  | { readonly outcome: 'STAY_SUBMITTED'; readonly reason: 'OUTSTANDING_BALANCE' };

/**
 * Decide sin lanzar.
 *
 * Devuelve el resultado en vez de una excepción porque el llamador legítimo
 * —una bandeja de inscripciones, por ejemplo— necesita saber por qué una
 * inscripción no se confirma sin tratarlo como un error.
 *
 * Lanza únicamente cuando la transición es ilegal, que sí es un error de
 * programación y no un estado del negocio.
 */
export function decideConfirmation(input: ConfirmationInput): ConfirmationDecision {
  if (!canTransitionRegistration(input.state, 'CONFIRMED')) {
    throw new DomainError(
      'REGISTRATION_TRANSITION_INVALID',
      `No existe transición de ${input.state} a CONFIRMED.`,
    );
  }

  if (input.fullExemptionApproved) {
    return { outcome: 'CONFIRM' };
  }

  /*
   * Cero confirma. Negativo también: un saldo negativo es sobrepago, y DEC-008
   * lo deja como saldo a favor de la persona. Quien pagó de más no está menos
   * inscrito que quien pagó exacto.
   */
  if (isZero(input.outstanding) || isNegative(input.outstanding)) {
    return { outcome: 'CONFIRM' };
  }

  return { outcome: 'STAY_SUBMITTED', reason: 'OUTSTANDING_BALANCE' };
}

/**
 * Igual que `decideConfirmation`, pero exige que se pueda confirmar.
 *
 * Para el caso de uso que ejecuta la confirmación: allí quedarse en
 * `SUBMITTED` no es información, es un rechazo.
 */
export function assertConfirmable(input: ConfirmationInput): void {
  const decision = decideConfirmation(input);

  if (decision.outcome !== 'CONFIRM') {
    throw new DomainError(
      'REGISTRATION_NOT_CONFIRMABLE',
      'La inscripción conserva saldo pendiente y no tiene exención total aprobada (REG-017).',
    );
  }
}
