import { Course } from './course-model';
import { MediaAsset } from '../media/media-asset-model';
import {
  isStorageConfigured,
  createPlaybackUrl,
} from '../../../services/storage-service';
import { issueHlsTicket } from '../../../services/hls-ticket';
import { isAdminOrOwner } from '../../../middleware/role-middleware';
import { bodyId } from '../../../helpers/parse-id';
import { ApiError } from '../../../types/interface';

/** Include the thumbnail asset (key + type only) so its URL can be presigned on read. */
export const THUMBNAIL_ASSET_INCLUDE = {
  model: MediaAsset,
  as: 'thumbnailAsset',
  attributes: ['id', 'storageKey', 'contentType'],
};

/** Include the wide banner asset so its URL can be presigned on read. */
export const BANNER_ASSET_INCLUDE = {
  model: MediaAsset,
  as: 'bannerAsset',
  attributes: ['id', 'storageKey', 'contentType'],
};

/** Include the trailer video asset so playback can be resolved on read. */
export const TRAILER_ASSET_INCLUDE = {
  model: MediaAsset,
  as: 'trailerAsset',
  attributes: ['id', 'storageKey', 'contentType', 'hlsStatus'],
};

/** Presigned URL for the course banner image, or null. */
export async function resolveBannerUrl(course: Course): Promise<string | null> {
  if (course.bannerAssetId && isStorageConfigured()) {
    const asset =
      course.bannerAsset ??
      (await MediaAsset.findByPk(course.bannerAssetId, {
        attributes: ['storageKey', 'contentType'],
      }));
    if (asset) {
      const { url } = await createPlaybackUrl(asset.storageKey, asset.contentType);
      return url;
    }
  }
  return null;
}

/**
 * The display URL for a course cover: a short-lived presigned R2 URL when an
 * image was uploaded (`thumbnailAssetId`), otherwise null. Covers are upload-only
 * (external image URLs aren't supported) and the private storage key is never exposed.
 */
export async function resolveThumbnailUrl(course: Course): Promise<string | null> {
  if (course.thumbnailAssetId && isStorageConfigured()) {
    const asset =
      course.thumbnailAsset ??
      (await MediaAsset.findByPk(course.thumbnailAssetId, {
        attributes: ['storageKey', 'contentType'],
      }));
    if (asset) {
      const { url } = await createPlaybackUrl(asset.storageKey, asset.contentType);
      return url;
    }
  }
  return null;
}

/**
 * Playback descriptor for the course trailer: HLS (encrypted, preferred) once
 * the video has been transcoded, or a short-lived presigned MP4 URL as a fallback.
 * Returns null when no trailer is set or storage is unavailable.
 */
export async function resolveTrailerPlayback(
  course: Course,
  viewerId = 0
): Promise<{ source: 'hls' | 'r2'; url: string } | null> {
  if (!course.trailerAssetId || !isStorageConfigured()) return null;
  const asset =
    course.trailerAsset ??
    (await MediaAsset.findByPk(course.trailerAssetId, {
      attributes: ['id', 'storageKey', 'contentType', 'hlsStatus', 'status'],
    }));
  if (!asset || asset.status !== 'ready') return null;
  if (asset.hlsStatus === 'ready') {
    const ticket = issueHlsTicket(asset.id, viewerId);
    return { source: 'hls', url: `/media/hls/${asset.id}/playlist?ticket=${encodeURIComponent(ticket)}` };
  }
  const { url } = await createPlaybackUrl(asset.storageKey, asset.contentType);
  return { source: 'r2', url };
}

/**
 * Course JSON for clients: resolved display URLs replace internal asset references.
 * The trailer field is omitted here (it requires a viewer id for the HLS ticket);
 * use `resolveTrailerPlayback` in the detail endpoint which has `req.user`.
 */
export async function serializeCourse(
  course: Course
): Promise<Record<string, unknown>> {
  const [thumbnail, banner] = await Promise.all([
    resolveThumbnailUrl(course),
    resolveBannerUrl(course),
  ]);
  const json = course.toJSON() as Record<string, unknown>;
  delete json.thumbnailAsset;
  delete json.bannerAsset;
  delete json.trailerAsset;
  json.thumbnail = thumbnail;
  json.banner = banner;
  return json;
}

/** Validate a body image-asset id points to a ready image the caller may use. */
export async function validateImageAsset(
  value: unknown,
  user: { id: number; roleName: string } | undefined,
  field = 'thumbnailAssetId'
): Promise<number> {
  const id = bodyId(value, field);
  const asset = await MediaAsset.findByPk(id);
  if (!asset || asset.kind !== 'image' || asset.status !== 'ready') {
    throw new ApiError(400, 'Invalid image. Upload it first.');
  }
  if (!isAdminOrOwner(user, asset.uploadedById ?? null)) {
    throw new ApiError(403, 'You can only use images you uploaded');
  }
  return id;
}

/** Validate a body video-asset id points to a ready video the caller may use. */
export async function validateVideoAsset(
  value: unknown,
  user: { id: number; roleName: string } | undefined,
  field = 'trailerAssetId'
): Promise<number> {
  const id = bodyId(value, field);
  const asset = await MediaAsset.findByPk(id);
  if (!asset || asset.kind !== 'video' || asset.status !== 'ready') {
    throw new ApiError(400, 'Invalid video. Upload and confirm it first.');
  }
  if (!isAdminOrOwner(user, asset.uploadedById ?? null)) {
    throw new ApiError(403, 'You can only use videos you uploaded');
  }
  return id;
}
