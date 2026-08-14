import { type Actor } from '@encuentro/domain';
import { describe, expect, it } from 'vitest';

import {
  savePolicy,
  saveHotel,
  saveRoom,
  type HotelState,
  type LodgingConfigRepository,
  type RoomState,
} from './configure-lodging.js';

const EVENTO = 'evt-1';
const HOTEL = 'hotel-1';
const HABITACION = 'room-1';

function actor(permisos: readonly string[] = ['lodging.manage']): Actor {
  return {
    userId: 'u-hospedaje',
    assignments: [{ permissions: permisos, scope: { type: 'EVENT', eventId: EVENTO } }],
  };
}

interface RepoFalso extends LodgingConfigRepository {
  readonly hoteles: unknown[];
  readonly habitaciones: unknown[];
  readonly politicas: unknown[];
}

function repositorio(
  estado: { hotel?: HotelState | null; room?: RoomState | null; pertenece?: boolean } = {},
): RepoFalso {
  const hoteles: unknown[] = [];
  const habitaciones: unknown[] = [];
  const politicas: unknown[] = [];

  return {
    hoteles,
    habitaciones,
    politicas,
    findHotel: () =>
      Promise.resolve(
        estado.hotel === undefined
          ? { id: HOTEL, eventId: EVENTO, name: 'Hotel Central', live: 0 }
          : estado.hotel,
      ),
    findRoom: () =>
      Promise.resolve(
        estado.room === undefined
          ? { id: HABITACION, hotelId: HOTEL, eventId: EVENTO, code: '101', occupied: 0 }
          : estado.room,
      ),
    hotelBelongsTo: () => Promise.resolve(estado.pertenece !== false),
    saveHotel: (input) => {
      hoteles.push(input.hotel);
      return Promise.resolve(HOTEL);
    },
    saveRoom: (input) => {
      habitaciones.push(input.room);
      return Promise.resolve(HABITACION);
    },
    savePolicy: (input) => {
      politicas.push(input.policy);
      return Promise.resolve();
    },
  };
}

const hotelNuevo = {
  id: null,
  code: 'CENTRAL',
  name: 'Hotel Central',
  address: null,
  active: true,
};

