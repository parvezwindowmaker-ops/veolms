import { Request, Response } from 'express';
import { Op, fn, col, literal, Order } from 'sequelize';
import { Course, CourseLevel } from './course-model';
import { Category } from '../category/category-model';
import { Section } from '../section/section-model';
import { Lesson } from '../lesson/lesson-model';
import { Enrollment } from '../enrollment/enrollment-model';
import { User } from '../../control/user/user-model';
import { ApiError } from '../../../types/interface';
import { isAdminOrOwner } from '../../../middleware/role-middleware';
import { loadOwnedCourse } from '../course-access';
import {
  purgeAssetsByIds,
  assetReferenceCount,
} from '../../../services/media-service';
import { bodyId } from '../../../helpers/parse-id';
import { validateCoursePrice } from './course-pricing';
import {
  THUMBNAIL_ASSET_INCLUDE,
  BANNER_ASSET_INCLUDE,
  TRAILER_ASSET_INCLUDE,
  resolveThumbnailUrl,
  resolveBannerUrl,
  resolveTrailerPlayback,
  serializeCourse,
  validateImageAsset,
  validateVideoAsset,
} from './course-thumbnail';
import {
  calculatePaginationInfo,
  parseRequestParams,
} from '../../../helpers/filters';

interface CourseStat {
  studentCount: number;
  lessonCount: number;
  totalDurationSec: number;
}

/** Clamp a query-param int into [min,max], falling back to `def`. */
function clampInt(value: unknown, def: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isInteger(n)) return def;
  return Math.min(max, Math.max(min, n));
}

/**
 * Aggregate per-course stats (enrolled students, lesson count, total duration)
 * in two grouped queries rather than N per-row counts.
 */
async function courseStats(courseIds: number[]): Promise<Map<number, CourseStat>> {
  const map = new Map<number, CourseStat>();
  for (const id of courseIds) {
    map.set(id, { studentCount: 0, lessonCount: 0, totalDurationSec: 0 });
  }
  if (courseIds.length === 0) return map;

  const enrollGroups = (await Enrollment.findAll({
    attributes: ['courseId', [fn('COUNT', col('id')), 'cnt']],
    where: { courseId: { [Op.in]: courseIds } },
    group: ['courseId'],
    raw: true,
  })) as unknown as Array<{ courseId: number; cnt: string }>;
  for (const g of enrollGroups) {
    const stat = map.get(Number(g.courseId));
    if (stat) stat.studentCount = Number(g.cnt);
  }

  const lessonGroups = (await Lesson.findAll({
    attributes: [
      'courseId',
      [fn('COUNT', col('id')), 'cnt'],
      [fn('COALESCE', fn('SUM', col('videoDurationSec')), 0), 'dur'],
    ],
    where: { courseId: { [Op.in]: courseIds } },
    group: ['courseId'],
    raw: true,
  })) as unknown as Array<{ courseId: number; cnt: string; dur: string }>;
  for (const g of lessonGroups) {
    const stat = map.get(Number(g.courseId));
    if (stat) {
      stat.lessonCount = Number(g.cnt);
      stat.totalDurationSec = Number(g.dur);
    }
  }
  return map;
}

/** Serialize a list of courses, attaching aggregate stats to each. */
async function serializeCourseList(
  rows: Course[]
): Promise<Record<string, unknown>[]> {
  const stats = await courseStats(rows.map((r) => r.id));
  return Promise.all(
    rows.map(async (row) => ({
      ...(await serializeCourse(row)),
      ...(stats.get(row.id) ?? { studentCount: 0, lessonCount: 0, totalDurationSec: 0 }),
    }))
  );
}

/** Coerce a body value into a clean string[] (trimmed, no empties, capped). */
function toStringList(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => String(v).trim())
    .filter((v) => v.length > 0)
    .slice(0, 50);
}

/** Validate an optional sale price: integer paise, >= 0 and strictly below price. */
function resolveDiscountPrice(value: unknown, price: number): number | null {
  if (value === undefined || value === null || value === '') return null;
  const dp = Number(value);
  if (!Number.isInteger(dp) || dp < 0) {
    throw new ApiError(400, 'discountPrice must be a non-negative integer (paise)');
  }
  if (dp >= price) {
    throw new ApiError(400, 'discountPrice must be less than the price');
  }
  return dp;
}

