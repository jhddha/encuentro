# P14–P15 — Hardening, respaldos y release

**Fecha:** 5 de agosto de 2026
**Alcance:** DEC-001 (infraestructura) y DEC-012 (RPO 1 h / RTO 4 h).

## ⚠ Lo que esta entrega NO hace

**No se desplegó nada.** No se tocó el VPS, no se subió ninguna imagen a ningún registro, no se configuró ningún dominio. Esta fase produce **configuración y procedimientos**, verificados en local. El despliegue lo ejecuta el responsable del proyecto con sus propias credenciales, cuando haya revisado lo que aquí se entrega.

## 1. Gate ejecutado

| Paso | Exit |
|---|---:|
| Validador · Formato · Lint · Typecheck | 0 |
| Unitarias — 273 · Integración — 102 · Accesibilidad — 165 | 0 |
| Build | 0 |
| **`docker build` de ambas imágenes** | 0 |
| **Arranque real de la imagen de producción** | health `ok`, landing `200` |

Las imágenes se construyeron y la de web se ejecutó contra el Postgres real, no solo se escribió el Dockerfile. Después se eliminaron; los contenedores de desarrollo siguen intactos.

## 2. Tres defectos reales encontrados al construir las imágenes

Escribir el despliegue obligó a ejecutar el código en condiciones que el desarrollo local nunca reproduce. Aparecieron tres problemas que habrían bloqueado el primer despliegue:

### El handler de autenticación exigía secretos en tiempo de build

`route.ts` llamaba a `auth()` en tiempo de módulo, así que `next build` fallaba con «Falta la variable de entorno SESSION_SECRET». Eso obligaría a meter secretos de producción en la imagen para poder compilarla.

**Los secretos pertenecen al entorno de ejecución, no al artefacto.** Se cambió a construcción por petición.

### Faltaba `.dockerignore`

`COPY . .` arrastraba el `node_modules` del host y pnpm abortaba al detectar que el directorio no coincidía con el lockfile. El error (`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`) no decía nada de eso.

### `apps/web/public` no existía

El `Dockerfile` lo copiaba porque Next lo espera. Se creó con un `robots.txt` que además cubre algo real: **las URL de verificación de comprobante contienen un token**, y un buscador que las recorra las deja indexadas.

## 3. Aislamiento de red — DEC-001

La regla que gobierna `docker-compose.prod.yml`: **PostgreSQL y Redis no llevan `ports:`**. Solo existen en la red `internal`, que está marcada `internal: true` y por tanto sin salida a Internet.

Los únicos puertos publicados en todo el sistema son el 80 y el 443 de Caddy, que es el único servicio en la red `edge`.

Todas las variables de entorno críticas usan `${VAR:?falta VAR}`: el compose **falla al arrancar** si falta una, en vez de levantar un contenedor a medio configurar.

## 4. Respaldo cifrado — DEC-012

`backup.sh` corre cada hora (RPO 1 h). Dos propiedades deliberadas:

- **El volcado se cifra antes de tocar el disco.** `pg_dump` va por tubería directa a `gpg`; nunca existe un fichero con datos personales en claro, ni transitoriamente.
- **Un fallo elimina el fichero parcial.** Un volcado truncado que parezca válido es peor que no tener respaldo, porque nadie lo revisa hasta que hace falta.

Avisa además si el respaldo pesa menos de 1 KB: eso suele ser un volcado vacío por credenciales incorrectas.

**Lo que `backup.sh` NO hace: subir la copia fuera del VPS.** Depende del proveedor de almacenamiento externo. **Sin ese paso DEC-012 no está cumplida** — una copia en el mismo servidor no protege contra la pérdida del servidor. Está dicho en el propio script y en el runbook.

## 5. El ensayo de restauración

DEC-012 exige que la restauración se ensaye, no solo que se configure. `restore-drill.sh` restaura sobre una base **desechable** y comprueba que los datos siguen siendo utilizables.

Restaurar sin errores no basta: **el volcado de una base vacía también restaura sin errores**. Por eso el ensayo verifica:

- que existen las tablas críticas;
- que **los triggers de inmutabilidad viajaron con el volcado** — si se perdieran, la base restaurada aceptaría reescribir el histórico financiero;
- que ningún comprobante quedó huérfano de su pago;
- que **todos los asientos siguen cuadrando** tras la restauración.

Nunca toca la base productiva. Un ensayo que pueda destruir producción no se ejecuta nunca por miedo, y uno que no se ejecuta no sirve para nada.

## 6. Runbooks — P15

En [`docs/04-delivery/runbooks.md`](../04-delivery/runbooks.md). Ocho procedimientos escritos para leerse bajo presión: despliegue, vuelta atrás, restauración, restablecimiento de MFA, caída de SMTP, sospecha de compromiso, cierre del evento y comprobaciones diarias.

Tres avisos que conviene destacar:

- **Volver atrás el código no deshace una migración.** Si el despliegue incluía una migración destructiva, revertir no recupera los datos. De ahí que el runbook exija respaldo verificado antes.
- **Tras restaurar, reconcilie contra los comprobantes físicos antes de reabrir cajas.** Hasta una hora de cobros puede haberse perdido; seguir cobrando sin reconciliar produce duplicados.
- **No rote `BACKUP_PASSPHRASE` sin conservar la anterior.** Los respaldos ya escritos siguen cifrados con la clave vieja.

## 7. Riesgos y pendientes antes de un go/no-go

1. **La subida del respaldo fuera del VPS no está implementada.** Es el requisito central de DEC-012 y depende de elegir proveedor. **Sin esto no hay go.**
2. **El rol de la aplicación no debe ser propietario de las tablas.** Es la mitigación pendiente desde P03: `TRUNCATE` esquiva los triggers append-only, y solo el propietario puede ejecutarlo.
3. **No hay worker de expiración de `HELD`** (P06) ni worker de envío de correo (P13). Ambos son procesos que el despliegue asume existentes.
4. **La imagen del worker pesa 1.49 GB** porque no se podan las dependencias de desarrollo: `pnpm prune --prod` rompe los enlaces internos del workspace. Se prefirió una imagen grande a un arranque que falle por un módulo ausente.
5. **No se ha ejecutado prueba de carga.** El prompt P14 la pide y no se hizo.
6. **Falta configurar el firewall del VPS y el acceso SSH restringido.** DEC-001 lo exige; es configuración del servidor, fuera de este repositorio.
7. **El módulo contable no puede llevar contabilidad real** hasta que se defina el plan de cuentas (ver informe de P12).

## 8. Estado para el go/no-go

Según los criterios de `execution-plan.md` §6, **el veredicto sería no-go**, por dos motivos concretos y verificables:

- la restauración desde un respaldo externo no está ensayada porque el respaldo externo no existe todavía;
- quedan 120 requisitos de la v2.6 sin migrar, y con ellos módulos enteros sin reglas.

No es un juicio sobre la calidad de lo construido, sino la aplicación literal de los criterios que el propio plan define.
