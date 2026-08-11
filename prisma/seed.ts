import 'dotenv/config';

import { createPrismaClient } from '@encuentro/infrastructure';

import { ROLES } from './roles';

/**
 * Datos mínimos de desarrollo.
 *
 * Crea una gestión de referencia y los roles con sus permisos, para poder
 * recorrer las pantallas de administración en local. No inventa inscripciones,
 * pagos ni catálogo: esos datos pertenecen a fases que aún no existen.
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
      currency: 'USD',
      // 8 días es la referencia actual (EVT-016), aquí como dato, no como regla.
      startAt: new Date('2026-11-01T00:00:00Z'),
      endAt: new Date('2026-11-08T23:59:59Z'),
      status: 'DRAFT',
    },
  });

  /*
   * Cuenta administrativa inicial.
   *
   * Se crea **sin credencial**: darle una contraseña por defecto dejaría una
   * cuenta con acceso conocido en cualquier entorno donde corriera el seed.
   * El alta real de la credencial se hace por el flujo de registro, que exige
   * verificación de correo (DEC-013) y segundo factor (DEC-014).
   */
  const admin = await prisma.user.upsert({
    where: { email: 'admin@encuentro.local' },
    update: {},
    create: { email: 'admin@encuentro.local', displayName: 'Administrador de desarrollo' },
  });

  for (const definition of ROLES) {
    const role = await prisma.role.upsert({
      where: { code: definition.code },
      update: {},
      create: { code: definition.code, name: definition.name },
    });

    await prisma.rolePermission.createMany({
      data: definition.permissions.map((permission) => ({ roleId: role.id, permission })),
      skipDuplicates: true,
    });

    if (definition.scopeType === 'GLOBAL') {
      const existing = await prisma.roleAssignment.findFirst({
        where: { userId: admin.id, roleId: role.id, scopeType: 'GLOBAL' },
      });

      if (existing === null) {
        await prisma.roleAssignment.create({
          data: { userId: admin.id, roleId: role.id, scopeType: 'GLOBAL' },
        });
      }
    }
  }

  console.log(`Seed listo: gestión ${event.code}, ${String(ROLES.length)} roles, 1 usuario.`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
