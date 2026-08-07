-- P16 — Actor de sistema para los procesos de fondo.
--
-- `audit_logs.actor_id` es obligatorio y referencia a `users`: toda escritura
-- auditada tiene un responsable (GOV-006). La expiracion de reservas (DEC-005)
-- y el envio de correo no tienen persona detras, y las dos alternativas
-- habituales son malas:
--
--   - hacer `actor_id` nulo, que rompe la trazabilidad de toda la tabla y
--     obliga a cada consulta a contemplar el caso;
--   - atribuir el cambio a quien creo la reserva, que es falso y confunde a
--     quien lea la auditoria buscando responsables.
--
-- Se crea en cambio una cuenta de sistema con identificador fijo. Es visible,
-- consultable y no se puede confundir con una persona.
--
-- La cuenta no puede iniciar sesion: no se le crea fila en `accounts`, que es
-- donde Better Auth guarda las credenciales, ni se le asigna ningun rol. Sin
-- credenciales no hay forma de autenticarse como ella.

INSERT INTO "users" ("id", "email", "display_name", "status", "email_verified", "two_factor_enabled", "created_at", "updated_at")
VALUES (
  '00000000-0000-4000-8000-000000000001',
  'sistema@encuentro.invalid',
  'Sistema',
  'SYSTEM',
  FALSE,
  FALSE,
  NOW(),
  NOW()
)
ON CONFLICT ("id") DO NOTHING;

-- El dominio `.invalid` esta reservado por RFC 2606 justamente para esto: no
-- resuelve y no puede pertenecer a nadie, asi que un envio accidental a esta
-- direccion falla en vez de llegar a un tercero.
