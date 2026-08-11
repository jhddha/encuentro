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
 *   pnpm exec tsx prisma/dev-fixture.ts revisor@ejemplo.org [peregrino@ejemplo.org]
 *
 * El segundo correo es opcional y **debe ser una cuenta distinta**. Si se da, la
 * inscripción de prueba queda vinculada a esa cuenta y su titular puede recorrer
 * `/e/ENC2026/mi-cuenta` y declarar un pago. Sin él, la inscripción no tiene
 * cuenta —como una inscripción presencial de IAM-012— y solo se puede recorrer
 * el lado del revisor.
 *
 * Que sean cuentas distintas no es capricho del script: quien revisa su propio
 * comprobante se aprueba a sí mismo el dinero, y probarlo así ocultaría
 * exactamente el control que PAY-025 introduce.
 */

const argumento = process.argv[2];
const argumentoPeregrino = process.argv[3];

if (argumento?.includes('@') !== true) {
  console.error(
    'Uso: pnpm exec tsx prisma/dev-fixture.ts <correo-revisor> [correo-peregrino]\n' +
      'Ambos deben estar ya registrados; el script no crea credenciales.',
  );
  process.exit(1);
}

if (argumentoPeregrino !== undefined && !argumentoPeregrino.includes('@')) {
  console.error(`«${argumentoPeregrino}» no parece un correo.`);
  process.exit(1);
}

if (argumentoPeregrino === argumento) {
  console.error('El revisor y el peregrino deben ser cuentas distintas.');
  process.exit(1);
}

/*
 * El estrechamiento del `if` no viaja dentro de `main()`, así que se fija aquí.
 * Sin esto el correo sería `string | undefined` en cada interpolación.
 */
const email: string = argumento;
const emailPeregrino: string | undefined = argumentoPeregrino;

const prisma = createPrismaClient(process.env.DATABASE_URL ?? '');

const storage = createObjectStorage({
  endpoint: process.env.OBJECT_STORAGE_ENDPOINT ?? 'http://localhost:9000',
  bucket: process.env.OBJECT_STORAGE_BUCKET ?? 'encuentro-private',
  accessKey: process.env.OBJECT_STORAGE_ACCESS_KEY ?? '',
  secretKey: process.env.OBJECT_STORAGE_SECRET_KEY ?? '',
});

/**
 * Importe del cargo de ejemplo.
 *
 * La **moneda** no se fija aquí: sale de la gestión. Estaba en dólares a mano,
 * y al pasar los libros a bolivianos el fixture habría sembrado un cargo en una
 * moneda que la gestión ya no usa — justo el histórico incoherente que la
 * restricción de moneda existe para impedir.
 */
