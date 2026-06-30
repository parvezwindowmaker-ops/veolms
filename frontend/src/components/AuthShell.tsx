import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2 } from 'lucide-react'

const PERKS = [
  { dot: 'bg-primary', label: 'Hands-on video courses' },
  { dot: 'bg-teal', label: 'Learn at your own pace' },
  { dot: 'bg-amber', label: 'Pay once, own it forever' },
]

/** Split auth layout: a playful brand panel on the left, the form on the right.
 *  Shared by Login + Signup so the two stay consistent. */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      {/* Left: brand panel (desktop) */}
      <aside className="bg-dots relative hidden overflow-hidden border-r-2 border-ink bg-tint px-12 lg:flex lg:flex-col lg:justify-center">
        <div
          className="pointer-events-none absolute -left-16 -top-20 h-72 w-72 rounded-full bg-[#ffb59c] opacity-70 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-24 right-0 h-80 w-80 rounded-full bg-[#a7ecdd] opacity-70 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute right-10 top-12 h-56 w-56 rounded-full bg-[#c8c0ff] opacity-45 blur-3xl"
          aria-hidden
        />
        <div className="relative max-w-md">
          <Link to="/" className="flex items-center gap-2.5 font-extrabold">
            <span className="grid h-10 w-10 -rotate-6 place-items-center rounded-xl bg-primary font-grotesk text-lg text-primary-foreground">
              V
            </span>
            <span className="text-xl tracking-tight">VeoLMS</span>
          </Link>

          <h2 className="mt-10 text-4xl font-extrabold leading-[1.1] tracking-tight">
            Learn to code, the{' '}
            <span className="relative inline-block whitespace-nowrap text-primary">
              fun way
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
            </span>
          </h2>

          <p className="mt-6 text-lg font-medium text-muted-foreground">
            Build real projects in JavaScript, React, Node and more, at your own
            pace.
          </p>

          <ul className="mt-8 space-y-3.5">
            {PERKS.map((p) => (
              <li key={p.label} className="flex items-center gap-3 font-semibold">
                <span className={'grid h-6 w-6 shrink-0 place-items-center rounded-full text-white ' + p.dot}>
                  <CheckCircle2 className="h-4 w-4" />
                </span>
                {p.label}
              </li>
            ))}
          </ul>
        </div>
      </aside>

      {/* Right: form */}
      <main className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  )
}
