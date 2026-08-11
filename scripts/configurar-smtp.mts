import 'dotenv/config';

import { createPrismaClient } from '@encuentro/infrastructure';
import { parseArgs } from 'node:util';
import process from 'node:process';

/**
 * Escribe la configuración de correo — GOV-007.
 *
 * Provisional y a sabiendas: la pantalla `/admin/configuracion/correo` es un
 * marcador de la fase 12, y hasta que exista no hay forma de dejar el servidor
 * SMTP configurado. Este script rellena el mismo hueco que rellenará ella, con
 * el mismo reparto:
 *
 *  - **Host, puerto, remitente y TLS van a la base**, en una fila única que un
 *    índice de unicidad protege. Son configuración, no secreto.
 *  - **La contraseña NO pasa por aquí.** Vive en `SMTP_PASSWORD`, en el
 *    entorno, y la pone la persona que la conoce. La tabla ni siquiera tiene
 *    columna para ella: un secreto en base es un secreto en cada respaldo, en
 *    cada volcado y en cada pantalla de administración.
 *
 * Uso:
 *   pnpm smtp:set --host smtp.ejemplo.com --port 587 --from "no-reply@ejemplo.com" \
 *                 --nombre "Encuentro" --usuario no-reply@ejemplo.com
 *
 * `--inseguro` desactiva TLS implícito (puerto 587 con STARTTLS lo necesita;
 * el 465 no).
 */

const { values } = parseArgs({
  options: {
    host: { type: 'string' },
    port: { type: 'string' },
    from: { type: 'string' },
    nombre: { type: 'string' },
    usuario: { type: 'string' },
    inseguro: { type: 'boolean', default: false },
  },
});

function exigir(nombre: string, valor: string | undefined): string {
  if (valor === undefined || valor.trim() === '') {
    throw new Error(`Falta --${nombre}. Vea el encabezado de scripts/configurar-smtp.mts.`);
  }
  return valor.trim();
}

const host = exigir('host', values.host);
const from = exigir('from', values.from);
const nombre = values.nombre?.trim() ?? 'Encuentro';
const puerto = Number.parseInt(exigir('port', values.port), 10);

if (!Number.isInteger(puerto) || puerto < 1 || puerto > 65535) {
  throw new Error(`El puerto «${values.port ?? ''}» no es válido.`);
}

/*
 * El 465 es TLS desde el primer byte; el 587 empieza en claro y sube con
 * STARTTLS, que nodemailer hace con `secure: false`. Confundirlos produce un
 * tiempo de espera agotado sin mensaje útil, así que se deduce del puerto y se
 * deja anular a mano.
 */
const secure = values.inseguro ? false : puerto === 465;

const prisma = createPrismaClient(process.env.DATABASE_URL ?? '');

try {
  const existente = await prisma.smtpSettings.findFirst({ select: { id: true } });

  const datos = {
    host,
    port: puerto,
    username: values.usuario?.trim() ?? null,
    fromName: nombre,
    fromEmail: from,
    secure,
  };

  if (existente === null) {
    await prisma.smtpSettings.create({ data: { ...datos, singleton: true } });
  } else {
    await prisma.smtpSettings.update({ where: { id: existente.id }, data: datos });
  }

  const conContrasena = (process.env.SMTP_PASSWORD ?? '') !== '';

  console.log(`Correo configurado: ${nombre} <${from}> por ${host}:${String(puerto)}`);
  console.log(`  TLS implícito: ${secure ? 'sí' : 'no (STARTTLS)'}`);
  console.log(`  Usuario: ${datos.username ?? '(sin autenticación)'}`);
  console.log(
    conContrasena
      ? '  SMTP_PASSWORD: presente en el entorno.'
      : '  SMTP_PASSWORD: AUSENTE. Añádala a .env si su servidor exige autenticación.',
  );
  console.log('\nLos correos salen desde el worker: `pnpm --filter @encuentro/worker dev`.');
} finally {
  await prisma.$disconnect();
}
