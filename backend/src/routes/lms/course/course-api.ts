import { Router } from 'express';
import { auth_middleware } from '../../../middleware/auth-middleware';
import { optional_auth_middleware } from '../../../middleware/optional-auth-middleware';
import { requireRole } from '../../../middleware/role-middleware';
import { id_checker_middleware } from '../../../middleware/id-validator-middleware';
import { asyncHandler } from '../../../helpers/async-handler';
import {
  addCourse,
  deleteCourse,
  getAllCourses,
  getCatalog,
  getCourseById,
  getMyCourses,
  getTrailer,
  publishCourse,
  unpublishCourse,
  updateCourse,
} from './course-controller';

const router = Router();

// Moderation surface (edit/publish/delete/list-own): Admins act on ANY course
// (ownership is bypassed by isAdminOrOwner), instructors only on their own.
const instructor = requireRole('Admin', 'Instructor');
// Authoring a NEW course is an instructor action only. Admins are operators,
// not content authors — they moderate existing courses, they don't create them.
const authorOnly = requireRole('Instructor');

// Public (no login): the homepage catalog and course pages must be visitable.
router.get('/catalog', asyncHandler(getCatalog));
router.get(
  '/getCourseById/:id',
  optional_auth_middleware,
  id_checker_middleware,
  asyncHandler(getCourseById)
);
router.get(
  '/trailer/:id',
  optional_auth_middleware,
  id_checker_middleware,
  asyncHandler(getTrailer)
);

router.get('/all', auth_middleware, requireRole('Admin'), asyncHandler(getAllCourses));
router.get('/my-courses', auth_middleware, instructor, asyncHandler(getMyCourses));
router.post('/addCourse', auth_middleware, authorOnly, asyncHandler(addCourse));
router.put(
  '/updateCourse/:id',
  auth_middleware,
  instructor,
  id_checker_middleware,
  asyncHandler(updateCourse)
);
router.post(
  '/publishCourse/:id',
  auth_middleware,
  instructor,
  id_checker_middleware,
  asyncHandler(publishCourse)
);
router.post(
  '/unpublishCourse/:id',
  auth_middleware,
  instructor,
  id_checker_middleware,
  asyncHandler(unpublishCourse)
);
router.delete(
  '/deleteCourse/:id',
  auth_middleware,
  instructor,
  id_checker_middleware,
  asyncHandler(deleteCourse)
);

export default router;
