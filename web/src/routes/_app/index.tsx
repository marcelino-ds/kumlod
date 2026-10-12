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

const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))

/** "25 menit", "1 jam", "1 jam 20 menit" */
function formatDuration(min: number): string {
  if (min < 60) return `${min} menit`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} jam ${m} menit` : `${h} jam`
}

/** Fixed pastel tones for the hero tiles. The hero is dark in both themes, so these stay put. */
const tileTone = {
  sky: 'bg-[#cfe2ff] text-[#0f2547]',
  sun: 'bg-[#ffe27a] text-[#3a2c00]',
  coral: 'bg-[#ff8f73] text-[#3d0f02]',
  lilac: 'bg-[#dcd4ff] text-[#24194d]',
} as const

const tileClass =
  'group relative flex h-full min-h-[7.5rem] flex-col rounded-[1.5rem] p-4 transition-transform sm:min-h-[9rem] hover:-translate-y-0.5 focus-visible:ring-[3px] focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-hero focus-visible:outline-none'

/**
 * Dashboard hero, ordered by importance: the class happening now (lime, the
 * loudest), then pastel tiles for today's numbers, then the semester week as
 * a quiet timeline next to the greeting.
 */
function DashboardHeader({ d, name, now, timeZone, tasks }: { d: Dashboard; name: string; now: Date; timeZone: string; tasks?: Task[] }) {
  const hm = localTime(now, timeZone)
  const key = greetingKey(hm)
  const GreetingIcon = greetingIcon[key]
  const active = d.today_meetings.filter((m) => m.meeting.status !== 'cancelled')
  const lectures = active.length
  const remaining = active.filter((m) => (m.meeting.end_time || '23:59') > hm).length
  const upcoming = d.upcoming_tasks.length
  const overdue = d.overdue_tasks.length
  const current = currentMeeting(d.today_meetings, hm)
  const total = tasks?.length
  const done = tasks?.filter((t) => !isOpen(t.status)).length

  return (
    <header className="relative overflow-hidden rounded-[2rem] bg-hero p-4 text-hero-foreground sm:p-5 md:p-6">
      <div aria-hidden className="dot-grid absolute inset-0 text-white/[0.05]" />
      <span aria-hidden className="absolute -top-28 -right-28 size-72 rounded-full bg-brand/10 blur-3xl" />

      <div className="relative grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:items-end lg:gap-8 2xl:grid-cols-[minmax(0,1fr)_minmax(0,28rem)]">
        <div className="min-w-0 px-1 pt-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-hero-foreground/65">
            <CalendarDaysIcon className="size-4 shrink-0" aria-hidden />
            <span>{formatLongDate(d.date)}</span>
            {d.semester && (
              <>
                <span aria-hidden>·</span>
                <Link to="/semester" className="font-semibold text-hero-foreground underline-offset-4 hover:underline">
                  {d.semester.name}
                </Link>
              </>
            )}
          </p>

          <h1 className="mt-3 flex items-center gap-3 text-[1.875rem] leading-tight font-extrabold tracking-tight md:text-[2.5rem]">
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
        </div>

        {d.semester && <WeekTimeline start={d.semester.start_date} end={d.semester.end_date} today={d.date} />}
      </div>

      <ul
        aria-label="Ringkasan hari ini"
        className="relative mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:gap-3 lg:grid-cols-[minmax(0,1.7fr)_repeat(3,minmax(0,1fr))]"
      >
        <li className="col-span-2 sm:col-span-3 lg:col-span-1">
          <NowNext current={current} lectures={lectures} hm={hm} />
        </li>
        <li>
          <a href="#schedule-title" className={cn(tileClass, tileTone.sky)}>
            <TileBody
              icon={BookOpenIcon}
              label="Kuliah hari ini"
              value={lectures}
              note={lectures === 0 ? 'Libur kuliah' : remaining === 0 ? 'Semua sudah selesai' : `Sisa ${remaining} kuliah`}
            />
          </a>
        </li>
        <li>
          {overdue > 0 ? (
            <Link to="/tugas" className={cn(tileClass, tileTone.coral)}>
              <TileBody
                icon={TriangleAlertIcon}
                label="Tugas terlambat"
                value={overdue}
                note={upcoming > 0 ? `+${upcoming} deadline 7 hari ke depan` : 'Segera kumpulkan'}
              />
            </Link>
          ) : (
            <Link to="/tugas" className={cn(tileClass, tileTone.sun)}>
              <TileBody
                icon={CalendarClockIcon}
                label="Deadline dekat"
                value={upcoming}
                note={upcoming === 0 ? 'Tidak ada deadline dekat' : 'Dalam 7 hari ke depan'}
              />
            </Link>
          )}
        </li>
        <li className="col-span-2 sm:col-span-1">
          <Link to="/tugas" className={cn(tileClass, tileTone.lilac)}>
            <TileBody
              icon={CircleCheckIcon}
              label="Tugas selesai"
              value={done ?? '-'}
              of={total}
              progress={done !== undefined && total ? done / total : undefined}
              note={total === undefined ? 'Memuat tugas' : total === 0 ? 'Belum ada tugas' : `${Math.round(((done ?? 0) / total) * 100)}% dari semua tugas`}
            />
          </Link>
        </li>
      </ul>
    </header>
  )
}

/** Content of a pastel hero tile: icon, label, a big number (optionally "of" a total), an optional bar, and a note. */
function TileBody({
  icon: Icon,
  label,
  value,
  of,
  note,
  progress,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: React.ReactNode
  of?: number
  note: string
  progress?: number
}) {
  return (
    <>
      <span className="flex items-center justify-between gap-2">
        <span aria-hidden className="flex size-9 items-center justify-center rounded-full bg-white/60">
          <Icon className="size-[1.05rem]" />
        </span>
        <ArrowUpRightIcon aria-hidden className="size-4 opacity-40 transition-opacity group-hover:opacity-90" />
      </span>
      <span className="mt-3 text-[0.8rem] leading-tight font-bold opacity-75">{label}</span>
      <span className="mt-1 flex items-baseline gap-1 tabular-nums">
        <span className="text-[2.25rem] leading-none font-extrabold tracking-tight">{value}</span>
        {of !== undefined && <span className="text-base font-bold opacity-50">/ {of}</span>}
      </span>
      {progress !== undefined && (
        <span aria-hidden className="mt-2.5 block h-1.5 overflow-hidden rounded-full bg-black/10">
          <span className="block h-full rounded-full bg-current transition-[width] duration-700" style={{ width: `${Math.round(progress * 100)}%` }} />
        </span>
      )}
      <span className="mt-auto pt-2 text-xs leading-snug font-semibold opacity-75">{note}</span>
    </>
  )
}

/** "Minggu ke-6 dari 20" with one segment per semester week; the current week is lit. */
function WeekTimeline({ start, end, today }: { start: string; end: string; today: string }) {
  const w = semesterWeek(start, end, today)
  const during = w.phase === 'during'
  const left = w.total - w.week
  return (
    <Link
      to="/semester"
      className="block rounded-[1.5rem] bg-white/[0.06] p-4 ring-1 ring-white/10 transition-colors hover:bg-white/[0.09] focus-visible:ring-[3px] focus-visible:ring-white/50 focus-visible:outline-none"
    >
      <span className="flex items-center justify-between gap-3 text-xs font-semibold text-hero-foreground/60">
        <span className="inline-flex items-center gap-1.5">
          <CalendarRangeIcon className="size-3.5" aria-hidden />
          Minggu kuliah
        </span>
        {during && <span>{left > 0 ? `${left} minggu lagi` : 'Minggu terakhir'}</span>}
      </span>
      <span className="mt-1.5 block text-2xl leading-tight font-extrabold tracking-tight">
        {during ? (
          <>
            Minggu ke-<span className="text-brand tabular-nums">{w.week}</span>{' '}
            <span className="text-base font-bold text-hero-foreground/45">dari {w.total}</span>
          </>
        ) : (
          semesterWeekLabel(w, start)
        )}
      </span>
      <span aria-hidden className="mt-3 flex h-3 items-center gap-[3px]">
        {Array.from({ length: w.total }, (_, i) => {
          const n = i + 1
          const isCurrent = during && n === w.week
          return (
            <span
              key={n}
              className={cn('flex-1 rounded-full', isCurrent ? 'h-3 bg-brand' : n <= w.week ? 'h-2 bg-white/40' : 'h-2 bg-white/10')}
            />
          )
        })}
      </span>
    </Link>
  )
}

/** The class running now or coming next (the loudest card), or that today's classes are over. */
function NowNext({ current, lectures, hm }: { current?: { item: Schemas['TodayMeeting']; now: boolean }; lectures: number; hm: string }) {
  if (!current) {
    return (
      <div className="flex h-full min-h-[9rem] flex-col justify-center rounded-[1.5rem] bg-white/[0.06] p-5 ring-1 ring-white/10">
        <CircleCheckIcon className="size-6 text-brand" aria-hidden />
        <p className="mt-2 text-lg font-extrabold tracking-tight">{lectures > 0 ? 'Kuliah hari ini beres' : 'Tidak ada kuliah hari ini'}</p>
        <p className="mt-0.5 text-sm text-hero-foreground/65">{lectures > 0 ? 'Semua kuliah hari ini sudah selesai.' : 'Waktu yang pas buat nyicil tugas.'}</p>
      </div>
    )
  }
  const { meeting: m, course } = current.item
  const start = toMinutes(m.start_time || '00:00')
  const end = toMinutes(m.end_time || '23:59')
  const nowMin = toMinutes(hm)
  const left = current.now ? end - nowMin : start - nowMin
  const elapsed = current.now && end > start ? Math.min(1, Math.max(0, (nowMin - start) / (end - start))) : 0

  return (
    <Link to="/" search={{ meeting: m.id }} style={courseStyle(course.color)} className={cn(tileClass, 'bg-brand p-5 text-brand-foreground')}>
      <span className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex h-8 items-center gap-2 rounded-full bg-brand-foreground px-3 text-xs font-bold text-brand">
          <span aria-hidden className={cn('size-2 rounded-full bg-brand', current.now && 'animate-pulse')} />
          {current.now ? 'Sedang berlangsung' : 'Berikutnya'}
        </span>
        <span className="text-sm font-extrabold tabular-nums">
          {current.now ? `Sisa ${formatDuration(left)}` : `Mulai dalam ${formatDuration(left)}`}
        </span>
      </span>
      <span className="mt-3 flex items-center gap-2.5">
        <span aria-hidden className="tint-solid size-3 shrink-0 rounded-full ring-2 ring-brand-foreground/25" />
        <span className="min-w-0 flex-1 truncate text-2xl leading-tight font-extrabold tracking-tight">{course.name}</span>
        <ArrowUpRightIcon className="size-5 shrink-0 opacity-60 transition-opacity group-hover:opacity-100" aria-hidden />
      </span>
      <span className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-semibold opacity-75">
        <span className="inline-flex items-center gap-1.5 tabular-nums">
          <ClockIcon className="size-3.5 shrink-0" aria-hidden />
          {m.start_time || '--:--'}
          {m.end_time && `-${m.end_time}`}
        </span>
        {m.room && (
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <MapPinIcon className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{m.room}</span>
          </span>
        )}
      </span>
      {current.now && (
        <span aria-hidden className="mt-auto block pt-4">
          <span className="block h-2 overflow-hidden rounded-full bg-brand-foreground/15">
            <span className="block h-full rounded-full bg-brand-foreground" style={{ width: `${Math.round(elapsed * 100)}%` }} />
          </span>
        </span>
      )}
    </Link>
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
