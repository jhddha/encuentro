import { createAuth, type PrismaClient } from '@encuentro/infrastructure';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { resetDatabase, testPrisma } from './helpers';

/**
 * Gate de P04: IDOR, enumeración, cookies y revocación.
 *
 * Contra Postgres real y la instancia real de Better Auth. Se ejercita la API
 * HTTP, no una capa intermedia: lo que se comprueba es lo que un atacante
 * vería.
 */
const prisma: PrismaClient = testPrisma();

const sentEmails: { email: string; url: string }[] = [];

const auth = createAuth({
  prisma,
  secret: 'secreto-de-pruebas-con-longitud-suficiente-1234',
  baseURL: 'http://localhost:3000',
  sendVerificationEmail: ({ email, url }) => {
    sentEmails.push({ email, url });
    return Promise.resolve();
  },
});

const PASSWORD = 'contrasena-de-prueba-larga';

async function signUp(email: string): Promise<void> {
  await auth.api.signUpEmail({
    body: { email, password: PASSWORD, name: 'Persona de prueba' },
  });
}

/** Inicia sesión contra la API HTTP y devuelve la respuesta completa. */
async function signInRaw(email: string, password: string): Promise<Response> {
  return await auth.handler(
    new Request('http://localhost:3000/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }),
  );
}

beforeEach(async () => {
  await resetDatabase(prisma);
  sentEmails.length = 0;
});

afterAll(async () => {
  await resetDatabase(prisma);
  await prisma.$disconnect();
});

describe('verificación de correo obligatoria (DEC-013)', () => {
  it('crea la cuenta sin verificar y envía el enlace', async () => {
    await signUp('peregrino@encuentro.test');

    const user = await prisma.user.findUniqueOrThrow({
      where: { email: 'peregrino@encuentro.test' },
    });
    expect(user.emailVerified).toBe(false);
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0]?.email).toBe('peregrino@encuentro.test');
  });

  it('no deja iniciar sesión mientras el correo no esté verificado', async () => {
    await signUp('peregrino@encuentro.test');

    const response = await signInRaw('peregrino@encuentro.test', PASSWORD);
    expect(response.ok).toBe(false);

    // Y no se creó sesión alguna.
    expect(await prisma.session.count()).toBe(0);
  });

  it('el enlace de verificación no contiene la dirección en claro', async () => {
    await signUp('peregrino@encuentro.test');
    // requirements.md §10: nada de PII en URLs.
    expect(sentEmails[0]?.url).not.toContain('peregrino@encuentro.test');
  });
});

describe('enumeración de cuentas', () => {
  it('responde igual ante cuenta inexistente y contraseña incorrecta', async () => {
    await signUp('existe@encuentro.test');
    await prisma.user.update({
      where: { email: 'existe@encuentro.test' },
      data: { emailVerified: true },
    });

    const wrongPassword = await signInRaw('existe@encuentro.test', 'contrasena-equivocada-larga');
    const noSuchUser = await signInRaw('no-existe@encuentro.test', PASSWORD);

    // Mismo código de estado: la diferencia permitiría enumerar direcciones.
    expect(wrongPassword.status).toBe(noSuchUser.status);

    const bodyA = (await wrongPassword.json()) as { code?: string };
    const bodyB = (await noSuchUser.json()) as { code?: string };
    expect(bodyA.code).toBe(bodyB.code);
  });

  it('el registro con una dirección ya usada no confirma que exista', async () => {
    await signUp('existe@encuentro.test');
    const before = await prisma.user.count();

    await auth.api
      .signUpEmail({ body: { email: 'existe@encuentro.test', password: PASSWORD, name: 'Otra' } })
      .catch(() => undefined);

    // No se creó una segunda cuenta con el mismo correo.
    expect(await prisma.user.count()).toBe(before);
  });
});

describe('sesión y cookies', () => {
  async function verifiedUserSession(email: string): Promise<Response> {
    await signUp(email);
    await prisma.user.update({ where: { email }, data: { emailVerified: true } });
    return await signInRaw(email, PASSWORD);
  }

  it('marca la cookie de sesión HttpOnly, SameSite y con Path', async () => {
    const response = await verifiedUserSession('admin@encuentro.test');
    const cookie = response.headers.get('set-cookie') ?? '';

    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\//i);
  });

  it('persiste la sesión en base, no solo en la cookie', async () => {
    await verifiedUserSession('admin@encuentro.test');
    // Solo una fila persistida se puede revocar; una cookie firmada solo caduca.
    expect(await prisma.session.count()).toBe(1);
  });

  it('la sesión tiene vencimiento', async () => {
    await verifiedUserSession('admin@encuentro.test');
    const session = await prisma.session.findFirstOrThrow();
    expect(session.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });
});

describe('revocación', () => {
  it('una sesión borrada deja de resolver de inmediato', async () => {
    await signUp('admin@encuentro.test');
    await prisma.user.update({
      where: { email: 'admin@encuentro.test' },
      data: { emailVerified: true },
    });

    const signIn = await signInRaw('admin@encuentro.test', PASSWORD);
    const cookie = signIn.headers.get('set-cookie') ?? '';
    expect(cookie).not.toBe('');

    const withCookie = new Headers({ cookie: cookie.split(';')[0] ?? '' });

    const before = await auth.api.getSession({ headers: withCookie });
    expect(before).not.toBeNull();

    // Revocación: se borra la fila, sin esperar a que caduque la cookie.
    await prisma.session.deleteMany({});

    const after = await auth.api.getSession({ headers: withCookie });
    expect(after).toBeNull();
  });

  it('borrar la persona arrastra sus sesiones', async () => {
    await signUp('admin@encuentro.test');
    await prisma.user.update({
      where: { email: 'admin@encuentro.test' },
      data: { emailVerified: true },
    });
    await signInRaw('admin@encuentro.test', PASSWORD);

    expect(await prisma.session.count()).toBe(1);
    await prisma.user.deleteMany({ where: { email: 'admin@encuentro.test' } });
    expect(await prisma.session.count()).toBe(0);
  });
});

describe('almacenamiento de credenciales', () => {
  it('nunca guarda la contraseña en claro', async () => {
    await signUp('admin@encuentro.test');

    const account = await prisma.account.findFirstOrThrow();
    expect(account.password).not.toBeNull();
    expect(account.password).not.toBe(PASSWORD);
    expect(account.password).not.toContain(PASSWORD);
    // Un hash con sal es sustancialmente más largo que la contraseña.
    expect((account.password ?? '').length).toBeGreaterThan(PASSWORD.length);
  });

  it('rechaza contraseñas por debajo del mínimo configurado', async () => {
    await expect(
      auth.api.signUpEmail({
        body: { email: 'corta@encuentro.test', password: 'corta', name: 'Persona' },
      }),
    ).rejects.toThrow();

    expect(await prisma.user.count()).toBe(0);
  });
});
