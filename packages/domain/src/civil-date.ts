/**
 * Días civiles en la zona de la gestión — NFR-013.
 *
 * «Almacenar en UTC y mostrar en la zona de la gestión; nunca la hora local del
 * servidor». Este módulo cubre el caso en que una fecha **no es un instante
 * sino un día**: la fecha de un pago, el día de un servicio de alimentos, la
 * noche de una reserva. El banco dice «8 de agosto», no «8 de agosto a las
 * 14:37:22Z», y tratarlo como instante introduce un desfase que solo aparece a
 * ciertas horas del día.
 *
 * Existe como módulo compartido porque tener dos formas de responder a «¿qué
 * día es hoy?» ya produjo un fallo: el tope del campo de fecha se calculaba en
 * la zona de la gestión y la validación comparaba contra el instante UTC. En La
 * Paz (UTC−4), entre medianoche y las ocho de la mañana el formulario ofrecía
 * «hoy» como fecha válida y la regla la rechazaba por futura.
 *
 * `Intl` es un built-in del lenguaje, no infraestructura: el módulo sigue
 * siendo puro y no consulta el reloj por su cuenta.
 */

/** Hora a la que se ancla un día civil. Ver `civilDayAnchor`. */
const ANCHOR_HOUR_UTC = 'T12:00:00.000Z';

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Día civil de un instante en la zona indicada, como `YYYY-MM-DD`.
 *
 * `en-CA` da exactamente ese formato; no es una elección de idioma sino la
 * forma más corta de obtener ISO sin componer las partes a mano.
 */
export function civilDayIn(timezone: string, instant: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

/**
 * Instante que representa un día civil `YYYY-MM-DD`.
 *
 * Se ancla a **mediodía UTC**. La medianoche no vale: `new Date('2026-08-08')`
 * es medianoche UTC, y en cualquier zona al oeste eso ya es el día 7 — quien
 * declara el 8 acabaría registrando el 7. Mediodía deja doce horas de margen a
 * cada lado, más que cualquier desplazamiento horario real.
 *
 * Como todas las fechas del circuito pasan por aquí, comparar dos de ellas
 * compara días civiles y no instantes, que es lo que la regla necesita.
 *
 * Devuelve `null` si el texto no es un día válido, para que quien llama decida
 * cómo decírselo al usuario en vez de propagar un `Invalid Date`.
 */
export function civilDayAnchor(day: string): Date | null {
  if (!ISO_DAY.test(day)) return null;

  const anchored = new Date(`${day}${ANCHOR_HOUR_UTC}`);

  if (Number.isNaN(anchored.getTime())) return null;

  // El patrón admite «2026-02-31», que `Date` convierte al 3 de marzo en vez de
  // rechazar. Se compara de vuelta para descartarlo.
  if (anchored.toISOString().slice(0, 10) !== day) return null;

  return anchored;
}

/** Ancla del día civil actual en la zona indicada. */
export function todayAnchorIn(timezone: string, now: Date): Date {
  const anchored = civilDayAnchor(civilDayIn(timezone, now));

  if (anchored === null) {
    // `civilDayIn` siempre produce `YYYY-MM-DD` válido; llegar aquí significaría
    // que la zona no existe, y eso es configuración rota, no un dato de usuario.
    throw new RangeError(`Zona horaria no válida: ${timezone}`);
  }

  return anchored;
}
