import { Link } from 'react-router-dom'
import { PlayCircle, Users, BookOpen, CheckCircle2 } from 'lucide-react'
import { formatPrice } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useMyEnrollments } from '@/features/enrollment/api'
import type { Course } from '@/types'

// Varied gradient covers so a thumbnail-less catalog stays colorful, not monotone.
const COVERS = [
  'from-[#ff5a3c] to-[#ffb020]',
  'from-[#13b6a4] to-[#7ce0cf]',
  'from-[#7c6bff] to-[#b3a7ff]',
  'from-[#ff7a45] to-[#ff5a3c]',
  'from-[#1fa2ff] to-[#13b6a4]',
  'from-[#ffb020] to-[#ff7a45]',
  'from-[#ff5a8a] to-[#ff5a3c]',
  'from-[#13b6a4] to-[#1fa2ff]',
]

function coverFor(seed: string) {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return COVERS[h % COVERS.length]
}

function compact(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n)
}

export function CourseCard({ course }: { course: Course }) {
  const instructor = course.instructor
    ? `${course.instructor.firstName ?? ''} ${course.instructor.lastName ?? ''}`.trim() ||
      course.instructor.userName ||
      'VeoLMS'
    : 'VeoLMS'

  const isFree = !course.price || course.price <= 0
  const hasDiscount =
    !isFree && course.discountPrice != null && course.discountPrice < course.price
  // Already-enrolled courses show an "Enrolled" state instead of a price/buy CTA.
  // isEnrolled is only set on the detail endpoint, so fall back to the (shared,
  // cached) enrollment list for catalog cards.
  const { data: enrollments } = useMyEnrollments()
  const enrolled =
    course.isEnrolled ?? enrollments?.some((e) => e.courseId === course.id) ?? false
  const cover = coverFor(String(course.id ?? course.title))
  const initial = course.title?.trim().charAt(0).toUpperCase() || 'V'
  const students = course.studentCount ?? 0
  const lessons = course.lessonCount ?? 0
  const blurb = course.subtitle || course.description || ''
  const to = `/courses/${course.id}`

  return (
    <article className="pop pop-hover flex h-full flex-col overflow-hidden">
      <Link to={to} className="group relative block aspect-video w-full overflow-hidden border-b-2 border-ink">
        {course.thumbnail ? (
          <img
            src={course.thumbnail}
            alt={course.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className={'relative flex h-full w-full items-center justify-center bg-gradient-to-br ' + cover}>
            <div
              className="absolute inset-0 opacity-30 [background-image:radial-gradient(rgba(255,255,255,0.55)_1.5px,transparent_1.6px)] [background-size:18px_18px]"
              aria-hidden
            />
            <span className="font-grotesk text-6xl font-bold text-white/90 drop-shadow-sm">
              {initial}
            </span>
          </div>
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-ink/35 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          <PlayCircle className="h-12 w-12 text-white drop-shadow" />
        </div>
        {course.category && (
          <span className="tag absolute left-3 top-3 rounded-full bg-white px-2.5 py-1 text-xs font-bold text-foreground">
            {course.category.name}
          </span>
        )}
        {enrolled ? (
          <span className="tag absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-teal px-2.5 py-1 text-xs font-bold text-white">
            <CheckCircle2 className="h-3.5 w-3.5" /> Enrolled
          </span>
        ) : isFree ? (
          <span className="tag absolute right-3 top-3 rounded-full bg-amber px-2.5 py-1 text-xs font-bold text-ink">
            Free
          </span>
        ) : (
          hasDiscount && (
            <span className="tag absolute right-3 top-3 rounded-full bg-primary px-2.5 py-1 text-xs font-bold text-primary-foreground">
              Sale
            </span>
          )
        )}
      </Link>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <Link to={to}>
          <h3 className="line-clamp-2 text-lg font-extrabold leading-snug tracking-tight transition-colors hover:text-primary">
            {course.title}
          </h3>
        </Link>
        <p className="text-sm font-medium text-muted-foreground">{instructor}</p>
        {blurb && (
          <p className="line-clamp-2 text-sm text-muted-foreground">{blurb}</p>
        )}

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Users className="h-3.5 w-3.5" /> {compact(students)} students
          </span>
          {lessons > 0 && (
            <span className="inline-flex items-center gap-1">
              <BookOpen className="h-3.5 w-3.5" /> {lessons} lessons
            </span>
          )}
          <span className="capitalize text-primary-strong">{course.level}</span>
        </div>

        <div className="mt-auto border-t-2 border-dashed border-border pt-3">
          {enrolled ? (
            // Owned: no price/buy CTA, just a way back into the course.
            <Button size="sm" asChild className="w-full">
              <Link to={`/learn/${course.id}`}>
                <PlayCircle className="h-4 w-4" />
                Go to course
              </Link>
            </Button>
          ) : (
            <>
              <div className="flex items-baseline gap-2">
                <span className="font-grotesk text-base font-extrabold text-primary-strong">
                  {isFree ? 'Free' : formatPrice(hasDiscount ? course.discountPrice! : course.price, course.currency)}
                </span>
                {hasDiscount && (
                  <span className="text-sm font-semibold text-muted-foreground line-through">
                    {formatPrice(course.price, course.currency)}
                  </span>
                )}
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Button variant="outline" size="sm" asChild className="flex-1">
                  <Link to={to}>Preview</Link>
                </Button>
                <Button size="sm" asChild className="flex-1">
                  <Link to={to}>{isFree ? 'Enroll' : 'Buy now'}</Link>
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </article>
  )
}

export function CourseCardSkeleton() {
  return (
    <div className="pop flex flex-col overflow-hidden">
      <div className="aspect-video w-full animate-pulse border-b-2 border-ink bg-muted" />
      <div className="space-y-3 p-4">
        <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
        <div className="h-4 w-4/5 animate-pulse rounded bg-muted" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
      </div>
    </div>
  )
}
