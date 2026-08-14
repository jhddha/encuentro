import 'dotenv/config';

import { createPrismaClient } from '@encuentro/infrastructure';
import process from 'node:process';

import { ROLES } from '../prisma/roles.js';

/**
 * Concede o retira un rol a una cuenta ya registrada.
 *
 * Existe porque faltaba: **no había forma de que una persona real fuera
 * administradora.** El seed crea `admin@encuentro.local` con `ADMIN_MASTER`
 * global y deliberadamente **sin credencial** —una contraseña por defecto es
 * una cuenta con acceso conocido en cualquier entorno donde el seed corra—, y
 * `dev-fixture.ts` solo concede `TESORERIA`. Entre las dos cosas, todo lo que
 * vive detrás de `event.*` o `catalog.manage` quedaba fuera del alcance de
 * cualquiera que iniciara sesión: configuración de la gestión, catálogo, alta
 * de gestiones y el registro de la tasa de cambio.
 *
 * No crea cuentas y no toca credenciales. La cuenta tiene que existir y haber
 * pasado por el registro real, con verificación de correo (DEC-013). Conceder
 * un rol a una cuenta que aún no ha configurado su segundo factor es correcto:
 * DEC-014 lo exige a toda cuenta con permisos y la pantalla se lo pedirá al
 * entrar.
 *
 * Uso:
 *   pnpm rol:conceder <correo> <ROL> [CODIGO_GESTION]
 *   pnpm rol:conceder <correo> <ROL> [CODIGO_GESTION] --retirar
 *
 * Retirar está en la misma herramienta a propósito. Una que solo concede
 * privilegios deja el error sin deshacer, y el error aquí es dar de más.
 */

const [, , correo, codigoRol, ...resto] = process.argv;

const retirar = resto.includes('--retirar');
const codigoGestion = resto.find((argumento) => !argumento.startsWith('--'));

function abortar(mensaje: string): never {
  console.error(mensaje);
  process.exit(1);
}

if (correo?.includes('@') !== true || codigoRol === undefined) {
  abortar(
    'Uso: pnpm rol:conceder <correo> <ROL> [CODIGO_GESTION] [--retirar]\n' +
      `Roles disponibles: ${ROLES.map((rol) => `${rol.code} (${rol.scopeType})`).join(', ')}`,
  );
}

const definicion = ROLES.find((rol) => rol.code === codigoRol);

if (definicion === undefined) {
  abortar(
    `No existe el rol «${codigoRol}».\n` +
      `Disponibles: ${ROLES.map((rol) => rol.code).join(', ')}`,
  );
}

/*
 * El ámbito lo fija el rol, no quien ejecuta.
 *
 * `ADMIN_MASTER` es global por definición y `TESORERIA` vive dentro de una
 * gestión. Dejar elegir el ámbito permitiría conceder un rol global con forma
 * de gestión, o al revés, y `scopeCovers` decide a partir de esa columna: un
 * ámbito mal puesto es una escalada silenciosa, no un error de tecleo.
 */
const global = definicion.scopeType === 'GLOBAL';

if (global && codigoGestion !== undefined) {
  abortar(`${definicion.code} es un rol global: no lleva gestión.`);
}

if (!global && codigoGestion === undefined) {
  abortar(`${definicion.code} necesita el código de la gestión. Por ejemplo: ENC2026`);
}

/*
 * El estrechamiento del `if` de arriba no viaja dentro de `main()`, así que se
 * fija aquí. Sin esto el correo sería `string | undefined` en cada uso.
 */
const email: string = correo;

const prisma = createPrismaClient(process.env.DATABASE_URL ?? '');

