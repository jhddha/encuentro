import 'dotenv/config';

import { createPrismaClient } from '@encuentro/infrastructure';

import { PLAN_DE_CUENTAS, ROLES_SIN_CUENTA } from './accounts-chart';
import COMISIONES from './comisiones.json';
import { ROLES } from './roles';

/**
 * Plantillas de correo del sistema.
 *
 * Texto plano: `createEmailSender` envía `text`, no HTML. Los marcadores son
 * `{{variable}}` y `renderTemplate` **falla** si falta alguna, en vez de dejar
 * un hueco — un correo que dice «Su pago de  ha sido aprobado» es peor que no
 * enviarlo.
 */
const TEMPLATES = [
  {
    code: 'AUTH_EMAIL_VERIFICATION',
    version: 1,
    subject: 'Verifique su correo — Encuentro',
    body: [
      'Le damos la bienvenida a Encuentro.',
      '',
      'Para activar su cuenta, abra este enlace:',
      '{{url}}',
      '',
      'El enlace caduca y solo puede usarse una vez. Si no fue usted quien creó',
      'la cuenta, ignore este mensaje: sin abrirlo, no se activa nada.',
    ].join('\n'),
  },
] as const;

/**
 * Datos mínimos de desarrollo.
 *
 * Crea una gestión de referencia y los roles con sus permisos, para poder
 * recorrer las pantallas de administración en local. No inventa inscripciones,
 * pagos ni catálogo: esos datos pertenecen a fases que aún no existen.
 *
 * **Tampoco crea cuentas ni concede permisos.** El primer administrador se
 * concede con `pnpm rol:conceder <correo> ADMIN_MASTER` a una cuenta que ya
 * haya pasado por el registro real (DEC-013).
 *
 * Los roles y sus permisos viven en `roles.ts`, compartidos con la siembra del
 * recorrido automatizado: dos copias de la matriz de permisos se separan en
 * silencio y la vieja hace pasar pruebas que no demuestran nada.
 */
const prisma = createPrismaClient(process.env.DATABASE_URL ?? '');

