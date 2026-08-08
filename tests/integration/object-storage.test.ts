import { createHash } from 'node:crypto';

import { createObjectStorage, ObjectStorageError } from '@encuentro/infrastructure';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Gate del almacenamiento de evidencias — PAY-018, PRV-003, PRV-004.
 *
 * Corre contra el MinIO de `docker-compose.yml`. Lo que se comprueba aquí no se
 * puede comprobar con dobles: que el objeto **no sea alcanzable sin firma**.
 */
const CONFIG = {
  endpoint: process.env.OBJECT_STORAGE_ENDPOINT ?? 'http://localhost:9000',
  bucket: process.env.OBJECT_STORAGE_BUCKET ?? 'encuentro-private',
  accessKey: process.env.OBJECT_STORAGE_ACCESS_KEY ?? 'encuentro-dev',
  secretKey: process.env.OBJECT_STORAGE_SECRET_KEY ?? 'encuentro-dev-secret',
};

const storage = createObjectStorage(CONFIG);
const EVENTO = 'evt-almacen';

/** PNG de 1×1 píxel. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

beforeAll(async () => {
  await storage.ensureBucket();
});

describe('almacenamiento de evidencias', () => {
  it('guarda el archivo y devuelve su suma', async () => {
    const stored = await storage.putEvidence({
      eventId: EVENTO,
      body: PNG,
      contentType: 'image/png',
    });

    expect(stored.size).toBe(PNG.byteLength);
    expect(stored.checksum).toBe(createHash('sha256').update(PNG).digest('hex'));
  });

  /*
   * PRV-004: ni nombres, ni documentos, ni códigos de inscripción en la ruta.
   * Una clave con PII se filtra en registros de acceso, cabeceras y capturas.
   */
  it('la clave no contiene PII', async () => {
    const stored = await storage.putEvidence({
      eventId: EVENTO,
      body: PNG,
      contentType: 'image/png',
    });

    expect(stored.fileId).toMatch(/^evidencias\/evt-almacen\/[0-9a-f-]{36}$/);
  });

  /*
   * La propiedad que hace privado el almacén. Sin ella, adivinar una clave
   * bastaría para leer el comprobante bancario de cualquiera.
   */
  it('el objeto NO es accesible sin firma', async () => {
    const stored = await storage.putEvidence({
      eventId: EVENTO,
      body: PNG,
      contentType: 'image/png',
    });

    const response = await fetch(`${CONFIG.endpoint}/${CONFIG.bucket}/${stored.fileId}`);

    expect(response.ok).toBe(false);
    expect([401, 403]).toContain(response.status);
  });

  it('la URL firmada devuelve exactamente el archivo', async () => {
    const stored = await storage.putEvidence({
      eventId: EVENTO,
      body: PNG,
      contentType: 'image/png',
    });

    const url = await storage.signedEvidenceUrl(stored.fileId);
    const response = await fetch(url);

    expect(response.ok).toBe(true);
    const bytes = Buffer.from(await response.arrayBuffer());
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(stored.checksum);
  });

  it('la URL firmada fuerza la descarga, no la vista en línea', async () => {
    const stored = await storage.putEvidence({
      eventId: EVENTO,
      body: PNG,
      contentType: 'image/png',
    });

    const response = await fetch(await storage.signedEvidenceUrl(stored.fileId));

    expect(response.headers.get('content-disposition')).toContain('attachment');
  });

  it('la URL firmada caduca', async () => {
    const stored = await storage.putEvidence({
      eventId: EVENTO,
      body: PNG,
      contentType: 'image/png',
    });

    // Un segundo negativo produce una firma ya vencida sin tener que esperar.
    const url = await storage.signedEvidenceUrl(stored.fileId, -1);
    const response = await fetch(url);

    expect(response.ok).toBe(false);
  });

  describe('validación de entrada', () => {
    /*
     * Servir HTML desde una URL firmada del mismo origen sería ejecutar el
     * documento de un desconocido con la sesión del revisor abierta.
     */
    it('rechaza un tipo fuera de la lista blanca', async () => {
      await expect(
        storage.putEvidence({
          eventId: EVENTO,
          body: Buffer.from('<script>alert(1)</script>'),
          contentType: 'text/html',
        }),
      ).rejects.toThrow(ObjectStorageError);
    });

    it('rechaza un archivo vacío', async () => {
      await expect(
        storage.putEvidence({ eventId: EVENTO, body: Buffer.alloc(0), contentType: 'image/png' }),
      ).rejects.toThrow(/vacío/);
    });

    it('rechaza un archivo de más de 10 MB', async () => {
      await expect(
        storage.putEvidence({
          eventId: EVENTO,
          body: Buffer.alloc(10 * 1024 * 1024 + 1),
          contentType: 'image/png',
        }),
      ).rejects.toThrow(/10 MB/);
    });
  });
});
