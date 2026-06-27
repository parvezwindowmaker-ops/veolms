import { Course } from './course-model';
import { MediaAsset } from '../media/media-asset-model';
import {
  isStorageConfigured,
  createPlaybackUrl,
} from '../../../services/storage-service';
import { isAdminOrOwner } from '../../../middleware/role-middleware';
import { bodyId } from '../../../helpers/parse-id';
import { ApiError } from '../../../types/interface';

/** Include the thumbnail asset (key + type only) so its URL can be presigned on read. */
export const THUMBNAIL_ASSET_INCLUDE = {
  model: MediaAsset,
  as: 'thumbnailAsset',
  attributes: ['id', 'storageKey', 'contentType'],
};

/**
 * The display URL for a course cover: a short-lived presigned R2 URL when an
 * image was uploaded (`thumbnailAssetId`), otherwise the externally-hosted
 * `thumbnail` URL (or null). The private storage key is never exposed.
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
  return course.thumbnail ?? null;
}

/**
 * Course JSON for clients: `thumbnail` is replaced with its resolved display URL
 * and the internal asset association is stripped.
 */
export async function serializeCourse(
  course: Course
): Promise<Record<string, unknown>> {
  const url = await resolveThumbnailUrl(course);
  const json = course.toJSON() as Record<string, unknown>;
  delete json.thumbnailAsset;
  json.thumbnail = url;
  return json;
}

/** Validate a body `thumbnailAssetId` points to a ready image the caller may use. */
export async function validateThumbnailAsset(
  value: unknown,
  user: { id: number; roleName: string } | undefined
): Promise<number> {
  const id = bodyId(value, 'thumbnailAssetId');
  const asset = await MediaAsset.findByPk(id);
  if (!asset || asset.kind !== 'image' || asset.status !== 'ready') {
    throw new ApiError(400, 'Invalid thumbnail image. Upload it first.');
  }
  if (!isAdminOrOwner(user, asset.uploadedById ?? null)) {
    throw new ApiError(403, 'You can only use images you uploaded');
  }
  return id;
}
