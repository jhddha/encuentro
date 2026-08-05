import { totalDays } from '@encuentro/domain';
import { Card, PageHeader, ReadonlyState } from '@encuentro/ui';
import Link from 'next/link';

import { Shell } from '@/components/shell';
import { eventRepository } from '@/lib/container';

export const dynamic = 'force-dynamic';

/**
 * Landing pública.
 *
 * EVT-004 y EVT-006: resuelve la única gestión públicamente habilitada. La
 * unicidad no se comprueba aquí sino con un índice único parcial en Postgres,
 * de modo que ni un error de código ni una escritura directa puedan publicar
 * dos a la vez.
 */
export default async function HomePage() {
  const event = await eventRepository().findPubliclyEnabled();

  return (
    <Shell title="Encuentro">
      <div className="flex flex-col gap-6">
        <PageHeader title="Encuentro" description="La Mansión" />

        {event === null ? (
          <ReadonlyState
            title="No hay ninguna gestión publicada"
            description="Cuando una gestión pase a ACTIVE y se habilite públicamente, aparecerá aquí con su información de inscripción."
          />
        ) : (
          <Card className="flex flex-col gap-4">
            <h2 className="font-[family-name:var(--font-display)] text-2xl">{event.name}</h2>
            <p className="text-sm">
              Del{' '}
              <time dateTime={event.startAt.toISOString()}>
                {event.startAt.toISOString().slice(0, 10)}
              </time>{' '}
              al{' '}
              <time dateTime={event.endAt.toISOString()}>
                {event.endAt.toISOString().slice(0, 10)}
              </time>{' '}
              · {totalDays(event.startAt, event.endAt)} días
            </p>
            <Link
              href={`/e/${event.code}/inscripcion`}
              className="inline-flex min-h-[var(--size-touch-target)] w-fit items-center rounded-md bg-[var(--color-flame)] px-5 text-[var(--color-ivory)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)]"
            >
              Inscribirme
            </Link>
          </Card>
        )}
      </div>
    </Shell>
  );
}
