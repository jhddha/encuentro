# Scripts del paquete

- `validate_canonical_docs.py`: valida estructura, contratos, decisiones y trazabilidad de identificadores. Se ejecuta con `pnpm docs:validate` y forma parte del gate.
- `conceder-rol.mts`: concede o retira un rol a una cuenta ya registrada. `pnpm rol:conceder`.
- `configurar-smtp.mts`: registra las credenciales del servidor de correo saliente. `pnpm smtp:set`.
- `preparar-base-desechable.mts`: prepara la base de pruebas o la de recorrido. `pnpm db:test`, `pnpm db:e2e`.
- `load-test.mts`: prueba de carga. `pnpm test:load`.
- `rebuild_package_v2_7.py`: **generador histórico. No ejecutar.**

## Sobre `conceder-rol.mts`

```bash
pnpm rol:conceder <correo> <ROL> [CODIGO_GESTION] [--retirar]
```

Existe porque faltaba: **no había forma de que una persona real fuera administradora.** El seed crea `admin@encuentro.local` con `ADMIN_MASTER` global y a propósito **sin credencial** —una contraseña por defecto es una cuenta con acceso conocido en cualquier entorno donde el seed corra— y `dev-fixture.ts` solo concede `TESORERIA`. Entre las dos cosas, todo lo que vive detrás de `event.*` o `catalog.manage` quedaba fuera del alcance de cualquiera capaz de iniciar sesión: configuración de la gestión, catálogo, alta de gestiones y el registro de la tasa de cambio.

El ámbito lo fija el rol y no quien ejecuta: `ADMIN_MASTER` es global, `TESORERIA` e `INSCRIPCIONES` viven dentro de una gestión. Dejar elegir el ámbito permitiría conceder un rol global con forma de gestión, y `scopeCovers` decide a partir de esa columna.

No crea cuentas ni toca credenciales: la cuenta tiene que haber pasado por el registro real (DEC-013). Conceder y retirar están en la misma herramienta a propósito, porque el error aquí es dar de más y una herramienta que solo concede lo deja sin deshacer. Ambas operaciones dejan rastro en `audit_logs`.

**Queda una cuenta que nadie controla.** `admin@encuentro.local` conserva su asignación global de `ADMIN_MASTER` sin credencial con la que iniciar sesión. En desarrollo es inofensivo y sirve de marcador; antes de que el seed se ejecute en un entorno real conviene decidir si esa fila debe existir, porque es una asignación de administrador global colgando de una dirección que nadie ha reclamado.

## Sobre `rebuild_package_v2_7.py`

Construyó el paquete documental canónico el 22 de julio de 2026 y cumplió su función una vez. Desde la migración de la línea base v2.6, **el repositorio es la fuente de verdad y este script no lo es**.

Su contenido quedó congelado en julio, y la renumeración lo recorrió a ciegas sustituyendo identificadores dentro de las cadenas que escribe. Ejecutarlo devolvería `requirements.md` de 163 requisitos a unos 68, regeneraría los contratos con el conjunto viejo y sobrescribiría el propio validador dejándolo sin sus comprobaciones de trazabilidad. No tiene `main()`: todo ocurre al importar.

Este archivo decía antes «ejecútela únicamente en una copia o rama controlada y revise `git diff`». Esa frase presentaba como operación normal algo que destruye la línea base, así que el script ahora se niega a correr salvo con una bandera explícita que nombra lo que hace.
