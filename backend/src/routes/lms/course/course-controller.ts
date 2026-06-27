import { Request, Response } from 'express';
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
  resolveThumbnailUrl,
  serializeCourse,
  validateThumbnailAsset,
} from './course-thumbnail';
import {
  calculatePaginationInfo,
  parseRequestParams,
} from '../../../helpers/filters';

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

/** Public catalog: published courses only, with search/sort/pagination. */
export const getCatalog = async (req: Request, res: Response): Promise<void> => {
  const { where, order, limit, offset, page } = parseRequestParams(req, Course);

  const filter = { ...(where as object), status: 'published' } as Record<string, unknown>;
  if (req.query.categoryId !== undefined) {
    const categoryId = Number(req.query.categoryId);
    if (Number.isInteger(categoryId) && categoryId > 0) {
      filter.categoryId = categoryId;
    }
  }
  if (LEVELS.includes(req.query.level as CourseLevel)) {
    filter.level = req.query.level;
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
  });

  res.status(200).json({
    data: await Promise.all(rows.map(serializeCourse)),
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
    data: await Promise.all(rows.map(serializeCourse)),
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
    data: await Promise.all(rows.map(serializeCourse)),
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
    videoUrl: string | null;
    videoAssetId: number | null;
    content: string | null;
  };
  const data = course.toJSON() as {
    sections?: Array<{ lessons?: LessonJSON[] }>;
    [key: string]: unknown;
  };
  // Replace the stored value with the resolved display URL; drop the internal asset.
  data.thumbnail = await resolveThumbnailUrl(course);
  delete data.thumbnailAsset;
  if (!owner && !enrolled) {
    for (const section of data.sections ?? []) {
      for (const lesson of section.lessons ?? []) {
        if (!lesson.isPreview) {
          lesson.videoUrl = null;
          lesson.videoAssetId = null;
          lesson.content = null;
        }
      }
    }
  }

  res.status(200).json({ data, message: 'Course fetched successfully' });
};

export const addCourse = async (req: Request, res: Response): Promise<void> => {
  const { title, subtitle, description, categoryId, level, thumbnail, thumbnailAssetId, price } =
    req.body ?? {};
  if (!title) {
    throw new ApiError(400, 'Course title is required');
  }
  if (level && !LEVELS.includes(level)) {
    throw new ApiError(400, 'level must be beginner, intermediate, or advanced');
  }

  // An uploaded image takes precedence; otherwise an external URL (or neither).
  let thumbAssetId: number | null = null;
  let thumb: string | null = null;
  if (thumbnailAssetId !== undefined && thumbnailAssetId !== null) {
    thumbAssetId = await validateThumbnailAsset(thumbnailAssetId, req.user);
  } else if (thumbnail) {
    thumb = String(thumbnail);
  }

  const course = await Course.create({
    title,
    subtitle: subtitle ?? null,
    description: description ?? null,
    categoryId: await resolveCategoryId(categoryId),
    level: level ?? 'beginner',
    thumbnail: thumb,
    thumbnailAssetId: thumbAssetId,
    // price is in paise (₹1 = 100); defaults to 0 (free) when omitted.
    price: price === undefined ? 0 : validateCoursePrice(price),
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

  const { title, subtitle, description, categoryId, level, thumbnail, thumbnailAssetId, price } =
    req.body ?? {};
  if (level && !LEVELS.includes(level)) {
    throw new ApiError(400, 'level must be beginner, intermediate, or advanced');
  }

  const previousAssetId = course.thumbnailAssetId ?? null;

  if (title !== undefined) course.title = title;
  if (subtitle !== undefined) course.subtitle = subtitle;
  if (description !== undefined) course.description = description;
  if (categoryId !== undefined) course.categoryId = await resolveCategoryId(categoryId);
  if (level !== undefined) course.level = level;
  // Thumbnail: an uploaded image (thumbnailAssetId) wins; otherwise an external
  // URL string (`thumbnail`, null/'' clears it). Setting one detaches the other.
  if (thumbnailAssetId !== undefined && thumbnailAssetId !== null) {
    course.thumbnailAssetId = await validateThumbnailAsset(thumbnailAssetId, req.user);
    course.thumbnail = null;
  } else if (thumbnail !== undefined) {
    course.thumbnail = thumbnail || null;
    course.thumbnailAssetId = null;
  }
  if (price !== undefined) course.price = validateCoursePrice(price);
  await course.save();

  // Replaced/removed image is now unreferenced, so purge the old R2 object + row.
  if (
    previousAssetId &&
    previousAssetId !== course.thumbnailAssetId &&
    (await assetReferenceCount(previousAssetId)) === 0
  ) {
    await purgeAssetsByIds([previousAssetId]);
  }

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
