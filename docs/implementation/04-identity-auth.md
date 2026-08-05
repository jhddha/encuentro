# P04 — Identidad y autenticación

**Fecha:** 5 de agosto de 2026
**Alcance:** DEC-016, DEC-013 y DEC-014 aprobadas e implementadas. Cuenta, sesión, verificación de correo, segundo factor y guardián de servidor.

## 1. Gate ejecutado

| Paso | Comando | Exit |
|---|---|---:|
| Validador documental | `python scripts/validate_canonical_docs.py` | 0 |
| Instalación congelada | `pnpm install --frozen-lockfile` | 0 |
| Formato | `pnpm format` | 0 |
| Lint | `pnpm lint` | 0 |
| Typecheck | `pnpm typecheck` | 0 |
| Unitarias | `pnpm test` — **116 pruebas** | 0 |
| **Integración** | `pnpm test:integration` — **26 pruebas** (14 de P03 + 12 de seguridad) | 0 |
| Build | `pnpm build` | 0 |
| Accesibilidad y responsive | `pnpm test:e2e` — **165 pruebas** | 0 |

## 2. Cómo se resolvió DEC-016

La decisión estaba redactada como «Auth.js estable o alternativa». Verificar el ecosistema resolvió la premisa en lugar de opinar sobre ella:

| Paquete | Estado el 2026-08-05 |
|---|---|
| `next-auth` v5 | Beta desde **2023-10-24**; última beta `5.0.0-beta.32` del 2026-07-20 |
| `next-auth` latest | `4.24.15`, era Pages Router |
| `@auth/core` | `0.41.3`, aún 0.x |
| `lucia` | Deprecado por su autor |
| `better-auth` | `1.6.26` estable; declara Next 16, React 19 y Prisma 7 |

**Auth.js no está estable.** Se adoptó Better Auth 1.6.26. Ver [DEC-016](../04-delivery/decisions/DEC-016.md) y [ADR-010](../02-architecture/adr/ADR-010.md).

### La frontera que importa

Better Auth responde **quién eres**. `packages/domain/src/rbac.ts` sigue respondiendo **qué puedes hacer aquí**. La librería no conoce permisos ni scopes, y las reglas probadas en P03 no se reescribieron. Una vulnerabilidad en la librería compromete la sesión, no el modelo de permisos.

`apps/web/src/lib/session.ts` es el único punto donde ambas cosas se juntan, y no decide nada por su cuenta: resuelve el actor y delega en `authorize` del dominio.

## 3. Orden de las comprobaciones

`requireActor` redirige en este orden, y el orden es deliberado:

1. sin sesión → `/ingresar`
2. correo sin verificar → `/verificar-correo` (DEC-013)
3. cuenta no `ACTIVE` → `/ingresar`
4. personal sin MFA → `/configurar-mfa` (DEC-014)

Exigir MFA antes de verificar el correo dejaría a la persona sin vía de recuperación. Y una cuenta suspendida pierde permisos de inmediato, sin esperar a que caduque su sesión.

El guardián vive en `apps/web/src/app/admin/layout.tsx`, así que cubre todas las rutas anidadas sin que cada página tenga que acordarse. Eso garantiza **autenticación**; la **autorización** por permiso y scope la exige cada acción con `requirePermission`, porque el permiso depende del recurso concreto y no de estar dentro de `/admin`.

## 4. Gate de seguridad: 12 pruebas contra la API real

Se ejercita `auth.handler` con peticiones HTTP, no una capa intermedia: lo que se comprueba es lo que vería un atacante.

| Comprobación | Resultado |
|---|---|
| Cuenta creada sin verificar, enlace enviado | ✅ |
| Sin correo verificado no hay sesión | ✅ `session.count() === 0` |
| El enlace de verificación no lleva la dirección en claro | ✅ |
| **Enumeración**: contraseña incorrecta y cuenta inexistente devuelven el mismo estado y el mismo código | ✅ |
| Registro con dirección repetida no crea una segunda cuenta ni lo confirma | ✅ |
| Cookie `HttpOnly`, `SameSite=Lax`, `Path=/` | ✅ |
| Sesión persistida en base, no solo en cookie | ✅ |
| **Revocación**: borrar la fila invalida la sesión de inmediato | ✅ |
| Borrar la persona arrastra sus sesiones | ✅ |
| La contraseña nunca se guarda en claro | ✅ |
| Se rechazan contraseñas bajo el mínimo de 12 | ✅ |

