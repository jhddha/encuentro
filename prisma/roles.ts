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
    ],
  },
] as const;
