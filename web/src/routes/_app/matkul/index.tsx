import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import {
  ArrowDownWideNarrowIcon,
  BookOpenIcon,
  CalendarPlusIcon,
  CheckIcon,
  ChevronDownIcon,
  ClockIcon,
  LayoutGridIcon,
  ListIcon,
  ListTodoIcon,
  PlusIcon,
  SearchIcon,
  SearchXIcon,
  TriangleAlertIcon,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import type * as React from 'react'

import type { Course, Schemas } from '@/api/client'
import { coursesQuery, semestersQuery } from '@/api/queries'
import { AttendanceDots, EmptyState, ErrorState, LevelBadge, LoadingList, PageHeader } from '@/components/common'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/misc'
import { localDate, localTime, parseLocalDate } from '@/lib/dates'
import { useAppSettings, useNow } from '@/lib/hooks'
import { attendanceSummaryText, dayShort, scheduleSummary } from '@/lib/labels'
import { cn, courseStyle, formatNumber } from '@/lib/utils'

type View = 'grid' | 'list'
type Sort = 'schedule' | 'name' | 'credits' | 'attendance' | 'tasks'
type Focus = 'all' | 'today' | 'attention' | 'tasks'

const sorts: { value: Sort; label: string }[] = [
  { value: 'schedule', label: 'Jadwal terdekat dalam minggu' },
  { value: 'name', label: 'Nama (A-Z)' },
  { value: 'credits', label: 'SKS terbanyak' },
  { value: 'attendance', label: 'Kehadiran terendah' },
  { value: 'tasks', label: 'Tugas terbanyak' },
]

export const Route = createFileRoute('/_app/matkul/')({
  validateSearch: (s: Record<string, unknown>): { semester?: string; view?: View; sort?: Sort; focus?: Focus } => ({
    semester: typeof s.semester === 'string' && s.semester ? s.semester : undefined,
    view: s.view === 'list' ? 'list' : undefined,
    sort: sorts.some((x) => x.value === s.sort) && s.sort !== 'schedule' ? (s.sort as Sort) : undefined,
    focus: s.focus === 'today' || s.focus === 'attention' || s.focus === 'tasks' ? s.focus : undefined,
  }),
  component: CoursesPage,
})

const needsAttention = (c: Course) => c.attendance.level !== 'safe'
const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))

/** ISO weekday (1 = Senin) of a YYYY-MM-DD date. */
function isoDay(date: string): number {
  return ((parseLocalDate(date).getDay() + 6) % 7) + 1
}

/** Minutes from the start of this week (Monday 00:00) to the course's next slot; courses without slots go last. */
function weekPosition(c: Course, today: number): number {
  if (c.schedules.length === 0) return Number.MAX_SAFE_INTEGER
  return Math.min(...c.schedules.map((s) => ((s.day_of_week - today + 7) % 7) * 1440 + toMinutes(s.start_time)))
}