La revocación es la razón de persistir sesiones en base: una cookie firmada solo caduca; una fila se borra.

## 5. Tres defectos reales encontrados

### `pnpm build` no compilaba los paquetes

El script filtraba a `./apps/*` y nunca ejecutaba `tsc --build`. Los paquetes del workspace se publicaban desde `dist` obsoleto, así que un cambio en `packages/ui` **no llegaba al build**. Funcionaba por accidente: `pnpm typecheck` generaba `dist` como efecto secundario.

Se detectó porque un cambio de accesibilidad en `Button` no aparecía en la página servida. Corregido: `build` ahora es `tsc --build && …`.

### Contraste insuficiente en dos tokens canónicos

`--color-flame` (#D63B2F) con texto `--color-ivory` (#F7F2EA) da **4.14:1**, por debajo del 4.5:1 que WCAG 2.2 AA exige para texto normal. `--color-warning` (#D98E04) como texto sobre marfil da **2.46:1**.

Es un conflicto real entre `design-system.md` §3 y `requirements.md` §10. No se alteró ningún token:

- El botón primario usa 19 px en negrita, que cumple el umbral de «texto grande» del propio estándar (3:1 a partir de 18.66 px bold).
- `StatusBadge` lleva el color al **borde y al símbolo**, y el texto a `--color-ink`. El color sigue cumpliendo su función de señal, y §3 ya exigía no depender solo de él.

**Pendiente de decisión:** el sistema visual debería resolver esta tensión de forma explícita, en vez de dejarla resuelta caso por caso en los componentes.

### Better Auth generaba identificadores incompatibles

Genera cadenas alfanuméricas de 32 caracteres; las columnas del esquema son `uuid`. El primer error visible era engañoso —`Unknown argument emailVerified`, de un cliente Prisma sin regenerar— y ocultaba el real: `invalid input syntax for type uuid`.

Se alineó la generación con `crypto.randomUUID()` en lugar de degradar las columnas a texto, porque el resto del esquema (events, audit_logs, role_assignments) usa UUID.

## 6. Contratos actualizados

`contracts/routes.json` pasa de 28 a **31 rutas**: `/ingresar`, `/verificar-correo` y `/configurar-mfa`. La prueba de rutas ahora verifica **ambas direcciones** — que toda ruta declarada exista y que no haya páginas fuera del contrato.

## 7. Qué NO se implementó, y por qué

| Omisión | Motivo |
|---|---|
| Envío real de correo | Pertenece a P13 con SMTP y outbox. El enlace se registra en el log del servidor para poder completar el flujo en desarrollo. La firma del puerto ya obliga a encolar, no a enviar en la petición (GOV-008). |
| Pantallas de alta y verificación de TOTP | El backend está configurado y probado; la interfaz de registro del segundo factor queda por construir. `/configurar-mfa` explica el requisito pero aún no genera el código QR. |
| Cuenta administrativa con credencial en el seed | Deliberado: una contraseña por defecto dejaría acceso conocido en cualquier entorno donde corriera el seed. |

## 8. Riesgos y pendientes

1. **Las pantallas de administración salieron de la cobertura de accesibilidad.** Ahora redirigen a `/ingresar` sin sesión, así que recorrerlas solo comprobaría la página de acceso. Hace falta un fixture de sesión de Playwright; hasta entonces su accesibilidad no está verificada automáticamente.
2. **La interfaz de MFA está incompleta**, así que hoy nadie puede completar el requisito de DEC-014 desde el navegador. El guardián redirige correctamente, pero la pantalla de destino aún no resuelve el trámite.
3. **Falta el procedimiento de restablecimiento de segundo factor** que DEC-014 exige: presencial, verificado por un ADMIN_MASTER y auditado. Va al runbook de P15.
4. El conflicto de contraste de la paleta (§5) sigue abierto como decisión de diseño.
5. `useSecureCookies` depende de `NODE_ENV === 'production'`. En el despliegue de P14 hay que confirmar que el reverse proxy termina TLS y que la variable está bien fijada.
