import { Link } from 'react-router-dom'
import { Target, Sparkles, IndianRupee, Users, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

const VALUES = [
  {
    icon: Target,
    color: 'bg-primary',
    title: 'Project-first',
    desc: 'Every course is built around shipping something real, not memorizing trivia.',
  },
  {
    icon: Sparkles,
    color: 'bg-teal',
    title: 'No fluff',
    desc: 'Short, focused lessons that respect your time and get you to the point.',
  },
  {
    icon: IndianRupee,
    color: 'bg-amber',
    title: 'Fair pricing',
    desc: 'Pay once and own it forever. Plenty of free courses to start with.',
  },
  {
    icon: Users,
    color: 'bg-violet',
    title: 'Open to teach',
    desc: 'Anyone can become an instructor and share what they know with learners.',
  },
]

export function AboutPage() {
  return (
    <>
      {/* Hero */}
      <section className="bg-dots relative isolate overflow-hidden border-b-2 border-ink bg-tint">
        <div
          className="pointer-events-none absolute -right-16 -top-24 -z-10 h-[360px] w-[360px] rounded-full bg-[#ffb59c] opacity-70 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-24 left-[26%] -z-10 h-[300px] w-[300px] rounded-full bg-[#a7ecdd] opacity-70 blur-3xl"
          aria-hidden
        />
        <div className="mx-auto max-w-3xl px-4 pb-20 pt-14 text-center sm:px-6 lg:px-8 lg:pb-28 lg:pt-20">
          <span className="eyebrow">About VeoLMS</span>
          <h1 className="mt-5 text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
            We help people actually{' '}
            <span className="relative inline-block whitespace-nowrap text-primary">
              finish
              <svg
                viewBox="0 0 200 12"
                preserveAspectRatio="none"
                aria-hidden
                className="absolute -bottom-2 left-0 h-3 w-full"
              >
                <path
                  d="M2 8 C 50 2, 150 2, 198 8"
                  stroke="#FFB020"
                  strokeWidth="4"
                  fill="none"
                  strokeLinecap="round"
                />
              </svg>
            </span>{' '}
            what they start.
          </h1>
          <p className="mx-auto mt-7 max-w-xl text-lg font-medium text-muted-foreground sm:text-xl">
            VeoLMS is a home for bite-sized, project-based video courses, built so
            learning sticks and you walk away having actually built something.
          </p>
        </div>
      </section>

      {/* Story */}
      <section className="mx-auto max-w-3xl px-4 py-20 sm:px-6 lg:px-8">
        <span className="eyebrow">Our story</span>
        <h2 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">
          Built by people who got tired of unfinished courses
        </h2>
        <div className="mt-6 space-y-4 text-lg font-medium leading-relaxed text-muted-foreground">
          <p>
            Most online courses are too long, too passive, and too easy to abandon.
            We started VeoLMS to fix that, with short lessons, real projects, and a
            player that remembers exactly where you left off.
          </p>
          <p>
            Whether you&apos;re picking up your first language or going deep on a
            framework, the goal is the same: keep momentum, and finish with something
            you can show.
          </p>
        </div>
      </section>

      {/* Values */}
      <section className="bg-tint2 border-y-2 border-ink">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <span className="eyebrow text-teal">What we believe</span>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">
            The principles behind every course
          </h2>
          <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {VALUES.map(({ icon: Icon, color, title, desc }) => (
              <div key={title} className="pop pop-hover p-6">
                <span
                  className={
                    'flex h-12 w-12 items-center justify-center rounded-2xl text-white ' +
                    color
                  }
                >
                  <Icon className="h-6 w-6" />
                </span>
                <h3 className="mt-5 text-lg font-bold tracking-tight">{title}</h3>
                <p className="mt-2 text-sm font-medium leading-relaxed text-muted-foreground">
                  {desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          {[
            { k: 'Project-based', v: 'Every course', c: 'text-primary-strong' },
            { k: 'HD streaming', v: 'Resume anywhere', c: 'text-teal' },
            { k: 'Lifetime', v: 'Access on purchase', c: 'text-violet' },
          ].map((s) => (
            <div key={s.v} className="pop p-7 text-center">
              <p className={'font-grotesk text-2xl font-bold sm:text-3xl ' + s.c}>
                {s.k}
              </p>
              <p className="mt-1 font-medium text-muted-foreground">{s.v}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
        <div className="relative isolate overflow-hidden rounded-[28px] border-2 border-ink bg-foreground px-6 py-16 text-center text-background shadow-[8px_10px_0_var(--ink)] sm:px-12">
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            Ready to start building?
          </h2>
          <p className="mx-auto mt-4 max-w-xl font-medium text-background/70">
            Join free and enroll in your first course today.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button size="lg" asChild>
              <Link to="/courses">
                Browse courses
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link to="/signup">Create free account</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  )
}
