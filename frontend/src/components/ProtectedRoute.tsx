import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import type { RoleName } from '@/types'

/**
 * Gate a route subtree. Unauthenticated users are sent to /login (with a return
 * path); authenticated users lacking an allowed role get /forbidden.
 *
 * NOTE: this is UX gating only. The backend independently authorizes every
 * request, so a tampered client cannot gain access by bypassing this.
 */
export function ProtectedRoute({ roles }: { roles?: RoleName[] }) {
  const { isAuthenticated, role } = useAuth()
  const location = useLocation()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  if (roles && (!role || !roles.includes(role))) {
    return <Navigate to="/forbidden" replace />
  }
  return <Outlet />
}