/** Validate a body categoryId, confirm it exists, and return it (or null). */
async function resolveCategoryId(categoryId: unknown): Promise<number | null> {
  if (categoryId === undefined || categoryId === null) return null;
  const id = bodyId(categoryId, 'categoryId');
  if (!(await Category.findByPk(id))) {
    throw new ApiError(400, 'Invalid categoryId');
  }
  return id;
}

const LEVELS: CourseLevel[] = ['beginner', 'intermediate', 'advanced'];
const INSTRUCTOR_ATTRS = ['id', 'firstName', 'lastName', 'userName'];

/**
 * Public catalog: published courses only. Supports free-text search across the
 * course title/subtitle/description AND the related category name + instructor
 * name, plus category/level filters, sort, and pagination.
 */
export const getCatalog = async (req: Request, res: Response): Promise<void> => {
  const limit = clampInt(req.query.limit, 24, 1, 100);
  const page = clampInt(req.query.page, 1, 1, 10000);
  const offset = (page - 1) * limit;

  const filter: Record<string, unknown> = { status: 'published' };
  if (req.query.categoryId !== undefined) {
    const categoryId = Number(req.query.categoryId);
    if (Number.isInteger(categoryId) && categoryId > 0) {
      filter.categoryId = categoryId;
    }
  }
  if (LEVELS.includes(req.query.level as CourseLevel)) {
    filter.level = req.query.level;
  }
  // Scope to one instructor's published courses (their public "storefront").
  if (req.query.instructorId !== undefined) {
    const instructorId = Number(req.query.instructorId);
    if (Number.isInteger(instructorId) && instructorId > 0) {
      filter.instructorId = instructorId;
    }
  }

  // Single free-text query matched (case-insensitively) against the course's own
  // text columns and the associated category + instructor names.
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (q) {
    const like = { [Op.iLike]: `%${q}%` };
    filter[Op.or as unknown as string] = [
      { title: like },
      { subtitle: like },
      { description: like },
      { '$category.name$': like },
      { '$instructor.firstName$': like },
      { '$instructor.lastName$': like },
      { '$instructor.userName$': like },
    ];
  }

  // Sort options. "popular" orders by a correlated enrollment count so the
  // homepage can surface the most-enrolled courses.
  let order: Order;
  switch (req.query.sort) {
    case 'popular':
      order = [
        [
          literal(
            '(SELECT COUNT(*) FROM "enrollments" AS e WHERE e."courseId" = "Course"."id")'
          ),
          'DESC',
        ],
        ['publishedAt', 'DESC'],
      ];
      break;
    case 'price-low':
      order = [['price', 'ASC']];
      break;
    case 'price-high':
      order = [['price', 'DESC']];
      break;
    case 'oldest':
      order = [['publishedAt', 'ASC']];
      break;
    default:
      order = [
        ['publishedAt', 'DESC'],
        ['createdAt', 'DESC'],
      ];
  }

  const { rows, count } = await Course.findAndCountAll({
    where: filter,
    order,
    limit,
    offset,
    include: [
      { model: Category, as: 'category' },
      { model: User, as: 'instructor', attributes: INSTRUCTOR_ATTRS },
      THUMBNAIL_ASSET_INCLUDE,
    ],
    distinct: true,
    // Required so the `$category.name$` / `$instructor.*$` search conditions
    // resolve against the joined tables when a LIMIT is applied (all includes
    // here are belongsTo, so the row count stays correct).
    subQuery: false,
  });

  res.status(200).json({
    data: await serializeCourseList(rows),
    pagination: calculatePaginationInfo(count, limit, page),
  });
};

/** All courses (Admin): the global management view, any status. */
export const getAllCourses = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { where, order, limit, offset, page } = parseRequestParams(req, Course);

  const { rows, count } = await Course.findAndCountAll({
    where,
    order,
    limit,
    offset,
    include: [
      { model: Category, as: 'category' },
      { model: User, as: 'instructor', attributes: INSTRUCTOR_ATTRS },
      THUMBNAIL_ASSET_INCLUDE,
    ],
    distinct: true,
  });

  res.status(200).json({
    data: await serializeCourseList(rows),
    pagination: calculatePaginationInfo(count, limit, page),
  });
};

