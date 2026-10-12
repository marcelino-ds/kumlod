import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { format } from 'date-fns'
import { id as localeId } from 'date-fns/locale'
import {
  ArrowUpRightIcon,
  CheckIcon,
  ClockIcon,
  FlameIcon,
  GraduationCapIcon,
  PencilIcon,
  PercentIcon,
  PresentationIcon,
  RotateCcwIcon,
  TriangleAlertIcon,
} from 'lucide-react'
import type * as React from 'react'

import type { Task } from '@/api/client'
import { gradesQuery, meetingsQuery, taskQuery, useSetTaskStatus } from '@/api/queries'
import { ErrorState, LoadingList } from '@/components/common'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { formatShortDate, formatTimestamp, localDate, localTime, parseLocalDate, timeLeft } from '@/lib/dates'
import { meetingKindLabel, priorityLabel, taskStatusLabel } from '@/lib/labels'
import { isOpen } from '@/lib/tasks'
import { cn, courseStyle } from '@/lib/utils'

const DAY = 86_400_000

/**
 * Read-only task details in a dialog (a bottom sheet on phones): deadline,
 * course, meeting, grade component, description, and the submission link,
 * with one button to tick it off and a link to the edit page.
 */
export function TaskDetailDialog({
  taskId,
  initial,
  now,
  timeZone,
  onClose,
}: {
  taskId?: string
  /** The task from the list, so the dialog opens instantly. */
  initial?: Task
  now: Date
  timeZone: string
  onClose: () => void
}) {
  const fetched = useQuery({ ...taskQuery(taskId ?? ''), enabled: !!taskId && !initial })
  const task = initial ?? fetched.data

  return (
    <Dialog open={!!taskId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="gap-0 sm:max-w-xl">
        {task ? (
          <TaskDetail task={task} now={now} timeZone={timeZone} />
        ) : fetched.isError ? (
          <>
            <DialogTitle className="sr-only">Detail tugas</DialogTitle>
            <ErrorState error={fetched.error} onRetry={() => void fetched.refetch()} />
          </>
        ) : (
          <>
            <DialogTitle className="sr-only">Memuat tugas</DialogTitle>
            <LoadingList rows={3} />
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function TaskDetail({ task, now, timeZone }: { task: Task; now: Date; timeZone: string }) {
  const setStatus = useSetTaskStatus()
  const done = !isOpen(task.status)
  const msLeft = new Date(task.deadline).getTime() - now.getTime()
  const overdue = !done && msLeft < 0
  const soon = !done && !overdue && msLeft < 2 * DAY
  const deadline = new Date(task.deadline)
  const day = parseLocalDate(localDate(deadline, timeZone))

  const meetings = useQuery({ ...meetingsQuery(task.course_id ?? ''), enabled: !!task.course_id && !!task.meeting_id })
  const grades = useQuery({ ...gradesQuery(task.course_id ?? ''), enabled: !!task.course_id && !!task.grade_component_id })
  const meeting = meetings.data?.find((m) => m.id === task.meeting_id)
  const component = grades.data?.components.find((g) => g.id === task.grade_component_id)

  const tone = done
    ? 'bg-[#d7f857]/20 text-[#2b3600] ring-[#d7f857] dark:bg-[#d7f857]/10 dark:text-[#d7f857]'
    : overdue
      ? 'bg-red-500/10 text-red-800 ring-red-500/50 dark:text-red-300'
      : soon
        ? 'bg-orange-400/15 text-orange-900 ring-orange-400/60 dark:text-orange-200'
        : 'bg-muted text-foreground ring-transparent'

  return (
    <div style={courseStyle(task.course?.color)} className="grid gap-5">
      {/* Course, priority, status */}
      <div className="flex flex-wrap items-center gap-1.5 pr-12">
        {task.course ? (
          <span className="tint-bg tint-ink inline-flex max-w-full items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold">
            <span aria-hidden className="tint-solid size-2 shrink-0 rounded-full" />
            <span className="truncate">{task.course.name}</span>
          </span>
        ) : (
          <span className="rounded-full bg-muted px-3 py-1 text-xs font-bold text-muted-foreground">Pribadi</span>
        )}
        <Badge variant={done ? 'success' : task.status === 'in_progress' ? 'info' : 'secondary'}>{taskStatusLabel[task.status]}</Badge>
        {task.priority === 'high' && (
          <Badge variant="danger">
            <FlameIcon aria-hidden /> Penting
          </Badge>
        )}
      </div>

      <div className="-mt-2">
        <DialogTitle className={cn('text-2xl leading-snug break-words', done && 'line-through decoration-2 opacity-70')}>{task.title}</DialogTitle>
        <DialogDescription className="mt-1">
          {done && task.completed_at ? `Dikumpulkan ${formatTimestamp(task.completed_at, timeZone)}` : `Dibuat ${formatTimestamp(task.created_at, timeZone)}`}
        </DialogDescription>
      </div>

      {/* Deadline */}
      <div className={cn('flex items-center gap-4 rounded-[1.5rem] p-4 ring-2', tone)}>
        <div className="flex size-14 shrink-0 flex-col items-center justify-center rounded-2xl bg-card leading-none text-foreground shadow-xs">
          <span className="text-[0.65rem] font-bold text-muted-foreground uppercase">{format(day, 'EEE', { locale: localeId })}</span>
          <span className="mt-0.5 text-[1.4rem] font-extrabold tabular-nums">{format(day, 'd')}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold opacity-75">Deadline</p>
          <p className="font-extrabold tracking-tight">
            {format(day, 'EEEE, d MMMM yyyy', { locale: localeId })}, {localTime(deadline, timeZone)}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold">
            {overdue ? <TriangleAlertIcon className="size-4" aria-hidden /> : done ? <CheckIcon className="size-4" aria-hidden /> : <ClockIcon className="size-4" aria-hidden />}
            {done ? 'Sudah dikumpulkan' : overdue ? `Terlambat, ${timeLeft(task.deadline, now)}` : timeLeft(task.deadline, now)}
          </p>
        </div>
      </div>

      {/* Facts */}
      <dl className="grid grid-cols-2 gap-2.5">
        <Fact icon={FlameIcon} label="Prioritas" value={priorityLabel[task.priority]} />
        <Fact icon={GraduationCapIcon} label="Nilai" value={task.score !== null ? task.score.toLocaleString('id-ID') : 'Belum dinilai'} />
        {task.meeting_id && (
          <Fact
            icon={PresentationIcon}
            label="Pertemuan"
            value={
              meeting
                ? `Pertemuan ${meeting.number}${meeting.kind !== 'lecture' ? ` (${meetingKindLabel[meeting.kind]})` : ''} · ${formatShortDate(meeting.date)}`
                : 'Memuat'
            }
          />
        )}
        {task.grade_component_id && (
          <Fact
            icon={PercentIcon}
            label="Komponen nilai"
            value={component ? `${component.name} (${component.weight.toLocaleString('id-ID')}%)` : 'Memuat'}
          />
        )}
      </dl>

      {/* Description */}
      <section aria-labelledby="task-desc-title">
        <h3 id="task-desc-title" className="mb-2 text-xs font-bold tracking-[0.14em] text-muted-foreground uppercase">
          Deskripsi
        </h3>
        {task.description ? (
          <p className="rounded-[1.25rem] bg-muted/70 p-4 text-sm leading-relaxed break-words whitespace-pre-wrap">{task.description}</p>
        ) : (
          <p className="text-sm text-muted-foreground">Tidak ada deskripsi.</p>
        )}
      </section>

      {task.submission_url && (
        <a
          href={task.submission_url}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex min-h-14 items-center gap-3 rounded-[1.25rem] bg-muted/70 px-4 py-3 transition-colors hover:bg-muted"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-bold text-muted-foreground">Link pengumpulan</span>
            <span className="block truncate text-sm font-semibold">{task.submission_url}</span>
          </span>
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand text-brand-foreground">
            <ArrowUpRightIcon className="size-4" aria-hidden />
          </span>
          <span className="sr-only">(buka di tab baru)</span>
        </a>
      )}

      {/* Actions */}
      <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
        <Button variant="outline" asChild>
          <Link to="/tugas/$taskId" params={{ taskId: task.id }}>
            <PencilIcon /> Edit tugas
          </Link>
        </Button>
        <Button
          variant={done ? 'outline' : 'brand'}
          disabled={setStatus.isPending}
          onClick={() => setStatus.mutate({ id: task.id, status: done ? 'todo' : 'submitted' })}
        >
          {done ? (
            <>
              <RotateCcwIcon /> Tandai belum dikumpulkan
            </>
          ) : (
            <>
              <CheckIcon /> Tandai dikumpulkan
            </>
          )}
        </Button>
      </div>
    </div>
  )
}

function Fact({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-start gap-2.5 rounded-[1.25rem] bg-muted/70 p-3.5">
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <dt className="text-xs font-bold text-muted-foreground">{label}</dt>
        <dd className="text-sm font-semibold break-words">{value}</dd>
      </div>
    </div>
  )
}
