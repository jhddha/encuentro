/**
 * Plan de cuentas de la organización — DEC-018.
 *
 * La decisión fija veintiún **roles** contables; qué cuenta representa cada rol
 * es «configuración de la organización», y así lo dice el propio contrato en
 * sus subdecisiones abiertas. Esto la cierra: los códigos y nombres salen del
 * plan que la organización usa hoy en su sistema contable, no de una
 * numeración inventada.
 *
 * DOS MONEDAS
 *
 * Los libros llevan bolivianos y dólares con **cuentas separadas** —«caja
 * moneda nacional» frente a «caja moneda extranjera»—, que es la práctica
 * habitual con divisas. Por eso un rol puede aparecer dos veces, una por
 * moneda, y por eso el índice único pasó a `(gestión, rol, moneda)`.
 *
 * El disparador `journal_line_must_match_entry` exige que la línea, su asiento
 * y su cuenta compartan moneda: es lo que impide imputar un cobro en dólares
 * contra la caja en bolivianos.
 *
 * LO QUE NO ESTÁ, Y POR QUÉ
 *
 * `QR_CLEARING` no tiene cuenta. La organización imputa los cobros por QR
 * directamente a su cuenta del BMSC, así que no existe cuenta puente. Crear una
 * duplicando el código del banco es imposible —`(gestión, código)` es único— y
 * duplicar la cuenta con otro código sería inventar una que nadie concilia. El
 * resolutor `FINANCIAL_ACCOUNT_BY_CHANNEL` debe llevar el canal QR a
 * `BANK_ACCOUNT`. Vacío deliberado, no olvido.
 *
 * `PAYMENT_GATEWAY_CLEARING` tampoco: no hay pasarela en v1 (DEC-015).
 */

export type Moneda = 'BOB' | 'USD';

export interface CuentaContable {
  readonly code: string;
  readonly name: string;
  /** Los cinco tipos del método contable estándar. */
  readonly kind: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';
  readonly currency: Moneda;
  readonly role: string | null;
  /** Cuenta que no existe en el plan actual y hay que abrir. */
  readonly nueva?: true;
}

