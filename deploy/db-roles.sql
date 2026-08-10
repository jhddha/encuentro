-- Separación de roles de base de datos — mitigación pendiente desde P03.
--
-- EL PROBLEMA
--
-- Los triggers append-only de GOV-009 se aplican por fila, y `TRUNCATE` no
-- dispara triggers de fila: los esquiva por completo. Solo el propietario de
-- una tabla puede truncarla, así que la protección real no es el trigger sino
-- **no ser propietario**.
--
-- Hasta ahora la aplicación se conectaba con un rol que era propietario de las
-- 41 tablas y además superusuario. Verificado en el entorno local: con ese rol,
-- `DELETE FROM audit_logs` se rechaza con GOV-009 y `TRUNCATE audit_logs`
-- vacía la tabla sin oposición.
--
-- LA SEPARACIÓN
--
--   encuentro_owner  Propietario del esquema y de las tablas. Ejecuta las
--                    migraciones. No lo usa la aplicación en marcha.
--   encuentro_app    Rol de ejecución. Lee y escribe filas. No es propietario
--                    de nada, así que no puede truncar, alterar ni borrar
--                    ninguna tabla.
--
-- `TRUNCATE` es un privilegio propio en PostgreSQL y no lo conceden
-- SELECT/INSERT/UPDATE/DELETE. Basta con no otorgarlo y no ser propietario.
--
-- CÓMO SE EJECUTA
--
-- Una sola vez, al aprovisionar la base, con un superusuario:
--
--   psql -v owner_password=LA_CLAVE -v app_password=LA_OTRA \
--        -U postgres -d encuentro -f db-roles.sql
--
-- Es idempotente: si los roles ya existen, actualiza sus contraseñas y vuelve a
-- aplicar propiedad y privilegios. Se puede ejecutar tras cada migración para
-- comprobar que nada quedó fuera.
--
-- Después, `DATABASE_URL` de la aplicación apunta a `encuentro_app` y
-- `DATABASE_MIGRATION_URL` a `encuentro_owner`.

\set ON_ERROR_STOP on

-- ---------------------------------------------------------------------------
-- 1. Roles
-- ---------------------------------------------------------------------------

-- Se usan condicionales de psql y no un bloque DO: psql no sustituye sus
-- variables dentro de una cadena entre comillas de dólar, así que la contraseña
-- nunca llegaría al `CREATE ROLE`. `:'var'` la entrecomilla correctamente.

SELECT NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'encuentro_owner') AS crear_owner \gset
\if :crear_owner
CREATE ROLE encuentro_owner LOGIN PASSWORD :'owner_password';
\else
ALTER ROLE encuentro_owner LOGIN PASSWORD :'owner_password';
\endif

SELECT NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'encuentro_app') AS crear_app \gset
\if :crear_app
CREATE ROLE encuentro_app LOGIN PASSWORD :'app_password';
\else
ALTER ROLE encuentro_app LOGIN PASSWORD :'app_password';
\endif

-- Ninguno de los dos necesita crear bases, roles ni replicar.
ALTER ROLE encuentro_owner NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
ALTER ROLE encuentro_app   NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;

-- ---------------------------------------------------------------------------
-- 2. Propiedad del esquema y de lo ya existente
-- ---------------------------------------------------------------------------

ALTER SCHEMA public OWNER TO encuentro_owner;

-- Nadie más crea objetos en `public`. Sin esto, cualquier rol con conexión
-- podría dejar tablas o funciones dentro del esquema de la aplicación.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

DO $$
DECLARE obj record;
BEGIN
  FOR obj IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I OWNER TO encuentro_owner', obj.tablename);
  END LOOP;

  FOR obj IN SELECT sequencename FROM pg_sequences WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER SEQUENCE public.%I OWNER TO encuentro_owner', obj.sequencename);
  END LOOP;

  -- Las funciones de los triggers append-only también deben pertenecer al
  -- propietario: quien puede reemplazar la función puede vaciarla de contenido
  -- y dejar el trigger sin efecto.
  FOR obj IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO encuentro_owner', obj.sig);
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- 3. Privilegios de la aplicación
--
-- Se conceden los cuatro verbos de datos y nada más. En particular **no** se
-- concede TRUNCATE, que es un privilegio independiente, ni REFERENCES ni
-- TRIGGER, que permitirían alterar la forma de las tablas.
-- ---------------------------------------------------------------------------

GRANT CONNECT ON DATABASE encuentro TO encuentro_app;
GRANT USAGE ON SCHEMA public TO encuentro_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO encuentro_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO encuentro_app;

-- Las tablas que cree una migración futura heredan estos privilegios sin que
-- nadie tenga que acordarse. Sin esto, cada fase nueva dejaría tablas que la
-- aplicación no puede leer, y el arreglo apresurado sería volver a hacerla
-- propietaria.
ALTER DEFAULT PRIVILEGES FOR ROLE encuentro_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO encuentro_app;
ALTER DEFAULT PRIVILEGES FOR ROLE encuentro_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO encuentro_app;

-- ---------------------------------------------------------------------------
-- 4. Defensa en profundidad sobre las tablas append-only
--
-- Los triggers ya rechazan UPDATE y DELETE en estas tablas. Retirar además el
-- privilegio hace que la operación ni siquiera llegue al trigger. Dos barreras
-- independientes: si alguien elimina un trigger en una migración descuidada,
-- el privilegio sigue faltando.
-- ---------------------------------------------------------------------------

-- `journal_lines` faltaba en esta lista y tampoco tenía triggers: era la única
-- tabla append-only sin ninguna de las dos barreras, así que la contabilidad se
-- podía vaciar con la conexión de la aplicación. Los triggers llegaron en la
-- migración 20260808190000; esto es la segunda barrera.
--
-- `receipts` no está aquí a propósito: su trigger `receipts_only_void` permite
-- el UPDATE de anulación que PAY-033 exige, y retirarle el privilegio lo
-- impediría.
REVOKE UPDATE, DELETE ON
  audit_logs,
  charges,
  inventory_movements,
  journal_entries,
  journal_lines,
  material_deliveries,
  meal_deliveries,
  payment_allocations,
  payments
FROM encuentro_app;

-- ---------------------------------------------------------------------------
-- 5. Comprobación
-- ---------------------------------------------------------------------------

DO $$
DECLARE propias int;
BEGIN
  SELECT count(*) INTO propias FROM pg_tables
  WHERE schemaname = 'public' AND tableowner = 'encuentro_app';

  IF propias > 0 THEN
    RAISE EXCEPTION 'encuentro_app sigue siendo propietario de % tablas', propias;
  END IF;

  IF has_table_privilege('encuentro_app', 'audit_logs', 'TRUNCATE') THEN
    RAISE EXCEPTION 'encuentro_app conserva TRUNCATE sobre audit_logs';
  END IF;

  IF has_table_privilege('encuentro_app', 'audit_logs', 'DELETE') THEN
    RAISE EXCEPTION 'encuentro_app conserva DELETE sobre audit_logs';
  END IF;

  RAISE NOTICE 'Separación de roles correcta: encuentro_app no es propietario y no puede truncar.';
END
$$;