function CoursesPage() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const semesters = useQuery(semestersQuery)
  const selected = search.semester ?? semesters.data?.find((s) => s.is_active)?.id ?? semesters.data?.[0]?.id ?? ''
  const semester = semesters.data?.find((s) => s.id === selected)
  const courses = useQuery(coursesQuery(selected))
  const { timeZone } = useAppSettings()
  const now = useNow()
  const [query, setQuery] = useState('')

  const view = search.view ?? 'grid'
  const sort = search.sort ?? 'schedule'
  const focus = search.focus ?? 'all'
  const todayDay = isoDay(localDate(now, timeZone))
  const hm = localTime(now, timeZone)

  const stats = useMemo(() => {
    const list = courses.data ?? []
    const pcts = list.map((c) => c.attendance.percentage).filter((p): p is number => p !== null)
    return {
      count: list.length,
      credits: list.reduce((sum, c) => sum + c.credits, 0),
      avgAttendance: pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null,
      attention: list.filter(needsAttention).length,
      today: list.filter((c) => c.schedules.some((s) => s.day_of_week === todayDay)).length,
      tasks: list.filter((c) => c.open_task_count > 0).length,
    }
  }, [courses.data, todayDay])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = (courses.data ?? []).filter((c) => {
      if (focus === 'today' && !c.schedules.some((s) => s.day_of_week === todayDay)) return false
      if (focus === 'attention' && !needsAttention(c)) return false
      if (focus === 'tasks' && c.open_task_count === 0) return false
      return !q || [c.name, c.code, c.lecturer].some((v) => v.toLowerCase().includes(q))
    })
    const byName = (a: Course, b: Course) => a.name.localeCompare(b.name, 'id')
    const cmp: Record<Sort, (a: Course, b: Course) => number> = {
      schedule: (a, b) => weekPosition(a, todayDay) - weekPosition(b, todayDay) || byName(a, b),
      name: byName,
      credits: (a, b) => b.credits - a.credits || byName(a, b),
      attendance: (a, b) => (a.attendance.percentage ?? 101) - (b.attendance.percentage ?? 101) || byName(a, b),
      tasks: (a, b) => b.open_task_count - a.open_task_count || byName(a, b),
    }
    return [...list].sort(cmp[sort])
  }, [courses.data, focus, query, sort, todayDay])

  if (semesters.data === undefined) {
    return semesters.isError ? <ErrorState error={semesters.error} onRetry={() => void semesters.refetch()} /> : <LoadingList />
  }
  if (semesters.data.length === 0) {
    return (
      <>
        <PageHeader title="Matkul" />
        <EmptyState
          icon={<CalendarPlusIcon />}
          title="Belum ada semester"
          description="Matkul selalu masuk ke sebuah semester."
          action={
            <Button asChild>
              <Link to="/semester">Buat semester</Link>
            </Button>
          }
        />
      </>
    )
  }

  const setSearch = (patch: Partial<{ view: View; sort: Sort; focus: Focus }>) =>
    void navigate({
      search: (prev) => ({
        ...prev,
        ...('view' in patch ? { view: patch.view === 'grid' ? undefined : patch.view } : {}),
        ...('sort' in patch ? { sort: patch.sort === 'schedule' ? undefined : patch.sort } : {}),
        ...('focus' in patch ? { focus: patch.focus === 'all' ? undefined : patch.focus } : {}),
      }),
      replace: true,
    })

  const focusOptions: { value: Focus; label: string; count?: number; icon?: React.ComponentType<{ className?: string }> }[] = [
    { value: 'all', label: 'Semua', count: stats.count },
    { value: 'today', label: 'Kuliah hari ini', count: stats.today, icon: ClockIcon },
    { value: 'attention', label: 'Perlu perhatian', count: stats.attention, icon: TriangleAlertIcon },
    { value: 'tasks', label: 'Ada tugas', count: stats.tasks, icon: ListTodoIcon },
  ]

  return (
    <div className="mx-auto max-w-[96rem]">
      <CoursesHeader
        semesters={semesters.data}
        selected={selected}
        onSemester={(id) => void navigate({ search: (prev) => ({ ...prev, semester: id }) })}
        stats={courses.data ? stats : undefined}
      />

      {/* Toolbar: highlight, sort, view, search */}
      <div className="mb-6 flex flex-col gap-2.5 xl:flex-row xl:items-center">
        <div role="group" aria-label="Sorot matkul" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 py-0.5 md:mx-0 md:px-0">
          {focusOptions.map((f) => {
            const on = focus === f.value
            const warn = f.value === 'attention' && (f.count ?? 0) > 0
            return (
              <button
                key={f.value}
                type="button"
                aria-pressed={on}
                onClick={() => setSearch({ focus: f.value })}
                className={cn(
                  'inline-flex h-11 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-semibold whitespace-nowrap shadow-xs ring-1 transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none',
                  on
                    ? 'bg-primary text-primary-foreground ring-transparent'
                    : 'bg-card text-muted-foreground ring-black/[0.04] hover:text-foreground dark:ring-white/[0.06]',
                )}
              >
                {f.icon && <f.icon className={cn('size-4', !on && warn && 'text-orange-500')} aria-hidden />}
                {f.label}
                {f.count !== undefined && (
                  <span
                    className={cn(
                      'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[0.7rem] font-bold tabular-nums',
                      on ? 'bg-primary-foreground/15' : warn ? 'bg-orange-400 text-[#2b1400]' : 'bg-foreground/[0.07]',
                    )}
                  >
                    {f.count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        <div className="flex min-w-0 flex-1 gap-2.5 xl:justify-end">
          <label className="relative min-w-0 flex-1 xl:max-w-xs">
            <span className="sr-only">Cari matkul</span>
            <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari matkul"
              title="Cari nama matkul, kode, atau dosen"
              className="h-11 w-full rounded-full bg-card pr-4 pl-10 text-base shadow-xs ring-1 ring-black/[0.04] outline-none placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/30 md:text-sm dark:ring-white/[0.06]"
            />
          </label>

          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={`Urutkan: ${sorts.find((s) => s.value === sort)?.label}`}
              className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-card px-4 text-sm font-semibold shadow-xs ring-1 ring-black/[0.04] outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/40 dark:ring-white/[0.06]"
            >
              <ArrowDownWideNarrowIcon className="size-4" aria-hidden />
              <span className="hidden sm:inline">Urutkan</span>
              <ChevronDownIcon className="size-4 opacity-60" aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-64">
              {sorts.map((s) => (
                <DropdownMenuItem key={s.value} onSelect={() => setSearch({ sort: s.value })}>
                  <span className="flex-1">{s.label}</span>
                  {sort === s.value && (
                    <>
                      <CheckIcon aria-hidden />
                      <span className="sr-only">(dipilih)</span>
                    </>
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <div role="group" aria-label="Tampilan" className="flex shrink-0 gap-1 rounded-full bg-card p-1 shadow-xs ring-1 ring-black/[0.04] dark:ring-white/[0.06]">
            {(
              [
                ['grid', 'Kartu', LayoutGridIcon],
                ['list', 'Daftar', ListIcon],
              ] as const
            ).map(([v, label, Icon]) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                aria-label={label}
                title={label}
                onClick={() => setSearch({ view: v })}
                className={cn(
                  'inline-flex size-9 items-center justify-center rounded-full transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none',
                  view === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="size-4" />
              </button>
            ))}
          </div>
        </div>
      </div>

      {courses.data === undefined ? (
        courses.isError ? <ErrorState error={courses.error} onRetry={() => void courses.refetch()} /> : <LoadingList />
      ) : courses.data.length === 0 ? (
        <EmptyState
          icon={<BookOpenIcon />}
          title={`Belum ada matkul di ${semester?.name ?? 'semester ini'}`}
          description="Tambahkan matkul beserta jadwalnya. Pertemuan, komponen nilai, dan absen langsung siap."
          action={
            <Button asChild>
              <Link to="/matkul/baru" search={{ semester: selected }}>
                Tambah matkul
              </Link>
            </Button>
          }
        />
      ) : shown.length === 0 ? (
        <EmptyState
          icon={<SearchXIcon />}
          title="Tidak ada matkul yang cocok"
          description={query.trim() ? `Tidak ada matkul dengan kata "${query.trim()}".` : 'Coba pilih sorotan lain.'}
        />
      ) : view === 'grid' ? (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {shown.map((c) => (
            <CourseCard key={c.id} course={c} todayDay={todayDay} hm={hm} />
          ))}
          {focus === 'all' && !query.trim() && (
            <li>
              <Link
                to="/matkul/baru"
                search={{ semester: selected }}
                className="flex h-full min-h-48 flex-col items-center justify-center gap-3 rounded-[1.75rem] border-2 border-dashed border-foreground/15 p-5 text-sm font-semibold text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
              >
                <span className="flex size-12 items-center justify-center rounded-full bg-card shadow-xs">
                  <PlusIcon className="size-5" aria-hidden />
                </span>
                Tambah matkul
              </Link>
            </li>
          )}
        </ul>
      ) : (
        <CourseTable courses={shown} todayDay={todayDay} hm={hm} />
      )}
    </div>
  )
}

// --------------------------------------------------------------- header

type Stats = { count: number; credits: number; avgAttendance: number | null; attention: number }

/** Page header card: semester picker, title, and the semester's numbers. */
function CoursesHeader({
  semesters,
  selected,
  onSemester,
  stats,
}: {
  semesters: Schemas['Semester'][]
  selected: string
  onSemester: (id: string) => void
  stats?: Stats
}) {
  const current = semesters.find((s) => s.id === selected)
  return (
    <header className="relative mb-5 overflow-hidden rounded-[2rem] bg-hero p-5 text-hero-foreground md:p-6">
      <div aria-hidden className="dot-grid absolute inset-0 text-white/[0.05]" />
      <span aria-hidden className="absolute -top-24 -right-16 size-60 rounded-full bg-brand/10 blur-3xl" />

      <div className="relative grid gap-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:gap-10">
        <div className="min-w-0 md:col-start-1 md:row-start-1">
          {semesters.length > 1 ? (
            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex h-8 items-center gap-1.5 rounded-full bg-white/10 px-3 text-xs font-semibold outline-none hover:bg-white/15 focus-visible:ring-[3px] focus-visible:ring-white/40">
                <span aria-hidden className={cn('size-2 rounded-full', current?.is_active ? 'bg-brand' : 'bg-white/40')} />
                {current?.name ?? 'Pilih semester'}
                <ChevronDownIcon className="size-3.5 opacity-70" aria-hidden />
                <span className="sr-only">, ganti semester</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-60">
                {semesters.map((s) => (
                  <DropdownMenuItem key={s.id} onSelect={() => onSemester(s.id)}>
                    <span aria-hidden className={cn('size-2 shrink-0 rounded-full', s.is_active ? 'bg-brand' : 'bg-foreground/25')} />
                    <span className="flex-1">
                      {s.name}
                      {s.is_active && <span className="ml-1.5 text-xs text-muted-foreground">aktif</span>}
                    </span>
                    {s.id === selected && <CheckIcon aria-hidden />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            current && (
              <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-white/10 px-3 text-xs font-semibold">
                <span aria-hidden className="size-2 rounded-full bg-brand" />
                {current.name}
              </span>
            )
          )}
          <h1 className="mt-2 flex items-center gap-3 text-[2rem] leading-none font-extrabold tracking-tight md:text-[2.5rem]">
            <span aria-hidden className="flex size-11 items-center justify-center rounded-2xl bg-brand text-brand-foreground md:size-12">
              <BookOpenIcon className="size-6" />
            </span>
            Matkul
          </h1>
        </div>

        <dl className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4 md:col-span-2 md:col-start-1 md:row-start-2 lg:col-span-1 lg:col-start-2 lg:row-start-1 lg:ml-auto lg:w-full lg:max-w-3xl">
          <HeaderStat label="Matkul" value={stats?.count} accent="text-brand" />
          <HeaderStat label="Total SKS" value={stats?.credits} />
          <HeaderStat
            label="Rata-rata hadir"
            value={stats ? (stats.avgAttendance === null ? '-' : `${formatNumber(stats.avgAttendance, 0)}%`) : undefined}
          />
          <HeaderStat label="Perlu perhatian" value={stats?.attention} alert={!!stats && stats.attention > 0} />
        </dl>

        <Button variant="brand" asChild className="hidden md:col-start-2 md:row-start-1 md:inline-flex lg:col-start-3">
          <Link to="/matkul/baru" search={{ semester: selected }}>
            <PlusIcon /> Tambah matkul
          </Link>
        </Button>
      </div>
    </header>
  )
}

function HeaderStat({ label, value, accent, alert }: { label: string; value?: React.ReactNode; accent?: string; alert?: boolean }) {
  return (
    <div className={cn('rounded-2xl bg-white/[0.06] px-3.5 py-2.5 ring-1 ring-white/[0.06] md:px-4', alert && 'bg-[#ff6b4a]/15 ring-[#ff6b4a]/40')}>
      <dt className="flex items-center gap-1 text-[0.7rem] font-semibold whitespace-nowrap text-hero-foreground/65 md:text-xs">
        {alert && <TriangleAlertIcon className="size-3.5 text-[#ff8f73]" aria-hidden />}
        {label}
      </dt>
      <dd className={cn('mt-0.5 text-2xl leading-tight font-extrabold tracking-tight tabular-nums md:text-[1.75rem]', accent, alert && 'text-[#ff8f73]')}>
        {value ?? '-'}
      </dd>
    </div>
  )
}

// ----------------------------------------------------------------- items

/** Today's slot for a course: running now, later today, or already over. */
function todaySlot(c: Course, todayDay: number, hm: string) {
  const slot = c.schedules.filter((s) => s.day_of_week === todayDay).sort((a, b) => a.start_time.localeCompare(b.start_time)).find((s) => s.end_time > hm)
  if (slot) return { slot, now: slot.start_time <= hm }
  const any = c.schedules.find((s) => s.day_of_week === todayDay)
  return any ? { slot: any, over: true as const } : undefined
}

function TodayBadge({ course, todayDay, hm }: { course: Course; todayDay: number; hm: string }) {
  const t = todaySlot(course, todayDay, hm)
  if (!t) return null
  const label = 'over' in t ? `Hari ini ${t.slot.start_time} (selesai)` : t.now ? `Berlangsung s.d. ${t.slot.end_time}` : `Hari ini ${t.slot.start_time}`
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap',
        'over' in t ? 'bg-card/60 text-muted-foreground' : 'bg-brand text-brand-foreground',
      )}
    >
      {!('over' in t) && t.now ? <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-current" /> : <ClockIcon className="size-3" aria-hidden />}
      {label}
    </span>
  )
}

const attentionRing: Record<Schemas['AttendanceLevel'], string> = {
  safe: '',
  warning: 'ring-2 ring-amber-400/70',
  critical: 'ring-2 ring-red-500/70',
  exceeded: 'ring-2 ring-red-500',
}

const chip = 'tint-border inline-flex items-center rounded-full border bg-card/60 px-2.5 py-0.5 text-xs font-semibold'

function GradeBubble({ course: c, className }: { course: Course; className?: string }) {
  const letter = c.grade.official_letter ?? c.grade.letter
  return (
    <span
      className={cn(
        'flex size-12 shrink-0 flex-col items-center justify-center rounded-full leading-none',
        letter ? 'bg-card shadow-xs' : 'border-2 border-dashed border-foreground/20 text-muted-foreground',
        className,
      )}
      title={c.grade.official_letter ? 'Huruf resmi KHS' : c.grade.is_final ? 'Huruf akhir' : 'Huruf sementara'}
    >
      <span aria-hidden className={letter ? 'text-lg font-extrabold' : 'text-[0.6rem] font-bold uppercase'}>
        {letter ?? 'Nilai'}
      </span>
      <span aria-hidden className="mt-0.5 text-[0.6rem] font-bold text-muted-foreground uppercase">
        {c.grade.official_letter ? 'KHS' : letter && !c.grade.is_final ? 'sem.' : letter ? '' : '?'}
      </span>
      <span className="sr-only">
        {letter ? `Nilai ${letter}${c.grade.official_letter ? ' dari KHS' : c.grade.is_final ? '' : ' sementara'}` : 'Belum ada nilai'}
      </span>
    </span>
  )
}

function CourseCard({ course: c, todayDay, hm }: { course: Course; todayDay: number; hm: string }) {
  const a = c.attendance
  return (
    <li>
      <Link
        to="/matkul/$courseId"
        params={{ courseId: c.id }}
        style={courseStyle(c.color)}
        className={cn('tint-bg group flex h-full flex-col rounded-[1.75rem] p-5 transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-lg', attentionRing[a.level])}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {c.code && <span className={chip}>#{c.code}</span>}
            <span className={chip}>{c.credits} SKS</span>
            <TodayBadge course={c} todayDay={todayDay} hm={hm} />
          </div>
          <GradeBubble course={c} />
        </div>

        <h2 className="tint-ink mt-3 text-xl leading-tight font-extrabold tracking-tight group-hover:underline">{c.name}</h2>
        {c.lecturer && <p className="mt-1 truncate text-sm font-medium text-foreground/70">{c.lecturer}</p>}
        <p className="mt-0.5 text-sm text-foreground/60">{scheduleSummary(c.schedules)}</p>

        <div className="mt-auto pt-5">
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="font-semibold">Kehadiran</span>
            <span className="tint-ink font-extrabold tabular-nums">{a.percentage === null ? '-' : `${formatNumber(a.percentage, 0)}%`}</span>
          </div>
          <AttendanceDots attendance={a} color={c.color} className="mt-2" />
          <p className="sr-only">{attendanceSummaryText(a)}</p>
          <div className="mt-4 flex flex-wrap items-center gap-1.5 text-xs">
            <LevelBadge level={a.level} />
            {a.total > 0 && (
              <span className="rounded-full bg-card/60 px-2.5 py-0.5 font-semibold">
                {a.remaining_absences >= 0 ? `Sisa bolos ${a.remaining_absences}` : `Lewat ${-a.remaining_absences} bolos`}
              </span>
            )}
            {c.open_task_count > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-card/60 px-2.5 py-0.5 font-semibold">
                <ListTodoIcon className="size-3" aria-hidden />
                {c.open_task_count} tugas
              </span>
            )}
            {c.grade.current_score !== null && (
              <span className="rounded-full bg-card/60 px-2.5 py-0.5 font-semibold tabular-nums">Nilai {formatNumber(c.grade.current_score)}</span>
            )}
          </div>
        </div>
      </Link>
    </li>
  )
}

const levelBar: Record<Schemas['AttendanceLevel'], string> = {
  safe: 'bg-emerald-500',
  warning: 'bg-amber-400',
  critical: 'bg-red-500',
  exceeded: 'bg-red-600',
}

const listCols = 'lg:grid-cols-[minmax(0,2.4fr)_minmax(0,1.6fr)_4rem_minmax(0,1.5fr)_5rem_3.5rem]'

/** Dense list: one row per course with schedule, credits, attendance, open tasks, and grade. */
function CourseTable({ courses, todayDay, hm }: { courses: Course[]; todayDay: number; hm: string }) {
  return (
    <div className="rounded-[1.75rem] bg-foreground/[0.035] p-2 md:p-2.5 dark:bg-white/[0.03]">
      <div aria-hidden className={cn('hidden gap-4 px-5 pt-2 pb-2.5 text-[0.7rem] font-bold tracking-[0.12em] text-muted-foreground uppercase lg:grid', listCols)}>
        <span>Matkul</span>
        <span>Jadwal</span>
        <span>SKS</span>
        <span>Kehadiran</span>
        <span>Tugas</span>
        <span className="text-center">Nilai</span>
      </div>
      <ul className="grid gap-2">
        {courses.map((c) => {
          const a = c.attendance
          return (
            <li key={c.id}>
              <Link
                to="/matkul/$courseId"
                params={{ courseId: c.id }}
                style={courseStyle(c.color)}
                className={cn(
                  'group relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 overflow-hidden rounded-[1.25rem] bg-card py-3.5 pr-4 pl-5 shadow-xs ring-1 ring-black/[0.04] transition-shadow hover:shadow-md dark:ring-white/[0.06]',
                  listCols,
                  attentionRing[a.level],
                )}
              >
                <span aria-hidden className="tint-solid absolute inset-y-0 left-0 w-1.5" />

                <div className="min-w-0">
                  <p className="flex items-center gap-2">
                    <span className="truncate font-bold group-hover:underline">{c.name}</span>
                    <span className="hidden sm:inline-flex">
                      <TodayBadge course={c} todayDay={todayDay} hm={hm} />
                    </span>
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[c.code && `#${c.code}`, c.lecturer].filter(Boolean).join(' · ') || 'Tanpa kode'}
                    <span className="lg:hidden"> · {c.credits} SKS</span>
                  </p>
                </div>

                <div className="col-start-2 row-span-2 row-start-1 lg:hidden">
                  <GradeBubble course={c} className="size-11" />
                </div>

                <p className="min-w-0 text-sm text-muted-foreground lg:text-foreground/80">
                  <span className="sr-only">Jadwal: </span>
                  {c.schedules.length === 0 ? (
                    'Belum ada jadwal'
                  ) : (
                    <span className="flex flex-col">
                      {c.schedules.map((s) => (
                        <span key={s.id} className={cn('truncate tabular-nums', s.day_of_week === todayDay && 'font-bold text-foreground')}>
                          {dayShort[s.day_of_week]} {s.start_time}-{s.end_time}
                          {s.room && <span className="text-muted-foreground"> · {s.room}</span>}
                        </span>
                      ))}
                    </span>
                  )}
                </p>

                <p className="hidden text-sm font-bold tabular-nums lg:block">
                  <span className="sr-only">SKS: </span>
                  {c.credits}
                </p>

                <div className="col-span-2 flex min-w-0 items-center gap-2.5 lg:col-span-1">
                  <span className="sr-only">Kehadiran: {attendanceSummaryText(a)}</span>
                  <span aria-hidden className="block h-2 min-w-12 flex-1 overflow-hidden rounded-full bg-foreground/10">
                    <span className={cn('block h-full rounded-full', levelBar[a.level])} style={{ width: `${Math.min(100, a.percentage ?? 0)}%` }} />
                  </span>
                  <span aria-hidden className="w-10 shrink-0 text-right text-sm font-extrabold tabular-nums">
                    {a.percentage === null ? '-' : `${formatNumber(a.percentage, 0)}%`}
                  </span>
                  <LevelBadge level={a.level} className="shrink-0" />
                  {c.open_task_count > 0 && (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold lg:hidden">
                      <ListTodoIcon className="size-3" aria-hidden />
                      {c.open_task_count}
                    </span>
                  )}
                </div>

                <p className="hidden text-sm font-semibold lg:block">
                  {c.open_task_count > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs">
                      <ListTodoIcon className="size-3" aria-hidden />
                      {c.open_task_count} tugas
                    </span>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </p>

                <div className="hidden justify-center lg:flex">
                  <GradeBubble course={c} className="size-11" />
                </div>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
