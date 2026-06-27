import { Request, Response } from 'express';
import { Lesson, LessonType } from './lesson-model';
import { Section } from '../section/section-model';
import { Course } from '../course/course-model';
import { Enrollment } from '../enrollment/enrollment-model';
import { MediaAsset } from '../media/media-asset-model';
import { ApiError, JwtPayload } from '../../../types/interface';
import { isAdminOrOwner } from '../../../middleware/role-middleware';
import { loadOwnedCourse } from '../course-access';
import { sanitizeData } from '../../../services/sanitize-service';
import {
  isStorageConfigured,
  createPlaybackUrl,
} from '../../../services/storage-service';
import { issueHlsTicket } from '../../../services/hls-ticket';
import {
  purgeAssetsByIds,
  assetReferenceCount,
} from '../../../services/media-service';
import { bodyId, nonNegInt } from '../../../helpers/parse-id';

const TYPES: LessonType[] = ['video', 'text'];

/** Require a non-empty string body field. */
function requireString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ApiError(400, `${name} is required and must be a non-empty string`);
  }
  return value;
}

/** Optional string body field (null when absent), rejecting non-strings. */
function optionalString(value: unknown, name: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new ApiError(400, `${name} must be a string`);
  }
  return value;
}

/** Validate an external video URL: must be a real http(s) URL (blocks javascript:/data:/file:). */
function validateVideoUrl(value: unknown): string {
  if (typeof value !== 'string') {
    throw new ApiError(400, 'videoUrl must be a string');
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new ApiError(400, 'videoUrl must be a valid URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ApiError(400, 'videoUrl must be an http(s) URL');
  }
  return value;
}

/** Verify a video MediaAsset is the user's own, a video, and uploaded. */
async function resolveVideoAsset(
  rawId: unknown,
  user: JwtPayload | undefined
): Promise<number> {
  const asset = await MediaAsset.findByPk(bodyId(rawId, 'videoAssetId'));
  if (!asset) {
    throw new ApiError(404, 'Video asset not found');
  }
  if (asset.kind !== 'video') {
    throw new ApiError(400, 'Media asset is not a video');
  }
  if (!isAdminOrOwner(user, asset.uploadedById)) {
    throw new ApiError(403, 'You can only attach your own uploads');
  }
  if (asset.status !== 'ready') {
    throw new ApiError(400, 'Video upload has not been confirmed yet');
  }
  return asset.id;
}

/** Resolve a video lesson's source (external URL XOR R2 asset) + notes. */
async function resolveVideoFields(
  body: Record<string, unknown>,
  user: JwtPayload | undefined
) {
  const hasAsset = body.videoAssetId !== undefined && body.videoAssetId !== null;
  const hasUrl = !!body.videoUrl;
  if (hasAsset && hasUrl) {
    throw new ApiError(400, 'Provide either videoUrl or videoAssetId, not both');
  }
  if (!hasAsset && !hasUrl) {
    throw new ApiError(400, 'A video lesson requires videoUrl or videoAssetId');
  }
  const notes = optionalString(body.content, 'content');
  return {
    videoUrl: hasUrl ? validateVideoUrl(body.videoUrl) : null,
    videoAssetId: hasAsset ? await resolveVideoAsset(body.videoAssetId, user) : null,
    videoDurationSec:
      body.videoDurationSec === undefined || body.videoDurationSec === null
        ? null
        : nonNegInt(body.videoDurationSec, 'videoDurationSec'),
    content: notes ? sanitizeData(notes) : null,
  };
}

/** Authorize viewing a lesson: owner/admin, or published + (preview or enrolled). */
async function assertLessonAccess(
  lesson: Lesson,
  user: JwtPayload | undefined
): Promise<void> {
  const course = await Course.findByPk(lesson.courseId);
  if (isAdminOrOwner(user, course?.instructorId ?? -1)) {
    return;
  }
  if (course?.status !== 'published') {
    throw new ApiError(403, 'This course is not available');
  }
  if (!lesson.isPreview) {
    const enrolled = await Enrollment.findOne({
      where: { userId: user!.id, courseId: lesson.courseId },
    });
    if (!enrolled) {
      throw new ApiError(403, 'Enroll in the course to access this lesson');
    }
  }
}

export const addLesson = async (req: Request, res: Response): Promise<void> => {
  const { sectionId, title, type } = req.body ?? {};
  if (!sectionId || !title || !type) {
    throw new ApiError(400, 'sectionId, title and type are required');
  }
  if (!TYPES.includes(type)) {
    throw new ApiError(400, 'type must be "video" or "text"');
  }

  const section = await Section.findByPk(bodyId(sectionId, 'sectionId'));
  if (!section) {
    throw new ApiError(404, 'Section not found');
  }
  await loadOwnedCourse(section.courseId, req.user);

  let contentFields;
  if (type === 'video') {
    contentFields = await resolveVideoFields(req.body, req.user);
  } else {
    contentFields = {
      content: sanitizeData(requireString(req.body.content, 'content')),
      videoUrl: null,
      videoAssetId: null,
      videoDurationSec: null,
    };
  }

  const lesson = await Lesson.create({
    sectionId: section.id,
    courseId: section.courseId,
    title: requireString(title, 'title'),
    type,
    position:
      req.body.position === undefined ? 0 : nonNegInt(req.body.position, 'position'),
    isPreview: !!req.body.isPreview,
    ...contentFields,
  });
  res.status(201).json({ data: lesson, message: 'Lesson created successfully' });
};

export const updateLesson = async (
  req: Request,
  res: Response
): Promise<void> => {
  const lesson = await Lesson.findByPk(req.params.id);
  if (!lesson) {
    throw new ApiError(404, 'Lesson not found');
  }
  await loadOwnedCourse(lesson.courseId, req.user);

  const { title, position, isPreview, videoUrl, videoAssetId, videoDurationSec, content } =
    req.body ?? {};

  // A text lesson cannot acquire a video source.
  if (lesson.type === 'text' && (videoUrl !== undefined || videoAssetId !== undefined)) {
    throw new ApiError(400, 'A text lesson cannot have a video source');
  }

  if (title !== undefined) lesson.title = requireString(title, 'title');
  if (position !== undefined) lesson.position = nonNegInt(position, 'position');
  if (isPreview !== undefined) lesson.isPreview = !!isPreview;

  // Switching the video source: setting one clears the other.
  if (videoAssetId !== undefined) {
    lesson.videoAssetId =
      videoAssetId === null ? null : await resolveVideoAsset(videoAssetId, req.user);
    if (lesson.videoAssetId) lesson.videoUrl = null;
  }
  if (videoUrl !== undefined) {
    lesson.videoUrl = videoUrl === null ? null : validateVideoUrl(videoUrl);
    if (lesson.videoUrl) lesson.videoAssetId = null;
  }
  if (videoDurationSec !== undefined) {
    lesson.videoDurationSec =
      videoDurationSec === null ? null : nonNegInt(videoDurationSec, 'videoDurationSec');
  }
  if (content !== undefined) {
    if (lesson.type === 'text') {
      lesson.content = sanitizeData(requireString(content, 'content'));
    } else {
      lesson.content =
        content === null || content === ''
          ? null
          : sanitizeData(requireString(content, 'content'));
    }
  }

  // A video lesson must always keep exactly one source.
  if (lesson.type === 'video') {
    const sources = [lesson.videoUrl, lesson.videoAssetId].filter(
      (v) => v != null
    ).length;
    if (sources !== 1) {
      throw new ApiError(
        400,
        'A video lesson must have exactly one of videoUrl or videoAssetId'
      );
    }
  }

  await lesson.save();

  res.status(200).json({ data: lesson, message: 'Lesson updated successfully' });
};

export const getLessonById = async (
  req: Request,
  res: Response
): Promise<void> => {
  const lesson = await Lesson.findByPk(req.params.id);
  if (!lesson) {
    throw new ApiError(404, 'Lesson not found');
  }
  await assertLessonAccess(lesson, req.user);
  res.status(200).json({ data: lesson, message: 'Lesson fetched successfully' });
};

/**
 * Issue a playback source for a lesson's video. For R2-hosted video this is a
 * short-lived presigned URL (the bucket is private); for external video it is
 * the stored URL. Gated by the same access rules as viewing the lesson.
 */
export const getLessonPlayback = async (
  req: Request,
  res: Response
): Promise<void> => {
  const lesson = await Lesson.findByPk(req.params.id);
  if (!lesson) {
    throw new ApiError(404, 'Lesson not found');
  }
  await assertLessonAccess(lesson, req.user);

  if (lesson.type !== 'video') {
    throw new ApiError(400, 'This lesson has no video');
  }

  if (lesson.videoAssetId) {
    if (!isStorageConfigured()) {
      throw new ApiError(503, 'Media storage (R2) is not configured');
    }
    const asset = await MediaAsset.findByPk(lesson.videoAssetId);
    if (!asset) {
      throw new ApiError(409, 'Video is not ready');
    }
    // Preferred: AES-128 encrypted HLS, where playlist + key are ticket-gated and the
    // raw file is gone, so there's no single downloadable video in the Network tab.
    if (asset.hlsStatus === 'ready') {
      const ticket = issueHlsTicket(asset.id, req.user!.id);
      const base = `${req.protocol}://${req.get('host')}`;
      res.status(200).json({
        data: {
          source: 'hls',
          url: `${base}/api/media/hls/${asset.id}/playlist?ticket=${encodeURIComponent(ticket)}`,
        },
        message: 'Playback URL issued',
      });
      return;
    }
    // Fallback: short-lived presigned MP4 (before transcode finishes, or if ffmpeg is unavailable).
    if (asset.status !== 'ready') {
      throw new ApiError(409, 'Video is not ready');
    }
    const { url, expiresIn } = await createPlaybackUrl(
      asset.storageKey,
      asset.contentType
    );
    res
      .status(200)
      .json({ data: { source: 'r2', url, expiresIn }, message: 'Playback URL issued' });
    return;
  }

  if (lesson.videoUrl) {
    res
      .status(200)
      .json({ data: { source: 'external', url: lesson.videoUrl }, message: 'Playback URL issued' });
    return;
  }

  throw new ApiError(404, 'No video for this lesson');
};

export const deleteLesson = async (
  req: Request,
  res: Response
): Promise<void> => {
  const lesson = await Lesson.findByPk(req.params.id);
  if (!lesson) {
    throw new ApiError(404, 'Lesson not found');
  }
  await loadOwnedCourse(lesson.courseId, req.user);

  const videoAssetId = lesson.videoAssetId ?? null;
  await lesson.destroy();
  // Remove the lesson's R2 video (object + row) only if nothing else references it.
  if (videoAssetId && (await assetReferenceCount(videoAssetId)) === 0) {
    await purgeAssetsByIds([videoAssetId]);
  }

  res.status(200).json({ message: 'Lesson deleted successfully' });
};