/** Courses authored by the current instructor (any status). */
export const getMyCourses = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { where, order, limit, offset, page } = parseRequestParams(req, Course);

  const { rows, count } = await Course.findAndCountAll({
    where: { ...(where as object), instructorId: req.user!.id },
    order,
    limit,
    offset,
    include: [{ model: Category, as: 'category' }, THUMBNAIL_ASSET_INCLUDE],
    distinct: true,
  });

  res.status(200).json({
    data: await serializeCourseList(rows),
    pagination: calculatePaginationInfo(count, limit, page),
  });
};

/** Full course detail with ordered sections and lessons. */
export const getCourseById = async (
  req: Request,
  res: Response
): Promise<void> => {
  const course = await Course.findByPk(req.params.id, {
    include: [
      { model: Category, as: 'category' },
      { model: User, as: 'instructor', attributes: INSTRUCTOR_ATTRS },
      THUMBNAIL_ASSET_INCLUDE,
      BANNER_ASSET_INCLUDE,
      TRAILER_ASSET_INCLUDE,
      {
        model: Section,
        as: 'sections',
        include: [{ model: Lesson, as: 'lessons' }],
      },
    ],
    order: [
      [{ model: Section, as: 'sections' }, 'position', 'ASC'],
      [
        { model: Section, as: 'sections' },
        { model: Lesson, as: 'lessons' },
        'position',
        'ASC',
      ],
    ],
  });

  if (!course) {
    throw new ApiError(404, 'Course not found');
  }
  // Draft courses are visible only to their instructor or an Admin.
  const owner = isAdminOrOwner(req.user, course.instructorId);
  if (course.status !== 'published' && !owner) {
    throw new ApiError(403, 'This course is not available');
  }

  // Decide whether the viewer may see protected lesson content. Owners/admins
  // always can; otherwise only if enrolled. Everyone else (anonymous visitors,
  // logged-in non-enrolled users) gets curriculum metadata + preview lessons
  // only. The video source/notes of paid lessons are withheld so the catalog
  // page can't be used to watch a course for free.
  let enrolled = false;
  if (!owner && req.user) {
    enrolled = !!(await Enrollment.findOne({
      where: { userId: req.user.id, courseId: course.id },
    }));
  }
  type LessonJSON = {
    isPreview: boolean;
    videoAssetId: number | null;
    content: string | null;
    videoDurationSec?: number | null;
  };
  const data = course.toJSON() as {
    sections?: Array<{ lessons?: LessonJSON[] }>;
    [key: string]: unknown;
  };
  // Replace the stored values with resolved display URLs; drop the internal assets.
  data.thumbnail = await resolveThumbnailUrl(course);
  data.banner = await resolveBannerUrl(course);
  data.trailer = await resolveTrailerPlayback(course, req.user?.id ?? 0);
  delete data.thumbnailAsset;
  delete data.bannerAsset;
  delete data.trailerAsset;

  // Aggregate stats computed from the already-loaded sections/lessons + a single
  // enrollment count, so the public page can show lessons / duration / students.
  let lessonCount = 0;
  let totalDurationSec = 0;
  for (const section of data.sections ?? []) {
    for (const lesson of section.lessons ?? []) {
      lessonCount += 1;
      totalDurationSec += Number(lesson.videoDurationSec ?? 0);
    }
  }
  data.lessonCount = lessonCount;
  data.totalDurationSec = totalDurationSec;
  data.studentCount = await Enrollment.count({ where: { courseId: course.id } });
  data.isEnrolled = enrolled;

  if (!owner && !enrolled) {
    for (const section of data.sections ?? []) {
      for (const lesson of section.lessons ?? []) {
        if (!lesson.isPreview) {
          lesson.videoAssetId = null;
          lesson.content = null;
        }
      }
    }
  }

  res.status(200).json({ data, message: 'Course fetched successfully' });
};

