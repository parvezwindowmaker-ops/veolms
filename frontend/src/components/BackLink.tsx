import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Consistent, clearly-visible back navigation: an outline pill with an arrow,
 * used across pages in place of low-contrast muted-text links. Long labels (e.g.
 * a course title) truncate instead of stretching the pill.
 */
export function BackLink({
  to,
  children,
  className,
}: {
  to: string
  children: ReactNode
  className?: string
}) {
  return (
    <Button variant="outline" size="sm" asChild className={cn('max-w-full', className)}>
      <Link to={to}>
        <ArrowLeft className="h-4 w-4 shrink-0" />
        <span className="min-w-0 truncate">{children}</span>
      </Link>
    </Button>
  )
}
