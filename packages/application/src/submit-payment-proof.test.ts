import { ADVANCE_CHANNELS, DomainError, type Actor } from '@encuentro/domain';
import { describe, expect, it } from 'vitest';

import type { Clock } from './ports.js';
import type { ExchangeRateRepository } from './register-exchange-rate.js';
import {
  resubmitPaymentProof,
  submitPaymentProof,
  type EvidenceFile,
  type EvidenceStore,
  type PaymentChannelRecord,
  type ProofForResubmission,
  type ProofSubmissionRepository,
  type ProofWriteResult,
  type RegistrationForPayment,
  type ResubmitProofInput,
  type SubmitProofInput,
} from './submit-payment-proof.js';

const EVENTO = 'evt-1';
const INSCRIPCION = 'reg-1';
const CANAL = 'ch-1';
const EVIDENCIA = 'proof-1';
const PEREGRINO = 'u-peregrino';
const USD = 'USD';

const AHORA = new Date('2026-08-08T12:00:00.000Z');
const reloj: Clock = { now: () => AHORA };

/** 06:30 en La Paz del día 8, que son las 10:30 UTC del mismo día. */
const MADRUGADA = new Date('2026-08-08T10:30:00.000Z');

/** El peregrino no tiene ninguna asignación de rol: le autoriza la titularidad. */
function peregrino(userId = PEREGRINO): Actor {
  return { userId, assignments: [] };
}

function inscripcion(overrides: Partial<RegistrationForPayment> = {}): RegistrationForPayment {
  return {
    id: INSCRIPCION,
    eventId: EVENTO,
    eventStatus: 'ACTIVE',
    eventCurrency: USD,
    eventTimezone: 'America/La_Paz',
    status: 'SUBMITTED',
    ownerUserId: PEREGRINO,
    ...overrides,
  };
}

function canal(overrides: Partial<PaymentChannelRecord> = {}): PaymentChannelRecord {
  return {
    id: CANAL,
    eventId: EVENTO,
    code: 'US_ACCOUNT_MANUAL',
    currency: USD,
    active: true,
    ...overrides,
  };
}

function evidenciaCorregible(overrides: Partial<ProofForResubmission> = {}): ProofForResubmission {
  return {
    id: EVIDENCIA,
    eventId: EVENTO,
    eventStatus: 'ACTIVE',
    eventCurrency: USD,
    eventTimezone: 'America/La_Paz',
    registrationId: INSCRIPCION,
    ownerUserId: PEREGRINO,
    status: 'CORRECTION_REQUESTED',
    channelCurrency: USD,
    version: 3,
    ...overrides,
  };
}

interface RepoFalso extends ProofSubmissionRepository {
  readonly enviados: SubmitProofInput[];
  readonly reenviados: ResubmitProofInput[];
}

function repositorio(options: {
  registration?: RegistrationForPayment | null;
  channel?: PaymentChannelRecord | null;
  proof?: ProofForResubmission | null;
  result?: ProofWriteResult;
}): RepoFalso {
  const enviados: SubmitProofInput[] = [];
  const reenviados: ResubmitProofInput[] = [];
  const result = options.result ?? ({ ok: true, proofId: EVIDENCIA } as const);

  return {
    enviados,
    reenviados,
    findRegistrationForPayment: () => Promise.resolve(options.registration ?? null),
    findChannel: () => Promise.resolve(options.channel ?? null),
    findForResubmission: () => Promise.resolve(options.proof ?? null),
    submit: (input) => {
      enviados.push(input);
      return Promise.resolve(result);
    },
    resubmit: (input) => {
      reenviados.push(input);
      return Promise.resolve(result);
    },
  };
}

interface AlmacenFalso extends EvidenceStore {
  readonly guardados: number[];
}

function almacen(): AlmacenFalso {
  const guardados: number[] = [];

  return {
    guardados,
    store: (input) => {
      guardados.push(input.body.byteLength);
      return Promise.resolve<EvidenceFile>({ fileId: 'evidencias/x/1', checksum: 'abc123' });
    },
  };
}

const ARCHIVO = { body: new Uint8Array([1, 2, 3, 4]), contentType: 'image/png' };

const comando = {
  eventId: EVENTO,
  registrationId: INSCRIPCION,
  channelId: CANAL,
  // Texto sin moneda: la pone el canal, dentro del caso de uso.
  declaredAmount: '420.00',
  paidAt: new Date('2026-08-07T15:00:00.000Z'),
  reference: 'TRF-88213',
  upload: ARCHIVO,
} as const;

