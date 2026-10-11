import { AlertCircleIcon, RefreshCwIcon, SparklesIcon, WifiOffIcon } from 'lucide-react'
import type * as React from 'react'

import type { AttendanceSummary } from '@/api/client'
import { errorMessage } from '@/api/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/misc'
import { useOnline } from '@/lib/hooks'
import { levelLabel, levelVariant } from '@/lib/labels'
import { cn, courseStyle } from '@/lib/utils'

/** The wordmark: logo tile plus "kumlod." */
export function Brand({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <img src="/logo.svg" alt="" className="size-10 rounded-[0.8rem]" />
      <span className="text-[1.4rem] leading-none font-extrabold tracking-tight">
        kumlod<span className="text-[#ff6b4a]">.</span>
      </span>
    </span>
  )
}

/** Class for the "back" pill link above detail pages. */
export const backLinkClass =
  'group mb-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-card py-1 pr-4 pl-1 text-sm font-semibold shadow-xs ring-1 ring-black/[0.03] hover:bg-muted dark:ring-white/[0.06] [&>svg]:size-9 [&>svg]:rounded-full [&>svg]:bg-muted [&>svg]:p-2.5 [&>svg]:transition-transform hover:[&>svg]:-translate-x-0.5'

export function PageHeader({
  title,
  eyebrow,
  description,
  actions,
  className,
}: {
  title: React.ReactNode
  eyebrow?: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('mb-6 flex flex-wrap items-end justify-between gap-x-4 gap-y-3', className)}>
      <div className="min-w-0">
        {eyebrow && <p className="mb-1.5 text-sm font-semibold text-muted-foreground">{eyebrow}</p>}
        <h1 className="text-[1.75rem] leading-[1.1] font-extrabold tracking-tight text-balance md:text-4xl">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm text-muted-foreground md:text-base">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Section({
  title,
  count,
  action,
  children,
  className,
  tone,
}: {
  title: React.ReactNode
  count?: number
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
  tone?: 'danger'
}) {
  return (
    <section className={cn('space-y-3', className)}>
      <div className="flex min-h-9 items-center justify-between gap-2">
        <h2 className={cn('flex items-center gap-2 text-lg font-bold tracking-tight', tone === 'danger' && 'text-destructive')}>
          {title}
          {count !== undefined && (
            <span
              className={cn(
                'inline-flex h-6 min-w-6 items-center justify-center rounded-full px-2 text-xs font-bold tabular-nums',
                tone === 'danger' ? 'bg-destructive text-white' : 'bg-foreground/[0.07] text-foreground',
              )}
            >
              {count}
            </span>
          )}
        </h2>
        {action}
      </div>
      {children}
    </section>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode
  title: string
  description?: React.ReactNode
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'relative flex flex-col items-center gap-2 overflow-hidden rounded-3xl bg-card px-6 py-10 text-center shadow-xs ring-1 ring-black/[0.03] dark:ring-white/[0.06]',
        className,
      )}
    >
      <div
        aria-hidden
        className="mb-2 flex size-16 rotate-[-6deg] items-center justify-center rounded-[1.4rem] bg-brand text-brand-foreground shadow-sm [&_svg]:size-7"
      >
        {icon ?? <SparklesIcon />}
      </div>
      <p className="text-lg font-bold tracking-tight">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-3xl bg-destructive/[0.07] px-6 py-8 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-destructive text-white">
        <AlertCircleIcon className="size-6" aria-hidden />
      </span>
      <p className="text-sm font-medium">{errorMessage(error)}</p>
      {onRetry && (
        <Button variant="outline" onClick={onRetry}>
          <RefreshCwIcon /> Coba lagi
        </Button>
      )}
    </div>
  )
}

/** Placeholder while data loads. Offline, it explains that nothing is cached yet. */
export function LoadingList({ rows = 3 }: { rows?: number }) {
  const online = useOnline()
  if (!online) {
    return (
      <EmptyState
        icon={<WifiOffIcon />}
        title="Data ini belum tersimpan di perangkat"
        description="Halaman ini belum pernah dibuka saat online. Sambungkan internet untuk memuatnya."
      />
    )
  }
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Memuat">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-20 w-full rounded-3xl" />
      ))}
    </div>
  )
}

/** Label, control, and an inline hint or error. Pass id to link them. */
export function Field({
  id,
  label,
  error,
  hint,
  children,
  className,
}: {
  id: string
  label: React.ReactNode
  error?: string
  hint?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('grid gap-2', className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="text-xs text-muted-foreground">
            {hint}
          </p>
        )
      )}
    </div>
  )
}

