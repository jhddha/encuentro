'use client';

import { EVIDENCE_CONTENT_TYPES, EVIDENCE_MAX_BYTES } from '@encuentro/domain';
import { Button, MICROCOPY } from '@encuentro/ui';
import { useRef, useState, useTransition, type SyntheticEvent } from 'react';

import { resubmitProofAction, submitProofAction } from './actions';

/**
 * Formulario de carga de evidencia — PAY-018.
 *
 * Los siete datos que pide son exactamente los que el requisito enumera: monto,
 * moneda, fecha, banco o plataforma, referencia, pagador y archivo. La moneda no
 * es un campo editable, y el banco no es texto libre sino el canal (PAY-023):
 * dejarlos escribir produciría evidencias que el revisor no puede cuadrar contra
 * ninguna cuenta.
 *
 * **La moneda es la del canal elegido, no la de la gestión.** Estaba fija en la
 * de la gestión, así que al elegir la cuenta de Estados Unidos el rótulo seguía
 * diciendo bolivianos sobre un campo en el que se teclean dólares. No era solo
 * el rótulo: la acción construía el importe con esa misma moneda y el dominio lo
 * rechazaba por no casar con el canal. El cobro internacional no se podía
 * declarar.
 *
 * El envío pasa por una acción de servidor con `FormData` en vez de subir el
 * archivo aparte. Así el archivo solo se guarda si el resto de la declaración es
 * aceptable, y un rechazo no deja objetos huérfanos en el almacén.
 */

export interface ChannelOption {
  readonly id: string;
  readonly code: string;
  readonly currency: string;
  readonly instructions: string | null;
}

const CHANNEL_LABEL: Readonly<Record<string, string>> = {
  BOLIVIA_QR_MANUAL: 'QR Simple — Bolivia',
  US_ACCOUNT_MANUAL: 'Transferencia a cuenta — Estados Unidos',
  US_PAYMENT_LINK_MANUAL: 'Enlace de pago — Estados Unidos',
};

/**
 * Filtra el diálogo del sistema; no sustituye la validación.
 *
 * Se construye desde `EVIDENCE_CONTENT_TYPES` para que no se desincronice de la
 * lista blanca que aplican el dominio y el almacén.
 */
const ACCEPT = EVIDENCE_CONTENT_TYPES.join(',');

const MAX_BYTES = EVIDENCE_MAX_BYTES;

