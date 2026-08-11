import { createAuth, createPrismaClient, type PrismaClient } from '@encuentro/infrastructure';
import { config as loadEnvFile } from 'dotenv';
import { mkdirSync, writeFileSync } from 'node:fs';

import { ROLES } from '../../prisma/roles';
import { ACTORES, BASE, EVENTO, PASSWORD, RUN, urlBaseDeDatos, type Actor } from './actores';
import { base32Decode, secretoDeUri, segundosRestantes, totp } from './totp';

/**
 * Siembra de actores y datos para el recorrido automatizado.
 *
 * Existe porque no hay forma de llegar por la interfaz: el alta exige un enlace
 * de correo que en local nadie recibe, el segundo factor exige una aplicación
 * autenticadora, y la asignación de rol y la inscripción **no tienen ningún
 * caso de uso** —el único escritor de `role_assignments` es `prisma/seed.ts`—.
 *
 * Todo lo que puede pasar por la API de autenticación pasa por ella. Solo se
 * escribe con Prisma lo que no tiene otra vía: catálogo, rol e inscripción.
 * Insertar la fila de `two_factors` a mano, por ejemplo, sería un error difícil
 * de ver: el esquema la declara `verified` por omisión, así que la cuenta
 * parecería enrolada con un secreto que el servidor no sabe descifrar.
 */

interface Sembrado {
  readonly eventId: string;
  readonly correos: readonly string[];
}

/** El nombre de la cookie depende de NODE_ENV, y el servidor lee el exacto. */
const COOKIE_ESPERADA = '__Secure-encuentro.session_token';

/** Ocho horas: es el `expiresIn` real de la sesión. */
const VIDA_SESION_S = 8 * 60 * 60;

function primerValorDeCookie(headers: Headers, nombre: string): string {
  /*
   * Se filtra **por nombre, nunca por posición**. Con el segundo factor activo
   * el inicio de sesión emite tres `Set-Cookie` —sesión, datos de sesión y el
   * reto de 2FA— y `verifyTOTP` emite dos. Tomar el primero funciona por
   * casualidad hasta el día que deja de funcionar.
   */
  const cookie = headers
    .getSetCookie()
    .map((entrada) => entrada.split(';')[0] ?? '')
    .find((entrada) => entrada.startsWith(`${nombre}=`));

  if (cookie === undefined) {
    throw new Error(`La respuesta no trae la cookie ${nombre}`);
  }

  return cookie;
}

async function crearCuenta(
  auth: ReturnType<typeof createAuth>,
  enlaces: Map<string, string>,
  actor: Actor,
): Promise<string> {
  await auth.api.signUpEmail({
    body: { email: actor.correo, password: PASSWORD, name: actor.nombre },
  });

  // DEC-013: sin verificar el correo no hay sesión que valga. El enlace lo
  // captura el `sendVerificationEmail` de abajo en vez de salir por SMTP.
  const enlace = enlaces.get(actor.correo);

  if (enlace === undefined) {
    throw new Error(`No se emitió enlace de verificación para ${actor.correo}`);
  }

  const token = new URL(enlace).searchParams.get('token');

  if (token === null) throw new Error(`El enlace de ${actor.correo} no trae token`);

  await auth.api.verifyEmail({ query: { token } });

  const acceso = await auth.api.signInEmail({
    body: { email: actor.correo, password: PASSWORD },
    returnHeaders: true,
  });

  return primerValorDeCookie(acceso.headers, COOKIE_ESPERADA);
}

/**
 * Registra el segundo factor y devuelve la cookie **nueva**.
 *
 * `verifyTOTP` crea una sesión nueva y borra la que se usó para llegar hasta
 * aquí. El token que devuelve en el cuerpo es el viejo, ya invalidado: hay que
 * leer la cabecera. Guardar el del cuerpo produce un estado que parece bueno y
 * que el servidor rechaza en silencio.
 */
