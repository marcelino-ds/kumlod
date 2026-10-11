import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowRightIcon, CalendarPlusIcon, CheckCircle2Icon, ChevronRightIcon, CoffeeIcon, MapPinIcon } from 'lucide-react'
import { useEffect, useRef } from 'react'

import type { Dashboard, Schemas } from '@/api/client'
import { dashboardQuery, meQuery } from '@/api/queries'
import { AttendancePicker } from '@/components/AttendancePicker'
import { AttendanceDots, EmptyState, ErrorState, LevelBadge, LoadingList, PageHeader, Section, StatTile } from '@/components/common'
import { TaskItem } from '@/components/TaskItem'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatLongDate, localTime } from '@/lib/dates'
import { useAppSettings, useNow } from '@/lib/hooks'
import { attendanceSummaryText, meetingKindLabel } from '@/lib/labels'
import { cn, courseStyle } from '@/lib/utils'

export const Route = createFileRoute('/_app/')({
  validateSearch: (search: Record<string, unknown>): { meeting?: string } => ({
    meeting: typeof search.meeting === 'string' ? search.meeting : undefined,
  }),
  component: TodayPage,
})

function greeting(hhmm: string): string {
  const h = Number(hhmm.slice(0, 2))
  if (h < 11) return 'Selamat pagi'
  if (h < 15) return 'Selamat siang'
  if (h < 18) return 'Selamat sore'
  return 'Selamat malam'
}

function summaryLine(lectures: number, upcoming: number, overdue: number): string {
  if (lectures === 0 && upcoming === 0 && overdue === 0) return 'Hari ini santai: tidak ada kuliah dan tidak ada deadline dekat.'
  const parts: string[] = []
  parts.push(lectures > 0 ? `${lectures} kuliah hari ini` : 'Tidak ada kuliah hari ini')
  if (upcoming > 0) parts.push(`${upcoming} deadline minggu ini`)
  let line = parts.join(', ')
  if (overdue > 0) line += `, dan ${overdue} tugas sudah lewat deadline`
  return `${line}.`
}

function TodayHero({ d, name, timeZone, now }: { d: Dashboard; name: string; timeZone: string; now: Date }) {
  const lectures = d.today_meetings.filter((m) => m.meeting.status !== 'cancelled').length
  const upcoming = d.upcoming_tasks.length
  const overdue = d.overdue_tasks.length
  return (
    <section aria-labelledby="today-title" className="relative overflow-hidden rounded-[2rem] bg-hero p-5 text-hero-foreground md:p-8">
      <div aria-hidden className="dot-grid absolute inset-0 text-white/[0.06]" />
      <div aria-hidden className="absolute -top-20 -right-16 size-44 rounded-full bg-brand md:-top-24 md:-right-10 md:size-72" />
      <div aria-hidden className="absolute top-10 right-24 size-9 rounded-full border-[6px] border-[#ff6b4a] md:top-16 md:right-72 md:size-12 md:border-8" />
      <div aria-hidden className="absolute right-6 bottom-28 hidden h-16 w-36 -rotate-12 rounded-full bg-sky-400 md:block lg:right-16" />

      <div className="relative">
        <p className="pr-20 text-sm font-semibold text-hero-foreground/70">{formatLongDate(d.date)}</p>
        <h1 id="today-title" className="mt-2 pr-16 text-[2rem] leading-[1.05] font-extrabold tracking-tight text-balance md:text-5xl">
          {greeting(localTime(now, timeZone))}
          {name ? `, ${name}` : ''}
          <span aria-hidden> 👋</span>
        </h1>
        <p className="mt-3 max-w-md text-sm text-hero-foreground/75 md:text-base">
          {d.semester ? summaryLine(lectures, upcoming, overdue) : 'Mulai dengan membuat semester pertama kamu.'}
        </p>
        {d.semester && (
          <div className="mt-6 grid max-w-xl grid-cols-3 gap-2 md:gap-3">
            <StatTile className="bg-white/10" label="Kuliah" value={lectures} hint="hari ini" />
            <StatTile className="bg-brand text-brand-foreground" label="Deadline" value={upcoming} hint="7 hari ke depan" />
            <StatTile
              className={overdue > 0 ? 'bg-[#ff6b4a] text-white' : 'bg-white/10'}
              label="Terlambat"
              value={overdue}
              hint={overdue > 0 ? 'segera kumpulkan' : 'aman'}
            />
          </div>
        )}
      </div>
    </section>
  )
}

