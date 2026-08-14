import importadas from './plan-de-cuentas.json';

/**
 * Plan de cuentas de la organización — DEC-018.
 *
 * Son las **226 cuentas imputables** del sistema contable que la organización
 * usa hoy, más seis que hacen falta y todavía no existen allá. Los códigos y
 * nombres salen de su plan; ninguno está inventado.
 *
 * `plan-de-cuentas.json` lo genera `scripts/importar_plan_contable.py` desde la
 * hoja que exporta su sistema. Se regenera cuando el plan cambie; no se edita a
 * mano, o la próxima importación se llevará el cambio por delante.
 *
 * POR QUÉ TODAS Y NO SOLO LAS QUE EL SISTEMA IMPUTA
 *
 * Más de la mitad —124 de 226— llevan la comisión dentro del nombre: «fondos
 * comis. hospedaje», «gastos comis. transporte». Es lo que se hace cuando el
 * sistema contable no tiene una dimensión de comisión: se abre una subcuenta
 * por cada una.
 *
 * `journal_entries` y `journal_lines` **tampoco la tienen**. Así que hoy la
 * cuenta es el único sitio donde esa dimensión puede vivir, y sin las 226 el
 * mayor del sistema no se podría cuadrar contra los libros reales. ACC-014 pide
 * que la comisión sea un eje propio; mientras no lo sea, esto es lo que hay.
 *
 * LA MONEDA FUNCIONAL ES EL BOLIVIANO
 *
 * Solo tres cuentas están en dólares, y las tres son cajas: son las únicas que
 * guardan dinero real en otra divisa. Ingresos, gastos y pasivos viven en
 * bolivianos; un cobro en dólares se convierte a la tasa congelada (DEC-009) y
 * la diferencia va a las cuentas de diferencia de cambio, que el plan ya tiene.
 *
 * No confundir con el origen del peregrino: «ofrenda peregrino nacional» e
 * «internacional» distinguen de dónde viene, no en qué moneda paga.
 */

export type Moneda = 'BOB' | 'USD';

export interface CuentaContable {
  readonly code: string;
  readonly name: string;
  /** Los cinco tipos del método contable estándar. */
  readonly kind: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';
  readonly currency: Moneda;
  readonly role: string | null;
  /** Cuenta que no existe en el plan de la organización y hay que abrir allá. */
  readonly nueva?: true;
}

/**
 * Cuentas que hacen falta y el plan actual no tiene.
 *
 * Numeradas siguiendo su esquema y colgando de cabeceras que ya existen vacías
 * —«fondos a rendir», «cuentas por pagar», «anticipos»—. **Están en el sistema
 * y todavía no en el plan contable**: hay que abrirlas allá para que los dos
 * coincidan.
 */
const NUEVAS: readonly CuentaContable[] = [
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
  {
    code: '112020001',
    name: 'Fondos a rendir servidores',
    kind: 'ASSET',
    currency: 'BOB',
    role: 'ADVANCES_TO_ACCOUNT_FOR',
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
  {
    code: '211100001',
    name: 'Cuentas por pagar generales',
    kind: 'LIABILITY',
    currency: 'BOB',
    role: 'ACCOUNTS_PAYABLE',
    nueva: true,
  },
  {
    code: '211110001',
    name: 'Anticipos de peregrinos',
    kind: 'LIABILITY',
    currency: 'BOB',
    role: 'PARTICIPANT_ADVANCES',
    nueva: true,
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
    /*
     * Inscripción de servidor — DEC-020.
     *
     * Cuelga del mismo grupo que las dos ofrendas de peregrino, `4110100xx`,
     * porque es lo mismo: ingreso por la inscripción de una persona. Y es una
     * cuenta aparte porque el módulo de servidores lo pide de forma explícita
     * —«para no mezclarse con los pagos de peregrinos»— y porque mezclarlos
     * haría que el ingreso por peregrinos dejara de ser comparable entre
     * gestiones.
     *
     * No se divide por origen como la ofrenda del peregrino: la organización
     * separa nacional de internacional por la nacionalidad de quien viene al
     * encuentro, y los servidores son de casa.
     */
    code: '411010003',
    name: 'Inscripción de servidor',
    kind: 'INCOME',
    currency: 'BOB',
    role: 'SERVER_REGISTRATION_REVENUE',
    nueva: true,
  },
];

/**
 * Qué cuenta del plan representa cada rol de DEC-018.
 *
 * Es la asignación que el contrato deja explícitamente a la organización. Una
 * cuenta sin rol es una cuenta normal del plan: existe, admite movimiento y
 * ningún asiento automático la elige.
 */
const ROL_POR_CODIGO: Readonly<Record<string, string>> = {
  '111010004': 'CASH_ON_HAND', // caja inscripciones M/N
  '111010005': 'CASH_ON_HAND', // caja inscripciones M/E
  '111020001': 'BANK_ACCOUNT', // BMSC — también recibe los cobros por QR
  '411010001': 'PILGRIM_OFFERING_DOMESTIC',
  '411010002': 'PILGRIM_OFFERING_INTERNATIONAL',
  '113010003': 'INVENTORY',
  '122010004': 'FIXED_ASSETS',
  '411020001': 'MONETARY_DONATION_REVENUE',
  '421030001': 'INVENTORY_SURPLUS',
  '611010008': 'OPERATING_EXPENSE',
  '611040001': 'PAYMENT_PROCESSING_FEES',
  '611060005': 'FOOD_AND_MATERIALS_EXPENSE',
  '621010003': 'RECONCILIATION_DIFFERENCES',
  '621010006': 'LOSS_AND_WASTE_EXPENSE',
};

export const PLAN_DE_CUENTAS: readonly CuentaContable[] = [
  ...importadas.map((cuenta): CuentaContable => ({
    code: cuenta.code,
    name: cuenta.name,
    kind: cuenta.kind as CuentaContable['kind'],
    currency: cuenta.currency as Moneda,
    role: ROL_POR_CODIGO[cuenta.code] ?? null,
  })),
  ...NUEVAS,
];

/** Roles de DEC-018 que quedan sin cuenta, con su motivo. */
export const ROLES_SIN_CUENTA: Readonly<Record<string, string>> = {
  QR_CLEARING:
    'Los cobros por QR se imputan directamente a la cuenta del BMSC, que ya tiene el rol ' +
    'BANK_ACCOUNT. No hay cuenta puente, y crear una que nadie concilia sería inventar ' +
    'movimiento. El resolutor de canales debe llevar el canal QR a BANK_ACCOUNT.',
  PAYMENT_GATEWAY_CLEARING: 'No hay pasarela de pago en v1 (DEC-015).',
};
