import { useRouter } from '@tanstack/react-router'
import { PlusIcon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import type { Course, Schemas } from '@/api/client'
import { useCreateCourse, useUpdateCourse } from '@/api/queries'
import { Field, FormError, invalidProps } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/misc'
import { fieldErrors } from '@/lib/hooks'
import { courseColors, dayNames } from '@/lib/labels'
import { uuidv7 } from '@/lib/uuid'
import { cn, courseStyle } from '@/lib/utils'

type Slot = Schemas['ScheduleInput'] & { key: string }

const newSlot = (): Slot => ({ key: uuidv7(), day_of_week: 1, start_time: '08:00', end_time: '09:40', room: '' })

function toInt(v: string, fallback: number): number {
  const n = Number.parseInt(v, 10)
  return Number.isFinite(n) ? n : fallback
}

/** Create or edit a course. Create needs semesterId and the defaults from settings. */
export function CourseForm(
  props:
    | { mode: 'create'; semesterId: string; defaults: { totalMeetings: number; minPct: number } }
    | { mode: 'edit'; course: Course; letters: string[] },
) {
  const router = useRouter()
  const create = useCreateCourse()
  const update = useUpdateCourse()
  const mutation = props.mode === 'create' ? create : update
  const errs = fieldErrors(mutation.error)
  const c = props.mode === 'edit' ? props.course : undefined

  const [name, setName] = useState(c?.name ?? '')
  const [code, setCode] = useState(c?.code ?? '')
  const [credits, setCredits] = useState(String(c?.credits ?? 3))
  const [lecturer, setLecturer] = useState(c?.lecturer ?? '')
  const [color, setColor] = useState(c?.color ?? courseColors[0])
  const [slots, setSlots] = useState<Slot[]>(
    c ? c.schedules.map((s) => ({ ...s, key: s.id })) : [newSlot()],
  )
  const [totalMeetings, setTotalMeetings] = useState(
    String(c?.total_meetings ?? (props.mode === 'create' ? props.defaults.totalMeetings : 16)),
  )
  const [minPct, setMinPct] = useState(String(c?.min_attendance_pct ?? (props.mode === 'create' ? props.defaults.minPct : 75)))
  const [generate, setGenerate] = useState(true)
  const [notes, setNotes] = useState(c?.notes ?? '')
  const [letter, setLetter] = useState(c?.final_grade_letter ?? '')

  const setSlot = (key: string, patch: Partial<Schemas['ScheduleInput']>) =>
    setSlots((list) => list.map((s) => (s.key === key ? { ...s, ...patch } : s)))

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const schedules = slots.map(({ key: _key, ...s }) => ({ ...s, room: s.room.trim() }))
    const common = {
      name: name.trim(),
      code: code.trim(),
      credits: toInt(credits, -1),
      lecturer: lecturer.trim(),
      color,
      total_meetings: toInt(totalMeetings, 0),
      min_attendance_pct: toInt(minPct, -1),
      notes,
      schedules,
    }
    if (props.mode === 'create') {
      const id = uuidv7()
      create.mutate(
        { semesterId: props.semesterId, body: { ...common, id, generate_meetings: generate } },
        {
          onSuccess: (course) => {
            toast.success('Matkul ditambahkan')
            void router.navigate({ to: '/matkul/$courseId', params: { courseId: course.id } })
          },
        },
      )
    } else {
      update.mutate(
        { id: props.course.id, body: { ...common, final_grade_letter: letter || null } },
        {
          onSuccess: () => {
            toast.success('Matkul disimpan')
            void router.navigate({ to: '/matkul/$courseId', params: { courseId: props.course.id } })
          },
        },
      )
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-5 rounded-[2rem] bg-card p-5 shadow-xs ring-1 ring-black/[0.03] md:p-7 dark:ring-white/[0.06]" noValidate>
      <div style={courseStyle(color)} className="tint-bg-strong -mx-1 -mt-1 flex items-center gap-3 rounded-3xl p-4">
        <span aria-hidden className="tint-solid flex size-12 shrink-0 items-center justify-center rounded-2xl text-lg font-extrabold text-white">
          {(name.trim() || 'M').slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="tint-ink truncate text-lg leading-tight font-extrabold">{name.trim() || 'Nama matkul'}</p>
          <p className="text-sm text-foreground/70">
            {[code.trim(), `${credits || 0} SKS`, lecturer.trim()].filter(Boolean).join(' · ')}
          </p>
        </div>
      </div>
      <Field id="c-name" label="Nama matkul" error={errs.name}>
        <Input id="c-name" required maxLength={150} value={name} onChange={(e) => setName(e.target.value)} placeholder="Basis Data" {...invalidProps('c-name', errs.name)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field id="c-code" label="Kode" error={errs.code}>
          <Input id="c-code" maxLength={30} value={code} onChange={(e) => setCode(e.target.value)} placeholder="IF201" />
        </Field>
        <Field id="c-credits" label="SKS" error={errs.credits}>
          <Input id="c-credits" inputMode="numeric" value={credits} onChange={(e) => setCredits(e.target.value)} {...invalidProps('c-credits', errs.credits)} />
        </Field>
      </div>
      <Field id="c-lecturer" label="Dosen" error={errs.lecturer}>
        <Input id="c-lecturer" maxLength={150} value={lecturer} onChange={(e) => setLecturer(e.target.value)} />
      </Field>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">Warna</legend>
        <div className="flex flex-wrap gap-2">
          {courseColors.map((col) => (
            <button
              key={col}
              type="button"
              aria-pressed={color === col}
              aria-label={`Warna ${col}`}
              onClick={() => setColor(col)}
              className={cn(
                'size-11 rounded-full ring-offset-2 ring-offset-card transition-transform hover:scale-105 focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none',
                color === col && 'scale-105 ring-[3px] ring-foreground',
              )}
              style={{ backgroundColor: col }}
            />
          ))}
        </div>
        {errs.color && <p className="mt-2 text-sm text-destructive">{errs.color}</p>}
      </fieldset>

      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm font-medium">Jadwal mingguan</legend>
        {errs.schedules && <p className="text-sm text-destructive">{errs.schedules}</p>}
        {slots.length === 0 && <p className="text-sm text-muted-foreground">Belum ada jadwal. Pertemuan bisa ditambah manual nanti.</p>}
        {slots.map((s, i) => {
          const prefix = `schedules[${i}]`
          const slotErr = errs[`${prefix}.day_of_week`] ?? errs[`${prefix}.start_time`] ?? errs[`${prefix}.end_time`] ?? errs[`${prefix}.room`]
          return (
            <div key={s.key} className="grid gap-2 rounded-3xl bg-muted p-3.5">
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <div className="grid gap-1.5">
                  <Label htmlFor={`slot-day-${s.key}`}>Hari</Label>
                  <NativeSelect id={`slot-day-${s.key}`} value={s.day_of_week} onChange={(e) => setSlot(s.key, { day_of_week: Number(e.target.value) })}>
                    {dayNames.slice(1).map((d, idx) => (
                      <option key={d} value={idx + 1}>
                        {d}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="self-end"
                  aria-label={`Hapus jadwal ${i + 1}`}
                  onClick={() => setSlots((list) => list.filter((x) => x.key !== s.key))}
                >
                  <Trash2Icon />
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="grid gap-1.5">
                  <Label htmlFor={`slot-start-${s.key}`}>Mulai</Label>
                  <Input id={`slot-start-${s.key}`} type="time" value={s.start_time} onChange={(e) => setSlot(s.key, { start_time: e.target.value })} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor={`slot-end-${s.key}`}>Selesai</Label>
                  <Input id={`slot-end-${s.key}`} type="time" value={s.end_time} onChange={(e) => setSlot(s.key, { end_time: e.target.value })} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor={`slot-room-${s.key}`}>Ruang</Label>
                  <Input id={`slot-room-${s.key}`} maxLength={100} value={s.room} onChange={(e) => setSlot(s.key, { room: e.target.value })} />
                </div>
              </div>
              {slotErr && <p className="text-sm text-destructive">{slotErr}</p>}
            </div>
          )
        })}
        <Button variant="outline" onClick={() => setSlots((list) => [...list, newSlot()])} disabled={slots.length >= 14}>
          <PlusIcon /> Tambah slot jadwal
        </Button>
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <Field id="c-meetings" label="Jumlah pertemuan" error={errs.total_meetings} hint="Termasuk UTS dan UAS">
          <Input id="c-meetings" inputMode="numeric" value={totalMeetings} onChange={(e) => setTotalMeetings(e.target.value)} {...invalidProps('c-meetings', errs.total_meetings)} />
        </Field>
        <Field id="c-minpct" label="Minimal hadir (%)" error={errs.min_attendance_pct}>
          <Input id="c-minpct" inputMode="numeric" value={minPct} onChange={(e) => setMinPct(e.target.value)} {...invalidProps('c-minpct', errs.min_attendance_pct)} />
        </Field>
      </div>

      {props.mode === 'create' && (
        <div className="flex items-center justify-between gap-4 rounded-3xl bg-muted p-4">
          <div>
            <Label htmlFor="c-generate">Buat pertemuan otomatis</Label>
            <p className="mt-1 text-sm text-muted-foreground">
              Dari tanggal mulai semester, mengikuti jadwal. Pertemuan ke-{Math.floor(toInt(totalMeetings, 16) / 2)} jadi UTS dan
              terakhir jadi UAS.
            </p>
          </div>
          <Switch id="c-generate" checked={generate} onCheckedChange={setGenerate} />
        </div>
      )}

      {props.mode === 'edit' && (
        <Field id="c-letter" label="Huruf resmi (KHS)" error={errs.final_grade_letter} hint="Mengalahkan huruf hasil hitung untuk IPS dan IPK.">
          <NativeSelect id="c-letter" value={letter} onChange={(e) => setLetter(e.target.value)}>
            <option value="">Belum ada</option>
            {props.letters.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </NativeSelect>
        </Field>
      )}

      <Field id="c-notes" label="Catatan" error={errs.notes}>
        <Textarea id="c-notes" rows={3} maxLength={5000} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>

      {Object.keys(errs).length === 0 && <FormError error={mutation.error} />}
      {Object.keys(errs).length > 0 && <p className="text-sm text-destructive">Periksa isian yang ditandai.</p>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.history.back()}>
          Batal
        </Button>
        <Button type="submit" size="lg" disabled={mutation.isPending || !name.trim()}>
          {mutation.isPending ? 'Menyimpan...' : props.mode === 'create' ? 'Tambah matkul' : 'Simpan'}
        </Button>
      </div>
    </form>
  )
}
