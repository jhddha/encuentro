# Scripts del paquete

- `validate_canonical_docs.py`: valida estructura, contratos, decisiones y trazabilidad de identificadores. Se ejecuta con `pnpm docs:validate` y forma parte del gate.
- `load-test.mts`: prueba de carga. `pnpm test:load`.
- `rebuild_package_v2_7.py`: **generador histórico. No ejecutar.**

## Sobre `rebuild_package_v2_7.py`

Construyó el paquete documental canónico el 22 de julio de 2026 y cumplió su función una vez. Desde la migración de la línea base v2.6, **el repositorio es la fuente de verdad y este script no lo es**.

Su contenido quedó congelado en julio, y la renumeración lo recorrió a ciegas sustituyendo identificadores dentro de las cadenas que escribe. Ejecutarlo devolvería `requirements.md` de 163 requisitos a unos 68, regeneraría los contratos con el conjunto viejo y sobrescribiría el propio validador dejándolo sin sus comprobaciones de trazabilidad. No tiene `main()`: todo ocurre al importar.

Este archivo decía antes «ejecútela únicamente en una copia o rama controlada y revise `git diff`». Esa frase presentaba como operación normal algo que destruye la línea base, así que el script ahora se niega a correr salvo con una bandera explícita que nombra lo que hace.
