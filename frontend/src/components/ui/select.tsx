import * as React from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface SelectOption {
  value: string
  label: string
}

interface SelectProps {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  id?: string
  placeholder?: string
  /** Extra classes for the trigger + options (e.g. `capitalize`). */
  className?: string
}

/**
 * Themed dropdown that replaces the native <select>, whose open option list can't be
 * styled to match the app. The trigger mirrors the Input (ink border + offset
 * shadow on focus); the menu is rendered through a portal with fixed positioning
 * so it's never clipped by an `overflow` ancestor (e.g. a scrollable modal body).
 */
export function Select({
  value,
  onChange,
  options,
  id,
  placeholder = 'Select…',
  className,
}: SelectProps) {
  const [open, setOpen] = React.useState(false)
  const [active, setActive] = React.useState(0)
  const [coords, setCoords] = React.useState<{
    top: number
    left: number
    width: number
  } | null>(null)
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const menuRef = React.useRef<HTMLUListElement>(null)

  const selected = options.find((o) => o.value === value)

  const place = () => {
    const r = triggerRef.current?.getBoundingClientRect()
    if (r) setCoords({ top: r.bottom + 6, left: r.left, width: r.width })
  }

  const openMenu = () => {
    place()
    setActive(Math.max(0, options.findIndex((o) => o.value === value)))
    setOpen(true)
  }
  const close = React.useCallback(() => setOpen(false), [])

  React.useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return
      close()
    }
    document.addEventListener('mousedown', onDoc)
    // Capture scroll on any ancestor (incl. a scrollable modal body) so the
    // fixed-positioned menu can't drift away from its trigger.
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open, close])

  const choose = (v: string) => {
    onChange(v)
    close()
    triggerRef.current?.focus()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault()
        openMenu()
      }
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, options.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      const o = options[active]
      if (o) choose(o.value)
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        id={id}
        ref={triggerRef}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={onKeyDown}
        className={cn(
          'flex h-11 w-full items-center justify-between gap-2 rounded-xl border-2 border-input bg-card px-3.5 py-2 text-left text-sm font-medium transition-all focus-visible:border-ink focus-visible:shadow-[3px_3px_0_var(--ink)] focus-visible:outline-none',
          open && 'border-ink shadow-[3px_3px_0_var(--ink)]',
          className
        )}
      >
        <span className={cn('truncate', !selected && 'text-muted-foreground')}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-180'
          )}
        />
      </button>

      {open &&
        coords &&
        createPortal(
          <ul
            ref={menuRef}
            role="listbox"
            style={{
              position: 'fixed',
              top: coords.top,
              left: coords.left,
              width: coords.width,
            }}
            className="z-[60] max-h-60 overflow-auto rounded-xl border-2 border-ink bg-card p-1.5 shadow-[4px_5px_0_var(--ink)]"
          >
            {options.map((opt, i) => {
              const isSelected = opt.value === value
              return (
                <li key={opt.value} role="option" aria-selected={isSelected}>
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => choose(opt.value)}
                    onMouseEnter={() => setActive(i)}
                    className={cn(
                      'flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold transition-colors',
                      i === active
                        ? 'bg-secondary text-primary-strong'
                        : 'text-foreground hover:bg-tint',
                      className
                    )}
                  >
                    {opt.label}
                    {isSelected && (
                      <Check className="h-4 w-4 shrink-0 text-primary-strong" />
                    )}
                  </button>
                </li>
              )
            })}
          </ul>,
          document.body
        )}
    </div>
  )
}
