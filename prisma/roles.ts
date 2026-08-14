/**
 * Definición de los roles y sus permisos.
 *
 * Vive aparte del seed porque lo necesitan dos consumidores: `prisma/seed.ts`,
 * que prepara el entorno de desarrollo, y la siembra del recorrido
 * automatizado. Duplicarlo dejaría dos matrices de permisos que se separan en
 * silencio, y la que se quedara vieja haría pasar pruebas de autorización que
 * no demuestran nada.
 *
 * Los permisos salen de `contracts/permissions.json`. Añadir uno aquí sin
 * añadirlo allí es una divergencia de contrato, no una decisión de código.
 */
export const ROLES = [
  {
    code: 'ADMIN_MASTER',
    name: 'Administrador maestro',
    scopeType: 'GLOBAL' as const,
    permissions: [
      'event.create',
      'event.read',
      'event.update',
      'event.transition',
      'event.close',
      'audit.read',
      'catalog.read',
      'catalog.manage',
      'registration.read',
      'payment.read',
      /*
       * La tasa de cambio la registra tesorería, y también quien administra:
       * la organización lo pidió así el 14 de agosto de 2026. Es un permiso
       * propio y no `event.update` porque ese autoriza además renombrar la
       * gestión y cambiar su moneda funcional.
       */
      'accounting.exchange_rate.manage',
      /*
       * Hospedaje, mientras no exista su comisión.
       *
       * `lodging.read` y `lodging.assign_room` los llevaría un rol HOSPEDAJE
       * propio; crearlo es una decisión sobre cómo se organiza el equipo y no
       * la toma el código. Sin esto la pantalla de hospedaje nace inalcanzable
       * —ningún rol la abre—, que es el mismo defecto que dejó al sistema sin
       * administrador hasta el 14 de agosto de 2026.
       *
       * **`lodging.override_capacity` no está aquí a propósito.** HOS-006 la
       * trata como una excepción con motivo registrado; repartirla por omisión
       * la convertiría en el camino normal.
       */
      'lodging.read',
      'lodging.assign_room',
    ],
  },
  {
    code: 'INSCRIPCIONES',
    name: 'Comisión de inscripciones',
    scopeType: 'EVENT' as const,
    permissions: [
      'event.read',
      'catalog.read',
      'catalog.private.assign',
      'registration.read',
      'registration.create',
      'registration.update',
    ],
  },
  {
    code: 'TESORERIA',
    name: 'Comisión de tesorería',
    scopeType: 'EVENT' as const,
    /*
     * Quien revisa evidencias necesita leer la inscripción para entender el
     * cargo, y emitir el comprobante que la aprobación produce. No lleva
     * `payment.adjust` ni `receipt.void`: corregir un pago ya aprobado es otra
     * operación y debe exigir otra autorización (GOV-005, PAY-033).
     */
    permissions: [
      'event.read',
      'registration.read',
      'payment.read',
      'payment.proof.review',
      'receipt.issue',
      'receipt.read',
      /*
       * Registrar la tasa del día. Es trabajo de tesorería: sin ella no se
       * puede aceptar un cobro en moneda extranjera, y quien revisa esos
       * comprobantes es quien sabe a cuánto se cotizó.
       */
      'accounting.exchange_rate.manage',
    ],
  },
] as const;
