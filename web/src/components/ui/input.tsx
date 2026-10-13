import { EyeIcon, EyeOffIcon, SearchIcon, XIcon } from 'lucide-react'
import * as React from 'react'

import { cn } from '@/lib/utils'

export const fieldBase =
  'w-full min-w-0 rounded-2xl border border-input bg-card px-4 text-base shadow-xs transition-[color,box-shadow,border-color] outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 md:text-sm'
export const fieldFocus = 'focus-visible:border-foreground/60 focus-visible:ring-[3px] focus-visible:ring-ring/15'

/** A button that looks like an input and opens a picker (select, date, time). */
export const fieldTrigger = cn(
  fieldBase,
  fieldFocus,
  'flex h-12 cursor-pointer items-center gap-2.5 text-left',
  'aria-invalid:border-destructive aria-invalid:ring-destructive/20',
  'data-[state=open]:border-foreground/60 data-[state=open]:ring-[3px] data-[state=open]:ring-ring/15',
)

/** Calls every ref with the same element. */
export function mergeRefs<T>(...refs: (React.Ref<T> | undefined)[]): React.RefCallback<T> {
  return (el) => {
    for (const ref of refs) {
      if (typeof ref === 'function') ref(el)
      else if (ref) ref.current = el
    }
  }
}

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(fieldBase, fieldFocus, 'flex h-12 py-2', 'aria-invalid:border-destructive aria-invalid:ring-destructive/20', className)}
      {...props}
    />
  )
}

/** Sets a textarea's height to fit its content without moving any scroll position. */
function fitHeight(el: HTMLTextAreaElement) {
  // Shrinking to "auto" briefly can clamp the scrollTop of scroll parents
  // (dialogs, the page), so remember and restore them.
  const saved: [Element, number][] = []
  for (let p = el.parentElement; p; p = p.parentElement) {
    if (p.scrollHeight > p.clientHeight && /(auto|scroll)/.test(getComputedStyle(p).overflowY)) saved.push([p, p.scrollTop])
  }
  const page = document.scrollingElement
  if (page) saved.push([page, page.scrollTop])
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`
  for (const [p, top] of saved) if (p.scrollTop !== top) p.scrollTop = top
}

/** A textarea that grows with its content instead of showing a resize handle. */
function Textarea({ className, ref, value, ...props }: React.ComponentProps<'textarea'>) {
  const inner = React.useRef<HTMLTextAreaElement>(null)
  React.useLayoutEffect(() => {
    if (inner.current) fitHeight(inner.current)
  }, [value])
  // Line wrapping changes with the width (rotation, breakpoints).
  React.useEffect(() => {
    const el = inner.current
    if (!el || typeof ResizeObserver === 'undefined') return
    let width = el.clientWidth
    const ro = new ResizeObserver(() => {
      if (el.clientWidth === width) return
      width = el.clientWidth
      fitHeight(el)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <textarea
      ref={mergeRefs(inner, ref)}
      data-slot="textarea"
      value={value}
      className={cn(
        fieldBase,
        fieldFocus,
        'flex max-h-[60dvh] min-h-24 resize-none overflow-y-auto py-3',
        'aria-invalid:border-destructive aria-invalid:ring-destructive/20',
        className,
      )}
      {...props}
    />
  )
}

/** Password field with its own show/hide button (the browser's reveal icon is hidden in CSS). */
function PasswordInput({ className, wrapperClassName, ...props }: Omit<React.ComponentProps<'input'>, 'type'> & { wrapperClassName?: string }) {
  const [show, setShow] = React.useState(false)
  return (
    <div className={cn('relative', wrapperClassName)}>
      <Input type={show ? 'text' : 'password'} className={cn('pr-12', className)} {...props} />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        aria-pressed={show}
        aria-label={show ? 'Sembunyikan password' : 'Tampilkan password'}
        className="absolute top-1/2 right-0.5 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40"
      >
        {show ? <EyeOffIcon className="size-4" aria-hidden /> : <EyeIcon className="size-4" aria-hidden />}
      </button>
    </div>
  )
}

/** Pill search box with a leading icon and a clear button. `trailing` shows while it is empty. */
function SearchInput({
  value,
  onValueChange,
  label,
  className,
  inputClassName,
  trailing,
  ref,
  ...props
}: Omit<React.ComponentProps<'input'>, 'value' | 'onChange' | 'type'> & {
  value: string
  onValueChange: (value: string) => void
  /** Accessible name, e.g. "Cari tugas". */
  label: string
  inputClassName?: string
  trailing?: React.ReactNode
}) {
  const inner = React.useRef<HTMLInputElement>(null)
  return (
    <div className={cn('relative min-w-0', className)}>
      <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        ref={mergeRefs(inner, ref)}
        type="search"
        enterKeyHint="search"
        aria-label={label}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        className={cn(
          'peer h-11 w-full rounded-full bg-card pr-11 pl-10 text-base shadow-xs ring-1 ring-black/[0.04] outline-none placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/30 md:text-sm dark:ring-white/[0.06]',
          inputClassName,
        )}
        {...props}
      />
      {value ? (
        <button
          type="button"
          aria-label="Hapus pencarian"
          onClick={() => {
            onValueChange('')
            inner.current?.focus()
          }}
          className="absolute top-0 right-0 inline-flex size-11 items-center justify-center rounded-full text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40"
        >
          <span className="flex size-6 items-center justify-center rounded-full bg-muted">
            <XIcon className="size-3.5" aria-hidden />
          </span>
        </button>
      ) : (
        trailing
      )}
    </div>
  )
}

export { Input, PasswordInput, SearchInput, Textarea }
