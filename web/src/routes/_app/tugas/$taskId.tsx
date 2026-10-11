import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { ArrowLeftIcon, ExternalLinkIcon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import type { Schemas, Task } from '@/api/client'
import { coursesQuery, gradesQuery, meetingsQuery, taskQuery, useDeleteTask, useUpdateTask } from '@/api/queries'
import { backLinkClass, CourseChip, ErrorState, Field, FormError, invalidProps, LoadingList, PageHeader } from '@/components/common'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/dialog'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { formatShortDate, formatTimestamp, localDate, localTime, zonedToDate } from '@/lib/dates'
import { fieldErrors, useAppSettings } from '@/lib/hooks'
import { meetingKindLabel, priorityLabel, taskStatusLabel } from '@/lib/labels'

export const Route = createFileRoute('/_app/tugas/$taskId')({
  component: TaskPage,
})

function TaskPage() {
  const { taskId } = Route.useParams()
  const task = useQuery(taskQuery(taskId))
  const { timeZone, isPending: settingsPending } = useAppSettings()

  return (
    <div className="mx-auto max-w-2xl">
      <Link to="/tugas" className={backLinkClass}>
        <ArrowLeftIcon /> Tugas
      </Link>
      {task.data === undefined ? (
        task.isError ? <ErrorState error={task.error} onRetry={() => void task.refetch()} /> : <LoadingList rows={5} />
      ) : settingsPending ? (
        <LoadingList rows={5} />
      ) : (
        <TaskForm key={task.data.updated_at} task={task.data} timeZone={timeZone} />
      )}
    </div>
  )
}

const statuses = Object.keys(taskStatusLabel) as Schemas['TaskStatus'][]
const priorities = Object.keys(priorityLabel) as Schemas['TaskPriority'][]

function TaskForm({ task, timeZone }: { task: Task; timeZone: string }) {
  const router = useRouter()
  const update = useUpdateTask()
  const remove = useDeleteTask()
  const errs = fieldErrors(update.error)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const [title, setTitle] = useState(task.title)
  const [courseId, setCourseId] = useState(task.course_id ?? '')
  const [meetingId, setMeetingId] = useState(task.meeting_id ?? '')
  const [componentId, setComponentId] = useState(task.grade_component_id ?? '')
  const [date, setDate] = useState(localDate(new Date(task.deadline), timeZone))
  const [time, setTime] = useState(localTime(new Date(task.deadline), timeZone))
  const [status, setStatus] = useState(task.status)
  const [priority, setPriority] = useState(task.priority)
  const [url, setUrl] = useState(task.submission_url)
  const [score, setScore] = useState(task.score === null ? '' : String(task.score))
  const [description, setDescription] = useState(task.description)

  const courses = useQuery(coursesQuery(task.semester_id))
  const meetings = useQuery(meetingsQuery(courseId))
  const grades = useQuery({ ...gradesQuery(courseId), enabled: courseId !== '' })

  const changeCourse = (id: string) => {
    setCourseId(id)
    setMeetingId('')
    setComponentId('')
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const parsedScore = score.trim() === '' ? null : Number(score.replace(',', '.'))
    update.mutate(
      {
        id: task.id,
        body: {
          title: title.trim(),
          course_id: courseId || null,
          meeting_id: courseId && meetingId ? meetingId : null,
          grade_component_id: courseId && componentId ? componentId : null,
          deadline: zonedToDate(date, time, timeZone).toISOString(),
          status,
          priority,
          submission_url: url.trim(),
          score: parsedScore !== null && Number.isFinite(parsedScore) ? parsedScore : null,
          description,
        },
      },
      { onSuccess: () => toast.success('Tugas disimpan') },
    )
  }

  return (
    <>
      <PageHeader
        eyebrow={task.course ? <CourseChip course={task.course} className="text-sm" /> : undefined}
        title={task.title}
        description={
          task.completed_at
            ? `Selesai ${formatTimestamp(task.completed_at, timeZone)}`
            : `Dibuat ${formatTimestamp(task.created_at, timeZone)}`
        }
        actions={
          <Button
            variant="outline"
            size="icon"
            className="text-destructive hover:bg-destructive/10"
            aria-label="Hapus tugas"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2Icon />
          </Button>
        }
      />
      <form onSubmit={submit} className="grid gap-5 rounded-[2rem] bg-card p-5 shadow-xs ring-1 ring-black/[0.03] md:p-7 dark:ring-white/[0.06]" noValidate>
        <Field id="t-title" label="Judul" error={errs.title}>
          <Input id="t-title" required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} {...invalidProps('t-title', errs.title)} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="t-status" label="Status" error={errs.status}>
            <NativeSelect id="t-status" value={status} onChange={(e) => setStatus(e.target.value as Schemas['TaskStatus'])}>
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {taskStatusLabel[s]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field id="t-priority" label="Prioritas" error={errs.priority}>
            <NativeSelect id="t-priority" value={priority} onChange={(e) => setPriority(e.target.value as Schemas['TaskPriority'])}>
              {priorities.map((p) => (
                <option key={p} value={p}>
                  {priorityLabel[p]}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field id="t-date" label="Tanggal deadline" error={errs.deadline}>
            <Input id="t-date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field id="t-time" label="Jam">
            <Input id="t-time" type="time" required value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
        </div>

        <Field id="t-course" label="Matkul" error={errs.course_id}>
          <NativeSelect id="t-course" value={courseId} onChange={(e) => changeCourse(e.target.value)}>
            <option value="">Tanpa matkul</option>
            {courses.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </Field>

        {courseId && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="t-meeting" label="Pertemuan" error={errs.meeting_id}>
              <NativeSelect id="t-meeting" value={meetingId} onChange={(e) => setMeetingId(e.target.value)}>
                <option value="">Tidak terkait pertemuan</option>
                {meetings.data?.map((m) => (
                  <option key={m.id} value={m.id}>
                    {`Pertemuan ${m.number} · ${formatShortDate(m.date)}${m.kind !== 'lecture' ? ` · ${meetingKindLabel[m.kind]}` : ''}`}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field
              id="t-component"
              label="Komponen nilai"
              error={errs.grade_component_id}
              hint="Nilai tugas dipakai untuk komponen bersumber tugas."
            >
              <NativeSelect id="t-component" value={componentId} onChange={(e) => setComponentId(e.target.value)}>
                <option value="">Tidak dihitung ke komponen</option>
                {grades.data?.components.map((g) => (
                  <option key={g.id} value={g.id}>
                    {`${g.name} (${g.weight.toLocaleString('id-ID')}%)${g.source === 'tasks' ? '' : ' · manual'}`}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
          <Field id="t-url" label="Link pengumpulan" error={errs.submission_url}>
            <div className="flex gap-2">
              <Input
                id="t-url"
                type="url"
                inputMode="url"
                placeholder="https://"
                maxLength={2000}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                {...invalidProps('t-url', errs.submission_url)}
              />
              {task.submission_url && (
                <Button variant="outline" size="icon" asChild>
                  <a href={task.submission_url} target="_blank" rel="noopener noreferrer" aria-label="Buka link pengumpulan">
                    <ExternalLinkIcon />
                  </a>
                </Button>
              )}
            </div>
          </Field>
          <Field id="t-score" label="Nilai (0-100)" error={errs.score}>
            <Input
              id="t-score"
              inputMode="decimal"
              placeholder="Belum dinilai"
              value={score}
              onChange={(e) => setScore(e.target.value)}
              {...invalidProps('t-score', errs.score)}
            />
          </Field>
        </div>

        <Field id="t-desc" label="Deskripsi" error={errs.description}>
          <Textarea id="t-desc" rows={5} maxLength={10000} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>

        {Object.keys(errs).length === 0 && <FormError error={update.error} />}
        <div className="flex justify-end">
          <Button type="submit" size="lg" disabled={update.isPending || !title.trim() || !date || !time}>
            {update.isPending ? 'Menyimpan...' : 'Simpan perubahan'}
          </Button>
        </div>
      </form>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Hapus tugas ini?"
        description={`"${task.title}" akan dihapus permanen.`}
        pending={remove.isPending}
        onConfirm={() =>
          remove.mutate(task.id, {
            onSuccess: () => {
              toast.success('Tugas dihapus')
              void router.navigate({ to: '/tugas' })
            },
          })
        }
      />
    </>
  )
}