async function registrarSegundoFactor(
  auth: ReturnType<typeof createAuth>,
  cookie: string,
): Promise<string> {
  const headers = new Headers({ cookie });

  const enrolamiento = await auth.api.enableTwoFactor({ body: { password: PASSWORD }, headers });
  const clave = base32Decode(secretoDeUri(enrolamiento.totpURI));

  /*
   * Si al código le quedan menos de dos segundos, se espera: la ventana podría
   * cambiar entre generarlo y validarlo. Se prefiere esperar a reintentar
   * porque `accountLockout` bloquea la cuenta 900 s a los diez fallos, y una
   * semilla que deja cuentas bloqueadas envenena la corrida siguiente.
   */
  if (segundosRestantes() < 2) {
    await new Promise((resolver) => setTimeout(resolver, 2500));
  }

  const verificacion = await auth.api.verifyTOTP({
    body: { code: totp(clave) },
    headers,
    returnHeaders: true,
  });

  return primerValorDeCookie(verificacion.headers, COOKIE_ESPERADA);
}

function guardarEstado(clave: string, cookie: string): void {
  mkdirSync('test-results/.auth', { recursive: true });

  const valor = cookie.slice(COOKIE_ESPERADA.length + 1);

  /*
   * `__Secure-` sobre http parece contradictorio y no lo es: los navegadores
   * tratan 127.0.0.1 como contexto seguro, así que Chromium acepta y reenvía la
   * cookie. El nombre lo impone el servidor, que corre con NODE_ENV=production.
   */
  writeFileSync(
    `test-results/.auth/${clave}.json`,
    `${JSON.stringify(
      {
        cookies: [
          {
            name: COOKIE_ESPERADA,
            value: valor,
            domain: '127.0.0.1',
            path: '/',
            expires: Math.floor(Date.now() / 1000) + VIDA_SESION_S,
            httpOnly: true,
            secure: true,
            sameSite: 'Lax',
          },
        ],
        origins: [],
      },
      null,
      2,
    )}\n`,
  );
}

/** Catálogo mínimo para que las pantallas del peregrino tengan algo que mostrar. */
async function sembrarNegocio(prisma: PrismaClient): Promise<{
  eventId: string;
  packageId: string;
  priceVersionId: string;
}> {
  const event = await prisma.event.upsert({
    where: { code: EVENTO },
    update: { status: 'ACTIVE', publiclyEnabled: true },
    create: {
      code: EVENTO,
      year: 2026,
      name: 'Encuentro 2026',
      timezone: 'America/La_Paz',
      currency: 'USD',
      startAt: new Date('2026-11-01T00:00:00Z'),
      endAt: new Date('2026-11-08T23:59:59Z'),
      status: 'ACTIVE',
      publiclyEnabled: true,
    },
  });

  const paquete = await prisma.package.upsert({
    where: { eventId_code: { eventId: event.id, code: 'GENERAL' } },
    update: {},
    create: { eventId: event.id, code: 'GENERAL', name: 'General', visibility: 'PUBLIC' },
  });

  /*
   * `findFirst` y no `upsert`: el único índice único de `price_versions` es
   * compuesto con el id, así que no hay clave por la que upsertar.
   *
   * Modalidad ARRIVAL a propósito. Una versión ADVANCE exige vigencia y
   * porcentaje mínimo —lo pide el CHECK `price_versions_advance_is_complete`— y
   * aquí no se necesita el beneficio anticipado para nada.
   */
  const existente = await prisma.priceVersion.findFirst({
    where: { packageId: paquete.id, paymentMode: 'ARRIVAL' },
  });

  const precio =
    existente ??
    (await prisma.priceVersion.create({
      data: { packageId: paquete.id, paymentMode: 'ARRIVAL', amount: '420.00', currency: 'USD' },
    }));

  /*
   * Sin un canal de adelanto activo el formulario de pagos se renderiza con el
   * desplegable vacío: existe y no sirve. Es justo la diferencia entre «la
   * pantalla carga» y «la pantalla funciona» que estas pruebas persiguen.
   */
  await prisma.paymentChannel.upsert({
    where: { eventId_code: { eventId: event.id, code: 'US_ACCOUNT_MANUAL' } },
    update: { active: true },
    create: { eventId: event.id, code: 'US_ACCOUNT_MANUAL', currency: 'USD', active: true },
  });

  /*
   * Los roles, con la misma matriz de permisos que el seed de desarrollo — de
   * ahí que `ROLES` viva en su propio módulo. Una copia aquí se quedaría vieja y
   * las pruebas de autorización seguirían en verde afirmando permisos que ya no
   * son los del contrato.
   *
   * En CI la base llega vacía, así que esto no es opcional.
   */
  for (const definicion of ROLES) {
    const rol = await prisma.role.upsert({
      where: { code: definicion.code },
      update: {},
      create: { code: definicion.code, name: definicion.name },
    });

    await prisma.rolePermission.createMany({
      data: definicion.permissions.map((permission) => ({ roleId: rol.id, permission })),
      skipDuplicates: true,
    });
  }

  return { eventId: event.id, packageId: paquete.id, priceVersionId: precio.id };
}

