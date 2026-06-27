import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { apiErrorMessage } from '@/lib/api'
import { AuthShell } from '@/components/AuthShell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const from = (location.state as { from?: string } | null)?.from
  // Arrived from a "teach" CTA: a Student logging in here wants to teach, so
  // send them to /teach to upgrade. Existing instructors/admins still go to /admin.
  const asInstructor = params.get('role') === 'instructor'

  const [userDetail, setUserDetail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const user = await login(userDetail, password)
      const isAuthor =
        user.roleName === 'Admin' || user.roleName === 'Instructor'
      const dest =
        from ?? (isAuthor ? '/admin' : asInstructor ? '/teach' : '/my-learning')
      navigate(dest, { replace: true })
    } catch (err) {
      setError(apiErrorMessage(err, 'Login failed'))
    } finally {
      setLoading(false)
    }
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
        <span className="eyebrow">Welcome back</span>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight">
          Log in to keep learning
        </h1>
        <p className="mt-2 font-medium text-muted-foreground">
          Pick up right where you left off.
        </p>

        <form onSubmit={onSubmit} className="mt-7 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="userDetail">Email or username</Label>
            <Input
              id="userDetail"
              autoComplete="username"
              value={userDetail}
              onChange={(e) => setUserDetail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && (
            <p className="rounded-xl bg-destructive/10 px-3.5 py-2.5 text-sm font-medium text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {loading ? 'Logging in…' : 'Log in'}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm font-medium text-muted-foreground">
          New to VeoLMS?{' '}
          <Link
            to={asInstructor ? '/signup?role=instructor' : '/signup'}
            className="font-bold text-primary-strong hover:underline"
          >
            Create an account
          </Link>
        </p>
      </div>
    </AuthShell>
  )
}
