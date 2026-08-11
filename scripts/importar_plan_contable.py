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

RAIZ = Path(__file__).resolve().parent.parent
DESTINO = RAIZ / "prisma" / "plan-de-cuentas.json"
DESTINO_COMISIONES = RAIZ / "prisma" / "comisiones.json"

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

# El plan agrupa las comisiones por área en sus cabeceras: «fondos recibidos en
# area espiritualidad», «gastos comisiones area logistica». El área se lee de
# ahí porque no está en ninguna otra parte.
AREA_APOYO = "COMISIONES DE APOYO"

# El plan escribe dos veces la misma comisión con una errata de por medio.
COMISIONES_UNIFICADAS = {"PRESENTACI{ON DE TALLERES": "PRESENTACION DE TALLERES"}

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


def codigo_de_comision(nombre: str) -> str:
    """Código estable a partir del nombre. El plan no los tiene."""
    limpio = re.sub(r"[^A-Z0-9]+", "_", sin_acentos(nombre)).strip("_")
    return limpio[:40]


def leer(ruta: Path) -> tuple[list[dict[str, str]], list[str], list[dict[str, str]]]:
    hoja = openpyxl.load_workbook(ruta, data_only=True)["Sheet1"]

    cuentas: list[dict[str, str]] = []
    avisos: list[str] = []
    vistos: dict[str, str] = {}
    comisiones: dict[str, tuple[str, str]] = {}
    area_actual = ""

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

        if celdas[0] == "C" and len(celdas) > 2:
            cabecera = sin_acentos(celdas[2])
            despues = re.search(r"\bAREA\s+(.+)$", cabecera)
            if despues is not None:
                area_actual = despues.group(1).strip()
            elif AREA_APOYO in cabecera:
                area_actual = AREA_APOYO
            else:
                area_actual = ""

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

        # El nombre se saca del original, no de la version normalizada: esta
        # sirve para reconocer el patron y aquella conserva los acentos.
        patron = r"\bCOMIS\.?\s+(.+)$"
        de_comision = re.search(patron, nombre, re.IGNORECASE)

        if de_comision is not None and area_actual:
            nombre_comision = de_comision.group(1).strip()
            clave = sin_acentos(nombre_comision)
            clave = COMISIONES_UNIFICADAS.get(clave, clave)
            # El area se toma de la primera cabecera donde aparece: las tres
            # familias de cuentas -fondos, donaciones y gastos- repiten la
            # misma comision bajo la misma area.
            comisiones.setdefault(clave, (nombre_comision, area_actual))

    cuentas.sort(key=lambda c: c["code"])

    lista = [
        {"code": codigo_de_comision(clave), "name": titular(nombre), "area": titular(area)}
        for clave, (nombre, area) in sorted(comisiones.items())
    ]

    return cuentas, avisos, lista


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit("Uso: python scripts/importar_plan_contable.py <ruta.xlsx>")

    cuentas, avisos, comisiones = leer(Path(sys.argv[1]))

    DESTINO.write_text(json.dumps(cuentas, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    DESTINO_COMISIONES.write_text(
        json.dumps(comisiones, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    extranjeras = sum(1 for c in cuentas if c["currency"] == MONEDA_EXTRANJERA)
    print(f"{len(cuentas)} cuentas imputables -> {DESTINO.relative_to(DESTINO.parents[1])}")
    print(f"  {extranjeras} en {MONEDA_EXTRANJERA}, el resto en {MONEDA_FUNCIONAL}")
    print(f"{len(comisiones)} comisiones -> {DESTINO_COMISIONES.name}")

    if avisos:
        print(f"\n{len(avisos)} avisos:")
        for aviso in avisos:
            print(f"  - {aviso}")


if __name__ == "__main__":
    main()