export const addCourse = async (req: Request, res: Response): Promise<void> => {
  const {
    title,
    subtitle,
    description,
    categoryId,
    level,
    language,
    tags,
    learningOutcomes,
    prerequisites,
    whoThisIsFor,
    thumbnailAssetId,
    bannerAssetId,
    trailerAssetId,
    price,
    discountPrice,
  } = req.body ?? {};
  if (!title) {
    throw new ApiError(400, 'Course title is required');
  }
  if (level && !LEVELS.includes(level)) {
    throw new ApiError(400, 'level must be beginner, intermediate, or advanced');
  }

  // Images are uploaded assets (R2) or none; external URLs aren't supported.
  let thumbAssetId: number | null = null;
  if (thumbnailAssetId !== undefined && thumbnailAssetId !== null) {
    thumbAssetId = await validateImageAsset(thumbnailAssetId, req.user, 'thumbnailAssetId');
  }
  let bannerId: number | null = null;
  if (bannerAssetId !== undefined && bannerAssetId !== null) {
    bannerId = await validateImageAsset(bannerAssetId, req.user, 'bannerAssetId');
  }
  let trailerId: number | null = null;
  if (trailerAssetId !== undefined && trailerAssetId !== null) {
    trailerId = await validateVideoAsset(trailerAssetId, req.user, 'trailerAssetId');
  }

  // price is in paise (₹1 = 100); defaults to 0 (free) when omitted.
  const resolvedPrice = price === undefined ? 0 : validateCoursePrice(price);

  const course = await Course.create({
    title,
    subtitle: subtitle ?? null,
    description: description ?? null,
    categoryId: await resolveCategoryId(categoryId),
    level: level ?? 'beginner',
    language: typeof language === 'string' && language.trim() ? language.trim() : 'English',
    tags: toStringList(tags) ?? [],
    learningOutcomes: toStringList(learningOutcomes) ?? [],
    prerequisites: toStringList(prerequisites) ?? [],
    whoThisIsFor: toStringList(whoThisIsFor) ?? [],
    thumbnailAssetId: thumbAssetId,
    bannerAssetId: bannerId,
    trailerAssetId: trailerId,
    price: resolvedPrice,
    discountPrice: resolveDiscountPrice(discountPrice, resolvedPrice),
    instructorId: req.user!.id,
  });
  res.status(201).json({
    data: await serializeCourse(course),
    message: 'Course created successfully',
  });
};

export const updateCourse = async (
  req: Request,
  res: Response
): Promise<void> => {
  const course = await loadOwnedCourse(req.params.id, req.user);

  const {
    title,
    subtitle,
    description,
    categoryId,
    level,
    language,
    tags,
    learningOutcomes,
    prerequisites,
    whoThisIsFor,
    thumbnailAssetId,
    bannerAssetId,
    trailerAssetId,
    price,
    discountPrice,
  } = req.body ?? {};
  if (level && !LEVELS.includes(level)) {
    throw new ApiError(400, 'level must be beginner, intermediate, or advanced');
  }

  const previousThumbId = course.thumbnailAssetId ?? null;
  const previousBannerId = course.bannerAssetId ?? null;
  const previousTrailerId = course.trailerAssetId ?? null;

  if (title !== undefined) course.title = title;
  if (subtitle !== undefined) course.subtitle = subtitle;
  if (description !== undefined) course.description = description;
  if (categoryId !== undefined) course.categoryId = await resolveCategoryId(categoryId);
  if (level !== undefined) course.level = level;
  if (language !== undefined) {
    course.language =
      typeof language === 'string' && language.trim() ? language.trim() : 'English';
  }
  if (tags !== undefined) course.tags = toStringList(tags) ?? [];
  if (learningOutcomes !== undefined) {
    course.learningOutcomes = toStringList(learningOutcomes) ?? [];
  }
  if (prerequisites !== undefined) course.prerequisites = toStringList(prerequisites) ?? [];
  if (whoThisIsFor !== undefined) course.whoThisIsFor = toStringList(whoThisIsFor) ?? [];
  // Images are uploaded assets (R2) or none; pass null to clear.
  if (thumbnailAssetId !== undefined) {
    course.thumbnailAssetId =
      thumbnailAssetId === null
        ? null
        : await validateImageAsset(thumbnailAssetId, req.user, 'thumbnailAssetId');
  }
  if (bannerAssetId !== undefined) {
    course.bannerAssetId =
      bannerAssetId === null
        ? null
        : await validateImageAsset(bannerAssetId, req.user, 'bannerAssetId');
  }
  if (trailerAssetId !== undefined) {
    course.trailerAssetId =
      trailerAssetId === null
        ? null
        : await validateVideoAsset(trailerAssetId, req.user, 'trailerAssetId');
  }
  if (price !== undefined) course.price = validateCoursePrice(price);
  // Re-validate discount against the (possibly new) price whenever either changes.
  if (discountPrice !== undefined || price !== undefined) {
    course.discountPrice = resolveDiscountPrice(
      discountPrice !== undefined ? discountPrice : course.discountPrice,
      course.price
    );
  }
  await course.save();

  // Replaced/removed images are now unreferenced, so purge the old R2 objects + rows.
  const orphaned: number[] = [];
  if (previousThumbId && previousThumbId !== course.thumbnailAssetId) {
    if ((await assetReferenceCount(previousThumbId)) === 0) orphaned.push(previousThumbId);
  }
  if (previousBannerId && previousBannerId !== course.bannerAssetId) {
    if ((await assetReferenceCount(previousBannerId)) === 0) orphaned.push(previousBannerId);
  }
  if (previousTrailerId && previousTrailerId !== course.trailerAssetId) {
    if ((await assetReferenceCount(previousTrailerId)) === 0) orphaned.push(previousTrailerId);
  }
  if (orphaned.length > 0) await purgeAssetsByIds(orphaned);

  res.status(200).json({
    data: await serializeCourse(course),
    message: 'Course updated successfully',
  });
};

