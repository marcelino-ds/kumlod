import { useQuery } from '@tanstack/react-query'
import { AlertTriangleIcon, CalendarPlusIcon, MoreVerticalIcon, PencilIcon, PlusIcon, Trash2Icon, WandSparklesIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

import type { Course, GradeSummary, Meeting, Schemas } from '@/api/client'
import {
  gradesQuery,
  meetingsQuery,
  tasksQuery,
  useCreateMeeting,
  useDeleteMeeting,
  useGenerateMeetings,
  useReplaceComponents,
  useUpdateCourse,
  useUpdateMeeting,
} from '@/api/queries'
import { AttendancePicker } from '@/components/AttendancePicker'
import { EmptyState, ErrorState, Field, FormError, invalidProps, LoadingList, Section } from '@/components/common'
import { AddMaterialForm, MaterialList } from '@/components/materials'
import { useQuickAdd } from '@/components/QuickAddTask'
import { TaskItem } from '@/components/TaskItem'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/misc'
import { localDate, relativeDay } from '@/lib/dates'
import { fieldErrors, useAppSettings, useNow } from '@/lib/hooks'
import { meetingKindLabel, meetingStatusLabel, targetStatusLabel } from '@/lib/labels'
import { groupTasks } from '@/lib/tasks'
import { uuidv7 } from '@/lib/uuid'
import { cn, courseStyle, formatNumber } from '@/lib/utils'

// ---------------- Meetings ----------------

export function MeetingsTab({ course }: { course: Course }) {
  const meetings = useQuery(meetingsQuery(course.id))
  const generate = useGenerateMeetings()
  const remove = useDeleteMeeting()
  const { timeZone } = useAppSettings()
  const now = useNow()
  const today = localDate(now, timeZone)
  const [editing, setEditing] = useState<Meeting | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Meeting | null>(null)

  if (meetings.data === undefined) {
    return meetings.isError ? <ErrorState error={meetings.error} onRetry={() => void meetings.refetch()} /> : <LoadingList rows={5} />
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={() => setEditing('new')}>
          <PlusIcon /> Tambah pertemuan
        </Button>
      </div>
      {meetings.data.length === 0 ? (
        <EmptyState
          icon={<CalendarPlusIcon />}
          title="Belum ada pertemuan"
          description={
            course.schedules.length > 0
              ? `Buat ${course.total_meetings} pertemuan dari jadwal mulai tanggal awal semester.`
              : 'Tambahkan jadwal di halaman ubah matkul untuk membuat pertemuan otomatis.'
          }
          action={
            course.schedules.length > 0 && (
              <Button
                disabled={generate.isPending}
                onClick={() => generate.mutate(course.id, { onSuccess: () => toast.success('Pertemuan dibuat') })}
              >
                <WandSparklesIcon /> Buat dari jadwal
              </Button>
            )
          }
        />
      ) : (
        <ol className="space-y-3" style={courseStyle(course.color)}>
          {meetings.data.map((m) => {
            const counted = m.kind === 'lecture' && m.status === 'scheduled'
            const unrecorded = counted && m.attendance === null && m.date < today
            const isToday = m.date === today
            const exam = m.kind !== 'lecture'
            return (
              <li
                key={m.id}
                className={cn(
                  'rounded-3xl bg-card p-4 shadow-xs ring-1 ring-black/[0.03] dark:ring-white/[0.06]',
                  isToday && 'ring-2 ring-foreground dark:ring-foreground',
                  m.status === 'cancelled' && 'opacity-60',
                )}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={cn(
                      'flex size-12 shrink-0 flex-col items-center justify-center rounded-2xl leading-none',
                      exam ? 'bg-hero text-hero-foreground' : isToday ? 'bg-brand text-brand-foreground' : 'tint-bg tint-ink',
                    )}
                  >
                    <span className="text-[0.6rem] font-bold uppercase opacity-70">{exam ? meetingKindLabel[m.kind] : 'Ke'}</span>
                    <span className="mt-0.5 text-lg font-extrabold tabular-nums">{m.number}</span>
                  </span>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-bold">
                        <span className="sr-only">Pertemuan {m.number}, </span>
                        {relativeDay(m.date, today)}
                      </span>
                      {m.status === 'cancelled' && <Badge variant="secondary">{meetingStatusLabel.cancelled}</Badge>}
                      {unrecorded && <Badge variant="danger">Belum dicatat</Badge>}
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {[m.start_time && `${m.start_time}${m.end_time ? `-${m.end_time}` : ''}`, m.room].filter(Boolean).join(' · ') ||
                        'Jam belum diatur'}
                    </p>
                    {m.topic && <p className="mt-1.5 text-sm font-medium">{m.topic}</p>}
                    {m.material_count > 0 && (
                      <p className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                        {m.material_count} materi
                      </p>
                    )}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="-my-1 -mr-1" aria-label={`Aksi pertemuan ${m.number}`}>
                        <MoreVerticalIcon />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onSelect={() => setEditing(m)}>
                        <PencilIcon /> Ubah
                      </DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(m)}>
                        <Trash2Icon /> Hapus
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {m.status === 'scheduled' && <AttendancePicker meeting={m} label={`pertemuan ${m.number}`} className="mt-4 md:ml-15 md:max-w-lg" />}
              </li>
            )
          })}
        </ol>
      )}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          {editing && (
            <MeetingForm
              key={editing === 'new' ? 'new' : editing.id}
              course={course}
              meeting={editing === 'new' ? undefined : editing}
              onDone={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Hapus pertemuan ${deleting?.number ?? ''}?`}
        description="Catatan absen pertemuan ini ikut hilang. Tugas dan materi yang terhubung tetap ada."
        pending={remove.isPending}
        onConfirm={() =>
          deleting &&
          remove.mutate(deleting.id, {
            onSuccess: () => {
              toast.success('Pertemuan dihapus')
              setDeleting(null)
            },
          })
        }
      />
    </>
  )
}

function MeetingForm({ course, meeting, onDone }: { course: Course; meeting?: Meeting; onDone: () => void }) {
  const create = useCreateMeeting()
  const update = useUpdateMeeting()
  const mutation = meeting ? update : create
  const errs = fieldErrors(mutation.error)
  const slot = course.schedules[0]
  const [date, setDate] = useState(meeting?.date ?? '')
  const [start, setStart] = useState(meeting?.start_time ?? slot?.start_time ?? '')
  const [end, setEnd] = useState(meeting?.end_time ?? slot?.end_time ?? '')
  const [room, setRoom] = useState(meeting?.room ?? slot?.room ?? '')
  const [kind, setKind] = useState<Schemas['MeetingKind']>(meeting?.kind ?? 'lecture')
  const [status, setStatus] = useState<Schemas['MeetingStatus']>(meeting?.status ?? 'scheduled')
  const [topic, setTopic] = useState(meeting?.topic ?? '')
  const [notes, setNotes] = useState(meeting?.notes ?? '')

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const done = () => {
      toast.success('Pertemuan disimpan')
      onDone()
    }
    const fields = { date, start_time: start, end_time: end, room: room.trim(), kind, topic: topic.trim(), notes }
    if (meeting) update.mutate({ id: meeting.id, body: { ...fields, status } }, { onSuccess: done })
    else create.mutate({ courseId: course.id, body: { ...fields, id: uuidv7() } }, { onSuccess: done })
  }

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>{meeting ? `Pertemuan ${meeting.number}` : 'Tambah pertemuan'}</DialogTitle>
        <DialogDescription>{course.name}</DialogDescription>
      </DialogHeader>
      <Field id="mt-date" label="Tanggal" error={errs.date}>
        <Input id="mt-date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} {...invalidProps('mt-date', errs.date)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field id="mt-start" label="Mulai" error={errs.start_time}>
          <Input id="mt-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field id="mt-end" label="Selesai" error={errs.end_time}>
          <Input id="mt-end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field id="mt-kind" label="Jenis" error={errs.kind}>
          <NativeSelect id="mt-kind" value={kind} onChange={(e) => setKind(e.target.value as Schemas['MeetingKind'])}>
            {(Object.keys(meetingKindLabel) as Schemas['MeetingKind'][]).map((k) => (
              <option key={k} value={k}>
                {meetingKindLabel[k]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        {meeting ? (
          <Field id="mt-status" label="Status" error={errs.status} hint="Pertemuan batal tidak dihitung ke absen.">
            <NativeSelect id="mt-status" value={status} onChange={(e) => setStatus(e.target.value as Schemas['MeetingStatus'])}>
              <option value="scheduled">{meetingStatusLabel.scheduled}</option>
              <option value="cancelled">{meetingStatusLabel.cancelled}</option>
            </NativeSelect>
          </Field>
        ) : (
          <Field id="mt-room" label="Ruang" error={errs.room}>
            <Input id="mt-room" maxLength={100} value={room} onChange={(e) => setRoom(e.target.value)} />
          </Field>
        )}
      </div>
      {meeting && (
        <Field id="mt-room" label="Ruang" error={errs.room}>
          <Input id="mt-room" maxLength={100} value={room} onChange={(e) => setRoom(e.target.value)} />
        </Field>
      )}
      <Field id="mt-topic" label="Topik" error={errs.topic}>
        <Input id="mt-topic" maxLength={300} value={topic} onChange={(e) => setTopic(e.target.value)} />
      </Field>
      <Field id="mt-notes" label="Catatan" error={errs.notes}>
        <Textarea id="mt-notes" rows={3} maxLength={10000} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      {Object.keys(errs).length === 0 && <FormError error={mutation.error} />}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Batal
        </Button>
        <Button type="submit" disabled={mutation.isPending || !date}>
          {mutation.isPending ? 'Menyimpan...' : 'Simpan'}
        </Button>
      </DialogFooter>
    </form>
  )
}

// ---------------- Tasks ----------------

export function TasksTab({ course }: { course: Course }) {
  const tasks = useQuery(tasksQuery({ semester_id: course.semester_id, course_id: course.id }))
  const { timeZone } = useAppSettings()
  const now = useNow()
  const quickAdd = useQuickAdd()
  const groups = useMemo(() => (tasks.data ? groupTasks(tasks.data, now, timeZone) : []), [tasks.data, now, timeZone])

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button variant="outline" onClick={() => quickAdd({ courseId: course.id })}>
          <PlusIcon /> Tambah tugas
        </Button>
      </div>
      {tasks.data === undefined ? (
        tasks.isError ? <ErrorState error={tasks.error} onRetry={() => void tasks.refetch()} /> : <LoadingList />
      ) : groups.length === 0 ? (
        <EmptyState title="Belum ada tugas untuk matkul ini" />
      ) : (
        <div className="space-y-8">
          {groups.map((g) => (
            <Section key={g.key} title={g.label} count={g.tasks.length} tone={g.key === 'overdue' ? 'danger' : undefined}>
              <ul className="space-y-2.5">
                {g.tasks.map((t) => (
                  <TaskItem key={t.id} task={t} now={now} timeZone={timeZone} showCourse={false} />
                ))}
              </ul>
            </Section>
          ))}
        </div>
      )}
    </>
  )
}

// ---------------- Materials ----------------

export function MaterialsTab({ course }: { course: Course }) {
  const [adding, setAdding] = useState(false)
  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button variant="outline" onClick={() => setAdding(true)}>
          <PlusIcon /> Tambah materi
        </Button>
      </div>
      <MaterialList
        filters={{ semester_id: 'all', course_id: course.id }}
        showCourse={false}
        emptyTitle="Belum ada materi untuk matkul ini"
        emptyAction={<Button onClick={() => setAdding(true)}>Tambah materi</Button>}
      />
      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent>
          {adding && <AddMaterialForm courses={[course]} fixedCourseId={course.id} onDone={() => setAdding(false)} />}
        </DialogContent>
      </Dialog>
    </>
  )
}

// ---------------- Grades ----------------

const targetVariant = { secured: 'success', possible: 'info', impossible: 'secondary' } as const

export function GradesTab({ course }: { course: Course }) {
  const grades = useQuery(gradesQuery(course.id))
  const settings = useAppSettings()
  const updateCourse = useUpdateCourse()
  const [editing, setEditing] = useState(false)

  if (grades.data === undefined) {
    return grades.isError ? <ErrorState error={grades.error} onRetry={() => void grades.refetch()} /> : <LoadingList rows={4} />
  }
  const g = grades.data
  const letters = settings.data?.grade_scale.map((e) => e.letter) ?? []

  const setOfficial = (letter: string) =>
    updateCourse.mutate(
      {
        id: course.id,
        body: {
          code: course.code,
          name: course.name,
          credits: course.credits,
          lecturer: course.lecturer,
          color: course.color,
          total_meetings: course.total_meetings,
          min_attendance_pct: course.min_attendance_pct,
          notes: course.notes,
          final_grade_letter: letter || null,
          schedules: course.schedules.map(({ day_of_week, start_time, end_time, room }) => ({ day_of_week, start_time, end_time, room })),
        },
      },
      { onSuccess: () => toast.success(letter ? `Huruf resmi ${letter} disimpan` : 'Huruf resmi dihapus') },
    )

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-start">
      <div className="grid gap-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-3xl bg-hero p-5 text-hero-foreground">
            <p className="text-xs font-semibold opacity-70">{g.is_final ? 'Nilai akhir' : 'Nilai sementara'}</p>
            <p className="mt-2 text-4xl leading-none font-extrabold tracking-tight text-brand tabular-nums">
              {formatNumber(g.is_final ? g.final_score : g.current_score)}
            </p>
          </div>
          <div className="rounded-3xl bg-card p-5 shadow-xs ring-1 ring-black/[0.03] dark:ring-white/[0.06]">
            <p className="text-xs font-semibold text-muted-foreground">Huruf hasil hitung</p>
            <p className="mt-2 text-4xl leading-none font-extrabold tracking-tight">{g.letter ?? '-'}</p>
          </div>
          <div className="col-span-2 rounded-3xl bg-brand p-4 text-brand-foreground sm:col-span-1">
            <label htmlFor="official-letter" className="text-xs font-semibold opacity-80">
              Huruf resmi (KHS)
            </label>
            <NativeSelect
              id="official-letter"
              className="mt-2 border-transparent text-base font-bold text-foreground"
              value={g.official_letter ?? ''}
              disabled={updateCourse.isPending}
              onChange={(e) => setOfficial(e.target.value)}
            >
              <option value="">Belum ada</option>
              {letters.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>

        {g.components.length > 0 && Math.abs(g.total_weight - 100) > 0.001 && (
          <p role="alert" className="flex items-start gap-2 rounded-2xl bg-amber-100 px-4 py-3 text-sm font-medium text-amber-950 dark:bg-amber-950 dark:text-amber-200">
            <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
            Total bobot {formatNumber(g.total_weight)}%, bukan 100%. Nilai tetap dihitung proporsional.
          </p>
        )}

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Komponen nilai</CardTitle>
            <Button variant="outline" size="sm" className="h-11" onClick={() => setEditing(true)}>
              <PencilIcon /> Atur
            </Button>
          </CardHeader>
          <CardContent>
            {g.components.length === 0 ? (
              <p className="text-sm text-muted-foreground">Belum ada komponen. Tambahkan supaya nilai bisa dihitung.</p>
            ) : (
              <ul className="grid gap-2.5" style={courseStyle(course.color)}>
                {g.components.map((c) => (
                  <li key={c.id} className="rounded-2xl bg-muted p-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-bold">{c.name}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Bobot {formatNumber(c.weight)}%
                          {c.source === 'tasks' && ` · rata-rata ${c.graded_task_count} tugas dinilai`}
                        </p>
                      </div>
                      <p className="text-2xl leading-none font-extrabold tabular-nums">
                        {formatNumber(c.effective_score)}
                        <span className="sr-only"> dari 100</span>
                      </p>
                    </div>
                    <div aria-hidden className="mt-3 h-2 overflow-hidden rounded-full bg-foreground/[0.08]">
                      <div
                        className="tint-solid h-full rounded-full"
                        style={{ width: `${Math.max(0, Math.min(100, c.effective_score ?? 0))}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {g.targets.length > 0 && <TargetsCard grades={g} />}

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent>{editing && <ComponentsForm courseId={course.id} grades={g} onDone={() => setEditing(false)} />}</DialogContent>
      </Dialog>
    </div>
  )
}

const targetTone = {
  secured: 'bg-brand text-brand-foreground',
  possible: 'bg-card text-foreground',
  impossible: 'bg-foreground/[0.06] text-muted-foreground',
} as const

function TargetsCard({ grades: g }: { grades: GradeSummary }) {
  return (
    <section aria-labelledby="targets-title" className="rounded-[2rem] bg-hero p-5 text-hero-foreground md:p-6">
      <h2 id="targets-title" className="text-xl font-extrabold tracking-tight">
        Butuh berapa?
      </h2>
      <p className="mt-1 text-sm text-hero-foreground/70">
        {g.is_final ? 'Semua komponen sudah ada nilainya.' : 'Rata-rata minimal di komponen yang belum ada nilainya untuk tiap huruf.'}
      </p>
      <ul className="mt-4 grid gap-2">
        {g.targets.map((t) => (
          <li key={t.letter} className={cn('flex items-center gap-3 rounded-2xl p-2.5 pr-3 text-sm', targetTone[t.status])}>
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-black/[0.06] text-lg font-extrabold dark:bg-white/10">
              {t.letter}
            </span>
            <span className="flex-1 font-medium">
              {t.required_average === null
                ? `Minimal ${formatNumber(t.min_score)}`
                : t.status === 'secured'
                  ? 'Sudah tercapai walau sisa komponen 0'
                  : `Rata-rata ${formatNumber(t.required_average)} di sisa komponen`}
            </span>
            <Badge variant={targetVariant[t.status]}>{targetStatusLabel[t.status]}</Badge>
          </li>
        ))}
      </ul>
    </section>
  )
}

type Row = { key: string; id?: string; name: string; weight: string; source: Schemas['GradeSource']; score: string }

function ComponentsForm({ courseId, grades, onDone }: { courseId: string; grades: GradeSummary; onDone: () => void }) {
  const replace = useReplaceComponents()
  const errs = fieldErrors(replace.error)
  const [rows, setRows] = useState<Row[]>(() =>
    grades.components.map((c) => ({
      key: c.id,
      id: c.id,
      name: c.name,
      weight: String(c.weight),
      source: c.source,
      score: c.score === null ? '' : String(c.score),
    })),
  )
  const num = (v: string) => Number(v.replace(',', '.'))
  const total = rows.reduce((s, r) => s + (Number.isFinite(num(r.weight)) ? num(r.weight) : 0), 0)
  const setRow = (key: string, patch: Partial<Row>) => setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    replace.mutate(
      {
        courseId,
        components: rows.map((r) => ({
          ...(r.id ? { id: r.id } : {}),
          name: r.name.trim(),
          weight: num(r.weight),
          source: r.source,
          score: r.source === 'manual' && r.score.trim() !== '' ? num(r.score) : null,
        })),
      },
      {
        onSuccess: () => {
          toast.success('Komponen nilai disimpan')
          onDone()
        },
      },
    )
  }

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>Komponen nilai</DialogTitle>
        <DialogDescription>
          Sumber "tugas" memakai rata-rata nilai tugas yang terhubung. Total bobot sekarang {formatNumber(total)}%.
        </DialogDescription>
      </DialogHeader>
      {rows.map((r, i) => {
        const p = `components[${i}]`
        const rowErr = errs[`${p}.name`] ?? errs[`${p}.weight`] ?? errs[`${p}.score`] ?? errs[`${p}.source`] ?? errs[`${p}.id`]
        return (
          <fieldset key={r.key} className="grid gap-2 rounded-3xl bg-muted p-3.5">
            <legend className="sr-only">Komponen {i + 1}</legend>
            <div className="grid grid-cols-[1fr_5.5rem_auto] items-end gap-2">
              <Field id={`gc-name-${r.key}`} label="Nama">
                <Input id={`gc-name-${r.key}`} maxLength={60} value={r.name} onChange={(e) => setRow(r.key, { name: e.target.value })} />
              </Field>
              <Field id={`gc-weight-${r.key}`} label="Bobot %">
                <Input id={`gc-weight-${r.key}`} inputMode="decimal" value={r.weight} onChange={(e) => setRow(r.key, { weight: e.target.value })} />
              </Field>
              <Button variant="ghost" size="icon" aria-label={`Hapus komponen ${r.name || i + 1}`} onClick={() => setRows((l) => l.filter((x) => x.key !== r.key))}>
                <Trash2Icon />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field id={`gc-source-${r.key}`} label="Sumber">
                <NativeSelect id={`gc-source-${r.key}`} value={r.source} onChange={(e) => setRow(r.key, { source: e.target.value as Schemas['GradeSource'] })}>
                  <option value="manual">Isi manual</option>
                  <option value="tasks">Dari tugas</option>
                </NativeSelect>
              </Field>
              {r.source === 'manual' && (
                <Field id={`gc-score-${r.key}`} label="Nilai (0-100)">
                  <Input id={`gc-score-${r.key}`} inputMode="decimal" placeholder="Belum ada" value={r.score} onChange={(e) => setRow(r.key, { score: e.target.value })} />
                </Field>
              )}
            </div>
            {rowErr && <p className="text-sm text-destructive">{rowErr}</p>}
          </fieldset>
        )
      })}
      <Button
        variant="outline"
        disabled={rows.length >= 20}
        onClick={() => setRows((l) => [...l, { key: uuidv7(), name: '', weight: '', source: 'manual', score: '' }])}
      >
        <PlusIcon /> Tambah komponen
      </Button>
      {errs.components && <p className="text-sm text-destructive">{errs.components}</p>}
      {Object.keys(errs).length === 0 && <FormError error={replace.error} />}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Batal
        </Button>
        <Button type="submit" disabled={replace.isPending}>
          {replace.isPending ? 'Menyimpan...' : 'Simpan'}
        </Button>
      </DialogFooter>
    </form>
  )
}
