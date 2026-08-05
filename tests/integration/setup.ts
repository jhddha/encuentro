import 'dotenv/config';

if (process.env.DATABASE_URL === undefined || process.env.DATABASE_URL === '') {
  throw new Error(
    'Las pruebas de integración necesitan DATABASE_URL. Levante el entorno con `pnpm db:up` y copie .env.example a .env.',
  );
}
