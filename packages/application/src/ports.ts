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
export interface AuditPort {
  record(entry: AuditEntry): Promise<void>;
}

export interface AuditEntry {
  readonly eventId?: string;
  readonly actorId: string;
  readonly action: string;
  readonly entity: string;
  readonly entityId: string;
  readonly reason?: string;
}
