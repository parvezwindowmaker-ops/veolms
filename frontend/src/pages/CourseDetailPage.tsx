import { useState } from 'react'
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom'
import {
  PlayCircle,
  Lock,
  Video,
  FileText,
  BookOpen,
  CheckCircle2,
  Settings,
  Users,
  Clock,
  Globe,
  CalendarDays,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { useCourseDetail } from '@/features/courses/detail'
import { useMyEnrollments, useCheckout } from '@/features/enrollment/api'
import { useAuth } from '@/context/AuthContext'
import { apiErrorMessage } from '@/lib/api'
import { formatPrice, cn } from '@/lib/utils'
import { formatDuration } from '@/lib/video'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { BackLink } from '@/components/BackLink'
import { Modal } from '@/components/ui/modal'
import { LessonPlayer } from '@/components/LessonPlayer'
import { usePlayback } from '@/features/learn/api'
import type { Lesson } from '@/types'

export function CourseDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { user, isAuthenticated, isAdmin } = useAuth()
  const { data: course, isLoading, isError } = useCourseDetail(id)
  const { data: enrollments } = useMyEnrollments()
  const startCheckout = useCheckout()

  const [preview, setPreview] = useState<Lesson | null>(null)
  const [buying, setBuying] = useState(false)
  const [error, setError] = useState('')
  const [showTrailer, setShowTrailer] = useState(false)
  if (isLoading) {
    return <div className="mx-auto max-w-5xl px-4 py-20 text-muted-foreground">Loading…</div>
  }
  if (isError || !course) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-20 text-center text-muted-foreground">
        Course not found.{' '}
        <Link to="/courses" className="font-semibold text-primary-strong hover:underline">
          Browse courses
        </Link>
      </div>
    )
  }

  const sections = course.sections ?? []
  const lessons = sections.flatMap((s) => s.lessons ?? [])
  const isFree = !course.price || course.price <= 0
  const enrolled = enrollments?.some((e) => e.courseId === course.id) ?? false
  const canManage = isAdmin || (!!user && course.instructorId === user.id)
  const instructor = course.instructor
    ? `${course.instructor.firstName ?? ''} ${course.instructor.lastName ?? ''}`.trim() ||
      course.instructor.userName ||
      'VeoLMS'
    : 'VeoLMS'

  const studentCount = course.studentCount ?? 0
  const totalDuration =
    course.totalDurationSec ??
    lessons.reduce((sum, l) => sum + (l.videoDurationSec ?? 0), 0)
  const hasDiscount =
    !isFree && course.discountPrice != null && course.discountPrice < course.price
  const effectivePrice = hasDiscount ? course.discountPrice! : course.price
  const lastUpdated = course.updatedAt
    ? new Date(course.updatedAt).toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
      })
    : null
  const outcomes = course.learningOutcomes ?? []
  const prerequisites = course.prerequisites ?? []
  const audience = course.whoThisIsFor ?? []

  const previewLessons = lessons.filter((l) => l.isPreview && !!l.videoAssetId)
  const previewIdx = preview ? previewLessons.findIndex((l) => l.id === preview.id) : -1
  const prevLesson = previewIdx > 0 ? previewLessons[previewIdx - 1] : null
  const nextLesson = previewIdx >= 0 && previewIdx < previewLessons.length - 1 ? previewLessons[previewIdx + 1] : null

  const onBuy = async () => {
    if (!isAuthenticated) {
      navigate('/login', { state: { from: location.pathname } })
      return
    }
    setError('')
    setBuying(true)
    try {
      const ok = await startCheckout(course)
      if (ok) navigate(`/learn/${course.id}`)
    } catch (err) {
      setError(apiErrorMessage(err, 'Payment could not be completed'))
    } finally {
      setBuying(false)
    }
  }

  const PurchaseCTA = () => {
    if (canManage) {
      return (
        <Button className="w-full" asChild>
          <Link to={`/admin/courses/${course.id}`}>
            <Settings className="h-4 w-4" />
            Manage course
          </Link>
        </Button>
      )
    }
    if (enrolled) {
      return (
        <Button className="w-full" asChild>
          <Link to={`/learn/${course.id}`}>
            <PlayCircle className="h-4 w-4" />
            Go to course
          </Link>
        </Button>
      )
    }
    return (
      <Button className="w-full" onClick={onBuy} disabled={buying}>
        {buying ? 'Processing…' : isFree ? 'Enroll for free' : `Buy for ${formatPrice(effectivePrice, course.currency)}`}
      </Button>
    )
  }

  return (
    <>
      {/* Hero */}
      <section className="relative isolate overflow-hidden bg-tint">
        {course.banner ? (
          <>
            <img
              src={course.banner}
              alt=""
              aria-hidden
              className="pointer-events-none absolute inset-0 -z-20 h-full w-full object-cover"
            />
            {/* gradient: left stays readable, right shows banner */}
            <div
              className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-r from-tint/95 via-tint/70 to-tint/30"
              aria-hidden
            />
            <div
              className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-t from-tint/80 to-transparent"
              aria-hidden
            />
          </>
        ) : (
          <>
            {/* pastel blobs — only shown when there's no banner */}
            <div
              className="pointer-events-none absolute -right-16 -top-24 -z-10 h-80 w-80 rounded-full bg-[#ffb59c] opacity-70 blur-3xl"
              aria-hidden
            />
            <div
              className="pointer-events-none absolute -bottom-24 left-1/4 -z-10 h-64 w-64 rounded-full bg-[#a7ecdd] opacity-70 blur-3xl"
              aria-hidden
            />
          </>
        )}
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-3 lg:px-8 lg:py-16">
          {/* Left: info */}
          <div className="lg:col-span-2">
            <BackLink to="/courses">All courses</BackLink>
            <h1 className="mt-4 text-4xl font-extrabold tracking-tight sm:text-5xl">
              {course.title}
            </h1>
            {course.subtitle && (
              <p className="mt-4 max-w-2xl text-lg font-medium text-muted-foreground">
                {course.subtitle}
              </p>
            )}
            <div className="mt-5 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span className="rounded-full bg-secondary px-3 py-1 font-semibold capitalize text-primary-strong">
                {course.level}
              </span>
              {course.category && (
                <span className="rounded-full bg-tint2 px-3 py-1 font-semibold text-teal">
                  {course.category.name}
                </span>
              )}
              <span className="font-medium">By {instructor}</span>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-medium text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <BookOpen className="h-4 w-4" /> {lessons.length} lessons
              </span>
              {totalDuration > 0 && (
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="h-4 w-4" /> {formatDuration(totalDuration)} total
                </span>
              )}
              <span className="inline-flex items-center gap-1.5">
                <Users className="h-4 w-4" /> {studentCount} students
              </span>
              {course.language && (
                <span className="inline-flex items-center gap-1.5">
                  <Globe className="h-4 w-4" /> {course.language}
                </span>
              )}
              {lastUpdated && (
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="h-4 w-4" /> Updated {lastUpdated}
                </span>
              )}
            </div>
            {course.description && (
              <div className="mt-9">
                <span className="eyebrow">About this course</span>
                <p className="mt-3 max-w-2xl whitespace-pre-line leading-relaxed text-foreground/90">
                  {course.description}
                </p>
              </div>
            )}

            {outcomes.length > 0 && (
              <div className="mt-9 max-w-2xl">
                <span className="eyebrow text-teal">What you'll learn</span>
                <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
                  {outcomes.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm font-medium text-foreground/90">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {prerequisites.length > 0 && (
              <div className="mt-9 max-w-2xl">
                <span className="eyebrow">Prerequisites</span>
                <ul className="mt-3 list-inside list-disc space-y-1.5 font-medium text-foreground/90">
                  {prerequisites.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            {audience.length > 0 && (
              <div className="mt-9 max-w-2xl">
                <span className="eyebrow text-violet">Who this course is for</span>
                <ul className="mt-3 list-inside list-disc space-y-1.5 font-medium text-foreground/90">
                  {audience.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            {(course.tags ?? []).length > 0 && (
              <div className="mt-9 flex flex-wrap gap-2">
                {(course.tags ?? []).map((tag) => (
                  <span key={tag} className="rounded-full bg-tint px-3 py-1 text-xs font-bold text-muted-foreground">
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Right: purchase card */}
          <div className="lg:col-span-1">
            <div className="pop overflow-hidden lg:sticky lg:top-20">
              <div className="aspect-video w-full">
                {showTrailer && course.trailer ? (
                  <LessonPlayer source={course.trailer.source} url={course.trailer.url} />
                ) : (
                  <div className="relative h-full w-full">
                    {course.thumbnail ? (
                      <img src={course.thumbnail} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary to-amber text-white">
                        <BookOpen className="h-12 w-12" />
                      </div>
                    )}
                    {course.trailer && (
                      <button
                        type="button"
                        onClick={() => setShowTrailer(true)}
                        aria-label="Play trailer"
                        className="absolute inset-0 flex items-center justify-center bg-ink/30 transition-colors hover:bg-ink/50"
                      >
                        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/90 text-primary-strong shadow-lg">
                          <PlayCircle className="h-9 w-9" />
                        </span>
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div className="space-y-4 p-5">
                {/* Already owns it: show an enrolled state, not a price (the owner/
                    admin still sees the price, since it's their course's listing). */}
                {enrolled && !canManage ? (
                  <Badge tone="success">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {isFree ? 'Enrolled' : 'Purchased'} · full access
                  </Badge>
                ) : (
                  <div className="flex items-baseline gap-2">
                    <p className="text-3xl font-extrabold tracking-tight text-primary-strong">
                      {isFree ? 'Free' : formatPrice(effectivePrice, course.currency)}
                    </p>
                    {hasDiscount && (
                      <p className="text-lg font-semibold text-muted-foreground line-through">
                        {formatPrice(course.price, course.currency)}
                      </p>
                    )}
                  </div>
                )}
                <PurchaseCTA />
                {error && (
                  <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
                    {error}
                  </p>
                )}
                <ul className="space-y-2.5 pt-1 text-sm text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-teal" /> Full lifetime access
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-teal" /> {lessons.length} lessons across {sections.length} sections
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-teal" /> Learn at your own pace
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Curriculum */}
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="lg:max-w-3xl">
          <span className="eyebrow">Curriculum</span>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight">Course content</h2>
          <p className="mt-2 font-grotesk text-muted-foreground">
            {sections.length} sections · {lessons.length} lessons
            {totalDuration > 0 && <> · {formatDuration(totalDuration)} total</>}
          </p>

          <div className="mt-7 space-y-5">
            {sections.map((section) => (
              <div key={section.id} className="pop overflow-hidden">
                <div className="border-b-2 border-foreground/10 px-5 py-3.5 font-bold">
                  {section.title}
                </div>
                <ul className="divide-y divide-border">
                  {(section.lessons ?? []).map((lesson) => {
                    const playable = lesson.isPreview && !!lesson.videoAssetId
                    return (
                      <li
                        key={lesson.id}
                        onClick={() => playable && setPreview(lesson)}
                        className={cn(
                          'flex items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-tint',
                          playable && 'cursor-pointer'
                        )}
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary-strong">
                            {lesson.type === 'video' ? (
                              <Video className="h-4 w-4" />
                            ) : (
                              <FileText className="h-4 w-4" />
                            )}
                          </span>
                          <span className="truncate font-medium">{lesson.title}</span>
                          {lesson.isPreview ? (
                            <span className="shrink-0 rounded-full bg-amber px-2.5 py-0.5 text-xs font-bold text-white">
                              preview
                            </span>
                          ) : (
                            <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          {lesson.type === 'video' && formatDuration(lesson.videoDurationSec) && (
                            <span className="font-grotesk text-xs text-muted-foreground">
                              {formatDuration(lesson.videoDurationSec)}
                            </span>
                          )}
                          {playable && (
                            <button
                              onClick={() => setPreview(lesson)}
                              className="inline-flex items-center gap-1 text-sm font-semibold text-primary-strong hover:underline"
                            >
                              <PlayCircle className="h-4 w-4" />
                              Preview
                            </button>
                          )}
                        </div>
                      </li>
                    )
                  })}
                  {(section.lessons ?? []).length === 0 && (
                    <li className="px-5 py-3.5 text-sm text-muted-foreground">
                      No lessons yet.
                    </li>
                  )}
                </ul>
              </div>
            ))}
            {sections.length === 0 && (
              <p className="rounded-2xl border-2 border-dashed border-border px-4 py-10 text-center text-muted-foreground">
                Curriculum coming soon.
              </p>
            )}
          </div>
        </div>
      </section>

      <Modal
        open={!!preview}
        onClose={() => setPreview(null)}
        title={preview?.title ?? 'Preview'}
        className="max-w-3xl"
      >
        {preview ? (
          <>
            <PreviewPlayer lessonId={preview.id} />

            {/* Prev / Next / Enroll row */}
            <div className="mt-4 flex items-center justify-between gap-3">
              <Button
                variant="outline"
                disabled={!prevLesson}
                onClick={() => prevLesson && setPreview(prevLesson)}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>

              {nextLesson ? (
                <Button onClick={() => setPreview(nextLesson)}>
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              ) : !enrolled && !canManage ? (
                <Button onClick={onBuy} disabled={buying}>
                  {buying
                    ? 'Processing…'
                    : isFree
                      ? 'Enroll for free'
                      : `Enroll · ${formatPrice(effectivePrice, course.currency)}`}
                </Button>
              ) : null}
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Preview not available.</p>
        )}
      </Modal>
    </>
  )
}

/**
 * Plays a free-preview lesson by fetching its gated playback source (encrypted
 * HLS or a short-lived presigned MP4). Preview lessons are viewable without
 * enrolling; the backend enforces that.
 */
function PreviewPlayer({ lessonId }: { lessonId: number }) {
  const playback = usePlayback(lessonId, true)

  if (playback.isLoading) {
    return (
      <div className="pop flex aspect-video w-full flex-col items-center justify-center gap-3 bg-tint text-sm font-semibold text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin" />
        Loading preview…
      </div>
    )
  }
  if (!playback.data) {
    return <p className="text-sm text-muted-foreground">Preview not available yet.</p>
  }
  return <LessonPlayer source={playback.data.source} url={playback.data.url} />
}
