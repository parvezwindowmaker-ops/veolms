import { useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, LogOut, Menu, X } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { userDisplayName } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function Navbar() {
  const { isAuthenticated, isAdmin, role, user, logout } = useAuth()
  const navigate = useNavigate()
  const canManage = role === 'Admin' || role === 'Instructor'
  const name = userDisplayName(user)
  const [open, setOpen] = useState(false)

  const handleLogout = async () => {
    setOpen(false)
    await logout()
    navigate('/')
  }

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'inline-flex h-9 items-center justify-center rounded-full px-4 text-sm font-semibold transition-all border-2',
      isActive
        ? 'bg-primary text-primary-foreground border-ink shadow-[2px_3px_0_var(--ink)]'
        : 'border-transparent text-muted-foreground hover:bg-accent/80 hover:text-foreground'
    )

  const links = (
    <>
      <NavLink to="/" end className={linkClass} onClick={() => setOpen(false)}>
        Home
      </NavLink>
      <NavLink to="/courses" className={linkClass} onClick={() => setOpen(false)}>
        Courses
      </NavLink>
      <NavLink to="/pricing" className={linkClass} onClick={() => setOpen(false)}>
        Pricing
      </NavLink>
      <NavLink to="/about" className={linkClass} onClick={() => setOpen(false)}>
        About
      </NavLink>
      {isAuthenticated && (
        <NavLink to="/my-learning" className={linkClass} onClick={() => setOpen(false)}>
          My Learning
        </NavLink>
      )}
      {!canManage && (
        <NavLink to="/teach" className={linkClass} onClick={() => setOpen(false)}>
          Teach
        </NavLink>
      )}
      {canManage && (
        <NavLink to="/admin" className={linkClass} onClick={() => setOpen(false)}>
          {isAdmin ? 'Admin' : 'Instructor'}
        </NavLink>
      )}
    </>
  )

  return (
    <header className="sticky top-0 z-40 w-full border-b-2 border-ink bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link to="/" className="flex items-center gap-2.5 font-extrabold">
          <span className="flex h-9 w-9 -rotate-6 items-center justify-center rounded-xl bg-primary font-grotesk text-primary-foreground">
            V
          </span>
          <span className="text-lg tracking-tight">VeoLMS</span>
        </Link>

        <nav className="hidden items-center gap-2 md:flex">{links}</nav>

        <div className="flex items-center gap-2">
          {isAuthenticated ? (
            <>
              {canManage && (
                <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
                  <Link to="/admin">
                    <LayoutDashboard className="h-4 w-4" />
                    Dashboard
                  </Link>
                </Button>
              )}
              {name && (
                <span className="hidden text-sm text-muted-foreground sm:inline">{name}</span>
              )}
              <Button variant="outline" size="sm" onClick={handleLogout} className="hidden md:inline-flex">
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Logout</span>
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" asChild className="hidden md:inline-flex">
                <Link to="/login">Log in</Link>
              </Button>
              <Button size="sm" asChild className="hidden sm:inline-flex">
                <Link to="/signup">Sign up</Link>
              </Button>
            </>
          )}

          {/* Mobile menu toggle */}
          <button
            type="button"
            aria-label="Toggle menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="grid h-9 w-9 place-items-center rounded-xl border-2 border-ink md:hidden"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="border-t border-border bg-background md:hidden">
          <nav className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 text-base sm:px-6">
            {links}
            <div className="flex flex-col gap-2 border-t border-dashed border-border pt-4">
              {isAuthenticated ? (
                <Button variant="outline" size="sm" onClick={handleLogout}>
                  <LogOut className="h-4 w-4" /> Logout
                </Button>
              ) : (
                <>
                  <Button variant="outline" size="sm" asChild>
                    <Link to="/login" onClick={() => setOpen(false)}>
                      Log in
                    </Link>
                  </Button>
                  <Button size="sm" asChild>
                    <Link to="/signup" onClick={() => setOpen(false)}>
                      Sign up
                    </Link>
                  </Button>
                </>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  )
}
