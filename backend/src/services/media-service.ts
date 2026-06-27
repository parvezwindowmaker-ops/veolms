import { Op } from 'sequelize';
import { MediaAsset, MediaKind } from '../routes/lms/media/media-asset-model';
import { Lesson } from '../routes/lms/lesson/lesson-model';
import { Course } from '../routes/lms/course/course-model';
import { User } from '../routes/control/user/user-model';
import { isStorageConfigured, deleteObject, deletePrefix } from './storage-service';

/** Create a MediaAsset already marked ready (used for server-side avatar uploads). */
export async function createReadyAsset(params: {
  kind: MediaKind;
  contentType: string;
  storageKey: string;
  originalName: string | null;
  sizeBytes: number | null;
  uploadedById: number;
}): Promise<MediaAsset> {
  return MediaAsset.create({ ...params, status: 'ready' });
}

/**
 * Delete an asset's R2 object then its DB row, so neither is orphaned.
 * If the object can't be deleted right now (R2 unconfigured, or a delete error),
 * the row is KEPT and marked `orphaned` instead of destroyed, so the object key
 * is still recorded and `reclaimOrphanedAssets()` can finish the job later.
 */
export async function purgeAsset(asset: MediaAsset | null): Promise<void> {
  if (!asset) return;

  if (isStorageConfigured()) {
    try {
      // Remove encrypted-HLS outputs (playlist + segments) if present.
      if (asset.hlsPrefix) await deletePrefix(asset.hlsPrefix);
      await deleteObject(asset.storageKey);
      await asset.destroy();
      return;
    } catch (err) {
      console.warn(
        `Failed to delete R2 object ${asset.storageKey}; marking orphaned:`,
        (err as Error).message
      );
    }
  }

  // Object not deleted, so retain the row (with its key) for later reclaim.
  try {
    asset.status = 'orphaned';
    await asset.save();
  } catch (err) {
    console.warn('Failed to mark asset orphaned:', (err as Error).message);
  }
}

/** Purge a set of assets by id (deduped, ignores nullish, fault-tolerant per item). */
export async function purgeAssetsByIds(
  ids: Array<number | null | undefined>
): Promise<void> {
  const unique = [...new Set(ids.filter((id): id is number => id != null))];
  if (!unique.length) return;
  const assets = await MediaAsset.findAll({ where: { id: unique } });
  for (const asset of assets) {
    try {
      await purgeAsset(asset);
    } catch (err) {
      // Never let one failure abort the batch.
      console.warn(`purgeAsset failed for asset ${asset.id}:`, (err as Error).message);
    }
  }
}

/** How many lessons / user avatars / course thumbnails currently reference an asset. */
export async function assetReferenceCount(assetId: number): Promise<number> {
  const [lessons, users, courses] = await Promise.all([
    Lesson.count({ where: { videoAssetId: assetId } }),
    User.count({ where: { avatarAssetId: assetId } }),
    Course.count({ where: { thumbnailAssetId: assetId } }),
  ]);
  return lessons + users + courses;
}

/**
 * Remove `pending` assets older than `hours`: abandoned uploads where the
 * client requested an upload URL but never confirmed. Returns the count removed.
 */
export async function cleanupStalePending(hours: number): Promise<number> {
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
  const stale = await MediaAsset.findAll({
    where: { status: 'pending', createdAt: { [Op.lt]: cutoff } },
  });
  for (const asset of stale) {
    await purgeAsset(asset);
  }
  return stale.length;
}

/**
 * Retry deleting the R2 objects of assets previously marked `orphaned`; on
 * success the row is removed. Requires R2 to be configured. Returns the count
 * successfully reclaimed.
 */
export async function reclaimOrphanedAssets(): Promise<number> {
  if (!isStorageConfigured()) return 0;
  const orphaned = await MediaAsset.findAll({ where: { status: 'orphaned' } });
  let reclaimed = 0;
  for (const asset of orphaned) {
    try {
      await deleteObject(asset.storageKey);
      await asset.destroy();
      reclaimed += 1;
    } catch (err) {
      console.warn(
        `Reclaim failed for orphaned asset ${asset.id}:`,
        (err as Error).message
      );
    }
  }
  return reclaimed;
}
