import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env';
import { ApiError } from '../types/interface';

let client: S3Client | null = null;

/** Whether R2 credentials are configured (media uploads enabled). */
export const isStorageConfigured = (): boolean => env.r2.configured;

function getClient(): S3Client {
  if (!env.r2.configured) {
    throw new ApiError(503, 'Media storage (R2) is not configured');
  }
  if (!client) {
    client = new S3Client({
      region: 'auto',
      endpoint: env.r2.endpoint,
      credentials: {
        accessKeyId: env.r2.accessKeyId,
        secretAccessKey: env.r2.secretAccessKey,
      },
      // The AWS SDK defaults requestChecksumCalculation to 'WHEN_SUPPORTED',
      // which makes PutObject inject a CRC32 integrity checksum. When presigning
      // (there is no body yet) it bakes the checksum of an EMPTY body into the
      // signed query (x-amz-checksum-crc32); R2 then rejects it against the real
      // uploaded bytes, and the browser surfaces that failed request as a CORS
      // error. 'WHEN_REQUIRED' stops the injection so presigned PUTs stay clean
      // and R2 accepts the upload. The response setting likewise keeps presigned
      // GET (playback) URLs free of a baked-in x-amz-checksum-mode.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }
  return client;
}

/** Sanitized, collision-resistant filename: <timestamp>-<rand>-<name>. */
function uniqueName(originalName: string): string {
  const safe = originalName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-60) || 'file';
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${unique}-${safe}`;
}

/** Build a namespaced, sanitized object key: <prefix>/<userId>/<unique>-<name>. */
export function buildStorageKey(
  prefix: string,
  userId: number,
  originalName: string
): string {
  return `${prefix}/${userId}/${uniqueName(originalName)}`;
}

/**
 * Course-scoped object key: course/<courseId>/<prefix>/<unique>-<name>. Keeps all
 * of a course's media (videos, images) grouped under one folder in the bucket.
 */
export function buildCourseKey(
  courseId: number,
  prefix: string,
  originalName: string
): string {
  return `course/${courseId}/${prefix}/${uniqueName(originalName)}`;
}

/**
 * Server-side upload of a small buffer (e.g. profile avatars). Large media
 * (video) uses presigned PUT instead so the app never proxies those bytes.
 */
export async function putObject(
  key: string,
  body: Buffer,
  contentType: string
): Promise<void> {
  await getClient().send(
    new PutObjectCommand({
      Bucket: env.r2.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
}

/**
 * Presigned PUT URL so the client uploads directly to R2 (the app never proxies
 * file bytes, which keeps it stateless and scalable). Short-lived.
 */
export async function createUploadUrl(
  key: string,
  contentType: string
): Promise<string> {
  const cmd = new PutObjectCommand({
    Bucket: env.r2.bucket,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(getClient(), cmd, { expiresIn: env.r2.urlTtlSeconds });
}

/**
 * Short-lived presigned GET URL for playback. The bucket is private, so this is
 * the only way to read the object; `inline` disposition serves it for playback
 * rather than as a download.
 */
export async function createPlaybackUrl(
  key: string,
  contentType?: string
): Promise<{ url: string; expiresIn: number }> {
  const cmd = new GetObjectCommand({
    Bucket: env.r2.bucket,
    Key: key,
    ResponseContentDisposition: 'inline',
    ...(contentType ? { ResponseContentType: contentType } : {}),
  });
  const url = await getSignedUrl(getClient(), cmd, {
    expiresIn: env.r2.urlTtlSeconds,
  });
  return { url, expiresIn: env.r2.urlTtlSeconds };
}

/** HEAD an object to confirm an upload landed and read its size/content-type. */
export async function headObject(
  key: string
): Promise<{ size: number; contentType?: string } | null> {
  try {
    const out = await getClient().send(
      new HeadObjectCommand({ Bucket: env.r2.bucket, Key: key })
    );
    return { size: Number(out.ContentLength ?? 0), contentType: out.ContentType };
  } catch {
    return null;
  }
}

export async function deleteObject(key: string): Promise<void> {
  await getClient().send(
    new DeleteObjectCommand({ Bucket: env.r2.bucket, Key: key })
  );
}

/** Download an object's full bytes (used for HLS transcoding). */
export async function getObjectBuffer(key: string): Promise<Buffer> {
  const out = await getClient().send(
    new GetObjectCommand({ Bucket: env.r2.bucket, Key: key })
  );
  if (!out.Body) throw new Error('Empty object body');
  const bytes = await out.Body.transformToByteArray();
  return Buffer.from(bytes);
}

/** Presigned GET with an explicit TTL (e.g. long-lived HLS segment URLs). */
export async function signGetUrl(
  key: string,
  ttlSeconds: number
): Promise<string> {
  return getSignedUrl(
    getClient(),
    new GetObjectCommand({ Bucket: env.r2.bucket, Key: key }),
    { expiresIn: ttlSeconds }
  );
}

/** Read an object as UTF-8 text (used to read the stored HLS playlist). */
export async function getObjectText(key: string): Promise<string> {
  return (await getObjectBuffer(key)).toString('utf8');
}

/** Delete every object under a prefix (HLS folder cleanup). */
export async function deletePrefix(prefix: string): Promise<void> {
  let token: string | undefined;
  do {
    const list = await getClient().send(
      new ListObjectsV2Command({
        Bucket: env.r2.bucket,
        Prefix: prefix,
        ContinuationToken: token,
      })
    );
    const objects = (list.Contents ?? [])
      .map((o) => o.Key)
      .filter((k): k is string => !!k)
      .map((Key) => ({ Key }));
    if (objects.length) {
      await getClient().send(
        new DeleteObjectsCommand({
          Bucket: env.r2.bucket,
          Delete: { Objects: objects },
        })
      );
    }
    token = list.IsTruncated ? list.NextContinuationToken : undefined;
  } while (token);
}