/**
 * Registro de tasas de mentira.
 *
 * Las pruebas de este archivo cobran en la moneda de la gestión, así que
 * `tasaDelPago` sale antes de consultar y nunca se llama a nada de aquí. Aun
 * así la dependencia es obligatoria y **faltaba**: los dobles se construían sin
 * ella y solo el orden de las comprobaciones evitaba el `undefined`. No lo vio
 * nadie porque `tsc --build` no cubre los archivos de prueba, que es un agujero
 * aparte del gate.
 *
 * `findForDay` devuelve `null` en vez de una tasa cualquiera: si alguna prueba
 * llegara a pedirla, el resultado sería el rechazo explícito por falta de tasa
 * y no una conversión inventada.
 */
function tasas(): ExchangeRateRepository {
  return {
    findForDay: () => Promise.resolve(null),
    listRecent: () => Promise.resolve([]),
    save: () => Promise.resolve(),
  };
}

function deps(repo: ProofSubmissionRepository, store: EvidenceStore = almacen()) {
  return { proofs: repo, evidence: store, rates: tasas(), clock: reloj };
}

describe('submitPaymentProof', () => {
  it('registra la evidencia del titular', async () => {
    const repo = repositorio({ registration: inscripcion(), channel: canal() });

    const id = await submitPaymentProof(deps(repo), peregrino(), comando);

    expect(id).toBe(EVIDENCIA);
    expect(repo.enviados).toHaveLength(1);
    expect(repo.enviados[0]?.reference).toBe('TRF-88213');
    expect(repo.enviados[0]?.file.checksum).toBe('abc123');
    expect(repo.enviados[0]?.actorId).toBe(PEREGRINO);
  });

  /*
   * PAY-025. Este caso de uso no toca ningún cargo ni crea ningún pago: lo
   * único que produce es una fila esperando revisión.
   */
  it('no crea ningún pago: solo deja la evidencia esperando', async () => {
    const repo = repositorio({ registration: inscripcion(), channel: canal() });
    await submitPaymentProof(deps(repo), peregrino(), comando);

    expect(repo.enviados[0]).not.toHaveProperty('allocations');
    expect(repo.reenviados).toHaveLength(0);
  });

  it('recorta la referencia y normaliza el pagador vacío', async () => {
    const repo = repositorio({ registration: inscripcion(), channel: canal() });

    await submitPaymentProof(deps(repo), peregrino(), {
      ...comando,
      reference: '  TRF-99  ',
      payerName: '   ',
    });

    expect(repo.enviados[0]?.reference).toBe('TRF-99');
    expect(repo.enviados[0]?.payerName).toBeNull();
  });

  it('conserva el pagador cuando pagó otra persona', async () => {
    const repo = repositorio({ registration: inscripcion(), channel: canal() });

    await submitPaymentProof(deps(repo), peregrino(), { ...comando, payerName: ' Ana Pérez ' });

    expect(repo.enviados[0]?.payerName).toBe('Ana Pérez');
  });

  describe('titularidad — PAY-021', () => {
    it('rechaza a quien no es el titular', async () => {
      const repo = repositorio({ registration: inscripcion(), channel: canal() });

      await expect(
        submitPaymentProof(deps(repo), peregrino('otro'), comando),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(repo.enviados).toHaveLength(0);
    });

    it('rechaza una inscripción sin cuenta vinculada (IAM-012)', async () => {
      const repo = repositorio({
        registration: inscripcion({ ownerUserId: null }),
        channel: canal(),
      });

      await expect(submitPaymentProof(deps(repo), peregrino(), comando)).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('una inscripción de otra gestión no está disponible', async () => {
      const repo = repositorio({
        registration: inscripcion({ eventId: 'evt-otra' }),
        channel: canal(),
      });

      await expect(submitPaymentProof(deps(repo), peregrino(), comando)).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('el rechazo no revela si la inscripción existe', async () => {
      const repo = repositorio({ registration: null });
      let thrown: unknown;

      try {
        await submitPaymentProof(deps(repo), peregrino(), comando);
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(DomainError);
      expect((thrown as DomainError).message).not.toContain(INSCRIPCION);
    });
  });

  describe('estado de la gestión y de la inscripción', () => {
    it('una gestión cerrada no admite evidencias (GOV-004)', async () => {
      const repo = repositorio({
        registration: inscripcion({ eventStatus: 'OPERATIONALLY_CLOSED' }),
        channel: canal(),
      });

      await expect(submitPaymentProof(deps(repo), peregrino(), comando)).rejects.toMatchObject({
        code: 'EVENT_OPERATIONS_BLOCKED',
      });
    });

    it('IN_PROGRESS sí las admite (GOV-003)', async () => {
      const repo = repositorio({
        registration: inscripcion({ eventStatus: 'IN_PROGRESS' }),
        channel: canal(),
      });

      await expect(submitPaymentProof(deps(repo), peregrino(), comando)).resolves.toBe(EVIDENCIA);
    });

    it('una inscripción cancelada no recibe dinero nuevo (REG-009)', async () => {
      const repo = repositorio({
        registration: inscripcion({ status: 'CANCELLED' }),
        channel: canal(),
      });

      await expect(submitPaymentProof(deps(repo), peregrino(), comando)).rejects.toMatchObject({
        code: 'PAYMENT_PROOF_NOT_SUBMITTABLE',
      });
    });
  });

  describe('canal — PAY-023, PAY-024', () => {
    it('rechaza un canal inexistente', async () => {
      const repo = repositorio({ registration: inscripcion(), channel: null });

      await expect(submitPaymentProof(deps(repo), peregrino(), comando)).rejects.toMatchObject({
        code: 'PAYMENT_PROOF_NOT_SUBMITTABLE',
      });
    });

    /*
     * Sin esta comprobación bastaría con presentar el identificador de un canal
     * ajeno para dirigir la transferencia a una cuenta que esta gestión no
     * controla.
     */
    it('rechaza un canal de otra gestión', async () => {
      const repo = repositorio({
        registration: inscripcion(),
        channel: canal({ eventId: 'evt-otra' }),
      });

      await expect(submitPaymentProof(deps(repo), peregrino(), comando)).rejects.toMatchObject({
        code: 'PAYMENT_PROOF_NOT_SUBMITTABLE',
      });
    });

    it('acepta un canal global', async () => {
      const repo = repositorio({ registration: inscripcion(), channel: canal({ eventId: null }) });

      await expect(submitPaymentProof(deps(repo), peregrino(), comando)).resolves.toBe(EVIDENCIA);
    });

    it('rechaza un canal deshabilitado', async () => {
      const repo = repositorio({ registration: inscripcion(), channel: canal({ active: false }) });

      await expect(submitPaymentProof(deps(repo), peregrino(), comando)).rejects.toThrow(
        /deshabilitado/,
      );
    });

    /*
     * PAY-024 y PAY-011. La pantalla solo ofrece los tres canales anticipados,
     * pero el identificador viaja en el formulario y el endpoint de la acción
     * de servidor es invocable directamente. Sin esta comprobación, presentar
     * el identificador de un canal de caja producía una evidencia aprobable
     * cuyo pago nunca pasaba por ningún arqueo.
     */
    it('rechaza los canales de caja aunque estén activos en la gestión', async () => {
      for (const code of ['CASH', 'CASH_QR']) {
        const store = almacen();
        const repo = repositorio({ registration: inscripcion(), channel: canal({ code }) });

        await expect(
          submitPaymentProof(deps(repo, store), peregrino(), comando),
        ).rejects.toMatchObject({ code: 'PAYMENT_PROOF_NOT_SUBMITTABLE' });

        expect(repo.enviados).toHaveLength(0);
        expect(store.guardados).toHaveLength(0);
      }
    });

    it('acepta los tres canales anticipados', async () => {
      for (const code of ADVANCE_CHANNELS) {
        const repo = repositorio({ registration: inscripcion(), channel: canal({ code }) });

        await expect(submitPaymentProof(deps(repo), peregrino(), comando)).resolves.toBe(EVIDENCIA);
      }
    });
  });

  describe('el archivo se guarda al final', () => {
    /*
     * Guardarlo antes de validar dejaría un objeto huérfano en el almacén por
     * cada intento rechazado, y nadie los recogería.
     */
    it('no guarda nada si la declaración se rechaza', async () => {
      const store = almacen();
      const repo = repositorio({ registration: inscripcion(), channel: canal({ active: false }) });

      await expect(submitPaymentProof(deps(repo, store), peregrino(), comando)).rejects.toThrow();
      expect(store.guardados).toHaveLength(0);
    });

    it('no guarda nada si el actor no es el titular', async () => {
      const store = almacen();
      const repo = repositorio({ registration: inscripcion(), channel: canal() });

      await expect(
        submitPaymentProof(deps(repo, store), peregrino('otro'), comando),
      ).rejects.toThrow();
      expect(store.guardados).toHaveLength(0);
    });

    it('guarda una sola vez cuando todo vale', async () => {
      const store = almacen();
      const repo = repositorio({ registration: inscripcion(), channel: canal() });

      await submitPaymentProof(deps(repo, store), peregrino(), comando);

      expect(store.guardados).toEqual([4]);
    });
  });

  it('traduce la referencia duplicada a PAY-027', async () => {
    const repo = repositorio({
      registration: inscripcion(),
      channel: canal(),
      result: { ok: false, reason: 'DUPLICATE_REFERENCE' },
    });

    await expect(submitPaymentProof(deps(repo), peregrino(), comando)).rejects.toMatchObject({
      code: 'PAYMENT_PROOF_DUPLICATE_REFERENCE',
    });
  });

  it('valida la declaración con el reloj inyectado, no con la hora del sistema', async () => {
    const repo = repositorio({ registration: inscripcion(), channel: canal() });

    await expect(
      submitPaymentProof(deps(repo), peregrino(), {
        ...comando,
        paidAt: new Date('2026-08-09T12:00:00.000Z'),
      }),
    ).rejects.toThrow(/futura/);
  });

  /*
   * La zona sale de la gestión, no del servidor (NFR-013). Con el reloj a las
   * 10:30 UTC del día 8, en La Paz ya es el día 8 y declarar ese día debe valer.
   */
  it('resuelve «hoy» en la zona de la gestión', async () => {
    const repo = repositorio({
      registration: inscripcion({ eventTimezone: 'America/La_Paz' }),
      channel: canal(),
    });

    const madrugada = {
      proofs: repo,
      evidence: almacen(),
      rates: tasas(),
      clock: { now: () => MADRUGADA },
    };

    await expect(
      submitPaymentProof(madrugada, peregrino(), {
        ...comando,
        paidAt: new Date('2026-08-08T12:00:00.000Z'),
      }),
    ).resolves.toBe(EVIDENCIA);
  });
});

describe('resubmitPaymentProof', () => {
  const correccion = {
    eventId: EVENTO,
    proofId: EVIDENCIA,
    expectedVersion: 3,
    declaredAmount: '420.00',
    paidAt: new Date('2026-08-07T15:00:00.000Z'),
    reference: 'TRF-88214',
    upload: ARCHIVO,
  } as const;

  it('devuelve a revisión una evidencia corregida', async () => {
    const repo = repositorio({ proof: evidenciaCorregible() });

    await resubmitPaymentProof(deps(repo), peregrino(), correccion);

    expect(repo.reenviados).toHaveLength(1);
    expect(repo.reenviados[0]?.expectedVersion).toBe(3);
    expect(repo.reenviados[0]?.reference).toBe('TRF-88214');
    expect(repo.reenviados[0]?.eventId).toBe(EVENTO);
  });

  /*
   * La máquina de estados solo admite `CORRECTION_REQUESTED -> SUBMITTED`. Un
   * rechazo no se corrige: se sustituye por una evidencia nueva.
   */
  it('no corrige una evidencia rechazada', async () => {
    const repo = repositorio({ proof: evidenciaCorregible({ status: 'REJECTED' }) });

    await expect(resubmitPaymentProof(deps(repo), peregrino(), correccion)).rejects.toMatchObject({
      code: 'PAYMENT_PROOF_NOT_SUBMITTABLE',
    });
  });

  it('no corrige una evidencia ya aprobada', async () => {
    const repo = repositorio({ proof: evidenciaCorregible({ status: 'APPROVED' }) });

    await expect(resubmitPaymentProof(deps(repo), peregrino(), correccion)).rejects.toMatchObject({
      code: 'PAYMENT_PROOF_NOT_SUBMITTABLE',
    });
  });

  it('rechaza a quien no es el titular', async () => {
    const repo = repositorio({ proof: evidenciaCorregible() });

    await expect(
      resubmitPaymentProof(deps(repo), peregrino('otro'), correccion),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('una evidencia de otra gestión no está disponible', async () => {
    const repo = repositorio({ proof: evidenciaCorregible({ eventId: 'evt-otra' }) });

    await expect(resubmitPaymentProof(deps(repo), peregrino(), correccion)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('perder la carrera contra otra corrección es conflicto de versión', async () => {
    const repo = repositorio({
      proof: evidenciaCorregible(),
      result: { ok: false, reason: 'CONFLICT' },
    });

    await expect(resubmitPaymentProof(deps(repo), peregrino(), correccion)).rejects.toMatchObject({
      code: 'EVENT_VERSION_CONFLICT',
    });
  });

  it('valida el archivo corregido igual que el original', async () => {
    const store = almacen();
    const repo = repositorio({ proof: evidenciaCorregible() });

    await expect(
      resubmitPaymentProof(deps(repo, store), peregrino(), {
        ...correccion,
        upload: { body: new Uint8Array([1]), contentType: 'text/html' },
      }),
    ).rejects.toMatchObject({ code: 'PAYMENT_PROOF_NOT_SUBMITTABLE' });

    expect(store.guardados).toHaveLength(0);
  });

  it('una gestión cerrada tampoco admite correcciones', async () => {
    const repo = repositorio({ proof: evidenciaCorregible({ eventStatus: 'FINANCIALLY_CLOSED' }) });

    await expect(resubmitPaymentProof(deps(repo), peregrino(), correccion)).rejects.toMatchObject({
      code: 'EVENT_OPERATIONS_BLOCKED',
    });
  });
});
