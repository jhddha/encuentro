# P01 — Monorepo, toolchain y CI

**Fecha:** 5 de agosto de 2026
**Alcance:** workspace, paquetes, apps, entorno, Docker local y CI. Sin lógica de negocio.

## 1. Gate ejecutado

Los siete pasos corrieron en el mismo orden que el workflow de CI:

| Paso | Comando | Exit |
|---|---|---:|
| Validador documental | `python scripts/validate_canonical_docs.py` | 0 |
| Instalación congelada | `pnpm install --frozen-lockfile` | 0 |
| Formato | `pnpm format` | 0 |
| Lint | `pnpm lint` | 0 |
| Typecheck | `pnpm typecheck` | 0 |
| Unitarias | `pnpm test` | 0 |
| Build | `pnpm build` | 0 |

Salidas relevantes:

```
OK ENCUENTRO docs v2.7: 65 requirement IDs, 28 routes, 36 permissions
Test Files  1 passed (1)
     Tests  14 passed (14)
Route (app)
┌ ○ /
└ ○ /_not-found
```

## 2. Estructura creada

```text
apps/web            Next.js 16 App Router
apps/worker         proceso Node separado (DEC-001)
packages/domain     estados canónicos y errores de dominio
packages/application puertos (Clock, AuditPort)
packages/infrastructure implementaciones de puertos
packages/ui         tokens de identidad
packages/config     esquema de entorno validado con Zod
prisma/             schema sin modelos todavía
tests/e2e/          reservado para Playwright (P02+)
```

La dirección de dependencias `presentation -> application -> domain` está impuesta por project references de TypeScript, no solo por convención: `packages/domain` no referencia a nadie y `packages/application` solo referencia a `domain`.

## 3. Versiones fijadas

Todas verificadas contra el registro npm el 5 de agosto de 2026, no asumidas.

| Dependencia | Versión | Nota |
|---|---|---|
| Node.js | 24.19.0 | patch exacto en `.nvmrc`, `engines` y CI |
| pnpm | 11.15.1 | `packageManager` |
| Next.js | 16.3.0 | |
| React | 19.2.8 | |
| TypeScript | 5.9.3 | ver decisión abajo |
| Prisma | 7.9.1 | |
| Tailwind | 4.3.3 | |
| BullMQ | 6.0.7 | |
| Vitest | 4.1.10 | |
| ESLint | 9.39.5 | ver decisión abajo |
| typescript-eslint | 8.66.0 | |
| Zod | 4.4.3 | |

### Decisión: TypeScript 5.9.3 y no 7.0.2

TypeScript 7.0.2 es la última estable, pero `typescript-eslint@8.66.0` declara peer `typescript >=4.8.4 <6.1.0` y **ninguna** versión publicada lo soporta todavía. Adoptar TS 7 hoy significaría perder las reglas de lint con información de tipos, que son justamente las que prohíben `any`, `ts-ignore` y casts injustificados (`CLAUDE.md`). Se eligió 5.9.3, la última con soporte completo. Revisar cuando typescript-eslint publique compatibilidad.

### Decisión: ESLint 9.39.5 y no 10.8.0

`eslint-config-next@16.3.0` arrastra `eslint-plugin-import`, `eslint-plugin-jsx-a11y` y `eslint-plugin-react`, que topan en `^9`. Con ESLint 10 el árbol de peers queda inconsistente. Se fijó la última 9.x.

Ninguna de las dos decisiones altera reglas de negocio, así que no requieren ADR. Si se quiere dejar constancia formal, corresponde un ADR de línea base técnica.

## 4. Qué NO se implementó, y por qué

| Omisión | Motivo |
|---|---|
| Autenticación productiva | **DEC-016 sigue BLOCKING.** El prompt P01 lo prohíbe explícitamente. |
| Modelos Prisma | Las tablas están en `data-api-rbac.md` §2 pero pertenecen a P03, P05, P06 y P07 con su migración y pruebas. Declararlas ahora crearía migraciones sin requisito asociado. |
| Colas BullMQ concretas | Igual: cada cola pertenece a la fase que la necesita. El worker solo abre conexión y apaga limpio. |
| Health checks HTTP | La arquitectura §9 los exige, pero no hay variable de puerto en `.env.example` ni requisito que fije su forma. Queda como TBD para P14. |
| Componentes de `design-system.md` §7 | Pertenecen a P02. |
| Máquina de estados `payment` | Ausente de `contracts/states.json` — hallazgo H-01 de P00. No se transcribe hasta que el contrato la incluya. |

## 5. Pruebas

14 pruebas unitarias en `packages/domain/src/states.test.ts`. No son un espejo del código: **leen `contracts/states.json` en tiempo de ejecución** y comparan contra las constantes del dominio. Si el contrato cambia y el dominio no, fallan.

Una de ellas vigila el hallazgo H-01: comprueba que el contrato siga teniendo exactamente seis máquinas. Cuando alguien añada `payment`, el test falla y obliga a transcribirla.

El resto cubre las transiciones de gestión (EVT-003, GOV-002), el motivo obligatorio en el cierre anticipado, y los predicados de GOV-003/GOV-004 sobre qué estados aceptan inscripciones y cuáles bloquean.

## 6. Notas de entorno

- **Docker verificado.** Con WSL2 y Docker Desktop 4.85.0 (server 29.6.2, Compose v5.3.1), `docker compose up -d` levanta los tres servicios y los tres reportan `healthy`. Puertos publicados solo en `127.0.0.1`.

  | Servicio | Estado | Comprobación |
  |---|---|---|
  | postgres 17 | healthy | `prisma migrate dev` conecta y sincroniza |
  | redis 7 | healthy | `redis-cli ping` → `PONG` |
  | minio | healthy | healthcheck `mc ready local` |

- `.env` local creado con secretos aleatorios de 48 caracteres, fuera del control de versiones. `packages/config` rechaza los valores `change-me` de `.env.example` y exige 32 caracteres mínimos en `SESSION_SECRET` y `RECEIPT_VERIFICATION_SECRET`.
- **Prisma 7 no carga `.env` por su cuenta** y ya no acepta `url` en `schema.prisma`. Ambos comportamientos se confirmaron contra la documentación oficial vía Context7, no por suposición: la configuración vive en `prisma.config.ts` con `import 'dotenv/config'` y `env('DATABASE_URL')`.
- `.claude/hooks/preflight.sh` sigue sin declararse en `settings.json` y depende de bash (hallazgo H-10 de P00). Su función la cubre hoy el paso de validación del CI.
- Prettier ignora `docs/`, `contracts/`, `prompts/` y `scripts/`: reformatearlos alteraría archivos cubiertos por `MANIFEST.sha256`.

## 7. Pendientes que arrastra P01

1. ~~Verificar `docker compose up`~~ — hecho, los tres servicios `healthy`.
2. ~~Regenerar `MANIFEST.sha256`~~ — hecho, 80/80 íntegros (H-08 cerrado).
3. ~~Cerrar H-01~~ — hecho: `payment` está en el contrato y en el dominio.
4. Cerrar H-02 a H-06 antes de P03/P05/P07. **H-05 y H-06 requieren decisión humana** sobre qué permisos deben existir.
5. Añadir Playwright y el primer smoke E2E en P02, cuando existan rutas reales que probar.
