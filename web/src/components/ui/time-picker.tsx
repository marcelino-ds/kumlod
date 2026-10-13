import { ClockIcon } from 'lucide-react'
import * as React from 'react'

import { buttonVariants } from '@/components/ui/button'
import { fieldTrigger } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

const pad = (n: number) => String(n).padStart(2, '0')
const hours = Array.from({ length: 24 }, (_, i) => pad(i))

/** Minutes in steps of 5, plus 59 (deadlines) and the current minute if it is off the grid. */
function minuteOptions(current: string): string[] {
  const set = new Set([...Array.from({ length: 12 }, (_, i) => pad(i * 5)), '59'])
  if (/^[0-5]\d$/.test(current)) set.add(current)
  return [...set].sort()
}

/** A scrollable column of choices; arrow keys move between them. */
function Column({
  label,
  items,
  selected,
  onPick,
  autoFocus,
}: {
  label: string
  items: string[]
  selected: string
  onPick: (value: string) => void
  autoFocus?: boolean
}) {
  const ref = React.useRef<HTMLDivElement>(null)

  // Center the selected item when the picker opens.
  React.useLayoutEffect(() => {
    const col = ref.current
    const el = col?.querySelector<HTMLButtonElement>('[aria-selected="true"]') ?? col?.querySelector<HTMLButtonElement>('button')
    if (!col || !el) return
    col.scrollTop = el.offsetTop - col.clientHeight / 2 + el.offsetHeight / 2
    if (autoFocus) el.focus({ preventScroll: true })
    // Only on open; later picks keep the scroll position.
  }, [])

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const buttons = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button'))
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement)
    let next = i
    if (e.key === 'ArrowDown') next = Math.min(i + 1, buttons.length - 1)
    else if (e.key === 'ArrowUp') next = Math.max(i - 1, 0)
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = buttons.length - 1
    else return
    e.preventDefault()
    buttons[next]?.focus()
    buttons[next]?.scrollIntoView({ block: 'nearest' })
  }

  const hasSelected = items.includes(selected)
  return (
    <div className="min-w-0">
      <p className="mb-1.5 text-center text-xs font-bold text-muted-foreground" aria-hidden>
        {label}
      </p>
      <div
        ref={ref}
        role="listbox"
        aria-label={label}
        onKeyDown={onKeyDown}
        className="no-scrollbar relative h-56 scroll-py-1 overflow-y-auto overscroll-contain rounded-2xl bg-muted/70 p-1 dark:bg-white/[0.04]"
      >
        {items.map((x, i) => {
          const on = x === selected
          return (
            <button
              key={x}
              type="button"
              role="option"
              aria-selected={on}
              tabIndex={on || (!hasSelected && i === 0) ? 0 : -1}
              onClick={() => onPick(x)}
              className={cn(
                'flex h-11 w-full items-center justify-center rounded-xl text-base font-semibold tabular-nums transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40',
                on ? 'bg-primary font-extrabold text-primary-foreground shadow-sm' : 'hover:bg-card dark:hover:bg-white/[0.06]',
              )}
            >
              {x}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Time field (HH:MM, 24 hours) with hour and minute columns. Picking a minute closes it. */
export function TimePicker({
  id,
  value,
  onChange,
  placeholder = '--:--',
  clearable,
  presets,
  disabled,
  className,
  onClose,
  ...aria
}: {
  id?: string
  value: string
  onChange: (time: string) => void
  placeholder?: string
  clearable?: boolean
  /** One-tap times shown above the columns, e.g. ["23:59"]. */
  presets?: string[]
  disabled?: boolean
  className?: string
  /** Called with the final value when the picker closes. */
  onClose?: (time: string) => void
  'aria-invalid'?: boolean
  'aria-describedby'?: string
}) {
  const [open, setOpenState] = React.useState(false)
  const fallbackId = React.useId()
  const valueId = `${id ?? fallbackId}-value`
  const [h = '', m = ''] = value ? value.split(':') : []
  // The latest picked time, so onClose sees it even before the parent re-renders.
  const latest = React.useRef(value)
  const setOpen = (o: boolean) => {
    if (o) latest.current = value
    setOpenState(o)
    if (!o && open) onClose?.(latest.current)
  }
  const set = (time: string, close: boolean) => {
    latest.current = time
    onChange(time)
    if (close) setOpen(false)
  }
  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild disabled={disabled}>
        <button
          type="button"
          id={id}
          aria-invalid={aria['aria-invalid']}
          aria-describedby={[valueId, aria['aria-describedby']].filter(Boolean).join(' ')}
          className={cn(fieldTrigger, 'tabular-nums', className)}
        >
          <ClockIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <span id={valueId} className={cn('min-w-0 flex-1 truncate', !value && 'text-muted-foreground')}>
            {value || placeholder}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent onOpenAutoFocus={(e) => e.preventDefault()}>
        <div className="w-[min(16.5rem,calc(100vw-1.5rem))] p-2.5">
          {presets && presets.length > 0 && (
            <div className="mb-2.5 grid grid-cols-4 gap-1">
              {presets.map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-pressed={p === value}
                  onClick={() => set(p, true)}
                  className={cn(buttonVariants({ variant: p === value ? 'default' : 'secondary' }), 'px-0 tabular-nums')}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-1.5">
            <Column label="Jam" items={hours} selected={h} onPick={(x) => set(`${x}:${m || '00'}`, false)} autoFocus />
            <span aria-hidden className="pb-[6.5rem] text-xl font-extrabold text-muted-foreground">
              :
            </span>
            <Column label="Menit" items={minuteOptions(m)} selected={m} onPick={(x) => set(`${h || '00'}:${x}`, true)} />
          </div>
          <div className="mt-2.5 flex items-center gap-1.5 border-t pt-2.5">
            {clearable && value && (
              <button type="button" onClick={() => set('', true)} className={cn(buttonVariants({ variant: 'ghost' }), 'px-4 text-muted-foreground')}>
                Kosongkan
              </button>
            )}
            <button type="button" onClick={() => setOpen(false)} className={cn(buttonVariants(), 'ml-auto')}>
              Selesai
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