function TodayPage() {
  const dash = useQuery(dashboardQuery)
  const me = useQuery(meQuery)
  const { timeZone } = useAppSettings()
  const now = useNow()
  const { meeting: highlight } = Route.useSearch()
  const name = me.data?.user.username ?? ''

  // Cached data wins over a failed refresh (e.g. offline).
  if (dash.data === undefined) {
    return (
      <>
        <PageHeader title="Hari Ini" />
        {dash.isError ? <ErrorState error={dash.error} onRetry={() => void dash.refetch()} /> : <LoadingList rows={4} />}
      </>
    )
  }
  const d = dash.data

  if (!d.semester) {
    return (
      <div className="space-y-6">
        <TodayHero d={d} name={name} timeZone={timeZone} now={now} />
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
      </div>
    )
  }

  return (
    <>
      <TodayHero d={d} name={name} timeZone={timeZone} now={now} />

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:items-start">
        <Section title="Jadwal hari ini" count={d.today_meetings.length}>
          {d.today_meetings.length === 0 ? (
            <EmptyState icon={<CoffeeIcon />} title="Tidak ada kuliah hari ini" description="Waktu yang pas buat nyicil tugas." />
          ) : (
            <ol className="relative space-y-4 before:absolute before:top-6 before:bottom-6 before:left-[4rem] before:-translate-x-1/2 before:border-l-2 before:border-dashed before:border-foreground/15">
              {d.today_meetings.map((tm) => (
                <TodayMeetingCard key={tm.meeting.id} item={tm} highlight={tm.meeting.id === highlight} />
              ))}
            </ol>
          )}
        </Section>

        <div className="space-y-8">
          {d.attendance_alerts.length > 0 && (
            <Section title="Perlu perhatian" count={d.attendance_alerts.length}>
              <ul className="grid gap-2.5">
                {d.attendance_alerts.map((a) => (
                  <li key={a.course.id}>
                    <Link
                      to="/matkul/$courseId"
                      params={{ courseId: a.course.id }}
                      search={{ tab: 'pertemuan' }}
                      style={courseStyle(a.course.color)}
                      className="tint-bg group flex items-center gap-3 rounded-3xl p-4 transition-transform hover:-translate-y-0.5"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="tint-ink font-bold">{a.course.name}</span>
                          <LevelBadge level={a.attendance.level} />
                        </div>
                        <p className="mt-1 text-sm text-foreground/70">{attendanceSummaryText(a.attendance)}</p>
                        <AttendanceDots attendance={a.attendance} color={a.course.color} size="sm" className="mt-2.5" />
                      </div>
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-card/80 transition-transform group-hover:translate-x-0.5">
                        <ChevronRightIcon className="size-4" aria-hidden />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {d.overdue_tasks.length > 0 && (
            <Section title="Terlambat" count={d.overdue_tasks.length} tone="danger">
              <ul className="space-y-2.5">
                {d.overdue_tasks.map((t) => (
                  <TaskItem key={t.id} task={t} now={now} timeZone={timeZone} />
                ))}
              </ul>
            </Section>
          )}

          <section aria-labelledby="upcoming-title" className="rounded-[2rem] bg-brand p-4 text-brand-foreground md:p-5">
            <div className="mb-4 flex items-center justify-between gap-2 px-1">
              <h2 id="upcoming-title" className="text-lg font-extrabold tracking-tight">
                Deadline 7 hari
                <span className="ml-2 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-hero px-2 align-middle text-xs font-bold text-hero-foreground tabular-nums">
                  {d.upcoming_tasks.length}
                </span>
              </h2>
              <Link
                to="/tugas"
                className="inline-flex h-10 items-center gap-1.5 rounded-full bg-hero px-4 text-sm font-semibold text-hero-foreground hover:bg-hero/85"
              >
                Semua <ArrowRightIcon className="size-4" aria-hidden />
              </Link>
            </div>
            {d.upcoming_tasks.length === 0 ? (
              <div className="flex items-center gap-3 rounded-2xl bg-white/50 px-4 py-5 text-sm font-semibold dark:bg-black/10">
                <CheckCircle2Icon className="size-6 shrink-0" aria-hidden />
                Tidak ada deadline dalam 7 hari. Mantap!
              </div>
            ) : (
              <ul className="space-y-2.5 text-foreground">
                {d.upcoming_tasks.map((t) => (
                  <TaskItem key={t.id} task={t} now={now} timeZone={timeZone} />
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  )
}

function TodayMeetingCard({ item, highlight }: { item: Schemas['TodayMeeting']; highlight: boolean }) {
  const { meeting: m, course } = item
  const ref = useRef<HTMLLIElement>(null)
  const cancelled = m.status === 'cancelled'

  useEffect(() => {
    if (highlight) ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [highlight])

  return (
    <li ref={ref} style={courseStyle(course.color)} className="relative grid grid-cols-[3.25rem_minmax(0,1fr)] gap-6">
      <div className="pt-4 text-right">
        <p className="text-sm font-extrabold tabular-nums">{m.start_time || '--:--'}</p>
        {m.end_time && <p className="text-xs font-medium text-muted-foreground tabular-nums">{m.end_time}</p>}
      </div>
      <span
        aria-hidden
        className="tint-solid absolute top-5 left-[4rem] size-3 -translate-x-1/2 rounded-full ring-4 ring-background"
      />
      <div
        className={cn(
          'tint-bg rounded-3xl p-4 md:p-5',
          highlight && 'ring-2 ring-foreground ring-offset-2 ring-offset-background',
          cancelled && 'opacity-60',
        )}
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="tint-border inline-flex items-center rounded-full border bg-card/60 px-2.5 py-0.5 text-xs font-semibold">
            Pertemuan {m.number}
          </span>
          {m.kind !== 'lecture' && <Badge variant="default">{meetingKindLabel[m.kind]}</Badge>}
          {cancelled && <Badge variant="secondary">Batal</Badge>}
        </div>
        <Link
          to="/matkul/$courseId"
          params={{ courseId: course.id }}
          className={cn('tint-ink mt-2 block text-lg leading-snug font-extrabold tracking-tight hover:underline', cancelled && 'line-through')}
        >
          {course.name}
        </Link>
        {(m.room || m.topic) && (
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-foreground/70">
            {m.room && (
              <span className="inline-flex items-center gap-1">
                <MapPinIcon className="size-3.5" aria-hidden />
                {m.room}
              </span>
            )}
            {m.topic && <span>{m.topic}</span>}
          </p>
        )}
        {!cancelled && (
          <AttendancePicker meeting={m} label={`${course.name} pertemuan ${m.number}`} className="mt-4 bg-card/60 dark:bg-black/20" />
        )}
      </div>
    </li>
  )
}
