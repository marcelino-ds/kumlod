import { TriangleAlertIcon, type LucideIcon } from 'lucide-react'
import type * as React from 'react'

import { cn } from '@/lib/utils'

/** Small pill above the hero title, e.g. the semester or the username. */
export const heroChipClass = 'inline-flex h-7 items-center gap-1.5 rounded-full bg-white/10 px-3 text-xs font-semibold'

/**
 * The dark header card shared by the main pages: an eyebrow and title with an
 * icon on the left, numbers in the middle, and the main action on the right.
 * On phones the numbers drop below the title and `aside` sits next to it.
 */
export function PageHero({
  eyebrow,
  icon: Icon,
  title,
  aside,
  action,
  children,
}: {
  eyebrow?: React.ReactNode
  icon: LucideIcon
  title: React.ReactNode
  /** Next to the title on phones, e.g. a compact add button. */
  aside?: React.ReactNode
  /** Main action from md up. */
  action?: React.ReactNode
  /** Stats and anything under them. */
  children?: React.ReactNode
}) {
  return (
    <header className="relative mb-5 overflow-hidden rounded-[2rem] bg-hero p-5 text-hero-foreground md:p-6">
      <div aria-hidden className="dot-grid absolute inset-0 text-white/[0.05]" />
      <span aria-hidden className="absolute -top-24 -right-16 size-60 rounded-full bg-brand/10 blur-3xl" />

      <div className="relative grid gap-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:gap-10">
        <div className="flex min-w-0 items-start justify-between gap-3 md:col-start-1 md:row-start-1">
          <div className="min-w-0">
            {eyebrow}
            <h1 className={cn('flex items-center gap-3 text-[2rem] leading-none font-extrabold tracking-tight md:text-[2.5rem]', eyebrow && 'mt-2')}>
              <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-brand text-brand-foreground md:size-12">
                <Icon className="size-6" />
              </span>
              {title}
            </h1>
          </div>
          {aside && <div className="shrink-0 md:hidden">{aside}</div>}
        </div>

        {children && (
          <div className="min-w-0 md:col-span-2 md:col-start-1 md:row-start-2 lg:col-span-1 lg:col-start-2 lg:row-start-1 lg:ml-auto lg:w-full lg:max-w-3xl">
            {children}
          </div>
        )}

        {action && <div className="hidden md:col-start-2 md:row-start-1 md:flex lg:col-start-3">{action}</div>}
      </div>
    </header>
  )
}

const alertInk = 'text-[#ff8f73]'

/**
 * A number tile inside PageHero. Pass onClick to make it a button that jumps
 * somewhere. kind="text" fits words such as "Aktif" instead of a big number.
 */
export function HeroStat({
  label,
  short,
  value,
  hint,
  accent,
  alert,
  icon: Icon,
  kind = 'number',
  onClick,
}: {
  label: string
  /** Shorter label below sm. */
  short?: string
  value?: React.ReactNode
  hint?: React.ReactNode
  /** Class for the value, e.g. "text-brand". */
  accent?: string
  alert?: boolean
  icon?: LucideIcon
  kind?: 'number' | 'text'
  onClick?: () => void
}) {
  const box = cn(
    'block min-w-0 rounded-2xl bg-white/[0.06] px-3.5 py-2.5 text-left ring-1 ring-white/[0.06] md:px-4',
    // Words do not fit a third of a phone screen, so text tiles become rows there.
    kind === 'text' && 'flex items-center justify-between gap-3 sm:block',
    alert && 'bg-[#ff6b4a]/15 ring-[#ff6b4a]/40',
    onClick && 'transition-colors outline-none hover:bg-white/10 focus-visible:ring-[3px] focus-visible:ring-white/40',
    onClick && alert && 'hover:bg-[#ff6b4a]/20',
  )
  const labelEl = (
    <span className="flex items-center gap-1 text-[0.7rem] font-semibold whitespace-nowrap text-hero-foreground/65 md:text-xs">
      {alert ? <TriangleAlertIcon className={cn('size-3.5', alertInk)} aria-hidden /> : Icon ? <Icon className="size-3.5" aria-hidden /> : null}
      {short ? (
        <>
          <span className="sm:hidden">{short}</span>
          <span className="hidden sm:inline">{label}</span>
        </>
      ) : (
        label
      )}
    </span>
  )
  const valueEl = (
    <span
      className={cn(
        'block min-w-0 truncate leading-tight font-extrabold tracking-tight tabular-nums',
        kind === 'text' ? 'sm:mt-0.5' : 'mt-0.5',
        kind === 'number' ? 'text-2xl md:text-[1.75rem]' : 'text-base md:text-xl',
        accent,
        alert && alertInk,
      )}
    >
      {value ?? '-'}
    </span>
  )
  const hintEl = hint && <span className="mt-0.5 hidden truncate text-xs text-hero-foreground/60 sm:block">{hint}</span>

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={box}>
        {labelEl}
        {valueEl}
        {hintEl}
      </button>
    )
  }
  return (
    <div className={box}>
      <dt>{labelEl}</dt>
      <dd>
        {valueEl}
        {hintEl}
      </dd>
    </div>
  )
}

/** A thin bar with a caption, under the hero stats. */
export function HeroBar({ children, caption }: { children: React.ReactNode; caption: React.ReactNode }) {
  return (
    <div className="mt-3 flex items-center gap-3">
      <span aria-hidden className="flex h-2 flex-1 gap-0.5 overflow-hidden rounded-full bg-white/10">
        {children}
      </span>
      <span className="max-w-[60%] shrink-0 truncate text-xs font-semibold text-hero-foreground/70 tabular-nums">{caption}</span>
    </div>
  )
}