export const publishCourse = async (
  req: Request,
  res: Response
): Promise<void> => {
  const course = await loadOwnedCourse(req.params.id, req.user);
  const lessonCount = await Lesson.count({ where: { courseId: course.id } });
  if (lessonCount === 0) {
    throw new ApiError(400, 'Add at least one lesson before publishing');
  }
  course.status = 'published';
  course.publishedAt = new Date();
  await course.save();
  res.status(200).json({ data: course, message: 'Course published' });
};

export const unpublishCourse = async (
  req: Request,
  res: Response
): Promise<void> => {
  const course = await loadOwnedCourse(req.params.id, req.user);
  course.status = 'draft';
  await course.save();
  res.status(200).json({ data: course, message: 'Course unpublished' });
};

export const deleteCourse = async (
  req: Request,
  res: Response
): Promise<void> => {
  const course = await loadOwnedCourse(req.params.id, req.user);

  // Collect R2 video assets before the DB cascade removes the lesson rows.
  const lessons = await Lesson.findAll({
    where: { courseId: course.id },
    attributes: ['videoAssetId'],
  });
  const candidateIds = [
    ...new Set([
      ...lessons.map((l) => l.videoAssetId).filter((v): v is number => v != null),
      ...(course.thumbnailAssetId ? [course.thumbnailAssetId] : []),
      ...(course.bannerAssetId ? [course.bannerAssetId] : []),
      ...(course.trailerAssetId ? [course.trailerAssetId] : []),
    ]),
  ];

  await course.destroy(); // cascades sections, lessons, enrollments, progress

  // After the cascade, purge only assets no other (cross-course) lesson references.
  const toPurge: number[] = [];
  for (const id of candidateIds) {
    if ((await assetReferenceCount(id)) === 0) toPurge.push(id);
  }
  await purgeAssetsByIds(toPurge);

  res.status(200).json({ message: 'Course deleted successfully' });
};

/**
 * Return a playback descriptor for the course trailer — HLS (preferred) or
 * presigned R2 MP4. Publicly accessible for published courses (trailers are
 * marketing content; no enrolment required). Draft trailers are gated to
 * the instructor/admin so they can preview before publishing.
 */
export const getTrailer = async (req: Request, res: Response): Promise<void> => {
  const course = await Course.findByPk(req.params.id, { include: [TRAILER_ASSET_INCLUDE] });
  if (!course) throw new ApiError(404, 'Course not found');
  if (course.status !== 'published' && !isAdminOrOwner(req.user, course.instructorId)) {
    throw new ApiError(403, 'Course not available');
  }
  if (!course.trailerAssetId) throw new ApiError(404, 'This course has no trailer');
  const playback = await resolveTrailerPlayback(course, req.user?.id ?? 0);
  if (!playback) throw new ApiError(409, 'Trailer is not ready yet');
  res.status(200).json({ data: playback, message: 'Trailer playback URL issued' });
};
