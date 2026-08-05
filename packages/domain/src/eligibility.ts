import { DomainError } from './errors.js';

/**
 * Elegibilidad de la persona para inscribirse.
 *
 * DEC-006: v1 **no admite menores de edad**. Es una regla dura con su error de
 * dominio, no un aviso que se pueda ignorar desde la interfaz.
 */

export const MINIMUM_AGE = 18;

/**
 * Edad cumplida en una fecha dada.
 *
 * Cuenta años completos, no divide días entre 365: quien nace el 29 de febrero
 * cumple años el 28 de febrero en los años no bisiestos, y una división daría
 * un resultado distinto en los bordes.
 */
export function ageAt(birthDate: Date, reference: Date): number {
  let age = reference.getUTCFullYear() - birthDate.getUTCFullYear();

  const monthDiff = reference.getUTCMonth() - birthDate.getUTCMonth();
  const dayDiff = reference.getUTCDate() - birthDate.getUTCDate();

  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1;
  }

  return age;
}

/**
 * ¿Puede esta persona inscribirse en esta gestión?
 *
 * La edad se evalúa contra **el inicio del evento**, no contra la fecha de
 * inscripción. Quien tiene 17 al inscribirse pero cumple 18 antes de que
 * empiece el Encuentro sí puede participar: lo que importa es su edad cuando
 * asista, que es cuando la organización asume la responsabilidad.
 */
export function isEligibleByAge(birthDate: Date, eventStartAt: Date): boolean {
  return ageAt(birthDate, eventStartAt) >= MINIMUM_AGE;
}

export function assertEligibleByAge(birthDate: Date, eventStartAt: Date): void {
  if (!isEligibleByAge(birthDate, eventStartAt)) {
    // El mensaje no revela la edad calculada: quien recibe el error ya conoce
    // su fecha de nacimiento, y repetirla no aporta nada.
    throw new DomainError(
      'MINOR_NOT_ALLOWED',
      `La inscripción requiere ${String(MINIMUM_AGE)} años cumplidos al inicio del evento.`,
    );
  }
}
