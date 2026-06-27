import { Request, Response } from 'express';
import { MediaAsset, MediaKind } from './media-asset-model';
import { ApiError } from '../../../types/interface';
import { env } from '../../../config/env';
import { isAdminOrOwner } from '../../../middleware/role-middleware';
import {
  isStorageConfigured,
  buildStorageKey,
  buildCourseKey,
  createUploadUrl,
  headObject,
  getObjectText,
  signGetUrl,
} from '../../../services/storage-service';
import { loadOwnedCourse } from '../course-access';
import {
  purgeAsset,
  assetReferenceCount,
  cleanupStalePending,
  reclaimOrphanedAssets,
} from '../../../services/media-service';
import { transcodeToHls } from '../../../services/hls-service';
import { verifyHlsTicket, HLS_TTL_SECONDS } from '../../../services/hls-ticket';
import { bodyId, nonNegInt, parseId } from '../../../helpers/parse-id';

const KINDS: MediaKind[] = ['video', 'image', 'file'];
const KEY_PREFIX: Record<MediaKind, string> = {
  video: 'videos',
  image: 'thumbnails',
  file: 'files',
};
const CONTENT_TYPE_RULES: Record<MediaKind, RegExp> = {
  video: /^video\//,
  image: /^image\//,
  file: /^(application|text)\//,
};

/** Issue a short-lived presigned PUT URL; the client uploads straight to R2. */
export const requestUploadUrl = async (
  req: Request,
  res: Response
): Promise<void> => {
  if (!isStorageConfigured()) {
    throw new ApiError(503, 'Media storage (R2) is not configured');
  }

  const { kind, contentType, originalName, courseId } = req.body ?? {};
  if (!kind || !KINDS.includes(kind)) {
    throw new ApiError(400, 'kind must be video, image, or file');
  }
  if (
    typeof contentType !== 'string' ||
    !CONTENT_TYPE_RULES[kind as MediaKind].test(contentType)
  ) {
    throw new ApiError(400, `Invalid contentType for a ${kind} upload`);
  }

  const name = typeof originalName === 'string' ? originalName : 'upload';
  const prefix = KEY_PREFIX[kind as MediaKind];

  // When a courseId is supplied, group the object under that course's folder
  // (course/<id>/...). Ownership is enforced so an instructor can only write
  // into their own course's folder.
  let key: string;
  if (courseId !== undefined && courseId !== null) {
    const course = await loadOwnedCourse(bodyId(courseId, 'courseId'), req.user);
    key = buildCourseKey(course.id, prefix, name);
  } else {
    key = buildStorageKey(prefix, req.user!.id, name);
  }

  const asset = await MediaAsset.create({
    storageKey: key,
    kind,
    contentType,
    originalName: typeof originalName === 'string' ? originalName : null,
    uploadedById: req.user!.id,
  });

  const uploadUrl = await createUploadUrl(key, contentType);

  res.status(201).json({
    data: {
      assetId: asset.id,
      uploadUrl,
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      expiresIn: env.r2.urlTtlSeconds,
    },
    message: 'Upload URL created. PUT the file, then confirm the upload.',
  });
};

/** Confirm an upload landed in R2 and mark the asset ready (reads size/type). */
export const confirmUpload = async (
  req: Request,
  res: Response
): Promise<void> => {
  const asset = await MediaAsset.findByPk(req.params.id);
  if (!asset) {
    throw new ApiError(404, 'Media asset not found');
  }
  if (!isAdminOrOwner(req.user, asset.uploadedById)) {
    throw new ApiError(403, 'You can only confirm your own uploads');
  }

  const head = await headObject(asset.storageKey);
  if (!head) {
    throw new ApiError(400, 'Upload not found in storage');
  }

  // Re-validate the actually-stored content type against the declared kind, so a
  // confirmed asset's bytes always match its kind (defense in depth).
  if (head.contentType && !CONTENT_TYPE_RULES[asset.kind].test(head.contentType)) {
    throw new ApiError(400, `Uploaded file type does not match a ${asset.kind}`);
  }

  asset.sizeBytes = head.size;
  if (head.contentType) asset.contentType = head.contentType;
  asset.status = 'ready';
  await asset.save();

  // Kick off encrypted-HLS transcoding in the background (no-op if ffmpeg/R2
  // absent). The raw MP4 stays usable until HLS is ready, then is deleted.
  if (asset.kind === 'video') void transcodeToHls(asset.id);

  res.status(200).json({
    data: { assetId: asset.id, status: asset.status, sizeBytes: asset.sizeBytes },
    message: 'Upload confirmed',
  });
};

