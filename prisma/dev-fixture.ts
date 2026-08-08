import 'dotenv/config';

import { createObjectStorage, createPrismaClient } from '@encuentro/infrastructure';
import process from 'node:process';

/**
 * Escenario de desarrollo para revisar una evidencia a mano.
 *
 * Existe porque hasta ahora «funciona» significaba «pasa las pruebas»: ninguna
 * pantalla se había ejercitado con una sesión real. Este script deja el sistema
 * en un estado donde eso es posible.
 *
 * **No crea credenciales.** Igual que `prisma/seed.ts`, y por la misma razón:
 * una contraseña por defecto es una cuenta con acceso conocido en cualquier
 * entorno donde el script corra. El alta pasa por el registro real, que exige
 * verificación de correo (DEC-013) y segundo factor (DEC-014).
 *
 * Uso:
 *   pnpm exec tsx prisma/dev-fixture.ts tu-correo@ejemplo.org
 */

const argumento = process.argv[2];

if (argumento?.includes('@') !== true) {
  console.error('Uso: pnpm exec tsx prisma/dev-fixture.ts <correo-ya-registrado>');
  process.exit(1);
}

/*
 * El estrechamiento del `if` no viaja dentro de `main()`, así que se fija aquí.
 * Sin esto el correo sería `string | undefined` en cada interpolación.
 */
const email: string = argumento;

const prisma = createPrismaClient(process.env.DATABASE_URL ?? '');

const storage = createObjectStorage({
  endpoint: process.env.OBJECT_STORAGE_ENDPOINT ?? 'http://localhost:9000',
  bucket: process.env.OBJECT_STORAGE_BUCKET ?? 'encuentro-private',
  accessKey: process.env.OBJECT_STORAGE_ACCESS_KEY ?? '',
  secretKey: process.env.OBJECT_STORAGE_SECRET_KEY ?? '',
});

/** PNG de 1×1 px que hace de comprobante escaneado. */
const COMPROBANTE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function main(): Promise<void> {
  const event = await prisma.event.findUnique({ where: { code: 'ENC2026' } });

  if (event === null) {
    console.error('No existe la gestión ENC2026. Ejecute antes `pnpm exec prisma db seed`.');
    process.exit(1);
  }

  /*
   * GOV-003: solo `ACTIVE` e `IN_PROGRESS` admiten inscripciones y pagos. El
   * seed deja la gestión en `DRAFT`, así que sin esto el revisor recibiría
   * EVENT_OPERATIONS_BLOCKED y parecería un fallo del código.
   *
   * En producción la transición es manual y auditada (EVT-003). Aquí se fuerza
   * porque es un fixture de desarrollo, y se dice en voz alta.
   */
  if (event.status === 'DRAFT' || event.status === 'READY') {
    await prisma.event.update({
      where: { id: event.id },
      data: { status: 'ACTIVE', publiclyEnabled: true },
    });
    console.log(`Gestión ${event.code} llevada a ACTIVE para que admita operaciones.`);
  }

  const user = await prisma.user.findFirst({ where: { email } });

  if (user === null) {
    console.error(`No existe ningún usuario con el correo ${email}.`);
    console.error('Regístrese primero en http://localhost:3000/ingresar y vuelva a ejecutar esto.');
    process.exit(1);
  }

  // --- Permiso de revisión, con ámbito de esta gestión --------------------------

  const role = await prisma.role.findUnique({ where: { code: 'TESORERIA' } });

  if (role === null) {
    console.error('No existe el rol TESORERIA. Ejecute `pnpm exec prisma db seed`.');
    process.exit(1);
  }

  const existing = await prisma.roleAssignment.findFirst({
    where: { userId: user.id, roleId: role.id, scopeType: 'EVENT', eventId: event.id },
  });

  if (existing === null) {
    await prisma.roleAssignment.create({
      data: { userId: user.id, roleId: role.id, scopeType: 'EVENT', eventId: event.id },
    });
  }

  // --- Una inscripción con su cargo -------------------------------------------

  const marca = Date.now().toString(36);

  const person = await prisma.person.create({
    data: { fullName: `Peregrino de prueba ${marca}`, birthDate: new Date('1990-05-14') },
  });

  const pkg = await prisma.package.upsert({
    where: { eventId_code: { eventId: event.id, code: 'GENERAL' } },
    update: {},
    create: { eventId: event.id, code: 'GENERAL', name: 'Paquete general', visibility: 'PUBLIC' },
  });

  let price = await prisma.priceVersion.findFirst({ where: { packageId: pkg.id } });
  price ??= await prisma.priceVersion.create({
    data: { packageId: pkg.id, paymentMode: 'ARRIVAL', amount: '420.00', currency: 'USD' },
  });

  const registration = await prisma.registration.create({
    data: {
      eventId: event.id,
      code: `REG-${marca.toUpperCase()}`,
      personId: person.id,
      packageId: pkg.id,
      priceVersionId: price.id,
      paymentMode: 'ARRIVAL',
      status: 'SUBMITTED',
    },
  });

  await prisma.charge.create({
    data: {
      registrationId: registration.id,
      concept: 'PACKAGE',
      amount: '420.00',
      currency: 'USD',
      snapshot: { packageCode: 'GENERAL', priceVersionId: price.id },
    },
  });

  // --- La evidencia, con su archivo en el almacén privado ----------------------

  await storage.ensureBucket();

  const stored = await storage.putEvidence({
    eventId: event.id,
    body: COMPROBANTE,
    contentType: 'image/png',
  });

  let channel = await prisma.paymentChannel.findFirst({ where: { eventId: event.id } });
  channel ??= await prisma.paymentChannel.create({
    data: { eventId: event.id, code: 'US_ACCOUNT_MANUAL', currency: 'USD' },
  });

  const proof = await prisma.paymentProof.create({
    data: {
      eventId: event.id,
      registrationId: registration.id,
      channelId: channel.id,
      declaredAmount: '420.00',
      currency: 'USD',
      paidAt: new Date(),
      reference: `TRF-${marca.toUpperCase()}`,
      payerName: person.fullName,
      fileId: stored.fileId,
      fileChecksum: stored.checksum,
      status: 'SUBMITTED',
    },
  });

  await prisma.$disconnect();

  console.log(`
Escenario listo.

  Gestión        ${event.code}
  Inscripción    ${registration.code} — saldo pendiente 420.00 USD
  Evidencia      ${proof.reference} — 420.00 USD, con archivo adjunto
  Permiso        TESORERIA sobre ${event.code}, concedido a ${email}

Para usarlo:

  1. pnpm --filter @encuentro/web dev
  2. Entre en http://localhost:3000/ingresar con ${email}
  3. Si le pide segundo factor, regístrelo: DEC-014 lo exige para toda cuenta
     con permisos, y acaba de recibir uno.
  4. Abra http://localhost:3000/admin/e/${event.code}/comprobantes
  5. Pulse «Tomar para revisión», luego «Revisar», abra el comprobante y
     reparta los 420.00 contra el cargo.

Al aprobar debería aparecer un comprobante numerado REC-${event.code}-000001.
`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
