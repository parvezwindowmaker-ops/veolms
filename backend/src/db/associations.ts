import { Role } from '../routes/control/role/role-model';
import { User } from '../routes/control/user/user-model';
import { Menu } from '../routes/control/menu/menu-model';
import { Permission } from '../routes/control/permission/permission-model';
import { Category } from '../routes/lms/category/category-model';
import { Course } from '../routes/lms/course/course-model';
import { Section } from '../routes/lms/section/section-model';
import { Lesson } from '../routes/lms/lesson/lesson-model';
import { Enrollment } from '../routes/lms/enrollment/enrollment-model';
import { LessonProgress } from '../routes/lms/progress/lesson-progress-model';
import { MediaAsset } from '../routes/lms/media/media-asset-model';
import { Payment } from '../routes/lms/payment/payment-model';

/**
 * Wire up all model associations. Importing this module pulls in every model
 * (triggering their `init`), so it must be imported once before `sequelize.sync()`.
 */
export function defineAssociations(): void {
  // ---- Access control (admin panel) ----
  // A role has many users; a role cannot be deleted while users reference it.
  Role.hasMany(User, { foreignKey: 'roleId', onDelete: 'RESTRICT' });
  User.belongsTo(Role, { foreignKey: 'roleId', as: 'role' });

  // A role has many permissions; deleting a role removes its permissions.
  Role.hasMany(Permission, { foreignKey: 'roleId', onDelete: 'CASCADE' });
  Permission.belongsTo(Role, { foreignKey: 'roleId', as: 'role' });

  // A menu has many permissions; deleting a menu removes its permissions.
  Menu.hasMany(Permission, { foreignKey: 'menuId', onDelete: 'CASCADE' });
  Permission.belongsTo(Menu, { foreignKey: 'menuId', as: 'menu' });

  // Self-referencing menu tree.
  Menu.belongsTo(Menu, { foreignKey: 'parentId', as: 'parent' });
  Menu.hasMany(Menu, { foreignKey: 'parentId', as: 'children' });

  // ---- LMS domain ----
  // Category <-> Course
  Category.hasMany(Course, { foreignKey: 'categoryId', onDelete: 'SET NULL' });
  Course.belongsTo(Category, { foreignKey: 'categoryId', as: 'category' });

  // Instructor (User) <-> Course
  User.hasMany(Course, { foreignKey: 'instructorId', onDelete: 'RESTRICT' });
  Course.belongsTo(User, { foreignKey: 'instructorId', as: 'instructor' });

  // Course -> Section -> Lesson (deleting a course cascades to its content)
  Course.hasMany(Section, { foreignKey: 'courseId', as: 'sections', onDelete: 'CASCADE' });
  Section.belongsTo(Course, { foreignKey: 'courseId', as: 'course' });

  Section.hasMany(Lesson, { foreignKey: 'sectionId', as: 'lessons', onDelete: 'CASCADE' });
  Lesson.belongsTo(Section, { foreignKey: 'sectionId', as: 'section' });

  Course.hasMany(Lesson, { foreignKey: 'courseId', as: 'lessons', onDelete: 'CASCADE' });
  Lesson.belongsTo(Course, { foreignKey: 'courseId', as: 'course' });

  // Enrollment (student <-> course)
  User.hasMany(Enrollment, { foreignKey: 'userId', onDelete: 'CASCADE' });
  Enrollment.belongsTo(User, { foreignKey: 'userId', as: 'student' });
  Course.hasMany(Enrollment, { foreignKey: 'courseId', as: 'enrollments', onDelete: 'CASCADE' });
  Enrollment.belongsTo(Course, { foreignKey: 'courseId', as: 'course' });

  // Media assets (R2 objects). Deleting the uploader keeps the asset (SET NULL)
  // so media still attached to a live course isn't dropped; deleteUser purges
  // only the user's unreferenced assets explicitly.
  User.hasMany(MediaAsset, { foreignKey: 'uploadedById', onDelete: 'SET NULL' });
  MediaAsset.belongsTo(User, { foreignKey: 'uploadedById', as: 'uploader' });
  MediaAsset.hasMany(Lesson, { foreignKey: 'videoAssetId', onDelete: 'SET NULL' });
  Lesson.belongsTo(MediaAsset, { foreignKey: 'videoAssetId', as: 'videoAsset' });

  // User avatar -> media asset (detached, not cascaded, if the asset is removed).
  MediaAsset.hasMany(User, { foreignKey: 'avatarAssetId', onDelete: 'SET NULL' });
  User.belongsTo(MediaAsset, { foreignKey: 'avatarAssetId', as: 'avatar' });

  // Course thumbnail -> media asset (detached, not cascaded, if the asset is removed).
  MediaAsset.hasMany(Course, { foreignKey: 'thumbnailAssetId', onDelete: 'SET NULL' });
  Course.belongsTo(MediaAsset, { foreignKey: 'thumbnailAssetId', as: 'thumbnailAsset' });

  // Payments (purchase records). Mirror the enrollment lifecycle: removing a
  // user/course removes their payment rows too. (A production system would
  // soft-delete to preserve the financial audit trail; documented tradeoff.)
  User.hasMany(Payment, { foreignKey: 'userId', onDelete: 'CASCADE' });
  Payment.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  Course.hasMany(Payment, { foreignKey: 'courseId', as: 'payments', onDelete: 'CASCADE' });
  Payment.belongsTo(Course, { foreignKey: 'courseId', as: 'course' });

  // Lesson progress
  User.hasMany(LessonProgress, { foreignKey: 'userId', onDelete: 'CASCADE' });
  LessonProgress.belongsTo(User, { foreignKey: 'userId', as: 'student' });
  Lesson.hasMany(LessonProgress, { foreignKey: 'lessonId', onDelete: 'CASCADE' });
  LessonProgress.belongsTo(Lesson, { foreignKey: 'lessonId', as: 'lesson' });
  Course.hasMany(LessonProgress, { foreignKey: 'courseId', onDelete: 'CASCADE' });
  LessonProgress.belongsTo(Course, { foreignKey: 'courseId', as: 'course' });
}
