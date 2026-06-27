import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Clipped decorative layer for page headers/heroes. It holds the blurred blobs
 * (and optional dotted texture) and clips THEM to its own box, so the parent no
 * longer needs `overflow-hidden`. That's important now that buttons and `.pop`
 * cards carry a bold offset shadow: an `overflow-hidden` parent would clip those
 * shadows (and hover lifts) at the edge. Sits behind content via `-z-10`.
 *
 * Pass a matching `rounded-*` in `className` when the parent has rounded corners
 * so the blobs are clipped to the same shape.
 */
export function Decor({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-0 -z-10 overflow-hidden',
        className
      )}
    >
      {children}
    </div>
  )
}
