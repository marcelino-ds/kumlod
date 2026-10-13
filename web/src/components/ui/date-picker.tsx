import { format } from 'date-fns'
import { id as idLocale } from 'date-fns/locale'
import { CalendarIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import * as React from 'react'

import { buttonVariants } from '@/components/ui/button'
import { fieldTrigger } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { addDays, addMonths, formatShortDate, localDate, mondayOf, monthGrid, parseLocalDate } from '@/lib/dates'
import { useAppSettings } from '@/lib/hooks'
import { cn } from '@/lib/utils'

const weekdays = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min']
const pad = (n: number) => String(n).padStart(2, '0')

const outOfRange = (d: string, min?: string, max?: string) => (!!min && d < min) || (!!max && d > max)
const clamp = (d: string, min?: string, max?: string) => (min && d < min ? min : max && d > max ? max : d)
const monthLabel = (d: string) => format(parseLocalDate(d), 'MMMM yyyy', { locale: idLocale })
const longLabel = (d: string) => format(parseLocalDate(d), 'EEEE, d MMMM yyyy', { locale: idLocale })

const navButton =
  'inline-flex size-11 items-center justify-center rounded-full text-foreground transition-colors outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-30'

/** Month calendar with keyboard support (arrows, Home/End, PageUp/PageDown, Shift for years). */
export function Calendar({
  value,
  onSelect,
  today,
  min,
  max,
  quick,
  onClear,
}: {
  value: string
  onSelect: (date: string) => void
  /** YYYY-MM-DD in the app time zone. */
  today: string
  min?: string
  max?: string
  /** Adds "Besok" and "Minggu depan" next to "Hari ini". */
  quick?: boolean
  /** Shows "Kosongkan". */
  onClear?: () => void
}) {
  const [cursor, setCursor] = React.useState(() => value || clamp(today, min, max))
  const [view, setView] = React.useState<'days' | 'months'>('days')
  const [year, setYear] = React.useState(() => Number(cursor.slice(0, 4)))
  const gridRef = React.useRef<HTMLDivElement>(null)
  const wantFocus = React.useRef(true)

  // Move focus to the cursor day after keyboard moves, and once when opened.
  React.useEffect(() => {
    if (!wantFocus.current || view !== 'days') return
    wantFocus.current = false
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${cursor}"]`)?.focus()
  }, [cursor, view])

  const move = (next: string) => {
    wantFocus.current = true
    setCursor(next)
  }

  const onGridKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowLeft':
        move(addDays(cursor, -1))
        break
      case 'ArrowRight':
        move(addDays(cursor, 1))
        break
      case 'ArrowUp':
        move(addDays(cursor, -7))
        break
      case 'ArrowDown':
        move(addDays(cursor, 7))
        break
      case 'Home':
        move(mondayOf(cursor))
        break
      case 'End':
        move(addDays(mondayOf(cursor), 6))
        break
      case 'PageUp':
        move(addMonths(cursor, e.shiftKey ? -12 : -1))
        break
      case 'PageDown':
        move(addMonths(cursor, e.shiftKey ? 12 : 1))
        break
      default:
        return
    }
    e.preventDefault()
  }

  const month = cursor.slice(0, 7)
  const days = monthGrid(cursor)
  const weeks = Array.from({ length: 6 }, (_, w) => days.slice(w * 7, w * 7 + 7))
  const pick = (d: string) => !outOfRange(d, min, max) && onSelect(d)

  const shortcuts = [
    { label: 'Hari ini', date: today },
    ...(quick
      ? [
          { label: 'Besok', date: addDays(today, 1) },
          { label: 'Minggu depan', date: addDays(today, 7) },
        ]
      : []),
  ]

  return (
    <div className="w-[min(20.5rem,calc(100vw-1.5rem))] p-2.5">
      <div className="mb-1 flex items-center justify-between gap-1">
        <button
          type="button"
          onClick={() => {
            setYear(Number(cursor.slice(0, 4)))
            setView((v) => (v === 'days' ? 'months' : 'days'))
            wantFocus.current = view === 'months'
          }}
          aria-expanded={view === 'months'}
          className="group inline-flex h-11 min-w-0 items-center gap-1.5 rounded-full px-3 text-base font-extrabold tracking-tight capitalize outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/40"
        >
          <span aria-live="polite" className="truncate">
            {view === 'days' ? monthLabel(cursor) : year}
          </span>
          <span className="sr-only">, pilih bulan</span>
          <ChevronDownIcon aria-hidden className="size-4 shrink-0 opacity-60 transition-transform group-aria-expanded:rotate-180" />
        </button>
        <div className="flex shrink-0">
          <button
            type="button"
            className={navButton}
            aria-label={view === 'days' ? 'Bulan sebelumnya' : 'Tahun sebelumnya'}
            onClick={() => (view === 'days' ? setCursor(addMonths(cursor, -1)) : setYear((y) => y - 1))}
          >
            <ChevronLeftIcon className="size-5" aria-hidden />
          </button>
          <button
            type="button"
            className={navButton}
            aria-label={view === 'days' ? 'Bulan berikutnya' : 'Tahun berikutnya'}
            onClick={() => (view === 'days' ? setCursor(addMonths(cursor, 1)) : setYear((y) => y + 1))}
          >
            <ChevronRightIcon className="size-5" aria-hidden />
          </button>
        </div>
      </div>

      {view === 'days' ? (
        <div ref={gridRef} role="grid" aria-label={monthLabel(cursor)} onKeyDown={onGridKeyDown}>
          <div role="row" className="grid grid-cols-7">
            {weekdays.map((w, i) => (
              <span
                key={w}
                role="columnheader"
                className={cn('flex h-8 items-center justify-center text-xs font-bold text-muted-foreground', i === 6 && 'text-red-600/80 dark:text-red-400/80')}
              >
                {w}
              </span>
            ))}
          </div>
          {weeks.map((week) => (
            <div key={week[0]} role="row" className="grid grid-cols-7">
              {week.map((d, i) => {
                const selected = d === value
                const isToday = d === today
                const inMonth = d.startsWith(month)
                const disabled = outOfRange(d, min, max)
                return (
                  <div key={d} role="gridcell" aria-selected={selected} className="flex justify-center py-px">
                    <button
                      type="button"
                      data-date={d}
                      tabIndex={d === cursor ? 0 : -1}
                      aria-label={`${longLabel(d)}${isToday ? ', hari ini' : ''}`}
                      aria-current={isToday ? 'date' : undefined}
                      aria-disabled={disabled || undefined}
                      onClick={() => pick(d)}
                      onFocus={() => inMonth && d !== cursor && setCursor(d)}
                      className={cn(
                        'relative flex size-11 items-center justify-center rounded-full text-sm font-semibold tabular-nums transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40',
                        !selected && 'hover:bg-muted',
                        !inMonth && 'text-muted-foreground/55',
                        inMonth && i === 6 && !selected && 'text-red-600 dark:text-red-400',
                        isToday && !selected && 'bg-brand/45 font-extrabold text-foreground hover:bg-brand/60',
                        selected && 'bg-primary font-extrabold text-primary-foreground shadow-sm',
                        disabled && 'cursor-not-allowed line-through opacity-35 hover:bg-transparent',
                      )}
                    >
                      {Number(d.slice(8))}
                    </button>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-1.5 py-1">
          {Array.from({ length: 12 }, (_, m) => {
            const first = `${year}-${pad(m + 1)}-01`
            const last = addDays(addMonths(first, 1), -1)
            const disabled = (!!min && last < min) || (!!max && first > max)
            const current = month === first.slice(0, 7)
            const thisMonth = today.startsWith(first.slice(0, 7))
            return (
              <button
                key={m}
                type="button"
                disabled={disabled}
                aria-pressed={current}
                onClick={() => {
                  move(clamp(addMonths(`${year}-${pad(m + 1)}-${cursor.slice(8)}`, 0), min, max))
                  setView('days')
                }}
                className={cn(
                  'h-12 rounded-2xl text-sm font-semibold capitalize transition-colors outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-35',
                  thisMonth && !current && 'bg-brand/45 font-extrabold hover:bg-brand/60',
                  current && 'bg-primary font-extrabold text-primary-foreground hover:bg-primary/90',
                )}
              >
                {format(parseLocalDate(first), 'MMM', { locale: idLocale })}
              </button>
            )
          })}
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t pt-2.5">
        {shortcuts.map((s) => (
          <button
            key={s.label}
            type="button"
            disabled={outOfRange(s.date, min, max)}
            onClick={() => onSelect(s.date)}
            className={cn(buttonVariants({ variant: 'secondary' }), 'px-4')}
          >
            {s.label}
          </button>
        ))}
        {onClear && (
          <button type="button" onClick={onClear} className={cn(buttonVariants({ variant: 'ghost' }), 'ml-auto px-4 text-muted-foreground')}>
            Kosongkan
          </button>
        )}
      </div>
    </div>
  )
}

/** Date field that opens the Kumlod calendar. Value is YYYY-MM-DD or "". */
export function DatePicker({
  id,
  value,
  onChange,
  min,
  max,
  placeholder = 'Pilih tanggal',
  clearable,
  quick,
  disabled,
  className,
  ...aria
}: {
  id?: string
  value: string
  onChange: (date: string) => void
  min?: string
  max?: string
  placeholder?: string
  clearable?: boolean
  quick?: boolean
  disabled?: boolean
  className?: string
  'aria-invalid'?: boolean
  'aria-describedby'?: string
}) {
  const { timeZone } = useAppSettings()
  const [open, setOpen] = React.useState(false)
  const fallbackId = React.useId()
  const valueId = `${id ?? fallbackId}-value`
  const today = localDate(new Date(), timeZone)
  const choose = (d: string) => {
    onChange(d)
    setOpen(false)
  }
  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild disabled={disabled}>
        <button
          type="button"
          id={id}
          aria-invalid={aria['aria-invalid']}
          aria-describedby={[valueId, aria['aria-describedby']].filter(Boolean).join(' ')}
          className={cn(fieldTrigger, className)}
        >
          <CalendarIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <span id={valueId} className={cn('min-w-0 flex-1 truncate', !value && 'text-muted-foreground')}>
            {value ? formatShortDate(value, Number(today.slice(0, 4))) : placeholder}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent onOpenAutoFocus={(e) => e.preventDefault()}>
        <Calendar
          value={value}
          onSelect={choose}
          today={today}
          min={min}
          max={max}
          quick={quick}
          onClear={clearable && value ? () => choose('') : undefined}
        />
      </PopoverContent>
    </Popover>
  )
}