/**
 * Serve the HLS playlist for a video asset, rewritten on the fly: the AES key URI
 * points at the gated key endpoint (carrying the same ticket) and each segment
 * becomes a short-lived presigned R2 URL. Authorized by the ticket only (so it
 * works with native HLS and hls.js alike); no JWT header needed.
 */
export const hlsPlaylist = async (req: Request, res: Response): Promise<void> => {
  const assetId = parseId(req.params.assetId, 'assetId');
  const ticket = String(req.query.ticket ?? '');
  if (!verifyHlsTicket(ticket, assetId)) {
    throw new ApiError(403, 'Invalid or expired playback ticket');
  }
  // Which playlist (master or a variant). Strict whitelist prevents path traversal.
  const p = String(req.query.p ?? 'master.m3u8');
  if (!/^[A-Za-z0-9_.-]+\.m3u8$/.test(p)) {
    throw new ApiError(400, 'Invalid playlist name');
  }

  const asset = await MediaAsset.findByPk(assetId);
  if (!asset || asset.hlsStatus !== 'ready' || !asset.hlsPrefix) {
    throw new ApiError(404, 'HLS stream not available');
  }

  const text = await getObjectText(asset.hlsPrefix + p);
  const base = `${req.protocol}://${req.get('host')}/api/media/hls/${assetId}`;
  const tq = `ticket=${encodeURIComponent(ticket)}`;
  const prefix = asset.hlsPrefix;

  let out: string;
  if (text.includes('#EXT-X-STREAM-INF')) {
    // Master playlist → route each variant playlist back through this gated endpoint.
    out = text
      .split('\n')
      .map((line) => {
        const t = line.trim();
        if (t && !t.startsWith('#') && t.endsWith('.m3u8')) {
          return `${base}/playlist?${tq}&p=${encodeURIComponent(t)}`;
        }
        return line;
      })
      .join('\n');
  } else {
    // Variant playlist → gate the AES key, presign each encrypted segment.
    const lines = await Promise.all(
      text.split('\n').map(async (line) => {
        if (line.startsWith('#EXT-X-KEY')) {
          return line.replace(/URI="[^"]*"/, `URI="${base}/key?${tq}"`);
        }
        const t = line.trim();
        if (t && !t.startsWith('#') && t.endsWith('.ts')) {
          return signGetUrl(prefix + t, HLS_TTL_SECONDS);
        }
        return line;
      })
    );
    out = lines.join('\n');
  }

  res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).send(out);
};

/** Serve the 16-byte AES-128 key for a ticketed HLS stream. */
export const hlsKey = async (req: Request, res: Response): Promise<void> => {
  const assetId = parseId(req.params.assetId, 'assetId');
  const ticket = String(req.query.ticket ?? '');
  if (!verifyHlsTicket(ticket, assetId)) {
    throw new ApiError(403, 'Invalid or expired playback ticket');
  }
  const asset = await MediaAsset.findByPk(assetId);
  if (!asset || asset.hlsStatus !== 'ready' || !asset.hlsKeyB64) {
    throw new ApiError(404, 'Key not available');
  }
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).send(Buffer.from(asset.hlsKeyB64, 'base64'));
};

export const deleteAsset = async (
  req: Request,
  res: Response
): Promise<void> => {
  const asset = await MediaAsset.findByPk(req.params.id);
  if (!asset) {
    throw new ApiError(404, 'Media asset not found');
  }
  if (!isAdminOrOwner(req.user, asset.uploadedById)) {
    throw new ApiError(403, 'You can only delete your own uploads');
  }

  // Refuse to delete an asset that's still attached (would break a lesson/avatar).
  if ((await assetReferenceCount(asset.id)) > 0) {
    throw new ApiError(
      409,
      'Asset is in use; detach it from its lesson/avatar before deleting'
    );
  }

  await purgeAsset(asset);
  res.status(200).json({ message: 'Media asset deleted' });
};

/** Admin housekeeping: drop abandoned `pending` uploads older than N hours. */
export const cleanupPending = async (
  req: Request,
  res: Response
): Promise<void> => {
  const hours =
    req.body?.olderThanHours === undefined
      ? 24
      : nonNegInt(req.body.olderThanHours, 'olderThanHours');
  const [removed, reclaimed] = [
    await cleanupStalePending(hours),
    await reclaimOrphanedAssets(),
  ];
  res.status(200).json({
    data: { removed, reclaimed },
    message: `Removed ${removed} stale pending upload(s); reclaimed ${reclaimed} orphaned object(s)`,
  });
};
