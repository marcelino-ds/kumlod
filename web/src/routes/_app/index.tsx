import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  BookOpenIcon,
  CalendarClockIcon,
  CalendarDaysIcon,
  CalendarPlusIcon,
  CalendarRangeIcon,
  CircleCheckIcon,
  ClockIcon,
  CoffeeIcon,
  FlameIcon,
  MapPinIcon,
  MoonStarIcon,
  PinIcon,
  PlusIcon,
  SunIcon,
  SunriseIcon,
  SunsetIcon,
  TriangleAlertIcon,
} from 'lucide-react'
import { useEffect, useRef } from 'react'
import type * as React from 'react'

import type { Course, Dashboard, Schemas, Task } from '@/api/client'
import { coursesQuery, dashboardQuery, meQuery, tasksQuery, useSetTaskStatus } from '@/api/queries'
import { AttendancePicker } from '@/components/AttendancePicker'
import { AttendanceDots, EmptyState, ErrorState, LevelBadge, LoadingList, PageHeader } from '@/components/common'
import { useQuickAdd } from '@/components/QuickAddTask'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/misc'
import { formatLongDate, localDate, localTime, relativeDay, semesterWeek, semesterWeekLabel, timeLeft } from '@/lib/dates'
import { useAppSettings, useNow } from '@/lib/hooks'
import { attendanceSummaryText, meetingKindLabel, taskStatusLabel } from '@/lib/labels'
import { isOpen } from '@/lib/tasks'
import { cn, courseStyle, formatNumber } from '@/lib/utils'

export const Route = createFileRoute('/_app/')({
  validateSearch: (search: Record<string, unknown>): { meeting?: string } => ({
    meeting: typeof search.meeting === 'string' ? search.meeting : undefined,
  }),
  component: DashboardPage,
})

