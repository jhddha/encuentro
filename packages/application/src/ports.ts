import type { Actor, EventState, LodgingState } from '@encuentro/domain';

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

// ---------------------------------------------------------------------------
// Procesos de fondo — DEC-001
//
// Los dos puertos que siguen los consume el worker, no la web. Están aquí y no
// en `apps/worker` porque la dirección de dependencias no cambia por el hecho
// de que quien invoque el caso de uso sea un proceso en vez de una petición.
// ---------------------------------------------------------------------------

/** Reserva candidata a expirar, tal como la ve la capa de aplicación. */
export interface ReservationRecord {
  readonly id: string;
  readonly eventId: string;
  readonly status: LodgingState;
  readonly createdAt: Date;
  /** DEC-005. La base garantiza que solo es no nulo mientras el estado es `HELD`. */
  readonly heldUntil: Date | null;
  readonly version: number;
}

export interface ExpireReservationInput {
  readonly reservationId: string;
  readonly expectedVersion: number;
  readonly actorId: string;
  readonly reason: string;
}

export interface ReservationRepository {
  /**
   * Reservas que la base considera vencidas: `HELD` con `held_until` pasado.
   *
   * Devuelve candidatas, no sentencias. Quien decide si se expiran es el
   * dominio, que vuelve a aplicar la regla de DEC-005 sobre `createdAt`.
   */
  findExpiryCandidates(now: Date, limit: number): Promise<readonly ReservationRecord[]>;

  /**
   * Expira una reserva con compare-and-swap sobre `version` y `status`.
   *
   * Devuelve `false` si otra operación se adelantó —típicamente una
   * confirmación de pago que llegó en el mismo segundo—. Perder esa carrera es
   * el resultado correcto: HOS-012 prohíbe liberar una reserva `CONFIRMED`.
   */
  expire(input: ExpireReservationInput): Promise<boolean>;
}

/**
 * Envío pendiente, con su plantilla sin renderizar.
 *
 * La sustitución de variables la hace el dominio (`renderTemplate`), no el
 * repositorio: es una regla, no un detalle de almacenamiento.
 */
export interface PendingNotification {
  readonly id: string;
  readonly eventId: string | null;
  readonly toEmail: string;
  readonly subjectTemplate: string;
  readonly bodyTemplate: string;
  readonly variables: Readonly<Record<string, string>>;
  readonly attempts: number;
}

export interface NotificationRepository {
  /**
   * Toma envíos vencidos y los marca `SENDING` de forma atómica.
   *
   * Reclamar y leer deben ser la misma operación. Si fueran dos, dos réplicas
   * del worker leerían la misma fila y el peregrino recibiría el correo dos
   * veces.
   */
  claimDue(now: Date, limit: number): Promise<readonly PendingNotification[]>;

  markSent(id: string, sentAt: Date): Promise<void>;

  /**
   * Marca el envío como fallido.
   *
   * `retryAt` nulo significa que no habrá reintento: o se agotaron los intentos
   * o el fallo es determinista y repetirlo daría el mismo resultado.
   */
  markFailed(id: string, error: string, retryAt: Date | null): Promise<void>;

  /**
   * Cierra un envío cuya cuota ya estaba agotada al reclamarlo.
   *
   * Distinto de `markFailed`, que además **cuenta un intento**: aquí no se
   * intentó nada. Llamar a `markFailed` dejaría la fila con más intentos que el
   * máximo, y una cola muerta que dice 6 de 5 no se puede leer.
   */
  markExhausted(id: string, error: string): Promise<void>;
}

export interface EmailMessage {
  readonly to: string;
  readonly subject: string;
  readonly body: string;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}