async function main(): Promise<void> {
  const usuario = await prisma.user.findFirst({
    where: { email },
    select: { id: true, email: true, status: true },
  });

  if (usuario === null) {
    abortar(
      `No existe ninguna cuenta con el correo ${email}.\n` +
        'Regístrese primero en http://localhost:3000/ingresar y vuelva a ejecutar esto.\n' +
        'Este script no crea cuentas ni credenciales.',
    );
  }

  if (usuario.status !== 'ACTIVE') {
    abortar(
      `La cuenta ${usuario.email} está en ${usuario.status} y no admite permisos.\n` +
        'Una cuenta suspendida con un rol concedido volvería con él al reactivarse.',
    );
  }

  const rol = await prisma.role.findUnique({
    where: { code: definicion.code },
    select: { id: true },
  });

  if (rol === null) {
    abortar(`El rol ${definicion.code} no está en la base. Ejecute \`pnpm exec prisma db seed\`.`);
  }

  const gestion =
    codigoGestion === undefined
      ? null
      : await prisma.event.findUnique({
          where: { code: codigoGestion },
          select: { id: true, code: true },
        });

  if (codigoGestion !== undefined && gestion === null) {
    abortar(`No existe la gestión ${codigoGestion}.`);
  }

  const donde = {
    userId: usuario.id,
    roleId: rol.id,
    scopeType: definicion.scopeType,
    eventId: gestion?.id ?? null,
  };

  const existente = await prisma.roleAssignment.findFirst({ where: donde, select: { id: true } });
  const ambito = gestion === null ? 'global' : `la gestión ${gestion.code}`;

  if (retirar) {
    if (existente === null) {
      console.log(`${usuario.email} no tenía ${definicion.code} en ${ambito}. Nada que retirar.`);
      return;
    }

    /*
     * El borrado y su rastro comparten transacción. Retirar un permiso sin
     * dejar constancia es exactamente lo que GOV-005 impide para las
     * mutaciones sensibles, y esta lo es: quien investigue por qué alguien
     * dejó de poder hacer algo no tiene otro sitio donde mirar.
     */
    await prisma.$transaction(async (tx) => {
      await tx.roleAssignment.delete({ where: { id: existente.id } });
      await tx.auditLog.create({
        data: {
          ...(gestion === null ? {} : { eventId: gestion.id }),
          actorId: usuario.id,
          action: 'role.revoke',
          entity: 'role_assignment',
          entityId: existente.id,
          reason: 'scripts/conceder-rol.mts --retirar',
          afterRedacted: { role: definicion.code, scope: definicion.scopeType },
        },
      });
    });

    console.log(`Retirado ${definicion.code} de ${usuario.email} en ${ambito}.`);
    return;
  }

  if (existente !== null) {
    console.log(`${usuario.email} ya tenía ${definicion.code} en ${ambito}. Sin cambios.`);
    return;
  }

  const creada = await prisma.$transaction(async (tx) => {
    const asignacion = await tx.roleAssignment.create({ data: donde, select: { id: true } });

    await tx.auditLog.create({
      data: {
        ...(gestion === null ? {} : { eventId: gestion.id }),
        /*
         * El actor es la propia cuenta que recibe el rol y no quien teclea el
         * comando: el script corre contra la base sin sesión, y no hay ninguna
         * identidad verificable que atribuirle. Registrarlo así es honesto
         * —dice a quién afecta— y el `reason` deja claro que vino de una
         * herramienta y no de una pantalla.
         */
        actorId: usuario.id,
        action: 'role.assign',
        entity: 'role_assignment',
        entityId: asignacion.id,
        reason: 'scripts/conceder-rol.mts',
        afterRedacted: { role: definicion.code, scope: definicion.scopeType },
      },
    });

    return asignacion;
  });

  console.log(`Concedido ${definicion.code} a ${usuario.email} en ${ambito}.`);
  console.log(`Asignación ${creada.id}`);
  console.log(`Permisos: ${definicion.permissions.join(', ')}`);
  /*
   * No hace falta volver a entrar: `createActorResolver` relee las asignaciones
   * en cada petición y no las guarda en la sesión. Recargar basta. Decir lo
   * contrario mandaría a cerrar sesión sin motivo, y en una cuenta con segundo
   * factor eso no es gratis.
   */
  console.log('\nRecargue la pantalla: los permisos se releen en cada petición.');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