export function ProofUploadForm({
  eventCode,
  currency,
  channels,
  today,
  correction,
}: {
  readonly eventCode: string;
  /** Moneda de la gestión: la de los cargos, no necesariamente la del canal. */
  readonly currency: string;
  readonly channels: readonly ChannelOption[];
  /** Fecha de hoy en la zona de la gestión, `YYYY-MM-DD`, para el tope del campo. */
  readonly today: string;
  /** Presente cuando se corrige una evidencia devuelta — PAY-026. */
  readonly correction?: { readonly proofId: string; readonly version: number };
}) {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  const [canalId, setCanalId] = useState(channels[0]?.id ?? '');
  const formRef = useRef<HTMLFormElement>(null);

  const corrigiendo = correction !== undefined;

  /*
   * El canal elegido manda sobre la moneda del importe. Si el identificador no
   * casa con ninguno —no debería—, se cae a la de la gestión antes que enseñar
   * un campo sin moneda.
   */
  const canal = channels.find((opcion) => opcion.id === canalId);
  const monedaDelCanal = canal?.currency ?? currency;
  const convertido = monedaDelCanal !== currency;

  function onSubmit(formEvent: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    formEvent.preventDefault();
    const form = new FormData(formEvent.currentTarget);

    setError(null);
    setDone(false);

    /*
     * Se comprueba el tamaño antes de enviar. No sustituye al dominio, que
     * sigue siendo la autoridad: evita subir diez megas por la red para que los
     * rechacen al llegar, y sobre todo evita chocar con el límite de cuerpo de
     * la acción de servidor, que responde 413 sin llegar a ejecutar nada.
     */
    const archivo = form.get('comprobante');

    if (archivo instanceof File && archivo.size > MAX_BYTES) {
      setError('El archivo del comprobante supera los 10 MB.');
      return;
    }

    startTransition(async () => {
      try {
        const result = corrigiendo
          ? await resubmitProofAction(eventCode, correction.proofId, correction.version, form)
          : await submitProofAction(eventCode, form);

        if (result.ok) {
          setDone(true);
          formRef.current?.reset();
        } else {
          setError(result.message);
        }
      } catch {
        /*
         * Un fallo de transporte —conexión caída, cuerpo rechazado por el
         * servidor— no es un `ActionResult`: sin este `catch` la promesa
         * rechazada sube al error boundary y el peregrino pierde la pantalla y
         * lo que había escrito, sin saber por qué.
         */
        setError('No se pudo enviar el comprobante. Revise su conexión e inténtelo de nuevo.');
      }
    });
  }

  if (channels.length === 0) {
    return (
      <p className="text-sm">
        Esta gestión todavía no tiene canales de pago anticipado habilitados. Consulte con la
        organización antes de transferir.
      </p>
    );
  }

  const titleId = corrigiendo ? 'corregir-titulo' : 'cargar-titulo';

  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col gap-4 rounded-lg border border-[var(--color-ink)]/20 p-4"
    >
      <h2 id={titleId} className="text-lg font-semibold">
        {corrigiendo ? 'Corregir el comprobante' : 'Declarar un pago'}
      </h2>

      <p className="text-sm">
        Transfiera por uno de los canales y adjunte el respaldo.{' '}
        <strong>Cargar el comprobante no confirma el pago:</strong> una persona autorizada lo revisa
        y entonces se aplica a su saldo.
      </p>

      <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="canal" className="text-sm font-medium">
            Banco o plataforma
          </label>
          {/*
            Controlado, y no `defaultValue`: la moneda del importe depende de
            esta elección, así que el componente tiene que enterarse de que
            cambió. Sin estado, el rótulo se quedaba en la moneda de la gestión
            para siempre.
          */}
          <select
            id="canal"
            name="canal"
            required
            value={canalId}
            onChange={(event) => {
              setCanalId(event.target.value);
            }}
            className="min-h-[var(--size-touch-target)] border border-[var(--color-ink)]/40 p-2 text-sm"
          >
            {channels.map((channel) => (
              <option key={channel.id} value={channel.id}>
                {CHANNEL_LABEL[channel.code] ?? channel.code} · {channel.currency}
              </option>
            ))}
          </select>
        </div>

        {/*
          Las instrucciones del canal elegido, no las de todos. Enseñar las tres
          a la vez obliga a buscar la propia entre datos de cuentas ajenas, y una
          transferencia enviada a la cuenta equivocada no se deshace.
        */}
        {canal?.instructions != null && <p className="text-xs opacity-80">{canal.instructions}</p>}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="importe" className="text-sm font-medium">
              Importe transferido ({monedaDelCanal})
            </label>
            <input
              id="importe"
              name="importe"
              type="text"
              inputMode="decimal"
              required
              placeholder="0.00"
              aria-describedby="importe-ayuda"
              className="min-h-[var(--size-touch-target)] border border-[var(--color-ink)]/40 p-2 text-sm tabular-nums"
            />
            <p id="importe-ayuda" className="text-xs opacity-70">
              Escriba el importe exacto que salió de su cuenta, con dos decimales.
              {/*
                Sus cargos están en la moneda de la gestión. Sin decirlo, el
                peregrino que transfiere dólares no sabe cuánto tiene que enviar
                para saldar una deuda expresada en bolivianos, y la aritmética
                la acabará haciendo mal alguien.
              */}
              {convertido && (
                <>
                  {' '}
                  Sus cargos están en {currency}: al revisarlo se convertirá con la tasa del día del
                  pago.
                </>
              )}
            </p>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="fecha" className="text-sm font-medium">
              Fecha del pago
            </label>
            <input
              id="fecha"
              name="fecha"
              type="date"
              required
              max={today}
              className="min-h-[var(--size-touch-target)] border border-[var(--color-ink)]/40 p-2 text-sm"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="referencia" className="text-sm font-medium">
              Referencia bancaria
            </label>
            <input
              id="referencia"
              name="referencia"
              type="text"
              required
              maxLength={64}
              aria-describedby="referencia-ayuda"
              className="min-h-[var(--size-touch-target)] border border-[var(--color-ink)]/40 p-2 font-mono text-sm"
            />
            <p id="referencia-ayuda" className="text-xs opacity-70">
              El número que su banco asignó a la transferencia. No se puede repetir.
            </p>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="pagador" className="text-sm font-medium">
              Titular de la cuenta que pagó
            </label>
            <input
              id="pagador"
              name="pagador"
              type="text"
              aria-describedby="pagador-ayuda"
              className="min-h-[var(--size-touch-target)] border border-[var(--color-ink)]/40 p-2 text-sm"
            />
            <p id="pagador-ayuda" className="text-xs opacity-70">
              Solo si pagó otra persona por usted.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="comprobante" className="text-sm font-medium">
            Comprobante
          </label>
          <input
            id="comprobante"
            name="comprobante"
            type="file"
            required
            accept={ACCEPT}
            aria-describedby="comprobante-ayuda"
            className="text-sm"
          />
          <p id="comprobante-ayuda" className="text-xs opacity-70">
            Foto o PDF del respaldo bancario, hasta 10 MB. Se guarda en privado: solo lo ve quien
            revisa su pago.
          </p>
        </div>

        {error !== null && (
          <p role="alert" className="text-sm text-[var(--color-danger)]">
            {error}
          </p>
        )}

        {/*
          Microcopy canónico (`design-system.md` §8), no una frase escrita aquí:
          describe qué promete el sistema al recibir un comprobante, y una
          variación cambiaría esa promesa.
        */}
        {done && (
          <p role="status" aria-live="polite" className="text-sm text-[var(--color-success)]">
            {MICROCOPY.advancePending}
          </p>
        )}

        <div>
          <Button type="submit" disabled={pending}>
            {pending ? 'Enviando…' : corrigiendo ? 'Enviar corrección' : 'Enviar comprobante'}
          </Button>
        </div>
      </form>
    </section>
  );
}
