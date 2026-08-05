import type { Actor, EventState } from '@encuentro/domain';

/**
 * Puertos de la capa de aplicación.
 *
 * La infraestructura los implementa; el dominio no los conoce. La dirección de
 * dependencias es `presentation -> application -> domain` (regla
 * 02-domain-boundaries): aquí no se importa Prisma, Redis ni ningún detalle de
 * infraestructura.
 */

/** Reloj inyectable. Nada en el dominio lee la hora del sistema directamente. */
export interface Clock {
  /** Instante actual en UTC (requirements.md §10: las fechas se guardan en UTC). */
  now(): Date;
}

/** Registro de auditoría append-only (GOV-009). */
export interface AuditEntry {
  readonly eventId?: string;
  readonly actorId: string;
  readonly action: string;
  readonly entity: string;
  readonly entityId: string;
  readonly reason?: string;
  readonly before?: Readonly<Record<string, unknown>>;
  readonly after?: Readonly<Record<string, unknown>>;
  readonly correlationId?: string;
}

export interface AuditPort {
  record(entry: AuditEntry): Promise<void>;
}

/** Gestión tal como la ve la capa de aplicación. */
export interface EventRecord {
  readonly id: string;
  readonly code: string;
  readonly year: number;
  readonly name: string;
  readonly timezone: string;
  readonly currency: string;
  readonly startAt: Date;
  readonly endAt: Date;
  readonly status: EventState;
  readonly version: number;
  readonly publiclyEnabled: boolean;
}

export interface EventRepository {
  findById(id: string): Promise<EventRecord | null>;
  findByCode(code: string): Promise<EventRecord | null>;
  list(): Promise<readonly EventRecord[]>;

  /** Gestión públicamente habilitada, o `null` si no hay ninguna (EVT-004, EVT-006). */
  findPubliclyEnabled(): Promise<EventRecord | null>;

  create(input: CreateEventInput): Promise<EventRecord>;

  /**
   * Aplica una transición con compare-and-swap sobre `version`.
   *
   * Devuelve `null` si la versión esperada ya no coincide, es decir, si otra
   * operación se adelantó. No lanza: quedar segundo en una carrera es un
   * resultado previsto, no un fallo del sistema.
   *
   * La escritura del estado y la del registro de auditoría ocurren en la misma
   * transacción de base de datos. Separarlas permitiría que un cambio quedara
   * sin rastro si el proceso muere entre ambas.
   */
  applyTransition(input: ApplyTransitionInput): Promise<EventRecord | null>;
}

export interface CreateEventInput {
  readonly code: string;
  readonly year: number;
  readonly name: string;
  readonly timezone: string;
  readonly currency: string;
  readonly startAt: Date;
  readonly endAt: Date;
  readonly actorId: string;
}

export interface ApplyTransitionInput {
  readonly eventId: string;
  readonly expectedVersion: number;
  readonly to: EventState;
  readonly actorId: string;
  readonly reason?: string;
}

/** Resuelve el actor de la petición y sus asignaciones de rol. */
export interface ActorResolver {
  resolve(userId: string): Promise<Actor | null>;
}
