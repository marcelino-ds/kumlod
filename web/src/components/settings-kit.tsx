import { useQueryClient } from '@tanstack/react-query'
import { MinusIcon, PlusIcon, type LucideIcon } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type * as React from 'react'
import { toast } from 'sonner'

import { errorMessage, type Settings } from '@/api/client'
import { qk, useUpdateSettings } from '@/api/queries'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/misc'
import { toUpdate } from '@/lib/settings'
import { cn } from '@/lib/utils'

// ------------------------------------------------------------- saving

type SaveOptions = {
  /** Toast after a successful save; false for none. */
  success?: string | false
  /** Do not toast errors; the caller shows them inline. */
  quietError?: boolean
  confirmGradeScale?: boolean
}

type SettingsCtx = {
  /**
   * Merges patch into the latest settings and saves the full object. Pass a
   * function to patch nested values (reminders) from the latest state.
   */
  save: (patch: Partial<Settings> | ((latest: Settings) => Partial<Settings>), opts?: SaveOptions) => Promise<Settings>
  /** Registers whether a section has unsaved edits. */
  setDirty: (key: string, dirty: boolean) => void
  dirty: boolean
}

const Ctx = createContext<SettingsCtx | null>(null)

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient()
  const update = useUpdateSettings()
  // Settings as they will be once queued saves finish, so a second quick
  // change builds on the first instead of the stale cache.
  const latest = useRef<Settings | null>(null)
  const [dirtyKeys, setDirtyKeys] = useState<ReadonlySet<string>>(new Set())
  const { mutateAsync } = update

  const save = useCallback(
    async (patch: Partial<Settings> | ((latest: Settings) => Partial<Settings>), opts: SaveOptions = {}) => {
      const base = latest.current ?? qc.getQueryData<Settings>(qk.settings)
      if (!base) throw new Error('Pengaturan belum dimuat')
      const next = { ...base, ...(typeof patch === 'function' ? patch(base) : patch) }
      latest.current = next
      try {
        const saved = await mutateAsync(toUpdate(next, opts.confirmGradeScale))
        if (latest.current === next) latest.current = null
        if (opts.success !== false) toast.success(opts.success ?? 'Pengaturan disimpan', { duration: 1800 })
        return saved
      } catch (err) {
        latest.current = null
        if (!opts.quietError) toast.error(errorMessage(err))
        throw err
      }
    },
    [qc, mutateAsync],
  )

  const setDirty = useCallback((key: string, dirty: boolean) => {
    setDirtyKeys((prev) => {
      if (prev.has(key) === dirty) return prev
      const next = new Set(prev)
      if (dirty) next.add(key)
      else next.delete(key)
      return next
    })
  }, [])

  const value = useMemo(() => ({ save, setDirty, dirty: dirtyKeys.size > 0 }), [save, setDirty, dirtyKeys])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSettingsCtx(): SettingsCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useSettingsCtx outside SettingsProvider')
  return ctx
}

/** Reports a section's unsaved state to the page while mounted. */
export function useDirty(key: string, dirty: boolean) {
  const { setDirty } = useSettingsCtx()
  useEffect(() => {
    setDirty(key, dirty)
    return () => setDirty(key, false)
  }, [key, dirty, setDirty])
}

/**
 * Saves value after it stopped changing for delayMs, when it is valid and
 * differs from the saved one. Returns whether a save is waiting or running.
 */
export function useAutoSave<T>(value: T, saved: T, valid: boolean, commit: (v: T) => Promise<unknown>, delayMs = 700): boolean {
  const [busy, setBusy] = useState(false)
  const commitRef = useRef(commit)
  commitRef.current = commit
  const changed = valid && !Object.is(value, saved)
  useEffect(() => {
    if (!changed) return
    const id = setTimeout(() => {
      setBusy(true)
      commitRef.current(value).finally(() => setBusy(false))
    }, delayMs)
    return () => clearTimeout(id)
  }, [value, changed, delayMs])
  return changed || busy
}

// ----------------------------------------------------------- layout

