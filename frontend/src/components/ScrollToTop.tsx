import { useLayoutEffect } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Resets scroll to the top on every route change. React Router preserves the
 * previous scroll position by default, which leaves a freshly-opened tab/page
 * scrolled part-way down. useLayoutEffect runs before paint so there's no flash
 * of the old position. Keyed on pathname only, so in-page query changes (e.g. a
 * catalog search) don't yank the user back to the top.
 */
export function ScrollToTop() {
  const { pathname } = useLocation()

  useLayoutEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  return null
}
