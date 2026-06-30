import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CheckCircle2, Circle, Video, FileText, Loader2 } from 'lucide-react'
import { BackLink } from '@/components/BackLink'
import { useCourseDetail } from '@/features/courses/detail'
import {
  useCourseProgress,
  usePlayback,
  useCompleteLesson,
  useUpdatePosition,
} from '@/features/learn/api'
import { apiErrorMessage } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { LessonPlayer } from '@/components/LessonPlayer'
import { cn } from '@/lib/utils'
import type { Lesson } from '@/types'

export function LearnPage() {
  const { courseId } = useParams()
  const { data: course, isLoading } = useCourseDetail(courseId)
  const progressQuery = useCourseProgress(courseId, true)
  const complete = useCompleteLesson(courseId as string)
  const updatePosition = useUpdatePosition()

  const lessons = useMemo<Lesson[]>(
    () => (course?.sections ?? []).flatMap((s) => s.lessons ?? []),
    [course]
  )
  const [selectedId, setSelectedId] = useState<number | null>(null)

  // Resume where the student left off: once curriculum + progress have loaded,
  // pick the initial lesson exactly once (the first not-completed lesson in order,
  // else the last lesson, else the first). Guarded so it never overrides later
  // manual sidebar clicks or Next-button navigation.
  const didResume = useRef(false)
  useEffect(() => {
    if (didResume.current || lessons.length === 0 || !progressQuery.data) return
    didResume.current = true
    const progressLessons = progressQuery.data.lessons ?? []
    const completed = new Set(
      progressLessons.filter((l) => l.completed).map((l) => l.lessonId)
    )
    const firstUnfinished = lessons.find((l) => !completed.has(l.id))
    setSelectedId(firstUnfinished?.id ?? lessons[lessons.length - 1]?.id ?? lessons[0].id)
  }, [lessons, progressQuery.data])

  const current =
    lessons.find((l) => l.id === selectedId) ?? lessons[0] ?? null

  const playback = usePlayback(current?.id, !!current && current.type === 'video')

  const completedIds = new Set(
    (progressQuery.data?.lessons ?? []).filter((l) => l.completed).map((l) => l.lessonId)
  )
  const percent = progressQuery.data?.percent ?? 0

  // Not enrolled (progress endpoint is enrollment-gated) → prompt to enroll.
  if (progressQuery.isError) {
    return (
      <div className="relative mx-auto max-w-lg px-4 py-24 text-center">
        <div className="pointer-events-none absolute -top-10 right-10 -z-10 h-56 w-56 rounded-full bg-[#ffb59c] opacity-70 blur-3xl" />
        <span className="eyebrow">Locked</span>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-foreground">
          You’re not enrolled
        </h1>
        <p className="mt-2 text-muted-foreground">
          Enroll in this course to start learning.
        </p>
        <Button asChild className="mt-6">
          <Link to={`/courses/${courseId}`}>View course</Link>
        </Button>
      </div>
    )
  }

  if (isLoading || !course) {
    return <div className="px-4 py-24 text-center text-muted-foreground">Loading…</div>
  }

  const idx = current ? lessons.findIndex((l) => l.id === current.id) : -1
  const next = idx >= 0 && idx < lessons.length - 1 ? lessons[idx + 1] : null
  const startAt =
    progressQuery.data?.lessons?.find((l) => l.lessonId === current?.id)
      ?.lastPositionSec ?? 0

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row lg:px-8">
      {/* Main */}
      <div className="min-w-0 flex-1">
        <BackLink to={`/courses/${courseId}`}>{course.title}</BackLink>

        <div className="mt-3">
          {current?.type === 'video' ? (
            playback.isLoading ? (
              <div className="pop flex aspect-video w-full flex-col items-center justify-center gap-3 bg-tint text-sm font-semibold text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin" />
                Loading video…
              </div>
            ) : playback.data ? (
              <LessonPlayer
                key={current!.id}
                source={playback.data.source}
                url={playback.data.url}
                startAt={startAt}
                onProgress={(sec) =>
                  updatePosition.mutate({ lessonId: current!.id, positionSec: sec })
                }
                onEnded={() => {
                  if (!completedIds.has(current!.id)) complete.mutate(current!.id)
                  if (next) setSelectedId(next.id)
                }}
              />
            ) : (
              <div className="pop flex aspect-video w-full items-center justify-center bg-tint text-sm font-semibold text-muted-foreground">
                Video unavailable
              </div>
            )
          ) : (
            <article
              className="pop max-w-none p-6 [&_a]:text-primary [&_a]:font-semibold [&_h1]:mb-3 [&_h1]:text-2xl [&_h1]:font-extrabold [&_h1]:tracking-tight [&_h1]:text-foreground [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-foreground [&_li]:ml-5 [&_li]:list-disc [&_p]:mb-3 [&_p]:leading-relaxed [&_p]:text-muted-foreground"
              dangerouslySetInnerHTML={{ __html: current?.content ?? '<p>No content.</p>' }}
            />
          )}
        </div>

        {current && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-2xl font-extrabold tracking-tight text-foreground">{current.title}</h1>
            <div className="flex items-center gap-2">
              {completedIds.has(current.id) ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-teal/15 px-3 py-1.5 text-sm font-semibold text-teal">
                  <CheckCircle2 className="h-4 w-4" /> Completed
                </span>
              ) : (
                <Button
                  size="sm"
                  onClick={() => complete.mutate(current.id)}
                  disabled={complete.isPending}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Mark complete
                </Button>
              )}
              {next && (
                <Button size="sm" variant="outline" onClick={() => setSelectedId(next.id)}>
                  Next
                </Button>
              )}
            </div>
          </div>
        )}
        {complete.isError && (
          <p className="mt-2 text-sm font-semibold text-destructive">
            {apiErrorMessage(complete.error)}
          </p>
        )}
      </div>

      {/* Sidebar */}
      <aside className="w-full shrink-0 lg:w-80">
        <div className="pop overflow-hidden">
          <div className="border-b-2 border-foreground p-4">
            <div className="flex items-center justify-between">
              <span className="eyebrow">Course content</span>
              <span className="font-grotesk text-sm font-bold text-primary-strong">{percent}%</span>
            </div>
            <div className="mt-2.5 h-2.5 w-full overflow-hidden rounded-full bg-secondary">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
            </div>
          </div>
          <div className="max-h-[70vh] overflow-y-auto p-2">
            {(course.sections ?? []).map((section) => (
              <div key={section.id} className="mb-2">
                <p className="font-grotesk px-2 py-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  {section.title}
                </p>
                <ul>
                  {(section.lessons ?? []).map((lesson) => {
                    const active = current?.id === lesson.id
                    const done = completedIds.has(lesson.id)
                    return (
                      <li key={lesson.id}>
                        <button
                          onClick={() => setSelectedId(lesson.id)}
                          className={cn(
                            'flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm font-medium transition-colors',
                            active
                              ? 'bg-secondary font-semibold text-primary-strong'
                              : 'text-foreground hover:bg-tint'
                          )}
                        >
                          {done ? (
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-teal" />
                          ) : (
                            <Circle className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                          )}
                          <span className="text-muted-foreground">
                            {lesson.type === 'video' ? (
                              <Video className="h-3.5 w-3.5" />
                            ) : (
                              <FileText className="h-3.5 w-3.5" />
                            )}
                          </span>
                          <span className="truncate">{lesson.title}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  )
}
