import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { EVENTO, type ClaveActor } from './actores';

/**
 * Las treinta y una rutas del contrato, instanciadas y clasificadas.
 *
 * Se leen de `contracts/routes.json` en vez de copiarse. Copiarlas dejaría dos
 * listas que se separan en silencio, que es exactamente lo que le pasó al gate
 * de accesibilidad: siguió en verde mientras la mitad de sus rutas se
 * convertían en redirecciones a `/ingresar`.
 *
 * Toda ruta del contrato tiene que estar clasificada aquí. Si falta una, este
 * módulo **lanza al cargarse** y el recorrido entero se detiene. Es deliberado:
 * el fallo que se quiere impedir es añadir una pantalla y que nadie diga quién
 * puede verla.
 */

export type Acceso = 'publica' | 'guardada';

const SEGMENTOS: Readonly<Record<string, string>> = {
  '[eventCode]': EVENTO,
  '[token]': 'tok-inexistente-para-la-prueba',
  '[cashCode]': 'CAJA-1',
  '[commissionCode]': 'COM-1',
  '[stationCode]': 'EST-1',
};

/**
 * Quién puede ver cada ruta, y con qué personaje se comprueba.
 *
 * `publica` significa que un anónimo la renderiza. `guardada`, que un anónimo
 * acaba en `/ingresar`. El personaje es el que debería poder verla; para las
 * públicas no hace falta ninguno.
 */
const ACCESO: Readonly<Record<string, { acceso: Acceso; actor?: ClaveActor }>> = {
  '/': { acceso: 'publica' },
  '/e/[eventCode]': { acceso: 'publica' },
  '/e/[eventCode]/inscripcion': { acceso: 'publica' },
  '/verificar/comprobante/[token]': { acceso: 'publica' },
  '/ingresar': { acceso: 'publica' },
  '/verificar-correo': { acceso: 'publica' },

  '/configurar-mfa': { acceso: 'guardada', actor: 'peregrino' },

  '/e/[eventCode]/mi-cuenta': { acceso: 'guardada', actor: 'peregrino' },
  '/e/[eventCode]/mi-cuenta/pagos': { acceso: 'guardada', actor: 'peregrino' },

  '/e/[eventCode]/mi-cuenta/hospedaje': { acceso: 'guardada', actor: 'peregrino' },

  /*
   * Las dos que quedan responden **200 a un anónimo**: son `PendingScreen` sin
   * guardián. Se clasifican como públicas para que la comprobación diga la
   * verdad de hoy, y `defectos-conocidos.spec.ts` afirma en `test.fail()` que
   * deberían exigir sesión. La de la credencial es la urgente: va a llevar un
   * token.
   *
   * Hospedaje salió de esta lista el 14 de agosto de 2026, al dejar de ser un
   * cascarón: ahora resuelve la inscripción por el usuario de la sesión.
   */
  '/e/[eventCode]/mi-cuenta/credencial': { acceso: 'publica' },
  '/e/[eventCode]/mi-cuenta/notificaciones': { acceso: 'publica' },

  '/admin': { acceso: 'guardada', actor: 'admin' },
  '/admin/eventos': { acceso: 'guardada', actor: 'admin' },
  '/admin/configuracion/correo': { acceso: 'guardada', actor: 'admin' },
  '/admin/e/[eventCode]/dashboard': { acceso: 'guardada', actor: 'admin' },
  '/admin/e/[eventCode]/configuracion': { acceso: 'guardada', actor: 'admin' },
  '/admin/e/[eventCode]/catalogo': { acceso: 'guardada', actor: 'admin' },
  '/admin/e/[eventCode]/inscripciones': { acceso: 'guardada', actor: 'admin' },
  '/admin/e/[eventCode]/pagos': { acceso: 'guardada', actor: 'admin' },
  '/admin/e/[eventCode]/comprobantes': { acceso: 'guardada', actor: 'tesoreria' },
  '/admin/e/[eventCode]/hospedaje': { acceso: 'guardada', actor: 'admin' },
  '/admin/e/[eventCode]/alimentos': { acceso: 'guardada', actor: 'admin' },
  '/admin/e/[eventCode]/materiales': { acceso: 'guardada', actor: 'admin' },
  '/admin/e/[eventCode]/transporte': { acceso: 'guardada', actor: 'admin' },
  '/admin/e/[eventCode]/contabilidad': { acceso: 'guardada', actor: 'admin' },
  '/admin/e/[eventCode]/reportes': { acceso: 'guardada', actor: 'admin' },
  '/admin/e/[eventCode]/auditoria': { acceso: 'guardada', actor: 'admin' },

  '/caja/e/[eventCode]/[cashCode]': { acceso: 'guardada', actor: 'admin' },
  '/comision/e/[eventCode]/[commissionCode]': { acceso: 'guardada', actor: 'admin' },
  '/scanner/e/[eventCode]/[stationCode]': { acceso: 'guardada', actor: 'admin' },
};

export interface RutaContrato {
  /** Plantilla tal como aparece en el contrato. */
  readonly plantilla: string;
  /** Ruta navegable, con los segmentos dinámicos sustituidos. */
  readonly ruta: string;
  readonly acceso: Acceso;
  readonly actor?: ClaveActor;
}

function instanciar(plantilla: string): string {
  return Object.entries(SEGMENTOS).reduce(
    (ruta, [segmento, valor]) => ruta.replaceAll(segmento, valor),
    plantilla,
  );
}

function cargar(): readonly RutaContrato[] {
  /*
   * Relativo al directorio de trabajo y no a `import.meta.url`: Playwright
   * transpila estos ficheros a CommonJS y allí `import.meta` es un error de
   * sintaxis. Tanto `playwright test` como `pnpm exec tsx` corren desde la raíz
   * del repositorio.
   */
  const crudo = readFileSync(resolve(process.cwd(), 'contracts/routes.json'), 'utf8');

  const contrato = JSON.parse(crudo) as { routes?: unknown };
  const plantillas = contrato.routes;

  if (!Array.isArray(plantillas)) {
    throw new Error('contracts/routes.json no trae una lista en «routes»');
  }

  return plantillas.map((entrada): RutaContrato => {
    if (typeof entrada !== 'string') {
      throw new Error(`Ruta del contrato que no es texto: ${JSON.stringify(entrada)}`);
    }

    const clasificacion = ACCESO[entrada];

    if (clasificacion === undefined) {
      throw new Error(
        `La ruta «${entrada}» está en contracts/routes.json y no en tests/e2e/rutas-contrato.ts. ` +
          'Declare quién puede verla antes de darla por buena.',
      );
    }

    return {
      plantilla: entrada,
      ruta: instanciar(entrada),
      acceso: clasificacion.acceso,
      ...(clasificacion.actor === undefined ? {} : { actor: clasificacion.actor }),
    };
  });
}

export const RUTAS_CONTRATO = cargar();

export const RUTAS_PUBLICAS = RUTAS_CONTRATO.filter((ruta) => ruta.acceso === 'publica');
export const RUTAS_GUARDADAS = RUTAS_CONTRATO.filter((ruta) => ruta.acceso === 'guardada');
