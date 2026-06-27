import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  BookOpen,
  Receipt,
  ArrowLeft,
  LogOut,
  Plus,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function AdminLayout() {
  const { user, role, isAdmin, logout } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()

  const nav = [
    { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/admin/courses', label: 'Courses', icon: BookOpen, end: false },
    ...(isAdmin
      ? [{ to: '/admin/sales', label: 'Sales', icon: Receipt, end: false }]
      : []),
  ]

  const pageTitle =
    pathname === '/admin'
      ? 'Dashboard'
      : pathname.startsWith('/admin/courses/new')
        ? 'New course'
        : /^\/admin\/courses\/\d+/.test(pathname)
          ? 'Manage course'
          : pathname.startsWith('/admin/courses')
            ? 'Courses'
            : pathname.startsWith('/admin/sales')
              ? 'Sales'
              : 'Workspace'

  const displayName = user?.firstName ?? user?.userName ?? 'You'
  const initial = displayName.charAt(0).toUpperCase()

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  const itemClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all',
      isActive
        ? 'border-2 border-ink bg-primary text-primary-foreground shadow-[2px_2px_0_var(--ink)]'
        : 'border-2 border-transparent text-muted-foreground hover:bg-tint hover:text-foreground'
    )

  return (
    <div className="flex min-h-svh bg-background text-foreground">
      {/* Sidebar: pinned full-height so it stays put while content scrolls */}
      <aside className="sticky top-0 hidden h-svh w-64 shrink-0 flex-col self-start border-r-2 border-ink bg-card md:flex">
        {/* Brand */}
        <Link
          to="/"
          className="flex h-16 shrink-0 items-center gap-2.5 border-b-2 border-ink bg-tint px-5 font-extrabold"
        >
          <span className="grid h-9 w-9 -rotate-6 place-items-center rounded-xl border-2 border-ink bg-primary font-grotesk text-base font-bold text-primary-foreground shadow-[2px_2px_0_var(--ink)]">
            V
          </span>
          <span className="text-lg tracking-tight">VeoLMS</span>
        </Link>

        {/* Nav */}
        <nav className="flex-1 space-y-1.5 overflow-y-auto p-3">
          {nav.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={itemClass}>
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="shrink-0 border-t-2 border-ink/10 p-3">
          <Button variant="ghost" asChild className="w-full justify-start">
            <Link to="/">
              <ArrowLeft className="h-4 w-4" />
              Back to site
            </Link>
          </Button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b-2 border-ink bg-card px-4 sm:px-6">
          <div className="min-w-0">
            <p className="font-grotesk text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              {role} workspace
            </p>
            <h1 className="truncate text-lg font-extrabold leading-tight tracking-tight">
              {pageTitle}
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <Button asChild size="sm" className="hidden sm:inline-flex">
              <Link to="/admin/courses/new">
                <Plus className="h-4 w-4" />
                New course
              </Link>
            </Button>

            <span className="hidden h-8 w-0.5 rounded-full bg-border sm:block" />

            <div className="hidden text-right leading-tight sm:block">
              <p className="text-sm font-bold">{displayName}</p>
              <p className="text-xs font-medium capitalize text-muted-foreground">
                {role}
              </p>
            </div>
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border-2 border-ink bg-primary text-sm font-bold text-primary-foreground shadow-[2px_2px_0_var(--ink)]">
              {initial}
            </span>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4" />
              <span className="hidden lg:inline">Logout</span>
            </Button>
          </div>
        </header>

        {/* Mobile nav */}
        <div className="sticky top-16 z-20 flex gap-2 overflow-x-auto border-b-2 border-ink bg-card px-4 py-2 md:hidden">
          {nav.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={itemClass}>
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </div>

        <main className="flex-1 bg-tint p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
