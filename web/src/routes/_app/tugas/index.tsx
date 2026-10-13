import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { format } from 'date-fns'
import { id as localeId } from 'date-fns/locale'
import {
  AlarmClockIcon,
  ArrowUpRightIcon,
  CheckCheckIcon,
  ClockIcon,
  FlameIcon,
  ListTodoIcon,
  PlusIcon,
  SearchIcon,
  SearchXIcon,
  TriangleAlertIcon,
} from 'lucide-react'
import { useMemo, useState } from 'react'

import type { Task } from '@/api/client'
import { coursesQuery, tasksQuery, useSetTaskStatus } from '@/api/queries'
import { CoursePicker, EmptyState, ErrorState, LoadingList } from '@/components/common'
import { HeroBar, heroChipClass, HeroStat, PageHero } from '@/components/page-hero'
import { useQuickAdd } from '@/components/QuickAddTask'
import { TaskDetailDialog } from '@/components/TaskDetailDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/misc'
import { daysBetween, localDate, localTime, parseLocalDate, timeLeft } from '@/lib/dates'
import { useActiveSemester, useAppSettings, useNow } from '@/lib/hooks'
import { taskStatusLabel } from '@/lib/labels'
import { isOpen } from '@/lib/tasks'
import { cn, courseStyle } from '@/lib/utils'

type StatusFilter = 'open' | 'done' | 'all'

const statusFilters: { value: StatusFilter; label: string }[] = [
  { value: 'open', label: 'Belum selesai' },
  { value: 'done', label: 'Selesai' },
  { value: 'all', label: 'Semua' },
]

export const Route = createFileRoute('/_app/tugas/')({
  validateSearch: (s: Record<string, unknown>): { status?: StatusFilter; course?: string; task?: string } => ({
    status: s.status === 'done' || s.status === 'all' ? s.status : undefined,
    course: typeof s.course === 'string' && s.course ? s.course : undefined,
    // Open task detail dialog; kept in the URL so Back closes it.
    task: typeof s.task === 'string' && s.task ? s.task : undefined,
  }),
  component: TasksPage,
})

const DAY = 86_400_000

type DayGroup = { key: string; date?: string; tasks: Task[] }

/**
 * Overdue open tasks first, then one group per deadline date: today and
 * later in ascending order, then earlier dates newest first.
 */
function groupByDay(tasks: Task[], now: Date, timeZone: string): DayGroup[] {
  const today = localDate(now, timeZone)
  const overdue: Task[] = []
  const days = new Map<string, Task[]>()
  for (const t of tasks) {
    if (isOpen(t.status) && new Date(t.deadline).getTime() < now.getTime()) {
      overdue.push(t)
      continue
    }
    const d = localDate(new Date(t.deadline), timeZone)
    days.set(d, [...(days.get(d) ?? []), t])
  }
  const byDeadline = (a: Task, b: Task) => a.deadline.localeCompare(b.deadline)
  const keys = [...days.keys()]
  const upcoming = keys.filter((d) => d >= today).sort()
  const past = keys.filter((d) => d < today).sort().reverse()
  return [
    ...(overdue.length > 0 ? [{ key: 'overdue', tasks: overdue.sort(byDeadline) }] : []),
    ...[...upcoming, ...past].map((d) => ({ key: d, date: d, tasks: (days.get(d) ?? []).sort(byDeadline) })),
  ]
}

