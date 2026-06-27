import { useState, type FormEvent } from 'react'
import { Mail, MessageSquare, Clock, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

const INFO = [
  {
    icon: Mail,
    color: 'bg-primary',
    title: 'Email us',
    value: 'support@veolms.com',
  },
  {
    icon: MessageSquare,
    color: 'bg-teal',
    title: 'Help center',
    value: 'Browse guides & answers',
  },
  {
    icon: Clock,
    color: 'bg-amber',
    title: 'Response time',
    value: 'Usually within 1 business day',
  },
]

export function ContactPage() {
  const [sent, setSent] = useState(false)

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    // Front-end only. Wire this to a real endpoint when one exists.
    setSent(true)
  }

  return (
    <>
      {/* Hero */}
      <section className="bg-dots relative isolate overflow-hidden border-b-2 border-ink bg-tint">
        <div
          className="pointer-events-none absolute -right-16 -top-24 -z-10 h-[340px] w-[340px] rounded-full bg-[#c8c0ff] opacity-60 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-24 left-[28%] -z-10 h-[300px] w-[300px] rounded-full bg-[#a7ecdd] opacity-70 blur-3xl"
          aria-hidden
        />
        <div className="mx-auto max-w-3xl px-4 pb-16 pt-14 text-center sm:px-6 lg:px-8 lg:pb-20 lg:pt-20">
          <span className="eyebrow">Contact</span>
          <h1 className="mt-5 text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
            Get in{' '}
            <span className="relative inline-block whitespace-nowrap text-primary">
              touch
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
            Questions, feedback, or partnership ideas? We&apos;d love to hear from you.
          </p>
        </div>
      </section>

      {/* Content */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-5">
          {/* Info */}
          <div className="lg:col-span-2">
            <span className="eyebrow">Reach us</span>
            <h2 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">
              We&apos;re here to help
            </h2>
            <p className="mt-3 font-medium text-muted-foreground">
              Pick whatever works best. We read everything that comes in.
            </p>
            <div className="mt-8 space-y-4">
              {INFO.map(({ icon: Icon, color, title, value }) => (
                <div key={title} className="pop flex items-center gap-4 p-4">
                  <span
                    className={
                      'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white ' +
                      color
                    }
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="font-bold tracking-tight">{title}</p>
                    <p className="text-sm font-medium text-muted-foreground">{value}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Form */}
          <div className="lg:col-span-3">
            <div className="pop p-7 sm:p-8">
              {sent ? (
                <div className="flex flex-col items-center py-10 text-center">
                  <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-teal text-white">
                    <CheckCircle2 className="h-7 w-7" />
                  </span>
                  <h3 className="mt-5 text-2xl font-extrabold tracking-tight">
                    Message sent!
                  </h3>
                  <p className="mt-2 font-medium text-muted-foreground">
                    Thanks for reaching out. We&apos;ll get back to you soon.
                  </p>
                  <Button
                    variant="outline"
                    className="mt-7"
                    onClick={() => setSent(false)}
                  >
                    Send another
                  </Button>
                </div>
              ) : (
                <form onSubmit={onSubmit} className="space-y-5">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="name">Name</Label>
                      <Input id="name" placeholder="Your name" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="you@example.com"
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="subject">Subject</Label>
                    <Input id="subject" placeholder="What's this about?" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="message">Message</Label>
                    <Textarea
                      id="message"
                      rows={5}
                      placeholder="Tell us a bit more…"
                      required
                    />
                  </div>
                  <Button type="submit" size="lg" className="w-full">
                    Send message
                  </Button>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
