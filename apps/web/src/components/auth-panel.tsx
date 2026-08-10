'use client';

import { Card, PageHeader } from '@encuentro/ui';
import { useEffect, useRef, useState } from 'react';

import { SignInForm } from './sign-in-form';
import { SignUpForm } from './sign-up-form';

/**
 * Acceso y alta en la misma pantalla — IAM-011.
 *
 * El alta vive aquí y no en una ruta propia porque `contracts/routes.json`
 * declara treinta y una rutas exactas y una prueba rechaza cualquier página
 * fuera del contrato. Añadir `/registro` sería un cambio de contrato; `/ingresar`
 * ya es la superficie pública de identidad y da cabida a las dos cosas.
 *
 * El encabezado cambia con el modo, así que vive en este componente: una página
 * necesita exactamente un `h1`, y dejarlo fijo en «Ingresar» mientras el
 * formulario pide crear una cuenta contaría otra cosa a quien navega por
 * encabezados.
 */
export function AuthPanel() {
  const [creating, setCreating] = useState(false);
  const firstField = useRef<HTMLInputElement>(null);
  const mounted = useRef(false);

  /*
   * El foco se mueve al primer campo del formulario que aparece. Sin esto, con
   * teclado o lector de pantalla el foco se queda en el botón que acaba de
   * desaparecer y el cambio pasa inadvertido (WCAG 2.4.3).
   *
   * En un efecto y no dentro del manejador: `requestAnimationFrame` desde el
   * `onClick` se ejecuta **antes** de que React monte el campo nuevo, así que el
   * `ref` todavía apunta al del formulario anterior o a nada. Comprobado en el
   * navegador, no supuesto: el foco se quedaba en el botón.
   *
   * El primer render se salta a propósito: robar el foco al cargar la página
   * movería el punto de partida de quien llega con teclado.
   */
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }

    firstField.current?.focus();
  }, [creating]);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6">
      {/*
        `exactOptionalPropertyTypes` está activo: pasar `description={undefined}`
        no es lo mismo que no pasarla, así que se elige el elemento entero.
      */}
      {creating ? (
        <PageHeader
          title="Crear cuenta"
          description="Necesita una cuenta para inscribirse y para consultar sus pagos."
        />
      ) : (
        <PageHeader title="Ingresar" />
      )}

      <Card>
        {creating ? (
          <SignUpForm firstFieldRef={firstField} />
        ) : (
          <SignInForm firstFieldRef={firstField} />
        )}
      </Card>

      <p className="text-center text-sm">
        {creating ? '¿Ya tiene cuenta? ' : '¿Todavía no tiene cuenta? '}
        <button
          type="button"
          onClick={() => {
            setCreating(!creating);
          }}
          className="min-h-[var(--size-touch-target)] underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)]"
        >
          {creating ? 'Ingresar' : 'Crear una'}
        </button>
      </p>
    </div>
  );
}
