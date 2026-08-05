/**
 * Microcopy canónico.
 *
 * Transcripción literal de `docs/03-design/design-system.md` §8. Estos textos
 * no se reescriben al gusto: describen reglas de negocio aprobadas y una
 * variación cambia lo que el sistema promete al peregrino.
 *
 * `microcopy.test.ts` comprueba que cada cadena siga apareciendo en el
 * documento fuente.
 */
export const MICROCOPY = {
  eventInProgress: 'El evento está en curso. Las inscripciones y pagos continúan habilitados.',
  advancePending: 'Recibimos tu comprobante. El beneficio se habilitará cuando sea aprobado.',
  advanceApproved:
    'Tu tarifa especial está confirmada. Ya puedes escoger hotel según disponibilidad.',
  arrivalMode:
    'Pagarás el precio normal y escogerás hotel entre las opciones disponibles al llegar.',
  mealOutsideWindow: 'Este servicio no está disponible en este horario.',
} as const;

/**
 * Término prohibido.
 *
 * `design-system.md` §6: «No usar "pago online" como sinónimo de pago
 * automático». v1 no tiene checkout automático (DEC-002, PAY-001), así que la
 * expresión induciría a error sobre lo que ocurre al pagar.
 */
export const FORBIDDEN_PAYMENT_TERM = 'pago online';
