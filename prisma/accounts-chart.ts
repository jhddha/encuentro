/**
 * Plan de cuentas de la organización — DEC-018.
 *
 * La decisión fija veintiún **roles** contables; qué cuenta representa cada rol
 * es «configuración de la organización», y así lo dice el propio contrato en
 * sus subdecisiones abiertas. Esto la cierra: los códigos y nombres salen del
 * plan que la organización usa hoy en su sistema contable, no de una
 * numeración inventada.
 *
 * LA MONEDA FUNCIONAL ES EL BOLIVIANO
 *
 * Los libros se llevan en bolivianos. Solo **caja y bancos** aparecen por
 * duplicado, una cuenta por divisa, porque son los únicos que guardan dinero
 * real en cada una — es lo que hace su plan con «caja moneda nacional» y «caja
 * moneda extranjera». Ingresos, gastos y pasivos viven en bolivianos: un cobro
 * en dólares se convierte a la tasa congelada (DEC-009) y la diferencia va a
 * `421010001` o `621010002`.
 *
 * Confundir los dos ejes es fácil y caro: «ofrenda peregrino nacional» e
 * «internacional» distinguen el **origen del peregrino**, no la moneda. Un
 * peregrino nacional puede pagar en dólares. La primera versión de este fichero
 * las mapeó a BOB y USD, y estaba mal.
 *
 * El disparador `journal_line_must_match_entry` exige que la línea, su asiento
 * y su cuenta compartan moneda: es lo que impide imputar un cobro en dólares
 * contra la caja en bolivianos.
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
   * LAS DOS OFRENDAS ESTÁN SEMBRADAS Y SIN ROL, A PROPÓSITO.
   *
   * La organización imputa la ofrenda a una cuenta o a otra **según la
   * nacionalidad del peregrino**. Hospedaje y transporte no son ingresos
   * aparte: forman parte de la inscripción y no se separan en el libro.
   *
   * Eso deja el contrato de DEC-018 desalineado en dos sentidos. Tiene tres
   * roles de ingreso donde hacen falta dos, y los suyos discriminan por
   * concepto donde aquí se discrimina por origen. Mientras no se resuelva,
   * `REGISTRATION_REVENUE` se queda **sin cuenta**: asignárselo a la nacional
   * mandaría en silencio las ofrendas internacionales a la cuenta equivocada, y
   * un motor que falla es preferible a un mayor que miente.
   *
   * La corrección propuesta —partir el rol en dos y retirar los de hospedaje y
   * transporte— toca `contracts/accounting-rules.json`, que es fuente de verdad
   * de una decisión aprobada. Espera autorización explícita.
   */
  {
    code: '411010001',
    name: 'Ofrenda peregrino nacional',
    kind: 'INCOME',
    currency: 'BOB',
    role: null,
  },
  {
    code: '411010002',
    name: 'Ofrenda peregrino internacional',
    kind: 'INCOME',
    currency: 'BOB',
    role: null,
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
  REGISTRATION_REVENUE:
    'La organización imputa la ofrenda según la nacionalidad del peregrino, y el contrato tiene ' +
    'un solo rol. Asignárselo a la cuenta nacional mandaría las ofrendas internacionales a la ' +
    'cuenta equivocada sin que nada lo dijera. Espera partir el rol en dos.',
  LODGING_REVENUE:
    'El hospedaje no es un ingreso aparte: forma parte de la inscripción y no se separa en el ' +
    'libro. El rol sobra en este plan.',
  TRANSPORT_REVENUE: 'Mismo motivo que el hospedaje.',
};