function TasksPage() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const status = search.status ?? 'open'
  const { active, isPending: semPending } = useActiveSemester()
  const courses = useQuery(coursesQuery(active?.id ?? ''))
  // One query per course filter; status and text are filtered here so the counts stay in sync.
  const tasks = useQuery(tasksQuery({ course_id: search.course }))
  const { timeZone } = useAppSettings()
  const now = useNow()
  const quickAdd = useQuickAdd()
  const [query, setQuery] = useState('')

  const counts = useMemo(() => {
    const list = tasks.data ?? []
    const open = list.filter((t) => isOpen(t.status))
    const overdue = open.filter((t) => new Date(t.deadline).getTime() < now.getTime()).length
    return { open: open.length, done: list.length - open.length, all: list.length, overdue }
  }, [tasks.data, now])

  const groups = useMemo(() => {
    if (!tasks.data) return []
    const q = query.trim().toLowerCase()
    const list = tasks.data.filter(
      (t) =>
        (status === 'all' || isOpen(t.status) === (status === 'open')) &&
        (!q || t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)),
    )
    return groupByDay(list, now, timeZone)
  }, [tasks.data, status, query, now, timeZone])

  const setStatus = (value: StatusFilter) => void navigate({ search: (prev) => ({ ...prev, status: value === 'open' ? undefined : value }) })
  const setCourse = (course: string | undefined) => void navigate({ search: (prev) => ({ ...prev, course }) })
  const today = localDate(now, timeZone)

  return (
    <div className="mx-auto max-w-[96rem]">
      <TasksHeader
        semester={active?.name}
        counts={tasks.data ? counts : undefined}
        onAdd={() => quickAdd({ courseId: search.course })}
      />

      {/* Toolbar: status, course, and text search in one row on desktop. */}
      <div className="mb-8 flex flex-col gap-2.5 md:flex-row md:flex-wrap md:items-center">
        <div
          role="group"
          aria-label="Filter status"
          className="grid grid-cols-3 gap-1 rounded-full bg-card p-1 shadow-xs ring-1 ring-black/[0.04] md:inline-grid md:w-auto dark:ring-white/[0.06]"
        >
          {statusFilters.map((f) => {
            const on = status === f.value
            return (
              <button
                key={f.value}
                type="button"
                aria-pressed={on}
                onClick={() => setStatus(f.value)}
                className={cn(
                  'flex h-9 items-center justify-center gap-2 rounded-full px-3 text-sm font-semibold whitespace-nowrap transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none md:px-4',
                  on ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {f.label}
                {tasks.data && (
                  <span
                    className={cn(
                      'hidden h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[0.7rem] font-bold tabular-nums sm:inline-flex',
                      on ? 'bg-primary-foreground/15' : 'bg-foreground/[0.07]',
                    )}
                  >
                    {counts[f.value]}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        <div className="flex min-w-0 flex-1 gap-2.5">
          {courses.data && courses.data.length > 0 && (
            <CoursePicker
              courses={courses.data}
              value={search.course}
              onChange={setCourse}
              counts={Object.fromEntries(courses.data.map((c) => [c.id, c.open_task_count]))}
              countLabel="belum selesai"
            />
          )}
          <label className="relative min-w-0 flex-1 md:ml-auto md:max-w-xs">
            <span className="sr-only">Cari tugas</span>
            <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari tugas"
              className="h-11 w-full rounded-full bg-card pr-4 pl-10 text-base shadow-xs ring-1 ring-black/[0.04] outline-none placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/30 md:text-sm dark:ring-white/[0.06]"
            />
          </label>
        </div>
      </div>

      {tasks.data === undefined || semPending ? (
        tasks.isError ? <ErrorState error={tasks.error} onRetry={() => void tasks.refetch()} /> : <LoadingList />
      ) : !active ? (
        <EmptyState icon={<ListTodoIcon />} title="Belum ada semester aktif" description="Tugas dikelompokkan per semester. Buat semester dulu." />
      ) : groups.length === 0 ? (
        query.trim() ? (
          <EmptyState icon={<SearchXIcon />} title="Tidak ada tugas yang cocok" description={`Tidak ada tugas dengan kata "${query.trim()}".`} />
        ) : (
          <EmptyState
            icon={<ListTodoIcon />}
            title={status === 'done' ? 'Belum ada tugas selesai' : 'Tidak ada tugas'}
            description={status === 'open' ? 'Semua beres. Tambah tugas baru lewat tombol +.' : undefined}
          />
        )
      ) : (
        <ol className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {groups.map((g) => (
            <DaySection key={g.key} group={g} today={today} now={now} timeZone={timeZone} showCourse={!search.course} />
          ))}
        </ol>
      )}

      <TaskDetailDialog
        taskId={search.task}
        initial={tasks.data?.find((t) => t.id === search.task)}
        now={now}
        timeZone={timeZone}
        onClose={() => void navigate({ search: (prev) => ({ ...prev, task: undefined }), replace: true })}
      />
    </div>
  )
}

// --------------------------------------------------------------- header

type Counts = { open: number; done: number; all: number; overdue: number }

/** Page header: semester and title, the open/overdue/done numbers, a completion bar, and the add button. */
function TasksHeader({ semester, counts, onAdd }: { semester?: string; counts?: Counts; onAdd: () => void }) {
  const pct = counts && counts.all > 0 ? counts.done / counts.all : 0
  return (
    <PageHero
      icon={ListTodoIcon}
      title="Tugas"
      eyebrow={
        semester && (
          <Link to="/semester" className={cn(heroChipClass, 'transition-colors hover:bg-white/15')}>
            <span aria-hidden className="size-2 rounded-full bg-brand" />
            {semester}
          </Link>
        )
      }
      action={
        <Button variant="brand" onClick={onAdd}>
          <PlusIcon /> Tambah tugas
        </Button>
      }
    >
      <dl className="grid grid-cols-3 gap-2">
        <HeroStat label="Belum selesai" short="Belum" value={counts?.open} accent="text-brand" />
        <HeroStat label="Terlambat" value={counts?.overdue} alert={!!counts && counts.overdue > 0} />
        <HeroStat label="Selesai" value={counts?.done} />
      </dl>
      <HeroBar caption={counts ? `${counts.done}/${counts.all} selesai · ${Math.round(pct * 100)}%` : 'Memuat'}>
        <span className="block h-full rounded-full bg-brand transition-[width] duration-700" style={{ width: `${Math.round(pct * 100)}%` }} />
      </HeroBar>
    </PageHero>
  )
}

// ----------------------------------------------------------------- list

/** "Hari ini", "Besok", "3 hari lagi", "Kemarin", "5 hari lalu". */
function dayDistance(date: string, today: string): string {
  const diff = daysBetween(today, date)
  if (diff === 0) return 'Hari ini'
  if (diff === 1) return 'Besok'
  if (diff === -1) return 'Kemarin'
  return diff > 0 ? `${diff} hari lagi` : `${-diff} hari lalu`
}

type Urgency = 'overdue' | 'today' | 'tomorrow' | 'soon' | 'done' | undefined

/** Panel, date block, and label styles per urgency. Only days with open tasks get one. */
const urgencyStyle: Record<Exclude<Urgency, undefined>, { panel: string; block: string; pill: string; label: string }> = {
  overdue: {
    panel: 'bg-red-500/[0.08] ring-2 ring-red-500/60',
    block: 'bg-red-500 text-white',
    pill: 'bg-red-500 text-white',
    label: 'Terlambat',
  },
  today: {
    panel: 'bg-red-500/[0.06] ring-2 ring-red-500/70',
    block: 'bg-red-500 text-white',
    pill: 'bg-red-500 text-white',
    label: 'Deadline hari ini',
  },
  tomorrow: {
    panel: 'bg-orange-500/[0.06] ring-2 ring-orange-400/70',
    block: 'bg-orange-400 text-[#2b1400]',
    pill: 'bg-orange-400 text-[#2b1400]',
    label: 'Deadline besok',
  },
  soon: {
    panel: 'bg-amber-400/[0.05] ring-1 ring-amber-400/55',
    block: 'bg-amber-300 text-[#3a2c00]',
    pill: 'bg-amber-300 text-[#3a2c00]',
    label: 'Segera',
  },
  done: {
    panel: 'bg-[#d7f857]/[0.08] ring-2 ring-[#d7f857]',
    block: 'bg-[#d7f857] text-[#1c2400]',
    pill: 'bg-[#d7f857] text-[#1c2400]',
    label: 'Selesai semua',
  },
}

/** One day in the planner: a panel with the date on top and the day's tasks stacked below. */
function DaySection({ group, today, now, timeZone, showCourse }: { group: DayGroup; today: string; now: Date; timeZone: string; showCourse: boolean }) {
  const overdue = group.key === 'overdue'
  const d = group.date ? parseLocalDate(group.date) : undefined
  const isToday = group.date === today
  const isPast = group.date !== undefined && group.date < today
  const headingId = `day-${group.key}`
  const longLabel = overdue ? 'Terlambat' : d ? format(d, 'EEEE, d MMMM', { locale: localeId }) : ''
  const distance = overdue ? 'Lewat deadline' : group.date ? dayDistance(group.date, today) : ''
  const hasOpen = group.tasks.some((t) => isOpen(t.status))
  const diff = group.date ? daysBetween(today, group.date) : 0
  const urgency: Urgency = overdue
    ? 'overdue'
    : !hasOpen
      ? 'done'
      : diff < 0
        ? undefined
        : diff === 0
          ? 'today'
          : diff === 1
            ? 'tomorrow'
            : diff <= 3
              ? 'soon'
              : undefined
  const u = urgency ? urgencyStyle[urgency] : undefined

  return (
    <li
      aria-labelledby={headingId}
      className={cn(
        'flex flex-col rounded-[1.75rem] p-2.5 md:p-3',
        u ? u.panel : isToday ? 'bg-brand/[0.12] ring-1 ring-brand/40' : 'bg-foreground/[0.035] dark:bg-white/[0.03]',
      )}
    >
      <div className="flex items-center gap-3 px-1.5 pt-1 pb-3">
        <div
          aria-hidden
          className={cn(
            'flex size-14 shrink-0 flex-col items-center justify-center rounded-2xl leading-none',
            u
              ? u.block
              : isToday
                ? 'bg-brand text-brand-foreground'
                : isPast
                  ? 'bg-foreground/[0.06] text-muted-foreground'
                  : 'bg-card shadow-xs ring-1 ring-black/[0.04] dark:ring-white/[0.06]',
          )}
        >
          {overdue ? (
            <TriangleAlertIcon className="size-6" />
          ) : (
            d && (
              <>
                <span className="text-[0.65rem] font-bold uppercase opacity-75">{format(d, 'EEE', { locale: localeId })}</span>
                <span className="mt-0.5 text-[1.4rem] font-extrabold tracking-tight tabular-nums">{format(d, 'd')}</span>
              </>
            )
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2
            id={headingId}
            className={cn('truncate font-extrabold tracking-tight md:text-[1.05rem]', (urgency === 'overdue' || urgency === 'today') && 'text-red-600 dark:text-red-400')}
          >
            {longLabel}
          </h2>
          <p className="text-sm font-semibold text-muted-foreground">
            {distance} · {group.tasks.length} tugas
          </p>
          {u && !overdue && (
            <span className={cn('mt-1.5 inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-xs font-bold sm:hidden', u.pill)}>
              {urgency === 'done' ? <CheckCheckIcon className="size-3.5" aria-hidden /> : <AlarmClockIcon className="size-3.5" aria-hidden />}
              {u.label}
            </span>
          )}
        </div>
        {u && !overdue && (
          <span aria-hidden className={cn('hidden h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-bold sm:inline-flex', u.pill)}>
            {urgency === 'done' ? <CheckCheckIcon className="size-3.5" aria-hidden /> : <AlarmClockIcon className="size-3.5" aria-hidden />}
            {u.label}
          </span>
        )}
      </div>

      <ul className="grid grid-cols-1 gap-2.5">
        {group.tasks.map((t) => (
          <TaskCard key={t.id} task={t} now={now} timeZone={timeZone} showCourse={showCourse} showDate={overdue} />
        ))}
      </ul>
    </li>
  )
}

/**
 * A task card: tick on the left, course and priority on top, title and a
 * short description, then the deadline time with how much is left.
 */
function TaskCard({ task, now, timeZone, showCourse, showDate }: { task: Task; now: Date; timeZone: string; showCourse: boolean; showDate: boolean }) {
  const setStatus = useSetTaskStatus()
  const done = !isOpen(task.status)
  const msLeft = new Date(task.deadline).getTime() - now.getTime()
  const overdue = !done && msLeft < 0
  const soon = !done && !overdue && msLeft < 2 * DAY
  const deadline = new Date(task.deadline)
  const time = localTime(deadline, timeZone)
  const when = showDate ? `${format(parseLocalDate(localDate(deadline, timeZone)), 'EEE, d MMM', { locale: localeId })} ${time}` : time
  const urgency = done
    ? 'bg-[#d7f857]/45 text-[#2b3600] dark:bg-[#d7f857]/15 dark:text-[#d7f857]'
    : overdue
      ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
      : soon
        ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300'
        : 'bg-muted text-muted-foreground'

  return (
    <li
      style={courseStyle(task.course?.color)}
      className={cn(
        'group relative flex gap-3 rounded-[1.5rem] bg-card p-4 shadow-xs ring-1 ring-black/[0.04] transition-[box-shadow,transform] hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/[0.06] dark:ring-white/[0.06]',
        overdue && 'ring-red-500/35 dark:ring-red-500/35',
        done && 'ring-2 ring-[#d7f857]',
      )}
    >
      <div className="relative z-10 -mt-1.5 -ml-1.5 flex size-11 shrink-0 items-center justify-center">
        <Checkbox
          checked={done}
          onCheckedChange={(checked) => setStatus.mutate({ id: task.id, status: checked ? 'submitted' : 'todo' })}
          aria-label={done ? `Tandai "${task.title}" belum dikumpulkan` : `Tandai "${task.title}" sudah dikumpulkan`}
        />
      </div>

      <div className={cn('flex min-w-0 flex-1 flex-col', done && 'opacity-75')}>
        {(showCourse || task.priority === 'high') && (
          <div className="mb-1.5 flex min-h-6 items-center justify-between gap-2">
            {showCourse ? (
              task.course ? (
                <span className="tint-bg tint-ink inline-flex min-w-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold">
                  <span aria-hidden className="tint-solid size-2 shrink-0 rounded-full" />
                  <span className="truncate">{task.course.name}</span>
                </span>
              ) : (
                <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-bold text-muted-foreground">Pribadi</span>
              )
            ) : (
              <span />
            )}
            {task.priority === 'high' && (
              <span className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-red-600 dark:text-red-400">
                <FlameIcon className="size-3.5" aria-hidden /> Penting
              </span>
            )}
          </div>
        )}

        <Link
          to="/tugas"
          search={(prev) => ({ ...prev, task: task.id })}
          className={cn(
            'line-clamp-2 leading-snug font-bold break-words after:absolute after:inset-0 after:rounded-[1.5rem] hover:underline md:text-[1.05rem]',
            done && 'line-through',
          )}
        >
          {task.title}
        </Link>
        {task.description && <p className="mt-1 line-clamp-2 text-sm leading-snug text-muted-foreground">{task.description}</p>}

        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-3.5">
          <span className={cn('inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-bold tabular-nums', urgency)}>
            {overdue ? <TriangleAlertIcon className="size-3.5" aria-hidden /> : <ClockIcon className="size-3.5" aria-hidden />}
            {when}
            <span className="font-semibold opacity-75">· {done ? taskStatusLabel[task.status] : timeLeft(task.deadline, now)}</span>
          </span>
          {task.status === 'in_progress' && <Badge variant="info">{taskStatusLabel.in_progress}</Badge>}
          {task.status === 'graded' && task.score !== null && <Badge variant="success">Nilai {task.score.toLocaleString('id-ID')}</Badge>}
        </div>
      </div>

      {task.submission_url && !done && (
        <a
          href={task.submission_url}
          target="_blank"
          rel="noopener noreferrer"
          className="relative z-10 -mt-1.5 -mr-1.5 inline-flex size-11 shrink-0 items-center justify-center self-start rounded-full bg-muted text-foreground transition-colors hover:bg-brand hover:text-brand-foreground"
          aria-label={`Buka link pengumpulan ${task.title}`}
          title="Buka link pengumpulan"
        >
          <ArrowUpRightIcon className="size-4" />
        </a>
      )}
    </li>
  )
}
