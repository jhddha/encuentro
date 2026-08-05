import { DomainError } from './errors.js';

/**
 * Notificaciones — P13.
 *
 * **Procedencia mixta.** No hay requisitos `NOT-*` en el contrato, pero tres
 * reglas sí vienen de documentos aprobados y **no** son inferencia:
 *
 *  - **GOV-007**: SMTP, reglas y plantillas son **globales**. No llevan
 *    `event_id`. Una gestión no configura su propio servidor de correo.
 *  - **GOV-008**: una falla de integración **no revierte** una operación
 *    confirmada. Si el correo no sale, el pago sigue aprobado.
 *  - **ADR-007**: el envío ocurre por outbox y worker, nunca dentro de la
 *    petición que originó el evento.
 *
 * Lo inferido es el catálogo concreto de plantillas y su contenido.
 */

/**
 * Estado de un envío.
 *
 * INFERIDO: la máquina de estados no está en `contracts/states.json`. Se modela
 * como cola con reintentos porque ADR-007 exige outbox y GOV-008 exige que el
 * fallo no propague hacia atrás.
 */
export type NotificationState = 'PENDING' | 'SENDING' | 'SENT' | 'FAILED' | 'CANCELLED';

const NOTIFICATION_TRANSITIONS: Readonly<Record<NotificationState, readonly NotificationState[]>> =
  {
    PENDING: ['SENDING', 'CANCELLED'],
    // Un envío puede volver a PENDING para reintentarse: GOV-008 exige que el
    // trabajo sea reintentable en el worker.
    SENDING: ['SENT', 'FAILED'],
    FAILED: ['PENDING', 'CANCELLED'],
    SENT: [],
    CANCELLED: [],
  };

export function canTransitionNotification(from: NotificationState, to: NotificationState): boolean {
  return NOTIFICATION_TRANSITIONS[from].includes(to);
}

/**
 * ¿Debe reintentarse este envío?
 *
 * INFERIDO: el número de reintentos y la espera no están documentados. Se usa
 * retroceso exponencial acotado, que es lo habitual para no golpear un SMTP
 * caído.
 */
export const MAX_DELIVERY_ATTEMPTS = 5;

export function shouldRetry(state: NotificationState, attempts: number): boolean {
  return state === 'FAILED' && attempts < MAX_DELIVERY_ATTEMPTS;
}

export function nextRetryDelayMs(attempts: number): number {
  // 1 min, 2, 4, 8, 16. Acotado para que un fallo prolongado no deje envíos
  // programados a días vista.
  const minutes = Math.min(2 ** Math.max(0, attempts - 1), 16);
  return minutes * 60 * 1000;
}

/**
 * Sustitución de variables en una plantilla.
 *
 * INFERIDO. Dos decisiones deliberadas:
 *
 *  - Una variable ausente **falla** en lugar de renderizarse vacía. Un correo
 *    que dice «Su pago de  ha sido aprobado» es peor que no enviarlo.
 *  - No se interpreta ningún marcador que no esté en el diccionario, así que el
 *    contenido de una variable no puede inyectar otra.
 */
const PLACEHOLDER = /\{\{(\w+)\}\}/g;

export function renderTemplate(
  template: string,
  variables: Readonly<Record<string, string>>,
): string {
  const missing: string[] = [];

  const rendered = template.replace(PLACEHOLDER, (_match, name: string) => {
    const value = variables[name];
    if (value === undefined) {
      missing.push(name);
      return '';
    }
    return value;
  });

  if (missing.length > 0) {
    throw new DomainError(
      'NOTIFICATION_TEMPLATE_INVALID',
      `Faltan variables en la plantilla: ${missing.join(', ')}.`,
    );
  }

  return rendered;
}

/** Variables que una plantilla declara necesitar. */
export function templateVariables(template: string): readonly string[] {
  return [...new Set([...template.matchAll(PLACEHOLDER)].map((m) => m[1] ?? ''))].filter(
    (name) => name !== '',
  );
}