/** A settings card with an icon, title, and description. */
export function SettingsSection({
  id,
  icon: Icon,
  tone,
  title,
  description,
  aside,
  children,
  className,
}: {
  id: string
  icon: LucideIcon
  tone: string
  title: string
  description?: React.ReactNode
  aside?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={cn('@container scroll-mt-6 rounded-[1.75rem] bg-card p-5 shadow-xs ring-1 ring-black/[0.03] md:p-6 dark:ring-white/[0.06]', className)}
    >
      <div className="mb-5 flex items-start gap-3">
        <span aria-hidden className={cn('flex size-11 shrink-0 items-center justify-center rounded-2xl', tone)}>
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
          <h2 id={`${id}-title`} className="text-lg leading-tight font-extrabold tracking-tight">
            {title}
          </h2>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  )
}

/** A label, hint, and an auto-saving switch. The whole row is the touch target. */
export function ToggleRow({
  id,
  label,
  hint,
  checked,
  onSave,
  children,
}: {
  id: string
  label: string
  hint?: React.ReactNode
  checked: boolean
  onSave: (v: boolean) => Promise<unknown>
  /** Extra controls shown under the row while it is on. */
  children?: React.ReactNode
}) {
  // Shows the new state right away and falls back to the saved one on failure.
  const [optimistic, setOptimistic] = useState<boolean | null>(null)
  const on = optimistic ?? checked
  const change = (v: boolean) => {
    setOptimistic(v)
    onSave(v)
      .catch(() => undefined)
      .finally(() => setOptimistic(null))
  }
  return (
    <div className="rounded-2xl bg-muted/60 px-4 py-3 dark:bg-white/[0.03]">
      <div className="flex items-center justify-between gap-4">
        <Label htmlFor={id} className="min-w-0 flex-1 cursor-pointer flex-col items-start gap-0.5 py-1 leading-snug">
          <span>{label}</span>
          {hint && <span className="text-sm font-normal text-muted-foreground">{hint}</span>}
        </Label>
        <Switch id={id} checked={on} onCheckedChange={change} />
      </div>
      {on && children}
    </div>
  )
}

/** A number with minus and plus buttons and a typed value. */
export function Stepper({
  id,
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
  error,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  min: number
  max: number
  step?: number
  suffix?: string
  error?: string
}) {
  const n = Number.parseInt(value, 10)
  const set = (v: number) => onChange(String(Math.min(max, Math.max(min, v))))
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex h-12 items-center gap-1 rounded-2xl border border-input bg-card p-1 shadow-xs focus-within:border-foreground/60 focus-within:ring-[3px] focus-within:ring-ring/15">
        <Button
          variant="ghost"
          size="icon"
          className="size-10 shrink-0"
          aria-label={`Kurangi ${label.toLowerCase()}`}
          disabled={Number.isNaN(n) || n <= min}
          onClick={() => set((Number.isNaN(n) ? min : n) - step)}
        >
          <MinusIcon />
        </Button>
        <div className="flex h-full min-w-0 flex-1 items-center justify-center gap-1">
          <input
            id={id}
            inputMode="numeric"
            value={value}
            onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, '').slice(0, 3))}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            className={cn('h-full min-w-0 bg-transparent text-base font-bold tabular-nums outline-none', suffix ? 'w-[3.5ch] text-right' : 'w-full text-center')}
          />
          {suffix && <span className="shrink-0 text-base font-bold text-muted-foreground">{suffix}</span>}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-10 shrink-0"
          aria-label={`Tambah ${label.toLowerCase()}`}
          disabled={!Number.isNaN(n) && n >= max}
          onClick={() => set((Number.isNaN(n) ? min : n) + step)}
        >
          <PlusIcon />
        </Button>
      </div>
      {error && (
        <p id={`${id}-error`} className="text-sm font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

/** Shown under a sub-form with unsaved edits: what is pending, cancel, and save. */
export function SaveBar({
  visible,
  pending,
  canSave,
  onCancel,
  label = 'Perubahan belum disimpan',
  saveLabel = 'Simpan',
}: {
  visible: boolean
  pending: boolean
  canSave: boolean
  onCancel: () => void
  label?: string
  saveLabel?: string
}) {
  if (!visible) return null
  return (
    <div
      role="status"
      className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl bg-brand/15 py-2 pr-2 pl-4 ring-1 ring-brand/50 dark:bg-brand/10"
    >
      <span aria-hidden className="size-2 shrink-0 animate-pulse rounded-full bg-brand" />
      <p className="min-w-0 flex-1 text-sm font-semibold">{label}</p>
      <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
        Batal
      </Button>
      <Button type="submit" variant="brand" disabled={pending || !canSave}>
        {pending ? 'Menyimpan...' : saveLabel}
      </Button>
    </div>
  )
}
