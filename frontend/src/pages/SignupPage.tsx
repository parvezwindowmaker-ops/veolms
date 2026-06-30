import { useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { apiErrorMessage } from '@/lib/api'
import { AuthShell } from '@/components/AuthShell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function SignupPage() {
  const { register, becomeInstructor, isAuthenticated, dashboardPath } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  // "Sign up to start teaching" links here with ?role=instructor. Accounts are
  // always created as a Student (the backend never trusts a client-sent role);
  // for the instructor intent we immediately promote via become-instructor.
  const asInstructor = params.get('role') === 'instructor'

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const update =
    (key: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }))

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    setLoading(true)
    try {
      await register(form)
      if (asInstructor) {
        try {
          await becomeInstructor()
          navigate('/admin', { replace: true })
        } catch {
          // Account was created (as a Student) but the upgrade failed, so send them
          // to the Teach page where they can retry becoming an instructor.
          navigate('/teach', { replace: true })
        }
      } else {
        navigate('/my-learning', { replace: true })
      }
    } catch (err) {
      setError(apiErrorMessage(err, 'Registration failed'))
    } finally {
      setLoading(false)
    }
  }

  // Already signed in (e.g. navigating here with a valid session): skip the form.
  if (isAuthenticated) {
    return <Navigate to={dashboardPath} replace />
  }

  return (
    <AuthShell>
      {/* brand (mobile only; desktop has the side panel) */}
      <Link
        to="/"
        className="mb-8 flex items-center justify-center gap-2.5 font-extrabold lg:hidden"
      >
        <span className="grid h-9 w-9 -rotate-6 place-items-center rounded-xl bg-primary font-grotesk text-primary-foreground">
          V
        </span>
        <span className="text-lg tracking-tight">VeoLMS</span>
      </Link>

      <div className="pop p-8">
        <span className="eyebrow">{asInstructor ? 'Become an instructor' : 'Join free'}</span>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight">
          {asInstructor ? 'Create your instructor account' : 'Create your account'}
        </h1>
        <p className="mt-2 font-medium text-muted-foreground">
          {asInstructor
            ? 'Sign up free and your instructor dashboard is ready instantly.'
            : 'Start learning in minutes. It’s free.'}
        </p>

        <form onSubmit={onSubmit} className="mt-7 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">First name</Label>
              <Input id="firstName" placeholder="Jane" value={form.firstName} onChange={update('firstName')} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last name</Label>
              <Input id="lastName" placeholder="Doe" value={form.lastName} onChange={update('lastName')} required />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={update('email')}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={form.password}
              onChange={update('password')}
              required
              minLength={8}
            />
          </div>
          {error && (
            <p className="rounded-xl bg-destructive/10 px-3.5 py-2.5 text-sm font-medium text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {asInstructor
              ? loading
                ? 'Setting up…'
                : 'Sign up & start teaching'
              : loading
                ? 'Creating account…'
                : 'Sign up'}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm font-medium text-muted-foreground">
          Already have an account?{' '}
          <Link
            to={asInstructor ? '/login?role=instructor' : '/login'}
            className="font-bold text-primary-strong hover:underline"
          >
            Log in
          </Link>
        </p>
      </div>
    </AuthShell>
  )
}
