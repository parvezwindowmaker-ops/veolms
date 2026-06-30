import { Link } from 'react-router-dom'
import { PlayCircle, BookOpen, Trophy, ArrowRight, CheckCircle2, Circle } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useMyEnrollments, type EnrolledCourse } from '@/features/enrollment/api'
import { useRecentlyWatched } from '@/features/learn/api'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

function Thumb({ course }: { course?: EnrolledCourse['course'] }) {
  if (course?.thumbnail) {
    return <img src={course.thumbnail} alt="" className="h-full w-full object-cover" />
  }
  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary to-amber text-primary-foreground">
      <BookOpen className="h-8 w-8" />
    </div>
  )
}

function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-secondary">
      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
    </div>
  )
}

export function MyLearningPage() {
  const { user } = useAuth()
  const { data: enrollments, isLoading } = useMyEnrollments()
  const { data: recent } = useRecentlyWatched()
  const list = enrollments ?? []
  const recentList = recent ?? []

  // Prefer a genuinely in-progress course for "Continue learning"; only fall back
  // to a started/active/any course (which may be 100% complete) when none exist.
  const continueCourse =
    list.find(
      (e) =>
        e.status === 'active' &&
        (e.progress?.percent ?? 0) > 0 &&
        (e.progress?.percent ?? 0) < 100
    ) ??
    list.find((e) => e.status === 'active' && (e.progress?.percent ?? 0) > 0) ??
    list.find((e) => e.status === 'active') ??
    list[0]
  const continueDone = (continueCourse?.progress?.percent ?? 0) === 100

  const completed = list.filter((e) => (e.progress?.percent ?? 0) === 100).length

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">
            Hey {user?.firstName ?? user?.userName} 👋
          </h1>
          <p className="mt-1 font-medium text-muted-foreground">
            Pick up where you left off.
          </p>
        </div>
        <div className="flex gap-3">
          <div className="pop px-4 py-2 text-center">
            <p className="font-grotesk text-2xl font-bold">{list.length}</p>
            <p className="text-xs font-medium text-muted-foreground">Enrolled</p>
          </div>
          <div className="pop px-4 py-2 text-center">
            <p className="font-grotesk text-2xl font-bold text-amber">{completed}</p>
            <p className="text-xs font-medium text-muted-foreground">Completed</p>
          </div>
        </div>
      </div>

      {isLoading ? (
        <p className="py-16 text-center text-muted-foreground">Loading…</p>
      ) : list.length === 0 ? (
        <div className="pop mt-10 px-6 py-16 text-center">
          <Trophy className="mx-auto h-10 w-10 text-amber" />
          <h2 className="mt-4 text-xl font-bold">No courses yet</h2>
          <p className="mt-1 font-medium text-muted-foreground">
            Enroll in a course and it’ll show up here.
          </p>
          <Button asChild className="mt-5">
            <Link to="/courses">
              Browse courses <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      ) : (
        <>
          {/* Continue / Recently watched */}
          {recentList.length > 0 && (
            <section className="mt-8">
              <span className="eyebrow">Continue · Recently watched</span>
              <div className="mt-3 flex snap-x gap-4 overflow-x-auto pb-2">
                {recentList.map((r) => (
                  <article
                    key={r.lessonId}
                    className="pop pop-hover flex w-64 shrink-0 snap-start flex-col gap-2 p-4"
                  >
                    <span
                      className={cn(
                        'inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
                        r.completed
                          ? 'bg-teal/15 text-teal'
                          : 'bg-amber/15 text-amber'
                      )}
                    >
                      {r.completed ? (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      ) : (
                        <Circle className="h-3.5 w-3.5" />
                      )}
                      {r.completed ? 'Completed' : 'In progress'}
                    </span>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {r.courseTitle}
                    </p>
                    <h3 className="line-clamp-2 font-bold leading-snug">{r.lessonTitle}</h3>
                    <Button asChild size="sm" variant="outline" className="mt-auto w-full">
                      <Link to={`/learn/${r.courseId}`}>
                        <PlayCircle className="h-4 w-4" /> {r.completed ? 'Review' : 'Resume'}
                      </Link>
                    </Button>
                  </article>
                ))}
              </div>
            </section>
          )}

          {/* Continue learning */}
          {continueCourse && (
            <section className="mt-8">
              <span className="eyebrow">Continue learning</span>
              <div className="pop pop-hover mt-3 grid grid-cols-1 overflow-hidden sm:grid-cols-[260px_1fr]">
                <div className="aspect-video sm:aspect-auto">
                  <Thumb course={continueCourse.course} />
                </div>
                <div className="flex flex-col justify-center gap-3 p-6">
                  <h3 className="text-xl font-bold">{continueCourse.course?.title}</h3>
                  <div className="flex items-center gap-3">
                    <ProgressBar percent={continueCourse.progress?.percent ?? 0} />
                    <span className="shrink-0 font-grotesk text-sm font-bold">
                      {continueCourse.progress?.percent ?? 0}%
                    </span>
                  </div>
                  <p className="text-sm font-medium text-muted-foreground">
                    {continueCourse.progress?.completed ?? 0} of{' '}
                    {continueCourse.progress?.total ?? 0} lessons complete
                  </p>
                  <Button
                    asChild
                    variant={continueDone ? 'outline' : 'default'}
                    className="mt-1 w-fit"
                  >
                    <Link to={`/learn/${continueCourse.courseId}`}>
                      <PlayCircle className="h-4 w-4" />{' '}
                      {continueDone ? 'Review course' : 'Resume course'}
                    </Link>
                  </Button>
                </div>
              </div>
            </section>
          )}

          {/* All my courses */}
          <section className="mt-12">
            <h2 className="mb-5 text-xl font-bold">My courses</h2>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((e) => {
                const percent = e.progress?.percent ?? 0
                const done = percent === 100
                return (
                  <article key={e.id} className="pop pop-hover flex flex-col overflow-hidden">
                    <div className="aspect-video">
                      <Thumb course={e.course} />
                    </div>
                    <div className="flex flex-1 flex-col gap-3 p-4">
                      <h3 className="font-bold leading-snug">{e.course?.title}</h3>
                      <div className="mt-auto flex items-center gap-2">
                        <ProgressBar percent={percent} />
                        <span className="shrink-0 font-grotesk text-xs font-bold">
                          {percent}%
                        </span>
                      </div>
                      <Button asChild variant={done ? 'outline' : 'default'} size="sm" className="w-full">
                        <Link to={`/learn/${e.courseId}`}>
                          {done ? 'Review' : 'Continue'}
                        </Link>
                      </Button>
                    </div>
                  </article>
                )
              })}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
