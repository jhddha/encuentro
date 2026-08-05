'use client';

import { twoFactorClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

/**
 * Cliente de autenticación para componentes de navegador.
 *
 * Solo habla con `/api/auth/*`. No conoce permisos ni scopes: la autorización
 * se decide en servidor (ADR-010, regla 03-security-rbac), y lo que se muestre
 * u oculte en la interfaz nunca es la barrera de seguridad.
 */
export const authClient = createAuthClient({
  plugins: [twoFactorClient()],
});
