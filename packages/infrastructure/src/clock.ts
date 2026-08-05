import type { Clock } from '@encuentro/application';

/** Implementación real del puerto `Clock`. Siempre UTC. */
export const systemClock: Clock = {
  now: () => new Date(),
};