export const PLAN_DE_CUENTAS = [
  // --- Disponible -----------------------------------------------------------
  {
    code: '111010004',
    name: 'Caja inscripciones moneda nacional',
    kind: 'ASSET',
    currency: 'BOB',
    role: 'CASH_ON_HAND',
  },
  {
    code: '111010005',
    name: 'Caja inscripciones moneda extranjera',
    kind: 'ASSET',
    currency: 'USD',
    role: 'CASH_ON_HAND',
  },
  {
    code: '111020001',
    name: 'BMSC 4011072765 M/N',
    kind: 'ASSET',
    currency: 'BOB',
    role: 'BANK_ACCOUNT',
  },
  {
    /*
     * En Bolivia no se maneja cuenta bancaria en dólares, así que los cobros en
     * moneda extranjera entran por una cuenta en Estados Unidos.
     */
    code: '111020006',
    name: 'MERU cuenta Estados Unidos M/E',
    kind: 'ASSET',
    currency: 'USD',
    role: 'BANK_ACCOUNT',
    nueva: true,
  },

  // --- Otros activos --------------------------------------------------------
  {
    code: '112020001',
    name: 'Fondos a rendir servidores',
    kind: 'ASSET',
    currency: 'BOB',
    role: 'ADVANCES_TO_ACCOUNT_FOR',
    nueva: true,
  },
  {
    code: '113010003',
    name: 'Productos del encuentro',
    kind: 'ASSET',
    currency: 'BOB',
    role: 'INVENTORY',
  },
  {
    /*
     * El rol es genérico y el plan tiene cinco subcuentas de activo fijo. Se
     * elige «equipos e instalaciones» por ser la más amplia; si la organización
     * prefiere otra, es cambiar esta línea.
     */
    code: '122010004',
    name: 'Equipos e instalaciones',
    kind: 'ASSET',
    currency: 'BOB',
    role: 'FIXED_ASSETS',
  },

  // --- Pasivo ---------------------------------------------------------------
  {
    code: '211110001',
    name: 'Anticipos de peregrinos',
    kind: 'LIABILITY',
    currency: 'BOB',
    role: 'PARTICIPANT_ADVANCES',
    nueva: true,
  },
  {
    code: '211110002',
    name: 'Anticipos de peregrinos M/E',
    kind: 'LIABILITY',
    currency: 'USD',
    role: 'PARTICIPANT_ADVANCES',
    nueva: true,
  },
  {
    code: '211100001',
    name: 'Cuentas por pagar generales',
    kind: 'LIABILITY',
    currency: 'BOB',
    role: 'ACCOUNTS_PAYABLE',
    nueva: true,
  },
  {
    code: '211090002',
    name: 'Reembolsos a servidores por pagar',
    kind: 'LIABILITY',
    currency: 'BOB',
    role: 'STAFF_REIMBURSEMENTS_PAYABLE',
    nueva: true,
  },

  // --- Ingresos -------------------------------------------------------------
  /*
   * Los tres conceptos —inscripción, hospedaje y transporte— van a la **misma**
   * ofrenda. Es la contabilidad que la organización lleva hoy: el peregrino no
   * paga una cuota por partidas, da una ofrenda; hospedaje y transporte son
   * gastos, no ingresos.
   *
   * La separación por concepto sigue existiendo **en el sistema**, en los
   * cargos, que es donde hace falta para cobrar y para el estado de cuenta. No
   * se traslada al libro. Por eso `LODGING_REVENUE` y `TRANSPORT_REVENUE` no
   * tienen cuenta y el resolutor `REVENUE_ROLE_BY_CONCEPT` debe llevar los tres
   * conceptos a `REGISTRATION_REVENUE`.
   */
  {
    code: '411010001',
    name: 'Ofrenda peregrino nacional',
    kind: 'INCOME',
    currency: 'BOB',
    role: 'REGISTRATION_REVENUE',
  },
  {
    code: '411010002',
    name: 'Ofrenda peregrino internacional',
    kind: 'INCOME',
    currency: 'USD',
    role: 'REGISTRATION_REVENUE',
  },
  {
    code: '411020001',
    name: 'Donaciones general para el encuentro',
    kind: 'INCOME',
    currency: 'BOB',
    role: 'MONETARY_DONATION_REVENUE',
  },
  {
    code: '411020005',
    name: 'Donaciones en especie',
    kind: 'INCOME',
    currency: 'BOB',
    role: 'IN_KIND_DONATION_REVENUE',
    nueva: true,
  },
  {
    code: '421030001',
    name: 'Sobrantes',
    kind: 'INCOME',
    currency: 'BOB',
    role: 'INVENTORY_SURPLUS',
  },

  // --- Egresos --------------------------------------------------------------
  {
    code: '611010008',
    name: 'Gastos generales',
    kind: 'EXPENSE',
    currency: 'BOB',
    role: 'OPERATING_EXPENSE',
  },
  {
    code: '611060005',
    name: 'Alimentación peregrino',
    kind: 'EXPENSE',
    currency: 'BOB',
    role: 'FOOD_AND_MATERIALS_EXPENSE',
  },
  {
    code: '621010006',
    name: 'Faltantes',
    kind: 'EXPENSE',
    currency: 'BOB',
    role: 'LOSS_AND_WASTE_EXPENSE',
  },
  {
    code: '611040001',
    name: 'Gastos bancarios y comisiones',
    kind: 'EXPENSE',
    currency: 'BOB',
    role: 'PAYMENT_PROCESSING_FEES',
  },
  {
    /*
     * El plan parte la diferencia en dos —`421010002` cuando es a favor y
     * `621010003` cuando es en contra— y eso es más correcto que una sola
     * cuenta: un abono a una cuenta de gasto se lee mal en un mayor. El rol
     * apunta al gasto, que es el caso que el sistema produce al conciliar caja.
     */
    code: '621010003',
    name: 'Diferencia por redondeo',
    kind: 'EXPENSE',
    currency: 'BOB',
    role: 'RECONCILIATION_DIFFERENCES',
  },

  // --- Diferencia de cambio -------------------------------------------------
  /*
   * No son roles de DEC-018 y hacen falta igual: cobrar en dólares una gestión
   * cuyos libros son en bolivianos produce diferencia de cambio en cuanto la
   * tasa se mueve entre la carga de la evidencia y su liquidación. Se siembran
   * sin rol para que existan cuando el motor de la fase 11 las necesite.
   */
  {
    code: '421010001',
    name: 'Diferencia de cambio (ingreso)',
    kind: 'INCOME',
    currency: 'BOB',
    role: null,
  },
  {
    code: '621010002',
    name: 'Diferencia de cambio (gasto)',
    kind: 'EXPENSE',
    currency: 'BOB',
    role: null,
  },
] as const satisfies readonly CuentaContable[];

/** Roles de DEC-018 que quedan sin cuenta, con su motivo. */
export const ROLES_SIN_CUENTA: Readonly<Record<string, string>> = {
  QR_CLEARING:
    'Los cobros por QR se imputan directamente a la cuenta del BMSC. El resolutor de canales ' +
    'debe llevar el canal QR a BANK_ACCOUNT en vez de a una cuenta puente que nadie concilia.',
  PAYMENT_GATEWAY_CLEARING: 'No hay pasarela de pago en v1 (DEC-015).',
  LODGING_REVENUE:
    'El hospedaje no es un ingreso en este plan: el peregrino da una ofrenda y el hospedaje es ' +
    'un gasto. El resolutor por concepto lleva el cargo a REGISTRATION_REVENUE.',
  TRANSPORT_REVENUE: 'Mismo motivo que el hospedaje.',
};
