import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { DomainError } from './errors.js';
import { authorize, can, scopeCovers, type Actor, type Scope } from './rbac.js';

const contractPermissions = (
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL('../../../contracts/permissions.json', import.meta.url)),
      'utf8',
    ),
  ) as { permissions: string[] }
).permissions;

const EVENT_A = 'evt-2026';
const EVENT_B = 'evt-2027';

function actorWith(permissions: readonly string[], scope: Scope): Actor {
  return { userId: 'u-1', assignments: [{ permissions, scope }] };
}

describe('contención de scopes', () => {
  it('GLOBAL alcanza cualquier recurso', () => {
    const global: Scope = { type: 'GLOBAL' };
    expect(scopeCovers(global, { type: 'GLOBAL' })).toBe(true);
    expect(scopeCovers(global, { type: 'EVENT', eventId: EVENT_A })).toBe(true);
    expect(scopeCovers(global, { type: 'CASH', eventId: EVENT_A, cashAccountId: 'CAJA-01' })).toBe(
      true,
    );
  });

  it('EVENT alcanza su gestión y lo que contiene', () => {
    const scope: Scope = { type: 'EVENT', eventId: EVENT_A };
    expect(scopeCovers(scope, { type: 'EVENT', eventId: EVENT_A })).toBe(true);
    expect(
      scopeCovers(scope, { type: 'COMMISSION', eventId: EVENT_A, commissionId: 'INSCRIPCIONES' }),
    ).toBe(true);
    expect(scopeCovers(scope, { type: 'CASH', eventId: EVENT_A, cashAccountId: 'CAJA-01' })).toBe(
      true,
    );
  });

  it('EVENT no alcanza otra gestión — aislamiento entre gestiones', () => {
    // GOV-001: todo registro transaccional pertenece a una gestión.
    const scope: Scope = { type: 'EVENT', eventId: EVENT_A };
    expect(scopeCovers(scope, { type: 'EVENT', eventId: EVENT_B })).toBe(false);
    expect(scopeCovers(scope, { type: 'CASH', eventId: EVENT_B, cashAccountId: 'CAJA-01' })).toBe(
      false,
    );
  });

  it('EVENT no escala a GLOBAL', () => {
    expect(scopeCovers({ type: 'EVENT', eventId: EVENT_A }, { type: 'GLOBAL' })).toBe(false);
  });

  it('CASH no alcanza otra caja de la misma gestión', () => {
    const scope: Scope = { type: 'CASH', eventId: EVENT_A, cashAccountId: 'CAJA-01' };
    expect(scopeCovers(scope, { type: 'CASH', eventId: EVENT_A, cashAccountId: 'CAJA-02' })).toBe(
      false,
    );
  });

  it('CASH no escala al nivel de gestión', () => {
    const scope: Scope = { type: 'CASH', eventId: EVENT_A, cashAccountId: 'CAJA-01' };
    expect(scopeCovers(scope, { type: 'EVENT', eventId: EVENT_A })).toBe(false);
  });

  it('COMMISSION no alcanza otra comisión ni una caja', () => {
    const scope: Scope = {
      type: 'COMMISSION',
      eventId: EVENT_A,
      commissionId: 'INSCRIPCIONES',
    };
    expect(
      scopeCovers(scope, { type: 'COMMISSION', eventId: EVENT_A, commissionId: 'HOSPEDAJE' }),
    ).toBe(false);
    expect(scopeCovers(scope, { type: 'CASH', eventId: EVENT_A, cashAccountId: 'CAJA-01' })).toBe(
      false,
    );
  });
});

describe('autorización por permiso y scope', () => {
  it('concede cuando permiso y alcance vienen de la misma asignación', () => {
    const actor = actorWith(['event.transition'], { type: 'EVENT', eventId: EVENT_A });
    expect(can(actor, 'event.transition', { type: 'EVENT', eventId: EVENT_A })).toBe(true);
  });

  it('niega el permiso correcto en el ámbito equivocado', () => {
    const actor = actorWith(['event.transition'], { type: 'EVENT', eventId: EVENT_A });
    expect(can(actor, 'event.transition', { type: 'EVENT', eventId: EVENT_B })).toBe(false);
  });

  it('niega el ámbito correcto con el permiso equivocado', () => {
    const actor = actorWith(['event.read'], { type: 'EVENT', eventId: EVENT_A });
    expect(can(actor, 'event.transition', { type: 'EVENT', eventId: EVENT_A })).toBe(false);
  });

  it('no combina permiso de una asignación con alcance de otra', () => {
    // Escalada clásica: el actor tiene `payment.collect` solo en CAJA-01 y
    // lectura en CAJA-02. Comprobar permiso y alcance por separado le dejaría
    // cobrar en CAJA-02.
    const actor: Actor = {
      userId: 'u-1',
      assignments: [
        {
          permissions: ['payment.collect'],
          scope: { type: 'CASH', eventId: EVENT_A, cashAccountId: 'CAJA-01' },
        },
        {
          permissions: ['payment.read'],
          scope: { type: 'CASH', eventId: EVENT_A, cashAccountId: 'CAJA-02' },
        },
      ],
    };

    expect(
      can(actor, 'payment.collect', { type: 'CASH', eventId: EVENT_A, cashAccountId: 'CAJA-01' }),
    ).toBe(true);
    expect(
      can(actor, 'payment.collect', { type: 'CASH', eventId: EVENT_A, cashAccountId: 'CAJA-02' }),
    ).toBe(false);
  });

  it('un actor sin asignaciones no puede nada', () => {
    const actor: Actor = { userId: 'u-1', assignments: [] };
    for (const permission of contractPermissions) {
      expect(can(actor, permission, { type: 'EVENT', eventId: EVENT_A })).toBe(false);
    }
  });

  it('authorize lanza FORBIDDEN sin revelar si el recurso existe', () => {
    const actor = actorWith(['event.read'], { type: 'EVENT', eventId: EVENT_A });

    let thrown: unknown;
    try {
      authorize(actor, 'event.transition', { type: 'EVENT', eventId: EVENT_B });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(DomainError);
    expect((thrown as DomainError).code).toBe('FORBIDDEN');
    // El mensaje no debe distinguir «no existe» de «no autorizado».
    expect((thrown as DomainError).message).not.toContain(EVENT_B);
  });
});

describe('permisos del contrato', () => {
  it('los permisos usados en dominio existen en contracts/permissions.json', () => {
    const used = [
      'event.create',
      'event.read',
      'event.update',
      'event.transition',
      'event.close',
      'audit.read',
    ];
    for (const permission of used) {
      expect(contractPermissions).toContain(permission);
    }
  });
});
