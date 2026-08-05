import { describe, expect, it } from 'vitest';

import type { DomainError } from './errors.js';
import {
  MAX_DELIVERY_ATTEMPTS,
  canTransitionNotification,
  nextRetryDelayMs,
  renderTemplate,
  shouldRetry,
  templateVariables,
} from './notifications.js';

describe('cola de envíos (ADR-007, GOV-008)', () => {
  it('recorre el camino normal', () => {
    expect(canTransitionNotification('PENDING', 'SENDING')).toBe(true);
    expect(canTransitionNotification('SENDING', 'SENT')).toBe(true);
  });

  it('un fallo puede reintentarse', () => {
    // GOV-008: el trabajo es reintentable en el worker.
    expect(canTransitionNotification('SENDING', 'FAILED')).toBe(true);
    expect(canTransitionNotification('FAILED', 'PENDING')).toBe(true);
  });

  it('un envío realizado es terminal', () => {
    expect(canTransitionNotification('SENT', 'PENDING')).toBe(false);
    expect(canTransitionNotification('SENT', 'FAILED')).toBe(false);
  });

  it('no se salta el estado de envío', () => {
    expect(canTransitionNotification('PENDING', 'SENT')).toBe(false);
  });
});

describe('reintentos acotados', () => {
  it('reintenta mientras queden intentos', () => {
    expect(shouldRetry('FAILED', 0)).toBe(true);
    expect(shouldRetry('FAILED', MAX_DELIVERY_ATTEMPTS - 1)).toBe(true);
  });

  it('deja de reintentar al agotarlos', () => {
    expect(shouldRetry('FAILED', MAX_DELIVERY_ATTEMPTS)).toBe(false);
  });

  it('solo reintenta lo que falló', () => {
    expect(shouldRetry('SENT', 0)).toBe(false);
    expect(shouldRetry('PENDING', 0)).toBe(false);
  });

  it('la espera crece pero está acotada', () => {
    // Un SMTP caído durante horas no debe dejar envíos programados a días vista.
    expect(nextRetryDelayMs(1)).toBe(60_000);
    expect(nextRetryDelayMs(2)).toBe(120_000);
    expect(nextRetryDelayMs(3)).toBe(240_000);
    expect(nextRetryDelayMs(10)).toBe(16 * 60_000);
  });
});

describe('plantillas', () => {
  it('sustituye las variables declaradas', () => {
    expect(
      renderTemplate('Hola {{nombre}}, tu pago de {{monto}} fue aprobado.', {
        nombre: 'Ana',
        monto: '350.00 USD',
      }),
    ).toBe('Hola Ana, tu pago de 350.00 USD fue aprobado.');
  });

  it('falla si falta una variable en lugar de dejar un hueco', () => {
    // «Su pago de  ha sido aprobado» es peor que no enviar nada.
    let thrown: unknown;
    try {
      renderTemplate('Tu pago de {{monto}} fue aprobado.', {});
    } catch (error) {
      thrown = error;
    }
    expect((thrown as DomainError).code).toBe('NOTIFICATION_TEMPLATE_INVALID');
    expect((thrown as DomainError).message).toContain('monto');
  });

  it('nombra todas las variables que faltan, no solo la primera', () => {
    let thrown: unknown;
    try {
      renderTemplate('{{a}} y {{b}} y {{c}}', { b: 'x' });
    } catch (error) {
      thrown = error;
    }
    expect((thrown as DomainError).message).toContain('a');
    expect((thrown as DomainError).message).toContain('c');
  });

  it('el contenido de una variable no puede inyectar otra', () => {
    // La sustitución es de una sola pasada: lo insertado no se reinterpreta.
    expect(renderTemplate('Hola {{nombre}}', { nombre: '{{secreto}}' })).toBe('Hola {{secreto}}');
  });

  it('deja intacto lo que no es un marcador', () => {
    expect(renderTemplate('Importe: { 350 } y {{monto}}', { monto: '1' })).toBe(
      'Importe: { 350 } y 1',
    );
  });

  it('enumera las variables que una plantilla necesita', () => {
    expect(templateVariables('Hola {{nombre}}, {{nombre}} de {{evento}}')).toEqual([
      'nombre',
      'evento',
    ]);
  });

  it('una plantilla sin variables no necesita ninguna', () => {
    expect(templateVariables('Texto fijo')).toEqual([]);
    expect(renderTemplate('Texto fijo', {})).toBe('Texto fijo');
  });
});