const IMPORTE = '420.00';

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

  /*
   * Cuenta del peregrino, si se pidió.
   *
   * Se exige que exista, igual que la del revisor: el alta pasa por el registro
   * real, con verificación de correo (DEC-013). Una cuenta creada aquí sería una
   * cuenta sin contraseña conocida o con una por defecto, y ninguna de las dos
   * cosas debe existir en ningún entorno.
   */
  let usuarioPeregrino: { id: string } | null = null;

  if (emailPeregrino !== undefined) {
    usuarioPeregrino = await prisma.user.findFirst({
      where: { email: emailPeregrino },
      select: { id: true },
    });

    if (usuarioPeregrino === null) {
      console.error(`No existe ningún usuario con el correo ${emailPeregrino}.`);
      console.error('Regístrelo en http://localhost:3000/ingresar y vuelva a ejecutar esto.');
      process.exit(1);
    }

    /*
     * `persons.user_id` es único: una cuenta no puede ser dos personas. Si esa
     * cuenta ya quedó vinculada por una ejecución anterior, se reutiliza en vez
     * de crear una persona nueva que reventaría contra el índice.
     */
    const yaVinculada = await prisma.person.findUnique({
      where: { userId: usuarioPeregrino.id },
      select: { id: true },
    });

    if (yaVinculada !== null) {
      await prisma.person.update({
        where: { id: yaVinculada.id },
        data: { userId: null },
      });
      console.log('La cuenta del peregrino ya estaba vinculada a otra persona; se desvinculó.');
    }
  }

  const person = await prisma.person.create({
    data: {
      fullName: `Peregrino de prueba ${marca}`,
      birthDate: new Date('1990-05-14'),
      ...(usuarioPeregrino === null ? {} : { userId: usuarioPeregrino.id }),
    },
  });

  const pkg = await prisma.package.upsert({
    where: { eventId_code: { eventId: event.id, code: 'GENERAL' } },
    update: {},
    create: { eventId: event.id, code: 'GENERAL', name: 'Paquete general', visibility: 'PUBLIC' },
  });

  let price = await prisma.priceVersion.findFirst({ where: { packageId: pkg.id } });
  price ??= await prisma.priceVersion.create({
    data: { packageId: pkg.id, paymentMode: 'ARRIVAL', amount: IMPORTE, currency: event.currency },
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
      amount: IMPORTE,
      currency: event.currency,
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

  /*
   * Canal anticipado con instrucciones. La moneda coincide con la de la gestión
   * a propósito: mientras TBD-001 siga abierto no hay tasa configurada, y un
   * canal en otra moneda haría que la pantalla del peregrino rechazara toda
   * declaración con un mensaje que parecería un fallo del código.
   */
  /*
   * El canal de la cuenta de Estados Unidos cobra en **dólares**, no en la
   * moneda de la gestión: es una cuenta en dólares y esa es su moneda. Al pasar
   * los libros a bolivianos lo puse en `event.currency` y era un error — el
   * canal no cambia de divisa porque cambien los libros.
   *
   * Deja el fixture en el caso que de verdad interesa probar: cobro en moneda
   * extranjera contra una gestión en la funcional, que es lo que exige tasa.
   *
   * `update` fija también la moneda: sin eso, una fila creada antes conserva la
   * suya y el fixture informa de una cosa mientras la base tiene otra. Pasó.
   */
  const canales = [
    {
      code: 'BOLIVIA_QR_MANUAL',
      currency: event.currency,
      instructions: 'QR de desarrollo. Datos ficticios, no transfiera nada.',
    },
    {
      code: 'US_ACCOUNT_MANUAL',
      currency: 'USD',
      instructions: 'Cuenta de desarrollo 0000-0000. Datos ficticios, no transfiera nada.',
    },
  ];

  for (const definicion of canales) {
    await prisma.paymentChannel.upsert({
      where: { eventId_code: { eventId: event.id, code: definicion.code } },
      // `update` fija también la moneda: sin eso, una fila creada antes conserva
      // la suya y el fixture informa de una cosa mientras la base tiene otra.
      update: { active: true, currency: definicion.currency },
      create: { eventId: event.id, ...definicion },
    });
  }

  /*
   * La evidencia sembrada va por el canal en la **moneda de la gestión**. El de
   * la cuenta de Estados Unidos cobra en dólares —es una cuenta en dólares, y
   * no cambia de divisa porque cambien los libros— y `assertDeclarableEvidence`
   * exige que importe y canal coincidan. Sembrar contra él dejaría una fila que
   * el dominio habría rechazado.
   *
   * Los dos quedan activos a propósito: el de dólares es el que hace falta para
   * probar la tasa de cambio.
   */
  const channel = await prisma.paymentChannel.findUniqueOrThrow({
    where: { eventId_code: { eventId: event.id, code: 'BOLIVIA_QR_MANUAL' } },
  });

  const proof = await prisma.paymentProof.create({
    data: {
      eventId: event.id,
      registrationId: registration.id,
      channelId: channel.id,
      declaredAmount: IMPORTE,
      currency: event.currency,
      paidAt: new Date(),
      reference: `TRF-${marca.toUpperCase()}`,
      payerName: person.fullName,
      fileId: stored.fileId,
      fileChecksum: stored.checksum,
      status: 'SUBMITTED',
    },
  });

  await prisma.$disconnect();

  const ladoPeregrino =
    emailPeregrino === undefined
      ? `  Peregrino      sin cuenta vinculada — pase un segundo correo para poder
                 recorrer /e/${event.code}/mi-cuenta con sesión`
      : `  Peregrino      ${emailPeregrino}, titular de ${registration.code}`;

  const pasosPeregrino =
    emailPeregrino === undefined
      ? ''
      : `
Y el circuito completo, que es lo que no se había recorrido nunca:

  6. En otro navegador o ventana privada, entre con ${emailPeregrino}
  7. Abra http://localhost:3000/e/${event.code}/mi-cuenta — debe ver el cargo
     de ${IMPORTE} y el saldo pendiente
  8. En /mi-cuenta/pagos declare un pago nuevo con otra referencia
  9. Como revisor, pida corrección de esa evidencia
 10. Como peregrino, corríjala: la fila vuelve a «Enviado» sin duplicarse
`;

  console.log(`
Escenario listo.

  Gestión        ${event.code}
  Inscripción    ${registration.code} — saldo pendiente ${IMPORTE} ${event.currency}
  Evidencia      ${proof.reference} — ${IMPORTE} ${event.currency}, con archivo adjunto
  Canal          ${channel.code} (${channel.currency}), activo y con instrucciones
  Permiso        TESORERIA sobre ${event.code}, concedido a ${email}
${ladoPeregrino}

Para usarlo:

  1. pnpm --filter @encuentro/web dev
  2. Entre en http://localhost:3000/ingresar con ${email}
  3. Si le pide segundo factor, regístrelo: DEC-014 lo exige para toda cuenta
     con permisos, y acaba de recibir uno.
  4. Abra http://localhost:3000/admin/e/${event.code}/comprobantes
  5. Pulse «Tomar para revisión», luego «Revisar», abra el comprobante y
     reparta los ${IMPORTE} contra el cargo.

Al aprobar debería aparecer un comprobante numerado REC-${event.code}-000001.
${pasosPeregrino}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
