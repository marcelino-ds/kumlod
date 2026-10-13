import { useQuery } from '@tanstack/react-query'
import { createContext, use, useCallback, useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'

import type { Schemas } from '@/api/client'
import { coursesQuery, useCreateTask } from '@/api/queries'
import { Field, FormError, invalidProps } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DatePicker } from '@/components/ui/date-picker'
import { Input } from '@/components/ui/input'
import { TimePicker } from '@/components/ui/time-picker'
import { localDate, zonedToDate } from '@/lib/dates'
import { fieldErrors, useActiveSemester, useAppSettings } from '@/lib/hooks'
import { deadlinePresets, priorityLabel } from '@/lib/labels'
import { uuidv7 } from '@/lib/uuid'
import { cn, courseStyle } from '@/lib/utils'

type Prefill = { courseId?: string }

const QuickAddContext = createContext<(prefill?: Prefill) => void>(() => {})

/** Opens the quick add task dialog from anywhere. */
export function useQuickAdd() {
  return use(QuickAddContext)
}

export function QuickAddProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ open: boolean; prefill: Prefill; key: number }>({ open: false, prefill: {}, key: 0 })
  const open = useCallback((prefill: Prefill = {}) => setState((s) => ({ open: true, prefill, key: s.key + 1 })), [])
  return (
    <QuickAddContext value={open}>
      {children}
      <Dialog open={state.open} onOpenChange={(o) => setState((s) => ({ ...s, open: o }))}>
        <DialogContent>
          {state.open && (
            <QuickAddForm key={state.key} prefill={state.prefill} onDone={() => setState((s) => ({ ...s, open: false }))} />
          )}
        </DialogContent>
      </Dialog>
    </QuickAddContext>
  )
}

const priorities: Schemas['TaskPriority'][] = ['low', 'normal', 'high']

function QuickAddForm({ prefill, onDone }: { prefill: Prefill; onDone: () => void }) {
  const { timeZone } = useAppSettings()
  const { active } = useActiveSemester()
  const courses = useQuery(coursesQuery(active?.id ?? ''))
  const create = useCreateTask()
  const today = useMemo(() => localDate(new Date(), timeZone), [timeZone])

  const [title, setTitle] = useState('')
  const [courseId, setCourseId] = useState(prefill.courseId ?? '')
  const [date, setDate] = useState(today)
  const [time, setTime] = useState('23:59')
  const [priority, setPriority] = useState<Schemas['TaskPriority']>('normal')
  const errs = fieldErrors(create.error)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !date || !time) return
    create.mutate(
      {
        id: uuidv7(),
        title: title.trim(),
        deadline: zonedToDate(date, time, timeZone).toISOString(),
        priority,
        ...(courseId ? { course_id: courseId } : {}),
      },
      {
        onSuccess: () => {
          toast.success('Tugas ditambahkan')
          onDone()
        },
      },
    )
  }

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>Tambah tugas</DialogTitle>
        <DialogDescription>Isi judul, pilih matkul, simpan. Deadline default hari ini jam 23:59.</DialogDescription>
      </DialogHeader>

      <Field id="qa-title" label="Judul" error={errs.title}>
        <Input
          id="qa-title"
          autoFocus
          required
          maxLength={200}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Misalnya: Laporan praktikum 3"
          {...invalidProps('qa-title', errs.title)}
        />
      </Field>

      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-semibold">Matkul</legend>
        <div className="flex flex-wrap gap-1.5">
          {[{ id: '', name: 'Tanpa matkul', color: '#94a3b8' }, ...(courses.data ?? [])].map((c) => {
            const on = courseId === c.id
            return (
              <button
                key={c.id || 'none'}
                type="button"
                aria-pressed={on}
                onClick={() => setCourseId(c.id)}
                style={courseStyle(c.color)}
                className={cn(
                  'inline-flex min-h-11 items-center gap-2 rounded-full border px-3.5 text-sm font-semibold transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none',
                  on ? 'tint-bg-strong tint-border tint-ink' : 'bg-card text-muted-foreground hover:text-foreground',
                )}
              >
                <span aria-hidden className="tint-solid size-2.5 shrink-0 rounded-full" />
                {c.name}
              </button>
            )
          })}
        </div>
        {(errs.course_id ?? errs.semester_id) && <p className="text-sm font-medium text-destructive">{errs.course_id ?? errs.semester_id}</p>}
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <Field id="qa-date" label="Tanggal" error={errs.deadline}>
          <DatePicker id="qa-date" quick value={date} onChange={setDate} {...invalidProps('qa-date', errs.deadline)} />
        </Field>
        <Field id="qa-time" label="Jam">
          <TimePicker id="qa-time" presets={deadlinePresets} value={time} onChange={setTime} />
        </Field>
      </div>

      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-semibold">Prioritas</legend>
        <div className="grid grid-cols-3 gap-1 rounded-full bg-muted p-1">
          {priorities.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={priority === p}
              onClick={() => setPriority(p)}
              className={cn(
                'h-11 rounded-full text-sm font-semibold transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none',
                priority === p
                  ? p === 'high'
                    ? 'bg-destructive text-white'
                    : 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {priorityLabel[p]}
            </button>
          ))}
        </div>
      </fieldset>

      {Object.keys(errs).length === 0 && <FormError error={create.error} />}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Batal
        </Button>
        <Button type="submit" disabled={create.isPending || !title.trim()}>
          {create.isPending ? 'Menyimpan...' : 'Simpan'}
        </Button>
      </DialogFooter>
    </form>
  )
}
