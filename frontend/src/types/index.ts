export type RoleName = 'Admin' | 'Instructor' | 'Student'

/** Shape of `data` returned by /user/login and /register (the JWT payload). */
export interface AuthUser {
  id: number
  userName: string
  email: string
  roleId: number
  roleName: RoleName
  lastPermissionUpdate?: string
  // populated when fetched from /user/me
  firstName?: string
  lastName?: string
  avatarUrl?: string | null
}

/** POST /user/login | /register | /become-instructor response. */
export interface LoginResponse {
  token: string
  data: AuthUser
  message?: string
}

export type CourseLevel = 'beginner' | 'intermediate' | 'advanced'
export type CourseStatus = 'draft' | 'published'

export interface Category {
  id: number
  name: string
  description?: string | null
}

export interface Instructor {
  id: number
  firstName?: string
  lastName?: string
  userName?: string
}

export interface Course {
  id: number
  title: string
  subtitle?: string | null
  description?: string | null
  thumbnail?: string | null
  thumbnailAssetId?: number | null
  banner?: string | null
  bannerAssetId?: number | null
  /** Playback descriptor returned by GET /course/trailer/:id — only present in course detail. */
  trailer?: { source: 'hls' | 'r2'; url: string } | null
  trailerAssetId?: number | null
  price: number // paise
  discountPrice?: number | null // paise
  currency: string
  level: CourseLevel
  language?: string
  tags?: string[]
  learningOutcomes?: string[]
  prerequisites?: string[]
  whoThisIsFor?: string[]
  status: CourseStatus
  categoryId?: number | null
  instructorId: number
  category?: Category | null
  instructor?: Instructor
  sections?: Section[]
  publishedAt?: string | null
  updatedAt?: string | null
  // Aggregates attached by the API (catalog + detail).
  studentCount?: number
  lessonCount?: number
  totalDurationSec?: number
  isEnrolled?: boolean
}

export type LessonType = 'video' | 'text'

export interface LessonResource {
  title: string
  url: string
}

export interface Lesson {
  id: number
  sectionId: number
  courseId: number
  title: string
  description?: string | null
  type: LessonType
  content?: string | null
  videoAssetId?: number | null
  videoDurationSec?: number | null
  resources?: LessonResource[]
  isPreview: boolean
  position: number
}

export interface Section {
  id: number
  courseId: number
  title: string
  position: number
  lessons?: Lesson[]
}

export interface Pagination {
  totalItems: number
  totalPages: number
  currentPage: number
  pageSize: number
}

export interface ListResponse<T> {
  data: T[]
  pagination?: Pagination
  message?: string
}

// ---- Admin control panel ----

/** A user row as returned by /user/getAllUsers (password never included). */
export interface AdminUser {
  id: number
  userName: string
  firstName: string
  lastName: string
  email: string
  roleId: number
  phone?: string | null
  dateOfBirth?: string | null
  address?: string | null
  role?: Role
  createdAt?: string
}

export interface Role {
  id: number
  roleName: string
  lastPermissionUpdate?: string
  createdAt?: string
}

/** An admin-panel menu node (RBAC is expressed as permissions over these). */
export interface MenuItem {
  id: number
  parentId: number | null
  label: string
  routeLink: string
  icon?: string | null
  checkList?: string | null
  isBoth?: boolean
}

/** A role's permission over one menu (internal can* columns). */
export interface PermissionEntry {
  id: number
  roleId: number
  menuId: number
  canRead: boolean
  canCreate: boolean
  canUpdate: boolean
  canDelete: boolean
  menu?: MenuItem
}
