import { Link } from 'react-router-dom'
import {
  BookOpen,
  CheckCircle2,
  FileEdit,
  ArrowRight,
  Sparkles,
  Receipt,
  Globe,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useManagedCourses } from '@/features/admin/api'
import { Decor } from '@/components/layout/Decor'
import { Button } from '@/components/ui/button'
import { formatPrice } from '@/lib/utils'

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string
  value: number | string
  icon: React.ComponentType<{ className?: string }>
  tone: string
}) {
  return (
    <div className="pop pop-hover p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-muted-foreground">{label}</p>
        <span
          className={
            'flex h-11 w-11 items-center justify-center rounded-2xl border-2 border-ink text-white shadow-[2px_2px_0_var(--ink)] ' +
            tone
          }
        >
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <p className="font-grotesk mt-3 text-4xl font-bold tracking-tight">{value}</p>
    </div>
  )
}

function QuickAction({
  to,
  icon: Icon,
  tone,
  title,
  desc,
}: {
  to: string
  icon: React.ComponentType<{ className?: string }>
  tone: string
  title: string
  desc: string
}) {
  return (
    <Link to={to} className="pop pop-hover group flex items-start gap-4 p-5">
      <span
        className={
          'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border-2 border-ink text-white shadow-[2px_2px_0_var(--ink)] ' +
          tone
        }
      >
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="flex items-center gap-1 font-bold tracking-tight">
          {title}
          <ArrowRight className="h-4 w-4 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
        </p>
        <p className="mt-0.5 text-sm font-medium text-muted-foreground">{desc}</p>
      </div>
    </Link>
  )
}

const STEPS = [
  'Create a course',
  'Add sections & lessons',
  'Set a price, or make it free',
  'Add a cover image, then Publish',
]

export function AdminDashboardPage() {
  const { isAdmin, user } = useAuth()
  const { data, isLoading } = useManagedCourses(isAdmin)
  const courses = data ?? []
  const published = courses.filter((c) => c.status === 'published').length
  const drafts = courses.length - published

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="relative">
        <Decor className="rounded-[22px] bg-dots">
          <div className="absolute -top-16 -right-10 h-64 w-64 rounded-full bg-[#ffb59c] opacity-70 blur-3xl" />
          <div className="absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-[#a7ecdd] opacity-70 blur-3xl" />
          <div className="absolute top-0 right-1/3 h-44 w-44 rounded-full bg-[#c8c0ff] opacity-45 blur-3xl" />
        </Decor>
        <span className="eyebrow">Dashboard</span>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">
          Welcome back, {user?.firstName ?? user?.userName} 👋
        </h1>
        <p className="mt-2 font-medium text-muted-foreground">
          {isAdmin
            ? 'Manage every course on the platform.'
            : 'Manage your courses and content.'}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Total courses"
          value={isLoading ? '…' : courses.length}
          icon={BookOpen}
          tone="bg-primary"
        />
        <StatCard
          label="Published"
          value={isLoading ? '…' : published}
          icon={CheckCircle2}
          tone="bg-teal"
        />
        <StatCard
          label="Drafts"
          value={isLoading ? '…' : drafts}
          icon={FileEdit}
          tone="bg-amber"
        />
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="mb-3 font-grotesk text-sm font-bold uppercase tracking-wider text-muted-foreground">
          Quick actions
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <QuickAction
            to="/admin/courses/new"
            icon={Sparkles}
            tone="bg-primary"
            title="Create a course"
            desc="Start a new course from scratch."
          />
          <QuickAction
            to="/admin/courses"
            icon={BookOpen}
            tone="bg-teal"
            title="Manage courses"
            desc="Edit content, lessons and pricing."
          />
          {isAdmin ? (
            <QuickAction
              to="/admin/sales"
              icon={Receipt}
              tone="bg-amber"
              title="Sales & revenue"
              desc="Track purchases and enrollments."
            />
          ) : (
            <QuickAction
              to="/"
              icon={Globe}
              tone="bg-violet"
              title="Visit your storefront"
              desc="See how learners view your courses."
            />
          )}
        </div>
      </div>

      {/* Recent courses + getting started */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="pop overflow-hidden lg:col-span-2">
          <div className="flex items-center justify-between border-b-2 border-foreground/10 px-5 py-4">
            <h2 className="text-lg font-bold tracking-tight">Recent courses</h2>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/admin/courses">
                View all
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
          {isLoading ? (
            <p className="px-5 py-10 text-sm text-muted-foreground">Loading…</p>
          ) : courses.length === 0 ? (
            <div className="flex flex-col items-center px-5 py-14 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-ink bg-secondary text-primary-strong shadow-[3px_3px_0_var(--ink)]">
                <BookOpen className="h-8 w-8" />
              </span>
              <p className="mt-5 text-lg font-bold tracking-tight">No courses yet</p>
              <p className="mt-1 max-w-xs text-sm font-medium text-muted-foreground">
                Create your first course and start adding lessons.
              </p>
              <Button asChild className="mt-6">
                <Link to="/admin/courses/new">
                  <Sparkles className="h-4 w-4" />
                  Create your first course
                </Link>
              </Button>
            </div>
          ) : (
            <ul className="divide-y-2 divide-foreground/5">
              {courses.slice(0, 5).map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-tint"
                >
                  <Link
                    to={`/admin/courses/${c.id}`}
                    className="flex min-w-0 items-center gap-3"
                  >
                    <span className="flex h-11 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border-2 border-ink bg-muted">
                      {c.thumbnail ? (
                        <img
                          src={c.thumbnail}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <BookOpen className="h-5 w-5 text-muted-foreground" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-bold tracking-tight">{c.title}</p>
                      <p className="text-xs text-muted-foreground">
                        <span className="font-grotesk font-bold text-primary-strong">
                          {formatPrice(c.price, c.currency)}
                        </span>{' '}
                        · {c.level}
                      </p>
                    </div>
                  </Link>
                  <span
                    className={
                      'shrink-0 rounded-full px-3 py-1 text-xs font-bold capitalize ' +
                      (c.status === 'published'
                        ? 'bg-teal/15 text-teal'
                        : 'bg-muted text-muted-foreground')
                    }
                  >
                    {c.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Getting started */}
        <div className="pop p-6">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary-strong" />
            <h2 className="text-lg font-bold tracking-tight">Get started</h2>
          </div>
          <p className="mt-1 text-sm font-medium text-muted-foreground">
            Four steps to your first published course.
          </p>
          <ol className="mt-5 space-y-3.5">
            {STEPS.map((step, i) => (
              <li key={step} className="flex items-center gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-secondary font-grotesk text-xs font-bold text-primary-strong">
                  {i + 1}
                </span>
                <span className="text-sm font-semibold">{step}</span>
              </li>
            ))}
          </ol>
          <Button asChild variant="outline" className="mt-6 w-full">
            <Link to="/admin/courses/new">
              <Sparkles className="h-4 w-4" />
              New course
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