function DashboardPage() {
  const dash = useQuery(dashboardQuery)
  const me = useQuery(meQuery)
  const tasks = useQuery(tasksQuery({}))
  const courses = useQuery(coursesQuery(dash.data?.semester?.id ?? ''))
  const { timeZone } = useAppSettings()
  const now = useNow()
  const { meeting: highlight } = Route.useSearch()

  // Cached data wins over a failed refresh (e.g. offline).
  if (dash.data === undefined) {
    return (
      <>
        <PageHeader title="Dashboard" />
        {dash.isError ? <ErrorState error={dash.error} onRetry={() => void dash.refetch()} /> : <LoadingList rows={4} />}
      </>
    )
  }
  const d = dash.data

  if (!d.semester) {
    return (
      <>
        <PageHeader title="Dashboard" eyebrow={formatLongDate(d.date)} />
        <EmptyState
          icon={<CalendarPlusIcon />}
          title="Belum ada semester aktif"
          description="Buat semester dulu, lalu tambahkan matkul beserta jadwalnya. Pertemuan akan dibuat otomatis."
          action={
            <Button asChild>
              <Link to="/semester">Buat semester</Link>
            </Button>
          }
        />
      </>
    )
  }

  return (
    <>
      <DashboardHeader d={d} name={me.data?.user.username ?? ''} now={now} timeZone={timeZone} tasks={tasks.data} />

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:grid-rows-[auto_1fr] lg:items-start xl:grid-cols-[minmax(0,1fr)_24rem]">
        <section aria-labelledby="schedule-title" className="lg:col-start-1 lg:row-start-1">
          <SectionTitle id="schedule-title" count={d.today_meetings.length}>
            Jadwal hari ini
          </SectionTitle>
          <ScheduleFlow meetings={d.today_meetings} now={now} timeZone={timeZone} highlight={highlight} />
        </section>

        <Agenda d={d} now={now} timeZone={timeZone} className="lg:col-start-2 lg:row-span-2 lg:row-start-1" />

        <section aria-labelledby="courses-title" className="lg:col-start-1 lg:row-start-2">
          <SectionTitle
            id="courses-title"
            count={courses.data?.length}
            action={
              <Link to="/matkul" className="inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-muted-foreground hover:bg-foreground/5 hover:text-foreground">
                Semua <ArrowRightIcon className="size-4" aria-hidden />
              </Link>
            }
          >
            Matkul semester ini
          </SectionTitle>
          {courses.data === undefined ? (
            courses.isError ? <ErrorState error={courses.error} onRetry={() => void courses.refetch()} /> : <LoadingList rows={2} />
          ) : courses.data.length === 0 ? (
            <EmptyState
              icon={<BookOpenIcon />}
              title="Belum ada matkul"
              action={
                <Button asChild>
                  <Link to="/matkul/baru" search={{ semester: d.semester.id }}>
                    Tambah matkul
                  </Link>
                </Button>
              }
            />
          ) : (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
              {courses.data.map((c) => (
                <CourseTile key={c.id} course={c} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  )
}

function SectionTitle({ id, count, action, children }: { id: string; count?: number; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mb-4 flex min-h-10 items-center justify-between gap-2">
      <h2 id={id} className="flex items-center gap-2 text-xl font-extrabold tracking-tight">
        {children}
        {count !== undefined && (
          <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-foreground/[0.07] px-2 text-xs font-bold tabular-nums">
            {count}
          </span>
        )}
      </h2>
      {action}
    </div>
  )
}

// ---------------------------------------------------------------- header

const greetingIcon = { pagi: SunriseIcon, siang: SunIcon, sore: SunsetIcon, malam: MoonStarIcon } as const

function greetingKey(hhmm: string): keyof typeof greetingIcon {
  const h = Number(hhmm.slice(0, 2))
  if (h < 11) return 'pagi'
  if (h < 15) return 'siang'
  if (h < 18) return 'sore'
  return 'malam'
}

/** The class running now, or the next one today. */
function currentMeeting(meetings: Schemas['TodayMeeting'][], hm: string) {
  const tm = meetings.find((m) => m.meeting.status !== 'cancelled' && (m.meeting.end_time || '23:59') > hm)
  if (!tm) return undefined
  return { item: tm, now: (tm.meeting.start_time || '00:00') <= hm }
}

const chipClass =
  'inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors focus-visible:ring-[3px] focus-visible:ring-white/40 focus-visible:outline-none [&>svg]:size-4 [&>svg]:shrink-0'

/**
 * Dashboard hero: greeting with the name highlighted, today's status as
 * chips that jump to the details, the class happening now or next, and a
 * ring for how many tasks are done.
 */
function DashboardHeader({ d, name, now, timeZone, tasks }: { d: Dashboard; name: string; now: Date; timeZone: string; tasks?: Task[] }) {
  const hm = localTime(now, timeZone)
  const key = greetingKey(hm)
  const GreetingIcon = greetingIcon[key]
  const lectures = d.today_meetings.filter((m) => m.meeting.status !== 'cancelled').length
  const upcoming = d.upcoming_tasks.length
  const overdue = d.overdue_tasks.length
  const current = currentMeeting(d.today_meetings, hm)
  const total = tasks?.length
  const done = tasks?.filter((t) => !isOpen(t.status)).length

  return (
    <header className="relative overflow-hidden rounded-[2rem] bg-hero p-5 text-hero-foreground md:p-7">
      <div aria-hidden className="dot-grid absolute inset-0 text-white/[0.05]" />
      <span aria-hidden className="absolute -top-14 -right-14 hidden size-40 rounded-full bg-brand/90 lg:block" />
      <span aria-hidden className="absolute top-7 right-28 hidden size-7 rounded-full border-[5px] border-[#ff6b4a] lg:block" />
      <span aria-hidden className="absolute -bottom-28 -left-20 size-64 rounded-full bg-white/[0.04]" />

      <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:gap-10">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
            <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-white/10 px-3">
              <CalendarDaysIcon className="size-3.5" aria-hidden />
              {formatLongDate(d.date)}
            </span>
            <Link to="/semester" className="inline-flex h-8 items-center gap-1.5 rounded-full bg-white/10 px-3 transition-colors hover:bg-white/15">
              <span aria-hidden className="size-2 rounded-full bg-brand" />
              {d.semester?.name}
            </Link>
            {d.semester && <WeekChip start={d.semester.start_date} end={d.semester.end_date} today={d.date} />}
          </div>

          <h1 className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 text-[2rem] leading-tight font-extrabold tracking-tight md:text-[2.75rem]">
            <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 md:size-12">
              <GreetingIcon className="size-6 text-brand" />
            </span>
            <span>
              Selamat {key}
              {name && (
                <>
                  ,{' '}
                  <span className="inline-block -rotate-2 rounded-xl bg-brand px-2.5 text-brand-foreground">{name}</span>
                </>
              )}
            </span>
          </h1>

          <ul aria-label="Ringkasan hari ini" className="mt-5 flex flex-wrap gap-2">
            <li>
              <a href="#schedule-title" className={cn(chipClass, 'bg-white/10 hover:bg-white/15')}>
                <BookOpenIcon aria-hidden />
                {lectures > 0 ? `${lectures} kuliah hari ini` : 'Tidak ada kuliah hari ini'}
              </a>
            </li>
            {upcoming > 0 && (
              <li>
                <Link to="/tugas" className={cn(chipClass, 'bg-white/10 hover:bg-white/15')}>
                  <CalendarClockIcon aria-hidden />
                  {upcoming} deadline minggu ini
                </Link>
              </li>
            )}
            {overdue > 0 && (
              <li>
                <Link to="/tugas" className={cn(chipClass, 'bg-[#ff6b4a] text-[#1c1c1a] hover:brightness-95')}>
                  <TriangleAlertIcon aria-hidden />
                  {overdue} tugas terlambat
                </Link>
              </li>
            )}
            {upcoming === 0 && overdue === 0 && (
              <li>
                <span className={cn(chipClass, 'bg-brand text-brand-foreground')}>
                  <CircleCheckIcon aria-hidden />
                  Tidak ada deadline dekat
                </span>
              </li>
            )}
          </ul>

          {lectures > 0 && <NowNext current={current} />}
        </div>

        <TaskRing done={done} total={total} upcoming={upcoming} />
      </div>
    </header>
  )
}

/** Week of the semester, e.g. "Minggu ke-6 / 20". */
function WeekChip({ start, end, today }: { start: string; end: string; today: string }) {
  const w = semesterWeek(start, end, today)
  if (w.phase !== 'during') {
    return <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-white/10 px-3">{semesterWeekLabel(w, start)}</span>
  }
  return (
    <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-brand px-3 text-brand-foreground">
      <CalendarRangeIcon className="size-3.5" aria-hidden />
      <span>
        Minggu ke-<span className="text-sm font-extrabold tabular-nums">{w.week}</span>
        <span className="opacity-60"> dari {w.total}</span>
      </span>
    </span>
  )
}

/** Which class is running now or comes next; or that today's classes are over. */
function NowNext({ current }: { current?: { item: Schemas['TodayMeeting']; now: boolean } }) {
  if (!current) {
    return (
      <p className="mt-4 flex items-center gap-2 text-sm text-hero-foreground/70">
        <CircleCheckIcon className="size-4 text-brand" aria-hidden />
        Kuliah hari ini sudah selesai semua.
      </p>
    )
  }
  const { meeting: m, course } = current.item
  return (
    <Link
      to="/"
      search={{ meeting: m.id }}
      style={courseStyle(course.color)}
      className="group mt-4 flex max-w-xl items-center gap-3 rounded-2xl bg-white/[0.07] p-3 pr-4 transition-colors hover:bg-white/[0.11]"
    >
      <span className="tint-solid flex size-11 shrink-0 items-center justify-center rounded-xl text-white">
        {current.now ? <span aria-hidden className="size-2.5 animate-pulse rounded-full bg-white" /> : <ClockIcon className="size-5" aria-hidden />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold text-hero-foreground/60">
          {current.now ? `Sedang berlangsung sampai ${m.end_time}` : `Berikutnya, mulai ${m.start_time}`}
        </span>
        <span className="block truncate font-bold">{course.name}</span>
      </span>
      {m.room && (
        <span className="hidden shrink-0 items-center gap-1 text-xs font-semibold text-hero-foreground/70 sm:inline-flex">
          <MapPinIcon className="size-3.5" aria-hidden />
          {m.room}
        </span>
      )}
      <ArrowRightIcon className="size-4 shrink-0 text-hero-foreground/60 transition-transform group-hover:translate-x-0.5" aria-hidden />
    </Link>
  )
}

/** Ring showing finished tasks out of all tasks, with the totals beside it. */
function TaskRing({ done, total, upcoming }: { done?: number; total?: number; upcoming: number }) {
  const pct = done !== undefined && total ? done / total : 0
  const r = 52
  const c = 2 * Math.PI * r
  return (
    <div className="flex items-center gap-5 lg:flex-col lg:items-center lg:gap-3">
      <div
        role="img"
        aria-label={total === undefined ? 'Memuat tugas' : `${done} dari ${total} tugas selesai`}
        className="relative size-32 shrink-0 lg:size-36"
      >
        <svg viewBox="0 0 120 120" className="size-full -rotate-90">
          <circle cx="60" cy="60" r={r} fill="none" strokeWidth="12" className="stroke-white/10" />
          <circle
            cx="60"
            cy="60"
            r={r}
            fill="none"
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - pct)}
            className="stroke-brand transition-[stroke-dashoffset] duration-700"
          />
        </svg>
        <span aria-hidden className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl leading-none font-extrabold tracking-tight tabular-nums">{total ? `${Math.round(pct * 100)}%` : '-'}</span>
          <span className="mt-1 text-[0.7rem] font-semibold text-hero-foreground/60">selesai</span>
        </span>
      </div>
      <dl className="grid grid-cols-1 gap-1.5 text-sm lg:grid-cols-3 lg:gap-4 lg:text-center">
        <div className="flex items-baseline gap-2 lg:flex-col-reverse lg:items-center lg:gap-0.5">
          <dt className="text-xs text-hero-foreground/60">Selesai</dt>
          <dd className="font-extrabold tabular-nums">{done ?? '-'}</dd>
        </div>
        <div className="flex items-baseline gap-2 lg:flex-col-reverse lg:items-center lg:gap-0.5">
          <dt className="text-xs text-hero-foreground/60">Total</dt>
          <dd className="font-extrabold tabular-nums">{total ?? '-'}</dd>
        </div>
        <div className="flex items-baseline gap-2 lg:flex-col-reverse lg:items-center lg:gap-0.5">
          <dt className="text-xs text-hero-foreground/60">Minggu ini</dt>
          <dd className="font-extrabold tabular-nums">{upcoming}</dd>
        </div>
      </dl>
    </div>
  )
}

// -------------------------------------------------------------- schedule

/**
 * Today's meetings as a zigzag flow joined by a dotted line. The class that
 * is running or comes next is lifted out as the featured card.
 */
function ScheduleFlow({ meetings, now, timeZone, highlight }: { meetings: Schemas['TodayMeeting'][]; now: Date; timeZone: string; highlight?: string }) {
  if (meetings.length === 0) {
    return <EmptyState icon={<CoffeeIcon />} title="Tidak ada kuliah hari ini" description="Waktu yang pas buat nyicil tugas." />
  }
  const hm = localTime(now, timeZone)
  const featured = meetings.find((tm) => tm.meeting.status !== 'cancelled' && (tm.meeting.end_time || '23:59') > hm)
  const flow = meetings.length > 1

  return (
    <ol
      className={cn(
        'relative grid grid-cols-1 gap-4 before:absolute before:top-8 before:bottom-8 before:left-5 before:border-l-2 before:border-dashed before:border-foreground/15',
        flow ? 'md:before:left-1/2' : 'md:before:hidden',
      )}
    >
      {meetings.map((tm, i) => {
        const right = flow && i % 2 === 1
        return (
          <li
            key={tm.meeting.id}
            style={courseStyle(tm.course.color)}
            className={cn('relative pl-11', flow ? 'md:w-[calc(50%-1.75rem)] md:pl-0' : 'md:pl-0', right && 'md:ml-auto', flow && i > 0 && 'md:-mt-20')}
          >
            <span
              aria-hidden
              className={cn(
                'tint-solid absolute top-8 left-5 size-3.5 -translate-x-1/2 rounded-full ring-4 ring-background',
                !flow && 'md:hidden',
                flow && (right ? 'md:right-[calc(100%+1.75rem)] md:left-auto md:translate-x-1/2' : 'md:left-[calc(100%+1.75rem)]'),
              )}
            />
            {flow && (
              <span
                aria-hidden
                className={cn('absolute top-[2.35rem] hidden w-7 border-t-2 border-dashed border-foreground/15 md:block', right ? 'right-full' : 'left-full')}
              />
            )}
            <MeetingCard
              item={tm}
              status={tm === featured ? ((tm.meeting.start_time || '00:00') <= hm ? 'now' : 'next') : undefined}
              highlight={tm.meeting.id === highlight}
            />
          </li>
        )
      })}
    </ol>
  )
}

function MeetingCard({ item, status, highlight }: { item: Schemas['TodayMeeting']; status?: 'now' | 'next'; highlight: boolean }) {
  const { meeting: m, course } = item
  const ref = useRef<HTMLDivElement>(null)
  const cancelled = m.status === 'cancelled'
  const featured = status !== undefined

  useEffect(() => {
    if (highlight) ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [highlight])

  return (
    <div
      ref={ref}
      className={cn(
        // Fixed layout: details on top (clamped), attendance always pinned to the bottom.
        'relative flex h-full min-h-[16.5rem] flex-col rounded-[1.75rem] p-5',
        featured ? 'tint-bg-strong shadow-xl shadow-black/[0.06] md:-rotate-1' : 'bg-card shadow-xs ring-1 ring-black/[0.03] dark:ring-white/[0.06]',
        highlight && 'ring-2 ring-foreground ring-offset-2 ring-offset-background',
        cancelled && 'opacity-60',
      )}
    >
      <span aria-hidden className={cn('tint-ink absolute top-4 right-4 flex size-10 items-center justify-center rounded-xl', featured ? 'bg-card/70' : 'tint-bg')}>
        <BookOpenIcon className="size-[1.1rem]" />
      </span>

      <p className="pr-12 text-xs font-bold text-muted-foreground tabular-nums">
        {m.start_time || '--:--'}
        {m.end_time && `-${m.end_time}`} · Pertemuan {m.number}
      </p>
      <Link
        to="/matkul/$courseId"
        params={{ courseId: course.id }}
        title={course.name}
        className={cn('mt-1.5 line-clamp-2 pr-12 text-xl leading-tight font-extrabold tracking-tight hover:underline', featured && 'tint-ink', cancelled && 'line-through')}
      >
        {course.name}
      </Link>
      {(m.room || m.topic) && (
        <div className="mt-1.5 grid gap-0.5 text-sm text-foreground/70">
          {m.room && (
            <p className="flex min-w-0 items-center gap-1 font-medium">
              <MapPinIcon className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">{m.room}</span>
            </p>
          )}
          {m.topic && (
            <p className="truncate" title={m.topic}>
              {m.topic}
            </p>
          )}
        </div>
      )}

      {(status || m.kind !== 'lecture' || cancelled) && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {status && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1 text-xs font-bold whitespace-nowrap shadow-xs">
              <ClockIcon className="size-3.5" aria-hidden />
              {status === 'now' ? `Berlangsung s.d. ${m.end_time}` : `Mulai ${m.start_time}`}
            </span>
          )}
          {m.kind !== 'lecture' && <Badge>{meetingKindLabel[m.kind]}</Badge>}
          {cancelled && <Badge variant="secondary">Batal</Badge>}
        </div>
      )}

      <div className="mt-auto pt-4">
        {cancelled ? (
          <p className="flex h-[3.25rem] items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">Kuliah dibatalkan</p>
        ) : (
          <AttendancePicker meeting={m} label={`${course.name} pertemuan ${m.number}`} className={featured ? 'bg-card/60 dark:bg-black/20' : 'bg-muted'} />
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- agenda

function Agenda({ d, now, timeZone, className }: { d: Dashboard; now: Date; timeZone: string; className?: string }) {
  const quickAdd = useQuickAdd()
  const today = localDate(now, timeZone)
  return (
    <aside aria-labelledby="agenda-title" className={cn('rounded-[2rem] bg-foreground/[0.04] p-4 md:p-5 dark:bg-white/[0.035]', className)}>
      <div className="mb-4 flex min-h-10 items-center justify-between gap-2 px-1">
        <h2 id="agenda-title" className="text-xl font-extrabold tracking-tight">
          Agenda
        </h2>
        <Link to="/tugas" className="inline-flex h-10 items-center gap-1.5 rounded-full bg-card px-4 text-sm font-semibold shadow-xs hover:bg-muted">
          Semua tugas <ArrowRightIcon className="size-4" aria-hidden />
        </Link>
      </div>

      <ul className="grid grid-cols-1 gap-3">
        {d.overdue_tasks.map((t) => (
          <AgendaTask key={t.id} task={t} now={now} timeZone={timeZone} today={today} overdue />
        ))}
        {d.attendance_alerts.map((a) => (
          <AgendaAttendance key={a.course.id} alert={a} />
        ))}
        {d.upcoming_tasks.map((t) => (
          <AgendaTask key={t.id} task={t} now={now} timeZone={timeZone} today={today} />
        ))}
        {d.overdue_tasks.length + d.upcoming_tasks.length === 0 && (
          <li className="flex items-center gap-2 rounded-3xl bg-brand px-4 py-5 text-sm font-semibold text-brand-foreground">
            <CircleCheckIcon className="size-4 shrink-0" aria-hidden /> Tidak ada deadline dalam 7 hari. Mantap!
          </li>
        )}
        <li>
          <button
            type="button"
            onClick={() => quickAdd()}
            className="flex min-h-16 w-full items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-foreground/15 text-sm font-semibold text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
          >
            <PlusIcon className="size-4" aria-hidden /> Tambah tugas
          </button>
        </li>
      </ul>
    </aside>
  )
}

function AgendaTask({ task, now, timeZone, today, overdue }: { task: Task; now: Date; timeZone: string; today: string; overdue?: boolean }) {
  const setStatus = useSetTaskStatus()
  const done = !isOpen(task.status)
  const deadline = new Date(task.deadline)
  return (
    <li
      style={courseStyle(task.course?.color)}
      className={cn(
        'rounded-3xl p-4',
        overdue ? 'bg-red-100 text-red-950 dark:bg-red-950/60 dark:text-red-50' : task.course ? 'tint-bg-strong' : 'bg-amber-100 dark:bg-amber-950/50',
        done && 'opacity-60',
      )}
    >
      <div className="flex items-center justify-between gap-3 text-xs font-bold">
        <span className="flex min-w-0 items-center gap-1.5">
          {overdue ? <TriangleAlertIcon className="size-3.5 shrink-0" aria-hidden /> : <PinIcon className="size-3.5 shrink-0" aria-hidden />}
          <span className="truncate">
            {overdue ? 'Terlambat' : 'Tugas'} · {task.course?.name ?? 'Pribadi'}
          </span>
        </span>
        <span className="shrink-0 opacity-70">{relativeDay(localDate(deadline, timeZone), today)}</span>
      </div>

      <Link
        to="/tugas/$taskId"
        params={{ taskId: task.id }}
        className="mt-2.5 block rounded-2xl bg-card/75 px-3.5 py-3 text-sm leading-snug font-semibold text-foreground hover:underline"
      >
        <span className={cn(done && 'line-through')}>{task.title}</span>
        {task.status === 'in_progress' && (
          <Badge variant="info" className="ml-2 align-middle">
            {taskStatusLabel.in_progress}
          </Badge>
        )}
      </Link>

      <div className="mt-3 flex items-center gap-1.5">
        <span className="inline-flex h-9 min-w-0 items-center gap-1.5 rounded-full bg-card/75 px-3 text-xs font-semibold text-foreground">
          <ClockIcon className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate tabular-nums">
            {localTime(deadline, timeZone)} · {timeLeft(task.deadline, now)}
          </span>
          {task.priority === 'high' && (
            <>
              <FlameIcon className="size-3.5 shrink-0 text-red-600 dark:text-red-400" aria-hidden />
              <span className="sr-only">Penting</span>
            </>
          )}
        </span>
        <span className="flex-1" />
        {task.submission_url && !done && (
          <a
            href={task.submission_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-card/75 text-foreground transition-colors hover:bg-card"
            aria-label={`Buka link pengumpulan ${task.title}`}
          >
            <ArrowUpRightIcon className="size-4" />
          </a>
        )}
        <span className="flex size-11 shrink-0 items-center justify-center">
          <Checkbox
            checked={done}
            onCheckedChange={(checked) => setStatus.mutate({ id: task.id, status: checked ? 'submitted' : 'todo' })}
            aria-label={done ? `Tandai "${task.title}" belum dikumpulkan` : `Tandai "${task.title}" sudah dikumpulkan`}
            className="size-9"
          />
        </span>
      </div>
    </li>
  )
}

function AgendaAttendance({ alert: a }: { alert: Schemas['AttendanceAlert'] }) {
  return (
    <li>
      <Link
        to="/matkul/$courseId"
        params={{ courseId: a.course.id }}
        search={{ tab: 'pertemuan' }}
        className="block rounded-3xl bg-violet-100 p-4 text-violet-950 transition-transform hover:-translate-y-0.5 dark:bg-violet-950/60 dark:text-violet-50"
      >
        <div className="flex items-center justify-between gap-3 text-xs font-bold">
          <span className="flex min-w-0 items-center gap-1.5">
            <TriangleAlertIcon className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">Absen · {a.course.name}</span>
          </span>
          <LevelBadge level={a.attendance.level} />
        </div>
        <div className="mt-2.5 rounded-2xl bg-card/75 px-3.5 py-3 text-foreground">
          <p className="text-sm leading-snug font-semibold">{attendanceSummaryText(a.attendance)}</p>
          <AttendanceDots attendance={a.attendance} color={a.course.color} size="sm" className="mt-2.5" />
        </div>
      </Link>
    </li>
  )
}

// --------------------------------------------------------------- courses

function CourseTile({ course: c }: { course: Course }) {
  const letter = c.grade.official_letter ?? c.grade.letter
  const a = c.attendance
  return (
    <li>
      <Link
        to="/matkul/$courseId"
        params={{ courseId: c.id }}
        style={courseStyle(c.color)}
        className="tint-bg group flex h-full flex-col gap-3 rounded-[1.5rem] p-4 transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-lg"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-foreground/60">
              {c.code ? `${c.code} · ` : ''}
              {c.credits} SKS
            </p>
            <h3 className="tint-ink mt-0.5 leading-tight font-extrabold tracking-tight group-hover:underline">{c.name}</h3>
          </div>
          <span
            className={cn(
              'flex size-11 shrink-0 items-center justify-center rounded-2xl text-base font-extrabold',
              letter ? 'bg-card shadow-xs' : 'border-2 border-dashed border-foreground/20 text-xs text-muted-foreground',
            )}
          >
            <span aria-hidden>{letter ?? '?'}</span>
            <span className="sr-only">{letter ? `Nilai ${letter}${c.grade.official_letter || c.grade.is_final ? '' : ' sementara'}` : 'Belum ada nilai'}</span>
          </span>
        </div>
        <AttendanceDots attendance={a} color={c.color} size="sm" />
        <p className="sr-only">{attendanceSummaryText(a)}</p>
        <div className="mt-auto flex flex-wrap items-center gap-1.5 text-xs">
          <LevelBadge level={a.level} />
          <span className="rounded-full bg-card/60 px-2.5 py-0.5 font-semibold tabular-nums">
            {a.percentage === null ? 'Belum ada absen' : `${formatNumber(a.percentage, 0)}% hadir`}
          </span>
          {c.open_task_count > 0 && <span className="rounded-full bg-card/60 px-2.5 py-0.5 font-semibold">{c.open_task_count} tugas</span>}
        </div>
      </Link>
    </li>
  )
}