describe('inventario de hoteles — HOS-011', () => {
  it('da de alta un hotel', async () => {
    const repo = repositorio();

    await saveHotel({ config: repo }, actor(), EVENTO, hotelNuevo);

    expect(repo.hoteles[0]).toMatchObject({ code: 'CENTRAL', name: 'Hotel Central' });
  });

  it('recorta los espacios del código y del nombre', async () => {
    const repo = repositorio();

    await saveHotel({ config: repo }, actor(), EVENTO, {
      ...hotelNuevo,
      code: '  CENTRAL  ',
      name: '  Hotel Central  ',
    });

    expect(repo.hoteles[0]).toMatchObject({ code: 'CENTRAL', name: 'Hotel Central' });
  });

  it('exige el permiso de administrar, no el de asignar', async () => {
    const repo = repositorio();

    await expect(
      saveHotel({ config: repo }, actor(['lodging.assign_room']), EVENTO, hotelNuevo),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    expect(repo.hoteles).toHaveLength(0);
  });

  it('no acepta un hotel sin código ni sin nombre', async () => {
    const repo = repositorio();

    await expect(
      saveHotel({ config: repo }, actor(), EVENTO, { ...hotelNuevo, code: '   ' }),
    ).rejects.toThrow(/necesita un código/);

    await expect(
      saveHotel({ config: repo }, actor(), EVENTO, { ...hotelNuevo, name: '' }),
    ).rejects.toThrow(/necesita un nombre/);
  });

  it('no toca un hotel de otra gestión', async () => {
    const repo = repositorio({ hotel: { id: HOTEL, eventId: 'otra', name: 'X', live: 0 } });

    await expect(
      saveHotel({ config: repo }, actor(), EVENTO, { ...hotelNuevo, id: HOTEL }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  /*
   * Retirarlo sacaría sus plazas del inventario mientras su gente sigue dentro,
   * y el hotel pasaría a contar más ocupación que capacidad.
   */
  it('no se retira un hotel con reservas vivas', async () => {
    const repo = repositorio({ hotel: { id: HOTEL, eventId: EVENTO, name: 'Central', live: 3 } });

    await expect(
      saveHotel({ config: repo }, actor(), EVENTO, { ...hotelNuevo, id: HOTEL, active: false }),
    ).rejects.toThrow(/Reasígnelas antes/);
  });

  it('sí se retira uno vacío', async () => {
    const repo = repositorio({ hotel: { id: HOTEL, eventId: EVENTO, name: 'Central', live: 0 } });

    await saveHotel({ config: repo }, actor(), EVENTO, { ...hotelNuevo, id: HOTEL, active: false });

    expect(repo.hoteles[0]).toMatchObject({ active: false });
  });
});

const habitacionNueva = { id: null, hotelId: HOTEL, code: '101', capacity: 4, active: true };

describe('inventario de habitaciones — HOS-002', () => {
  it('da de alta una habitación', async () => {
    const repo = repositorio();

    await saveRoom({ config: repo }, actor(), EVENTO, habitacionNueva);

    expect(repo.habitaciones[0]).toMatchObject({ code: '101', capacity: 4 });
  });

  it('no cuelga una habitación de un hotel de otra gestión', async () => {
    const repo = repositorio({ pertenece: false });

    await expect(
      saveRoom({ config: repo }, actor(), EVENTO, habitacionNueva),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it.each([0, -2, 1.5, Number.NaN])('rechaza la capacidad %s', async (capacidad) => {
    const repo = repositorio();

    await expect(
      saveRoom({ config: repo }, actor(), EVENTO, { ...habitacionNueva, capacity: capacidad }),
    ).rejects.toThrow(/al menos una plaza/);
  });

  /*
   * El caso que importa de verdad: corregir hacia abajo una habitación que ya
   * tiene gente. Sin esta comprobación el hotel anunciaría plazas negativas.
   */
  it('no baja la capacidad por debajo de lo ocupado', async () => {
    const repo = repositorio({
      room: { id: HABITACION, hotelId: HOTEL, eventId: EVENTO, code: '101', occupied: 3 },
    });

    await expect(
      saveRoom({ config: repo }, actor(), EVENTO, {
        ...habitacionNueva,
        id: HABITACION,
        capacity: 2,
      }),
    ).rejects.toThrow(/Mueva primero a quien sobre/);
  });

  it('sí la baja hasta justo lo ocupado', async () => {
    const repo = repositorio({
      room: { id: HABITACION, hotelId: HOTEL, eventId: EVENTO, code: '101', occupied: 3 },
    });

    await saveRoom({ config: repo }, actor(), EVENTO, {
      ...habitacionNueva,
      id: HABITACION,
      capacity: 3,
    });

    expect(repo.habitaciones[0]).toMatchObject({ capacity: 3 });
  });

  it('no retira del servicio una habitación con gente dentro', async () => {
    const repo = repositorio({
      room: { id: HABITACION, hotelId: HOTEL, eventId: EVENTO, code: '101', occupied: 1 },
    });

    await expect(
      saveRoom({ config: repo }, actor(), EVENTO, {
        ...habitacionNueva,
        id: HABITACION,
        active: false,
      }),
    ).rejects.toThrow(/Reasígnelas antes/);
  });
});

describe('política de noches — HOS-011, HOS-014', () => {
  const politica = { nightCount: 7, checkInDate: '2026-11-01', checkOutDate: '2026-11-08' };

  it('guarda una política coherente', async () => {
    const repo = repositorio();

    await savePolicy({ config: repo }, actor(), EVENTO, politica);

    expect(repo.politicas[0]).toMatchObject({ eventId: EVENTO, nightCount: 7 });
  });

  /*
   * Las noches son un dato configurado y las fechas otro: que no cuadren es lo
   * que esta comprobación existe para atrapar, y tiene que saltar al guardar y
   * no cuando el primer peregrino intente reservar.
   */
  it('rechaza unas noches que no cuadran con las fechas', async () => {
    const repo = repositorio();

    await expect(
      savePolicy({ config: repo }, actor(), EVENTO, { ...politica, nightCount: 5 }),
    ).rejects.toThrow(/abarcan/);

    expect(repo.politicas).toHaveLength(0);
  });

  it('rechaza fechas ilegibles', async () => {
    const repo = repositorio();

    await expect(
      savePolicy({ config: repo }, actor(), EVENTO, { ...politica, checkInDate: 'ayer' }),
    ).rejects.toThrow(/fechas de entrada y salida válidas/);
  });

  it('no admite cero noches', async () => {
    const repo = repositorio();

    await expect(
      savePolicy({ config: repo }, actor(), EVENTO, {
        nightCount: 0,
        checkInDate: '2026-11-01',
        checkOutDate: '2026-11-01',
      }),
    ).rejects.toThrow(/al menos una noche/);
  });

  it('exige el permiso de administrar', async () => {
    const repo = repositorio();

    await expect(
      savePolicy({ config: repo }, actor(['lodging.read']), EVENTO, politica),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  /* Nada fija las siete noches: la referencia es un dato, no una constante. */
  it('admite una gestión de otra duración', async () => {
    const repo = repositorio();

    await savePolicy({ config: repo }, actor(), EVENTO, {
      nightCount: 3,
      checkInDate: '2026-11-01',
      checkOutDate: '2026-11-04',
    });

    expect(repo.politicas[0]).toMatchObject({ nightCount: 3 });
  });
});