/** aria props for a control with a possible error. */
export function invalidProps(id: string, error?: string) {
  return error ? { 'aria-invalid': true as const, 'aria-describedby': `${id}-error` } : {}
}

export function CourseDot({ color, className }: { color: string; className?: string }) {
  return <span aria-hidden className={cn('inline-block size-2.5 shrink-0 rounded-full', className)} style={{ backgroundColor: color }} />
}

/** A pastel pill with the course color and name. */
export function CourseChip({ course, className }: { course: { name: string; color: string }; className?: string }) {
  return (
    <span
      style={courseStyle(course.color)}
      className={cn('tint-bg tint-ink inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold', className)}
    >
      <span aria-hidden className="tint-solid size-2 shrink-0 rounded-full" />
      <span className="truncate">{course.name}</span>
    </span>
  )
}

export function LevelBadge({ level, className }: { level: AttendanceSummary['level']; className?: string }) {
  return (
    <Badge variant={levelVariant[level]} className={className}>
      {levelLabel[level]}
    </Badge>
  )
}

/** Shows the first error message of a form that has no field-level errors. */
export function FormError({ error }: { error: unknown }) {
  if (!error) return null
  return (
    <p role="alert" className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
      {errorMessage(error)}
    </p>
  )
}

/**
 * One dot per lecture meeting: present (course color), absent (red), excused but
 * not counted (sky), past without a record (ring), and upcoming (faint).
 * Decorative; pair it with attendanceSummaryText for screen readers.
 */
export function AttendanceDots({
  attendance: a,
  color,
  className,
  size = 'md',
}: {
  attendance: AttendanceSummary
  color: string
  className?: string
  size?: 'sm' | 'md'
}) {
  if (a.total === 0) return null
  const excused = Math.max(a.recorded - a.present - a.absences, 0)
  const pending = Math.max(a.held - a.recorded, 0)
  const kinds: string[] = [
    ...Array<string>(a.present).fill('tint-solid'),
    ...Array<string>(a.absences).fill('bg-red-500'),
    ...Array<string>(excused).fill('bg-sky-400'),
    ...Array<string>(pending).fill('border-2 border-[color:var(--c)] bg-transparent'),
  ]
  while (kinds.length < a.total) kinds.push('tint-solid opacity-20')
  return (
    <div aria-hidden style={courseStyle(color)} className={cn('flex flex-wrap gap-1', className)}>
      {kinds.slice(0, a.total).map((k, i) => (
        <span key={i} className={cn('rounded-full', size === 'sm' ? 'size-2.5' : 'size-3.5', k)} />
      ))}
    </div>
  )
}

/** A big-number tile used in hero cards and summaries. */
export function StatTile({
  label,
  value,
  hint,
  className,
  valueClassName,
}: {
  label: React.ReactNode
  value: React.ReactNode
  hint?: React.ReactNode
  className?: string
  valueClassName?: string
}) {
  return (
    <div className={cn('flex min-w-0 flex-col justify-between gap-1 rounded-2xl bg-card/70 p-3.5', className)}>
      <p className="text-xs font-semibold opacity-75">{label}</p>
      <p className={cn('text-3xl leading-none font-extrabold tracking-tight tabular-nums', valueClassName)}>{value}</p>
      {hint && <p className="text-xs leading-tight opacity-75">{hint}</p>}
    </div>
  )
}

const chipBase =
  'inline-flex h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none'

/** A scrollable row of course chips to filter a list by course. */
export function CourseFilterChips({
  courses,
  value,
  onChange,
  counts,
}: {
  courses: { id: string; name: string; color: string }[]
  value: string | undefined
  onChange: (courseId: string | undefined) => void
  counts?: Record<string, number>
}) {
  if (courses.length === 0) return null
  return (
    <div role="group" aria-label="Filter matkul" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 py-0.5 md:mx-0 md:flex-wrap md:px-0">
      <button
        type="button"
        aria-pressed={!value}
        onClick={() => onChange(undefined)}
        className={cn(chipBase, !value ? 'border-transparent bg-primary text-primary-foreground' : 'bg-card hover:bg-muted')}
      >
        Semua matkul
      </button>
      {courses.map((c) => {
        const on = value === c.id
        const count = counts?.[c.id]
        return (
          <button
            key={c.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? undefined : c.id)}
            style={courseStyle(c.color)}
            className={cn(chipBase, on ? 'tint-bg-strong tint-border tint-ink' : 'bg-card hover:bg-muted')}
          >
            <span aria-hidden className="tint-solid size-2.5 rounded-full" />
            {c.name}
            {count !== undefined && count > 0 && <span className="text-xs opacity-60 tabular-nums">{count}</span>}
          </button>
        )
      })}
    </div>
  )
}
