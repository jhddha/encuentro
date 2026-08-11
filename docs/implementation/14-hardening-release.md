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

**Actualización del 7-ago-2026: `backup.sh` ya sube la copia fuera del VPS.**

Tres propiedades que se añadieron con ella:

- **`BACKUP_REMOTE_ENABLED` es obligatoria y no tiene valor por defecto.** Lo peligroso no es carecer de copia externa, sino creer que se tiene; un despliegue mal configurado no puede guardar solo en local sin que alguien lo haya decidido.
- **No se borra en local lo que no está confirmado fuera.** Sin esa comprobación, una subida fallida seguida del vencimiento de la retención perdería el respaldo en silencio.
- **El contenedor necesitó salida a Internet.** Estaba solo en la red `internal`, marcada `internal: true`, así que físicamente no podía subir nada. Se añadió una red `egress` sin puertos publicados: Postgres y Redis siguen incomunicados y solo Caddy publica puertos.

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

1. ~~**La subida del respaldo fuera del VPS no está implementada.**~~ **Implementada el 7-ago-2026.** Destino elegido: **Backblaze B2**, en un proveedor distinto al del VPS para que perder la cuenta de OVH no se lleve también los respaldos. El código es S3-compatible: cambiar de proveedor son variables de entorno. **Queda pendiente configurar las credenciales y ejecutar el primer ensayo con `restore-drill.sh --remote`**, que es lo que cierra DEC-012 de verdad.
2. ~~**El rol de la aplicación no debe ser propietario de las tablas.**~~ **Cerrado el 7-ago-2026** con [`deploy/db-roles.sql`](../../deploy/db-roles.sql). Verificado en el entorno local: con el rol anterior, `DELETE FROM audit_logs` se rechazaba con GOV-009 pero `TRUNCATE audit_logs` la vaciaba sin oposición. Con `encuentro_app`, los cinco intentos —truncar, borrar, alterar una tabla, eliminar un trigger— fallan, y la escritura legítima sigue funcionando.
3. ~~**No hay worker de expiración de `HELD`** (P06) ni worker de envío de correo (P13).~~ **Cerrado el 5-ago-2026** en [`16-background-workers.md`](16-background-workers.md): ambas colas existen, con pruebas unitarias, de integración y arranque real verificado.
4. **La imagen del worker pesa 1.49 GB** porque no se podan las dependencias de desarrollo: `pnpm prune --prod` rompe los enlaces internos del workspace. Se prefirió una imagen grande a un arranque que falle por un módulo ausente.
5. ~~**No se ha ejecutado prueba de carga.**~~ **Ejecutada el 7-ago-2026** con [`scripts/load-test.mts`](../../scripts/load-test.mts), contra la compilación de producción y los umbrales de `NFR-002`. Las cuatro rutas públicas medidas pasan con holgura:

   | Ruta | p50 | p97.5 | Umbral |
   |---|---:|---:|---:|
   | `/api/health` | 43 ms | 80 ms | 500 ms |
   | `/` | 113 ms | 156 ms | 500 ms |
   | `/e/ENC2026` | 105 ms | 140 ms | 500 ms |
   | `/e/ENC2026/inscripcion` | 123 ms | 167 ms | 500 ms |

   Se evalúa el **p97.5**, más estricto que el p95 que pide el requisito: si pasa aquel, este pasa por definición.

   **Dos salvedades.** La medición es sobre una máquina de desarrollo Windows con Postgres en Docker, no sobre el VPS: orienta, no certifica. Y **no cubre las mutaciones de `NFR-002` ni el escáner de `NFR-003`**, que exigen sesión autenticada y estación registrada; el propio script lo declara al terminar en vez de callarlo.
6. **Falta configurar el firewall del VPS y el acceso SSH restringido.** DEC-001 lo exige; es configuración del servidor, fuera de este repositorio.
7. ~~**El módulo contable no puede llevar contabilidad real** hasta que se defina el plan de cuentas.~~ **Cerrado el 7-ago-2026 por [DEC-018](../04-delivery/decisions/DEC-018.md)**: veintiún roles contables, tres resolvedores y una matriz de veintidós reglas. La organización debe asignar una cuenta a cada rol antes de contabilizar; sin eso el motor no resuelve ningún asiento.

## 8. Estado para el go/no-go

Según los criterios de `execution-plan.md` §6, **el veredicto sería no-go**, por dos motivos concretos y verificables:

- la restauración desde un respaldo externo no está ensayada porque el respaldo externo no existe todavía;
- quedan 120 requisitos de la v2.6 sin migrar, y con ellos módulos enteros sin reglas.

No es un juicio sobre la calidad de lo construido, sino la aplicación literal de los criterios que el propio plan define.

### Actualización del 7 de agosto de 2026

**El segundo motivo ya no aplica.** El documento fuente v2.6 apareció, los 198 requisitos de la línea base están clasificados uno a uno y el contrato declara 163. Ver [`requirement-migration-v2.6-to-current.md`](../04-delivery/requirement-migration-v2.6-to-current.md).

**El primero sigue en pie, pero cambió de naturaleza.** La subida externa ya está implementada; lo que falta son las credenciales de Backblaze B2 y ejecutar el primer `restore-drill.sh --remote`.

**El veredicto sigue siendo no-go**, ahora por causas distintas:

| Pendiente | Naturaleza |
|---|---|
| Primer ensayo de restauración desde el destino externo | Configuración: faltan credenciales |
| Firewall y SSH restringido del VPS | **Infraestructura: el VPS todavía no existe** |
| ~~Rol de aplicación no propietario de las tablas~~ | **Cerrado el 7-ago-2026**; ver §7.2 |
| ~~Prueba de carga~~ | **Ejecutada el 7-ago-2026**; ver §7.5 |
| Requisitos declarados y no construidos | Consecuencia de haber ampliado el contrato de 64 a 163 |

> Las dos filas tachadas seguían aquí como «trabajo pendiente, ejecutable hoy» mientras el §7 del mismo archivo, editado en el mismo commit, las daba por cerradas y verificadas. Quien evaluara el go/no-go por esta tabla habría reasignado trabajo ya hecho. Corregido el 8 de agosto de 2026.

Los dos primeros presuponen un servidor que aún no está aprovisionado. No son trabajo pendiente sino infraestructura pendiente, y conviene no confundirlos al planificar.

**Actualización del 5-ago-2026.** El pendiente 3 quedó cerrado (ver [`16-background-workers.md`](16-background-workers.md)). Sobre el segundo motivo del no-go, existe ahora un borrador de los 120 requisitos en [`requirements-candidates-v26.md`](../01-product/requirements-candidates-v26.md), **derivado y sin aprobar**: no cuenta como migración hasta que el responsable del proyecto lo revise. El veredicto sigue siendo **no-go**.