export async function sembrar(): Promise<Sembrado> {
  // Por omisión dotenv lee `.env` del directorio de trabajo, que es la raíz
  // del repositorio tanto bajo Playwright como bajo tsx. No se usa
  // `import.meta.url`: Playwright transpila a CommonJS y allí no existe.
  loadEnvFile({ quiet: true });

  /*
   * ANTES de `createAuth`, y no es un detalle.
   *
   * El nombre de la cookie de sesión depende de NODE_ENV. El servidor corre bajo
   * `next start`, que fija `production`, mientras que este proceso arranca sin
   * NODE_ENV y `dotenv` lo deja en `development`. Sembrar sin forzarlo produce
   * una cookie `encuentro.session_token` que el servidor **ignora en silencio**:
   * las pruebas solo verían una redirección a `/ingresar`, sin ninguna pista.
   */
  process.env.NODE_ENV = 'production';

  const prisma = createPrismaClient(urlBaseDeDatos());
  const enlaces = new Map<string, string>();

  const auth = createAuth({
    prisma,
    secret: process.env.SESSION_SECRET ?? '',
    baseURL: BASE,
    sendVerificationEmail: ({ email, url }) => {
      enlaces.set(email, url);
      return Promise.resolve();
    },
  });

  try {
    const contexto = await auth.$context;
    const nombreCookie = contexto.authCookies.sessionToken.name;

    if (nombreCookie !== COOKIE_ESPERADA) {
      throw new Error(
        `La cookie sería «${nombreCookie}» y el servidor espera «${COOKIE_ESPERADA}»: ` +
          'la sesión sembrada no valdría. Revise NODE_ENV.',
      );
    }

    const negocio = await sembrarNegocio(prisma);

    for (const actor of Object.values(ACTORES)) {
      let cookie = await crearCuenta(auth, enlaces, actor);

      /*
       * El segundo factor va **antes** de asignar el rol. Al revés, cualquier
       * navegación intermedia rebotaría a `/configurar-mfa`, porque
       * `requireActor` lo exige en cuanto hay una asignación (DEC-014).
       */
      if (actor.rol !== null) {
        cookie = await registrarSegundoFactor(auth, cookie);
      }

      const usuario = await prisma.user.findUniqueOrThrow({
        where: { email: actor.correo },
        select: { id: true, twoFactorEnabled: true, emailVerified: true },
      });

      // La afirmación que faltaba el día que la pantalla de registro no
      // registraba nada: no basta con que las llamadas no fallen.
      if (!usuario.emailVerified) throw new Error(`${actor.correo} sin correo verificado`);

      if (actor.rol !== null) {
        const factor = await prisma.twoFactor.findFirstOrThrow({
          where: { userId: usuario.id },
          select: { verified: true },
        });

        if (!usuario.twoFactorEnabled || !factor.verified) {
          throw new Error(`${actor.correo} quedó con el segundo factor a medias`);
        }

        const rol = await prisma.role.findUniqueOrThrow({ where: { code: actor.rol } });

        await prisma.roleAssignment.create({
          data: {
            userId: usuario.id,
            roleId: rol.id,
            scopeType: actor.scope,
            eventId: actor.scope === 'EVENT' ? negocio.eventId : null,
          },
        });
      }

      if (actor.rol === null) {
        const persona = await prisma.person.create({
          data: {
            userId: usuario.id,
            fullName: actor.nombre,
            birthDate: new Date('1990-01-01T00:00:00Z'),
          },
        });

        const inscripcion = await prisma.registration.create({
          data: {
            eventId: negocio.eventId,
            code: `REG-E2E-${RUN.toUpperCase()}`,
            personId: persona.id,
            packageId: negocio.packageId,
            priceVersionId: negocio.priceVersionId,
            paymentMode: 'ARRIVAL',
            status: 'SUBMITTED',
          },
        });

        await prisma.charge.create({
          data: {
            registrationId: inscripcion.id,
            concept: 'PACKAGE',
            amount: '420.00',
            currency: 'USD',
            snapshot: { packageCode: 'GENERAL', paymentMode: 'ARRIVAL' },
          },
        });
      }

      guardarEstado(actor.clave, cookie);
    }

    return {
      eventId: negocio.eventId,
      correos: Object.values(ACTORES).map((actor) => actor.correo),
    };
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Borra lo que sembró esta corrida, y nada más.
 *
 * Por sufijo de correo y en orden de dependencia. No se llama a `resetDatabase`
 * ni se trunca nada: esta base puede ser la de desarrollo de alguien.
 */
export async function limpiar(): Promise<number> {
  // Por omisión dotenv lee `.env` del directorio de trabajo, que es la raíz
  // del repositorio tanto bajo Playwright como bajo tsx. No se usa
  // `import.meta.url`: Playwright transpila a CommonJS y allí no existe.
  loadEnvFile({ quiet: true });

  const prisma = createPrismaClient(urlBaseDeDatos());
  const correos = Object.values(ACTORES).map((actor) => actor.correo);

  try {
    const usuarios = await prisma.user.findMany({
      where: { email: { in: [...correos] } },
      select: { id: true },
    });

    if (usuarios.length === 0) return 0;

    const ids = usuarios.map((usuario) => usuario.id);
    const personas = await prisma.person.findMany({
      where: { userId: { in: ids } },
      select: { id: true },
    });

    const inscripciones = await prisma.registration.findMany({
      where: { personId: { in: personas.map((persona) => persona.id) } },
      select: { id: true },
    });

    const registrationIds = inscripciones.map((inscripcion) => inscripcion.id);

    /*
     * `charges` es de solo anexado de verdad: su trigger rechaza DELETE incluso
     * al propietario de la tabla, y sin borrar el cargo tampoco se puede borrar
     * la inscripción, ni la persona, ni la cuenta. La limpieza entera depende de
     * esto.
     *
     * El disparador se apaga **dentro de una transacción**. En Postgres el DDL
     * es transaccional, así que si algo falla en medio el ROLLBACK lo devuelve a
     * su sitio: no existe el caso de dejarlo apagado.
     *
     * Es una llave de excepción y se usa aquí y en ningún otro lugar. La
     * alternativa —el TRUNCATE de las pruebas de integración— vaciaría la base
     * entera, y esta puede ser la de desarrollo de alguien.
     */
    if (registrationIds.length > 0) {
      await prisma.$transaction([
        prisma.$executeRawUnsafe(
          `DELETE FROM payment_allocations WHERE charge_id IN (SELECT id FROM charges WHERE registration_id = ANY($1::uuid[]))`,
          registrationIds,
        ),
        prisma.$executeRawUnsafe('ALTER TABLE charges DISABLE TRIGGER charges_no_delete'),
        prisma.$executeRawUnsafe(
          `DELETE FROM charges WHERE registration_id = ANY($1::uuid[])`,
          registrationIds,
        ),
        prisma.$executeRawUnsafe('ALTER TABLE charges ENABLE TRIGGER charges_no_delete'),
      ]);

      await prisma.registration.deleteMany({ where: { id: { in: registrationIds } } });
    }

    await prisma.person.deleteMany({ where: { userId: { in: ids } } });
    await prisma.roleAssignment.deleteMany({ where: { userId: { in: ids } } });
    await prisma.twoFactor.deleteMany({ where: { userId: { in: ids } } });
    await prisma.session.deleteMany({ where: { userId: { in: ids } } });
    await prisma.account.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });

    return ids.length;
  } finally {
    await prisma.$disconnect();
  }
}
