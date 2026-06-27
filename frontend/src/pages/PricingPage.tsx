import { Link } from 'react-router-dom'
import { Check, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

const PLANS = [
  {
    name: 'Free',
    price: '₹0',
    note: 'forever',
    tone: 'text-teal',
    desc: 'Start learning today, no card required.',
    features: [
      'Access to all free courses',
      'Progress tracking & resume',
      'HD video streaming',
      'Learn on any device',
    ],
    cta: 'Create free account',
    to: '/signup',
    variant: 'outline' as const,
    featured: false,
  },
  {
    name: 'Per course',
    price: 'Pay once',
    note: 'own it forever',
    tone: 'text-primary-strong',
    desc: 'Buy individual premium courses. No subscription.',
    features: [
      'Everything in Free',
      'Lifetime access to purchased courses',
      'All future updates included',
      'Secure Razorpay checkout',
      'Enrollment-gated streaming',
    ],
    cta: 'Browse catalog',
    to: '/courses',
    variant: 'default' as const,
    featured: true,
  },
  {
    name: 'Teach',
    price: '₹0',
    note: 'to publish',
    tone: 'text-violet',
    desc: 'Share what you know and earn from your courses.',
    features: [
      'Free instructor dashboard',
      'Publish video & YouTube lessons',
      'Appear in the public catalog',
      'Set your own price or go free',
    ],
    cta: 'Start teaching',
    to: '/teach',
    variant: 'outline' as const,
    featured: false,
  },
]

const FAQ = [
  {
    q: 'Is there a subscription?',
    a: 'No. Free courses are free, and premium courses are a one-time purchase you keep forever.',
  },
  {
    q: 'What payment methods are supported?',
    a: 'Payments are handled securely through Razorpay, with support for cards, UPI, net banking, and more.',
  },
  {
    q: 'Do I keep access if I stop paying?',
    a: 'Yes. Once you buy a course it stays in your account, including any future updates.',
  },
  {
    q: 'How much does it cost to teach?',
    a: 'Nothing. Creating an instructor account and publishing courses is completely free.',
  },
]

export function PricingPage() {
  return (
    <>
      {/* Hero */}
      <section className="bg-dots relative isolate overflow-hidden border-b-2 border-ink bg-tint">
        <div
          className="pointer-events-none absolute -left-16 -top-24 -z-10 h-[340px] w-[340px] rounded-full bg-[#a7ecdd] opacity-70 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-24 right-[24%] -z-10 h-[300px] w-[300px] rounded-full bg-[#ffb59c] opacity-70 blur-3xl"
          aria-hidden
        />
        <div className="mx-auto max-w-3xl px-4 pb-16 pt-14 text-center sm:px-6 lg:px-8 lg:pb-20 lg:pt-20">
          <span className="eyebrow">Pricing</span>
          <h1 className="mt-5 text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
            Simple pricing.{' '}
            <span className="relative inline-block whitespace-nowrap text-primary">
              No subscriptions.
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
          </h1>
          <p className="mx-auto mt-7 max-w-xl text-lg font-medium text-muted-foreground sm:text-xl">
            Pay once for the courses you want and own them forever. Start with our
            free courses, no card required.
          </p>
        </div>
      </section>

      {/* Plans */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={
                'pop relative flex flex-col p-7 ' +
                (plan.featured
                  ? 'shadow-[6px_8px_0_var(--ink)] lg:shadow-[8px_11px_0_var(--ink)]'
                  : '')
              }
            >
              {plan.featured && (
                <span className="tag absolute -top-3 left-7 rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground">
                  Most popular
                </span>
              )}
              <h3 className="font-grotesk text-sm font-bold uppercase tracking-wide text-muted-foreground">
                {plan.name}
              </h3>
              <div className="mt-3 flex items-baseline gap-2">
                <span className={'text-4xl font-extrabold tracking-tight ' + plan.tone}>
                  {plan.price}
                </span>
                <span className="text-sm font-medium text-muted-foreground">
                  {plan.note}
                </span>
              </div>
              <p className="mt-3 text-sm font-medium text-muted-foreground">
                {plan.desc}
              </p>
              <ul className="mt-6 flex-1 space-y-3">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm font-medium">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal/15 text-teal">
                      <Check className="h-3.5 w-3.5" />
                    </span>
                    {f}
                  </li>
                ))}
              </ul>
              <Button asChild size="lg" variant={plan.variant} className="mt-7 w-full">
                <Link to={plan.to}>
                  {plan.cta}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-tint2 border-t-2 border-ink">
        <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6 lg:px-8">
          <span className="eyebrow text-teal">Questions</span>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">
            Frequently asked
          </h2>
          <div className="mt-10 space-y-4">
            {FAQ.map((item) => (
              <div key={item.q} className="pop p-6">
                <h3 className="text-lg font-bold tracking-tight">{item.q}</h3>
                <p className="mt-2 font-medium leading-relaxed text-muted-foreground">
                  {item.a}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