async function main(): Promise<void> {
  const event = await prisma.event.upsert({
    where: { code: 'ENC2026' },
    update: {},
    create: {
      code: 'ENC2026',
      year: 2026,
      name: 'Encuentro 2026',
      timezone: 'America/La_Paz',
      // Moneda funcional: los libros de la organización se llevan en bolivianos.
      // Un cobro en dólares se convierte a la tasa congelada (DEC-009).
      currency: 'BOB',
      // 8 días es la referencia actual (EVT-016), aquí como dato, no como regla.
      startAt: new Date('2026-11-01T00:00:00Z'),
      endAt: new Date('2026-11-08T23:59:59Z'),
      status: 'DRAFT',
    },
  });

  /*
   * Roles y permisos. **Ninguna cuenta administrativa.**
   *
   * Aquí se creaba `admin@encuentro.local` con `ADMIN_MASTER` global y sin
   * credencial. Lo segundo era deliberado y correcto —una contraseña por
   * defecto es una cuenta con acceso conocido en cualquier entorno donde el
   * seed corra— pero dejaba dos consecuencias que nadie había juntado: nadie
   * capaz de iniciar sesión podía ser administrador, y quedaba una asignación
   * de administrador global colgando de una dirección que nadie reclama.
   *
   * El primer administrador se concede a una cuenta real, ya registrada, con
   * `pnpm rol:conceder <correo> ADMIN_MASTER`. Exige acceso a la base, que es
   * exactamente el listón que corresponde a arrancar un administrador.
   */
  for (const definition of ROLES) {
    const role = await prisma.role.upsert({
      where: { code: definition.code },
      update: { name: definition.name },
      create: { code: definition.code, name: definition.name },
    });

    /*
     * Los permisos se **reconcilian**, no se acumulan.
     *
     * Antes solo se insertaban los que faltaban, así que un permiso retirado
     * del código seguía concedido en la base para siempre. En una matriz de
     * autorización eso no es datos obsoletos: es un permiso que alguien decidió
     * quitar y que sigue vigente sin que nada lo diga.
     */
    await prisma.rolePermission.deleteMany({
      where: { roleId: role.id, permission: { notIn: [...definition.permissions] } },
    });

    await prisma.rolePermission.createMany({
      data: definition.permissions.map((permission) => ({ roleId: role.id, permission })),
      skipDuplicates: true,
    });
  }

  /*
   * Plantillas de correo del sistema.
   *
   * Son datos del producto, no configuración de la organización: el texto de la
   * verificación de correo no lo decide cada instalación. Por eso viven aquí y
   * no en la pantalla de administración, donde sí vive el servidor SMTP
   * (GOV-007).
   *
   * `@@unique([code, version])`: publicar un texto nuevo es una fila nueva con
   * versión siguiente, no un UPDATE. Los envíos ya despachados siguen
   * apuntando al texto con el que salieron.
   */
  for (const template of TEMPLATES) {
    await prisma.notificationTemplate.upsert({
      where: { code_version: { code: template.code, version: template.version } },
      update: {},
      create: template,
    });
  }

  /*
   * Comisiones — EVT-002, SRV-001, ACC-007, ACC-014.
   *
   * Las cuarenta y dos que la organización tiene hoy, extraídas de su plan de
   * cuentas: es donde vivían, repartidas en 124 subcuentas, porque su sistema
   * contable no tiene esta dimensión.
   *
   * Por gestión, como el resto del catálogo. `prisma/comisiones.json` lo genera
   * el mismo importador que el plan; no se edita a mano.
   */
  for (const comision of COMISIONES) {
    await prisma.commission.upsert({
      where: { eventId_code: { eventId: event.id, code: comision.code } },
      update: { name: comision.name, area: comision.area },
      create: {
        eventId: event.id,
        code: comision.code,
        name: comision.name,
        area: comision.area,
      },
    });
  }

  /*
   * Plan de cuentas de la organización — DEC-018.
   *
   * A diferencia de las plantillas, esto **sí** es configuración de la
   * organización: son los códigos de su sistema contable. Vive en el seed
   * porque hoy no hay pantalla que los administre; cuando la fase 11 la traiga,
   * esto pasa a ser el estado inicial y no la única vía.
   */
  for (const cuenta of PLAN_DE_CUENTAS) {
    await prisma.account_.upsert({
      where: { eventId_code: { eventId: event.id, code: cuenta.code } },
      update: {
        name: cuenta.name,
        kind: cuenta.kind,
        currency: cuenta.currency,
        role: cuenta.role,
      },
      create: {
        eventId: event.id,
        code: cuenta.code,
        name: cuenta.name,
        kind: cuenta.kind,
        currency: cuenta.currency,
        role: cuenta.role,
      },
    });
  }

  /*
   * El plan es la fuente de verdad, no un acumulador.
   *
   * Con `upsert` a secas, una cuenta retirada del fichero se quedaba en la base
   * para siempre. Pasó al corregir el eje de las ofrendas: sobrevivió un
   * «anticipos de peregrinos M/E» que ya no debía existir, y una cuenta
   * fantasma en el plan es una a la que alguien puede imputar.
   *
   * Solo se retira lo que no tiene movimiento. Si tiene líneas, la clave
   * foránea lo impide y hay que decidirlo a mano: borrar una cuenta con
   * historia no es tarea de un seed.
   */
  const codigos = PLAN_DE_CUENTAS.map((cuenta) => cuenta.code);

  const sobrantes = await prisma.account_.findMany({
    where: { eventId: event.id, code: { notIn: codigos }, lines: { none: {} } },
    select: { id: true, code: true, name: true },
  });

  if (sobrantes.length > 0) {
    await prisma.account_.deleteMany({ where: { id: { in: sobrantes.map((c) => c.id) } } });
    console.log(
      `Retiradas ${String(sobrantes.length)} cuentas que ya no están en el plan: ` +
        sobrantes.map((c) => `${c.code} ${c.name}`).join(', '),
    );
  }

  const conMovimiento = await prisma.account_.count({
    where: { eventId: event.id, code: { notIn: codigos } },
  });

  if (conMovimiento > 0) {
    console.warn(
      `Aviso: ${String(conMovimiento)} cuentas fuera del plan conservan movimiento y no se retiran.`,
    );
  }

  const nuevas = PLAN_DE_CUENTAS.filter((cuenta) => 'nueva' in cuenta).length;

  console.log(
    `Seed listo: gestión ${event.code}, ${String(ROLES.length)} roles, ` +
      `${String(TEMPLATES.length)} plantillas de correo, ` +
      `${String(PLAN_DE_CUENTAS.length)} cuentas contables (${String(nuevas)} por abrir en el plan real), ` +
      `${String(COMISIONES.length)} comisiones.`,
  );

  const sinCuenta = Object.keys(ROLES_SIN_CUENTA);
  console.log(`Roles de DEC-018 sin cuenta, a propósito: ${sinCuenta.join(', ')}.`);

  /*
   * El seed no crea ninguna cuenta ni concede ningún permiso. Sin este aviso,
   * un entorno recién sembrado parece completo y no lo está: nadie puede
   * administrarlo hasta que alguien se registre y reciba el rol.
   */
  const administradores = await prisma.roleAssignment.count({
    where: { scopeType: 'GLOBAL', role: { code: 'ADMIN_MASTER' } },
  });

  if (administradores === 0) {
    console.log(
      '\nNo hay ningún administrador. Regístrese en /ingresar y después:\n' +
        '  pnpm rol:conceder <su-correo> ADMIN_MASTER',
    );
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
