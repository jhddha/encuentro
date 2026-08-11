"""Importa el plan de cuentas de la organización a `prisma/plan-de-cuentas.json`.

El plan vive en el sistema contable de la organización y se exporta a una hoja
de cálculo con cuatro columnas: marcador de nivel, código, nombre y naturaleza
deudora o acreedora. Este script toma las cuentas **imputables** —las marcadas
`S`— y las deja en un JSON que el seed siembra por gestión.

Las cabeceras (`G`, `R`, `T`, `C`) se descartan: no admiten movimiento y el
esquema no tiene jerarquía de cuentas.

QUÉ SE DEDUCE Y QUÉ SE COMPRUEBA

El tipo contable sale del primer dígito del código, que es la convención del
propio plan (1 activo, 2 pasivo, 3 patrimonio, 4 ingresos, 5 costos, 6 egresos).
Deducirlo del código y no de la cabecera es deliberado: en el fichero hay
cuentas colgando del padre equivocado, y el código es el dato fiable.

La naturaleza declarada se usa como **comprobación cruzada**: una cuenta deudora
tiene que ser activo, costo o egreso; una acreedora, pasivo, patrimonio o
ingreso. Cualquier discrepancia se reporta en vez de escribirse.

La moneda no está en el fichero: va en el nombre. Se asigna la moneda funcional
salvo que el nombre diga «moneda extranjera» o «M/E».

Uso:
    python scripts/importar_plan_contable.py <ruta.xlsx>

Requiere `openpyxl` (`pip install openpyxl`).
"""

from __future__ import annotations

import json
import re
import sys
import unicodedata
from pathlib import Path

try:
    import openpyxl
except ModuleNotFoundError:  # pragma: no cover - mensaje para quien lo ejecute
    sys.exit("Falta openpyxl. Instálelo con: pip install openpyxl")

DESTINO = Path(__file__).resolve().parent.parent / "prisma" / "plan-de-cuentas.json"

MONEDA_FUNCIONAL = "BOB"
MONEDA_EXTRANJERA = "USD"

GRUPOS = {
    "1": ("ASSET", "DEUDOR"),
    "2": ("LIABILITY", "ACREEDOR"),
    "3": ("EQUITY", "ACREEDOR"),
    "4": ("INCOME", "ACREEDOR"),
    "5": ("EXPENSE", "DEUDOR"),
    "6": ("EXPENSE", "DEUDOR"),
}

# Errata del plan de origen: «caja comisión inscripciones moneda nacional» y
# «…moneda extranjera» comparten el código 111010006, y `(gestión, código)` es
# único. La organización confirmó 111010007 como el siguiente libre.
RENUMERADAS = {("111010006", "MONEDA EXTRANJERA"): "111010007"}

MARCAS_EXTRANJERA = ("MONEDA EXTRANJERA", "M/E")

# Siglas reales del plan. Se listan en vez de detectarlas por «va en mayúsculas»,
# porque el fichero entero está en mayúsculas sostenidas y esa heurística deja
# «CAJA» y «FONDOS» como si fueran acrónimos.
SIGLAS = {
    "BMSC", "BNB", "ITF", "QR", "TV", "CTA", "NRO", "M/N", "M/E", "IVA", "IT",
}


def sin_acentos(texto: str) -> str:
    """Compara nombres sin depender de cómo sobrevivieron los acentos."""
    return "".join(
        c for c in unicodedata.normalize("NFD", texto.upper()) if unicodedata.category(c) != "Mn"
    )


def titular(nombre: str) -> str:
    """MAYÚSCULAS SOSTENIDAS a capitalización de frase, respetando siglas y códigos."""
    palabras = []

    for indice, palabra in enumerate(nombre.split()):
        desnudo = palabra.strip(".,()")

        if desnudo.upper() in SIGLAS or any(c.isdigit() for c in palabra):
            palabras.append(palabra.upper() if desnudo.upper() in SIGLAS else palabra)
        elif indice == 0:
            palabras.append(palabra.capitalize())
        else:
            palabras.append(palabra.lower())

    return " ".join(palabras)


def leer(ruta: Path) -> tuple[list[dict[str, str]], list[str]]:
    hoja = openpyxl.load_workbook(ruta, data_only=True)["Sheet1"]

    cuentas: list[dict[str, str]] = []
    avisos: list[str] = []
    vistos: dict[str, str] = {}

    for numero, fila in enumerate(hoja.iter_rows(min_row=2, values_only=True), start=2):
        celdas = [("" if c is None else str(c).strip()) for c in fila]
        celdas = [c for c in celdas if c != ""]

        if not celdas:
            continue

        # Una fila del plan perdió su marcador de nivel; se reconoce por el
        # código de nueve dígitos, que solo tienen las imputables.
        if celdas[0] not in ("G", "R", "T", "C", "S"):
            if not re.fullmatch(r"\d{9}", celdas[0]):
                continue
            celdas = ["S", *celdas]
            avisos.append(f"fila {numero}: sin marcador de nivel, tratada como imputable")

        if celdas[0] != "S":
            continue

        codigo, nombre = celdas[1], celdas[2]
        naturaleza = celdas[3] if len(celdas) > 3 else ""

        if not re.fullmatch(r"\d{9}", codigo):
            avisos.append(f"fila {numero}: código «{codigo}» no tiene nueve dígitos, omitida")
            continue

        grupo = GRUPOS.get(codigo[0])
        if grupo is None:
            avisos.append(f"fila {numero}: el código «{codigo}» no empieza por un grupo conocido")
            continue

        kind, esperada = grupo

        if naturaleza and naturaleza != esperada:
            avisos.append(
                f"{codigo} «{nombre}»: declarada {naturaleza} y su grupo exige {esperada}"
            )

        limpio = sin_acentos(nombre)
        for (duplicado, marca), nuevo in RENUMERADAS.items():
            if codigo == duplicado and marca in limpio:
                avisos.append(f"{codigo} «{nombre}»: renumerada a {nuevo} por código duplicado")
                codigo = nuevo

        if codigo in vistos:
            avisos.append(f"{codigo} «{nombre}»: duplica a «{vistos[codigo]}», omitida")
            continue

        vistos[codigo] = nombre

        moneda = (
            MONEDA_EXTRANJERA
            if any(marca in limpio for marca in MARCAS_EXTRANJERA)
            else MONEDA_FUNCIONAL
        )

        cuentas.append(
            {"code": codigo, "name": titular(nombre), "kind": kind, "currency": moneda}
        )

    cuentas.sort(key=lambda c: c["code"])
    return cuentas, avisos


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit("Uso: python scripts/importar_plan_contable.py <ruta.xlsx>")

    cuentas, avisos = leer(Path(sys.argv[1]))

    DESTINO.write_text(json.dumps(cuentas, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    extranjeras = sum(1 for c in cuentas if c["currency"] == MONEDA_EXTRANJERA)
    print(f"{len(cuentas)} cuentas imputables -> {DESTINO.relative_to(DESTINO.parents[1])}")
    print(f"  {extranjeras} en {MONEDA_EXTRANJERA}, el resto en {MONEDA_FUNCIONAL}")

    if avisos:
        print(f"\n{len(avisos)} avisos:")
        for aviso in avisos:
            print(f"  - {aviso}")


if __name__ == "__main__":
    main()
