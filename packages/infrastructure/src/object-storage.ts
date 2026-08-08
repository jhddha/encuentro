import { createHash, randomUUID } from 'node:crypto';

import {
  CreateBucketCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * Almacenamiento de evidencias de pago — PAY-018, PRV-003.
 *
 * El archivo de una evidencia es un comprobante bancario: lleva nombre, cuenta y
 * a veces saldo de una persona real. Por eso **nunca es público** y solo se
 * alcanza con una URL firmada y caduca.
 *
 * El endpoint es S3-compatible: MinIO en local, y en producción lo que se
 * configure. `forcePathStyle` es obligatorio con MinIO, que no resuelve buckets
 * por subdominio.
 */

export interface ObjectStorageConfig {
  readonly endpoint: string;
  readonly bucket: string;
  readonly accessKey: string;
  readonly secretKey: string;
  readonly region?: string;
}

export interface StoredEvidence {
  /** Clave opaca del objeto. Es lo que se guarda en `payment_proofs.file_id`. */
  readonly fileId: string;
  /** SHA-256 del contenido, para detectar un archivo alterado o truncado. */
  readonly checksum: string;
  readonly size: number;
}

/**
 * Tipos admitidos.
 *
 * Una lista blanca, no negra. Servir un `text/html` desde una URL firmada del
 * mismo origen sería ejecutar HTML de un desconocido con la sesión del revisor
 * delante: exactamente un XSS almacenado. Un comprobante bancario es una imagen
 * o un PDF y nada más.
 */
const ALLOWED_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);

/** 10 MB. Una foto de comprobante no pesa más, y el límite acota el abuso. */
const MAX_BYTES = 10 * 1024 * 1024;

/** Cinco minutos: lo que tarda un revisor en abrirlo, no en compartirlo. */
const DEFAULT_TTL_SECONDS = 300;

export class ObjectStorageError extends Error {}

export interface ObjectStorage {
  /**
   * Crea el bucket si no existe.
   *
   * Se ejecuta al aprovisionar, no en cada subida. Está aquí y no en un script
   * suelto porque el nombre del bucket y las credenciales ya viven en esta
   * configuración: partirlo invitaría a que ambos se desincronizaran.
   */
  ensureBucket(): Promise<void>;

  putEvidence(input: {
    readonly eventId: string;
    readonly body: Uint8Array;
    readonly contentType: string;
  }): Promise<StoredEvidence>;

  signedEvidenceUrl(fileId: string, ttlSeconds?: number): Promise<string>;
}

export function createObjectStorage(config: ObjectStorageConfig): ObjectStorage {
  const options: S3ClientConfig = {
    endpoint: config.endpoint,
    region: config.region ?? 'us-east-1',
    credentials: { accessKeyId: config.accessKey, secretAccessKey: config.secretKey },
    // MinIO no resuelve buckets por subdominio.
    forcePathStyle: true,
  };

  const client = new S3Client(options);

  return {
    async ensureBucket() {
      try {
        await client.send(new CreateBucketCommand({ Bucket: config.bucket }));
      } catch (error) {
        // `BucketAlreadyOwnedByYou` es el caso normal a partir del segundo
        // arranque. Cualquier otro fallo sí importa y se propaga.
        const code = (error as { name?: string }).name ?? '';
        if (!/BucketAlreadyOwnedByYou|BucketAlreadyExists/.test(code)) throw error;
      }
    },

    async putEvidence(input) {
      if (!ALLOWED_CONTENT_TYPES.has(input.contentType)) {
        throw new ObjectStorageError(
          `Tipo de archivo no admitido: ${input.contentType}. Se aceptan imágenes y PDF.`,
        );
      }

      if (input.body.byteLength === 0) {
        throw new ObjectStorageError('El archivo está vacío.');
      }

      if (input.body.byteLength > MAX_BYTES) {
        throw new ObjectStorageError('El archivo supera los 10 MB.');
      }

      /*
       * La clave no contiene PII — PRV-004: nada de nombres, documentos ni
       * códigos de inscripción en rutas ni URL. Solo la gestión, para poder
       * borrar por gestión, y un identificador aleatorio.
       */
      const fileId = `evidencias/${input.eventId}/${randomUUID()}`;
      const checksum = createHash('sha256').update(input.body).digest('hex');

      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: fileId,
          Body: input.body,
          ContentType: input.contentType,
          /*
           * Forzar la descarga en vez de la vista en línea. Aunque el tipo esté
           * en la lista blanca, un PDF puede ejecutar guiones en algunos
           * visores; descargándolo no se renderiza en el origen de la sesión.
           */
          ContentDisposition: 'attachment',
          ChecksumSHA256: Buffer.from(checksum, 'hex').toString('base64'),
        }),
      );

      return { fileId, checksum, size: input.body.byteLength };
    },

    async signedEvidenceUrl(fileId, ttlSeconds = DEFAULT_TTL_SECONDS) {
      return await getSignedUrl(
        client,
        new GetObjectCommand({ Bucket: config.bucket, Key: fileId }),
        { expiresIn: ttlSeconds },
      );
    },
  };
}
