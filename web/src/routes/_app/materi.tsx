import { useQueries, useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { format } from 'date-fns'
import { id as localeId } from 'date-fns/locale'
import {
  ArrowDownWideNarrowIcon,
  BookOpenIcon,
  CalendarDaysIcon,
  CheckIcon,
  ChevronDownIcon,
  FolderOpenIcon,
  LayersIcon,
  LayoutGridIcon,
  PlusIcon,
  SearchIcon,
  SearchXIcon,
  XIcon,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type * as React from 'react'

import type { Course, Material, Meeting } from '@/api/client'
import { coursesQuery, materialsQuery, meetingsQuery } from '@/api/queries'
import { CoursePicker, EmptyState, ErrorState, LoadingList } from '@/components/common'
import { AddMaterialForm, kindIcon, MaterialCard, useMaterialActions, type MaterialActions } from '@/components/materials'
import { HeroBar, heroChipClass, HeroStat, PageHero } from '@/components/page-hero'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/misc'
import { localDate, parseLocalDate } from '@/lib/dates'
import { useActiveSemester, useAppSettings, useDebounced, useNow } from '@/lib/hooks'
import { materialKindLabel, meetingKindLabel } from '@/lib/labels'
import {
  addedThisWeek,
  examScopeLabel,
  groupByCourse,
  groupByMeeting,
  isExamScope,
  isNamedScope,
  kindCounts,
  matchesMeeting,
  materialSortLabel,
  midtermCutoff,
  sortMaterials,
  type MaterialKind,
  type MaterialSort,
  type MeetingFilter,
} from '@/lib/materials'
import { cn, courseStyle } from '@/lib/utils'

type View = 'group' | 'list'

type Search = {
  q?: string
  course?: string
  kind?: MaterialKind
  meeting?: MeetingFilter
  sort?: MaterialSort
  view?: View
}

const kinds: MaterialKind[] = ['file', 'link', 'note']
const sorts: MaterialSort[] = ['relevance', 'newest', 'oldest', 'title', 'meeting']
const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined)

export const Route = createFileRoute('/_app/materi')({
  validateSearch: (s: Record<string, unknown>): Search => ({
    q: str(s.q),
    course: str(s.course),
    kind: kinds.includes(s.kind as MaterialKind) ? (s.kind as MaterialKind) : undefined,
    meeting: str(s.meeting),
    sort: sorts.includes(s.sort as MaterialSort) ? (s.sort as MaterialSort) : undefined,
    view: s.view === 'list' ? 'list' : undefined,
  }),
  component: MaterialsPage,
})

type Adding = { courseId?: string; meetingId?: string }

function MaterialsPage() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const { active, isPending: semPending } = useActiveSemester()
  const courses = useQuery(coursesQuery(active?.id ?? ''))
  const courseList = useMemo(() => courses.data ?? [], [courses.data])
  const { timeZone } = useAppSettings()
  const now = useNow()
  const { actions, dialogs } = useMaterialActions()
  const [adding, setAdding] = useState<Adding | null>(null)

  const [text, setText] = useState(search.q ?? '')
  const q = useDebounced(text.trim(), 300)
  useEffect(() => {
    if ((search.q ?? '') !== q) void navigate({ search: (prev) => ({ ...prev, q: q || undefined }), replace: true })
  }, [q, search.q, navigate])

  // Unfiltered list for the header and per-course counts; the same request as
  // the filtered one when no course or text filter is set.
  const all = useQuery({ ...materialsQuery({}), enabled: !!active })
  const materials = useQuery({ ...materialsQuery({ course_id: search.course, q: q || undefined }), enabled: !!active })

  // Meetings: the selected course for group headers and the meeting picker, or
  // every course when filtering by exam scope.
  const exam = isExamScope(search.meeting)
  const meetingCourseIds = search.course ? [search.course] : exam ? courseList.map((c) => c.id) : []
  const meetingQueries = useQueries({ queries: meetingCourseIds.map((id) => meetingsQuery(id)) })
  const meetingsByCourse = new Map<string, Meeting[]>()
  meetingCourseIds.forEach((id, i) => {
    const data = meetingQueries[i]?.data
    if (data) meetingsByCourse.set(id, data)
  })
  const cutoffs = new Map([...meetingsByCourse].map(([id, list]) => [id, midtermCutoff(list)]))
  const meetingsPending = exam && meetingQueries.some((m) => m.isPending)

  const sort: MaterialSort = search.sort === 'relevance' && !q ? 'newest' : (search.sort ?? (q ? 'relevance' : 'newest'))
  const view = search.view ?? 'group'
  const base = materials.data ?? []
  const inMeeting = base.filter((m) => matchesMeeting(m, search.meeting, cutoffs))
  const counts = kindCounts(inMeeting)
  const shown = sortMaterials(search.kind ? inMeeting.filter((m) => m.kind === search.kind) : inMeeting, sort)
  const unlinked = exam ? base.filter((m) => m.meeting_id === null).length : 0

  const total = all.data?.length ?? 0
  const perCourse = useMemo(() => {
    const map: Record<string, number> = {}
    for (const m of all.data ?? []) map[m.course_id] = (map[m.course_id] ?? 0) + 1
    return map
  }, [all.data])

  const filtered = !!(search.course || search.kind || search.meeting || q)
  const setSearch = (patch: Partial<Search>) => void navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true })
  const setCourse = (course: string | undefined) =>
    void navigate({
      // A single meeting belongs to one course, so drop it when the course changes.
      search: (prev) => ({ ...prev, course, meeting: isNamedScope(prev.meeting) ? prev.meeting : undefined }),
    })
  const reset = () => {
    setText('')
    void navigate({ search: (prev) => ({ q: prev.q, sort: prev.sort, view: prev.view }) })
  }

  // "/" focuses the search box, like on most sites with search.
  const searchRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return
      if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) return
      e.preventDefault()
      searchRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const selectedCourse = courseList.find((c) => c.id === search.course)
  const courseMeetings = search.course ? meetingsByCourse.get(search.course) : undefined
  const openAdd = (a: Adding = {}) => setAdding({ courseId: a.courseId ?? search.course, meetingId: a.meetingId })

  let body: React.ReactNode
  if (semPending || (active && (courses.data === undefined || materials.data === undefined || all.data === undefined))) {
    const err = courses.error ?? materials.error ?? all.error
    body = err ? (
      <ErrorState
        error={err}
        onRetry={() => {
          void courses.refetch()
          void materials.refetch()
          void all.refetch()
        }}
      />
    ) : (
      <LoadingList />
    )
  } else if (!active) {
    body = (
      <EmptyState
        icon={<FolderOpenIcon />}
        title="Belum ada semester aktif"
        description="Materi dikelompokkan per matkul di semester aktif."
        action={
          <Button asChild>
            <Link to="/semester">Buka semester</Link>
          </Button>
        }
      />
    )
  } else if (courseList.length === 0) {
    body = (
      <EmptyState
        icon={<BookOpenIcon />}
        title="Belum ada matkul"
        description="Materi selalu masuk ke sebuah matkul. Tambahkan matkul dulu."
        action={
          <Button asChild>
            <Link to="/matkul/baru">Tambah matkul</Link>
          </Button>
        }
      />
    )
  } else if (total === 0) {
    body = (
      <EmptyState
        icon={<FolderOpenIcon />}
        title="Belum ada materi"
        description="Simpan slide, link Drive atau Moodle, dan catatan kuliah supaya gampang dicari pas UTS dan UAS."
        action={<Button onClick={() => openAdd()}>Tambah materi</Button>}
      />
    )
  } else if (meetingsPending) {
    body = <LoadingList />
  } else if (shown.length === 0) {
    body = (
      <EmptyState
        icon={<SearchXIcon />}
        title="Tidak ada materi yang cocok"
        description={
          q
            ? `Tidak ada materi dengan kata "${q}" untuk filter ini.`
            : exam
              ? `${examScopeLabel[search.meeting as 'uts' | 'uas']} dihitung dari pertemuan yang ditautkan ke materi.`
              : 'Coba ganti atau hapus filter.'
        }
        action={
          <Button variant="outline" onClick={reset}>
            <XIcon /> Hapus filter
          </Button>
        }
      />
    )
  } else if (view === 'list') {
    body = (
      <ul className={cn('grid gap-2.5 md:grid-cols-2 2xl:grid-cols-3', materials.isPlaceholderData && 'opacity-60')}>
        {shown.map((m) => (
          <MaterialCard key={m.id} material={m} actions={actions} now={now} timeZone={timeZone} showCourse={!search.course} />
        ))}
      </ul>
    )
  } else if (search.course) {
    body = (
      <ol className={cn(masonry, materials.isPlaceholderData && 'opacity-60')}>
        {groupByMeeting(shown).map((g) => (
          <MeetingGroup
            key={g.key}
            meeting={courseMeetings?.find((m) => m.id === g.key)}
            number={g.items[0]?.meeting_number ?? null}
            items={g.items}
            today={localDate(now, timeZone)}
            actions={actions}
            now={now}
            timeZone={timeZone}
            onAdd={() => openAdd({ meetingId: g.key === 'none' ? undefined : g.key })}
          />
        ))}
      </ol>
    )
  } else {
    body = (
      <ol className={cn(masonry, materials.isPlaceholderData && 'opacity-60')}>
        {groupByCourse(shown).map((g) => (
          <CourseGroup
            key={g.key}
            course={courseList.find((c) => c.id === g.key) ?? g.items[0].course}
            items={g.items}
            actions={actions}
            now={now}
            timeZone={timeZone}
            onAdd={() => openAdd({ courseId: g.key })}
          />
        ))}
      </ol>
    )
  }

  const ready = !!active && courseList.length > 0 && total > 0

  return (
    <div className="mx-auto max-w-[96rem]">
      <MaterialsHeader
        semester={active?.name}
        materials={all.data}
        courses={courseList}
        now={now}
        canAdd={courseList.length > 0}
        onAdd={() => openAdd()}
      />

      {ready && (
        <div className="mb-6 grid gap-2.5">
          <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center">
            <KindFilter value={search.kind} counts={counts} onChange={(kind) => setSearch({ kind })} />
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Cari materi</span>
              <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                ref={searchRef}
                type="search"
                enterKeyHint="search"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Cari judul, isi catatan, atau nama file"
                className="peer h-11 w-full rounded-full bg-card pr-12 pl-10 text-base shadow-xs ring-1 ring-black/[0.04] outline-none placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/30 md:text-sm dark:ring-white/[0.06]"
              />
              <kbd
                aria-hidden
                className="pointer-events-none absolute top-1/2 right-4 hidden h-6 -translate-y-1/2 items-center rounded-md bg-muted px-2 font-sans text-xs font-bold text-muted-foreground peer-focus:hidden lg:inline-flex"
              >
                /
              </kbd>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex w-full min-w-0 gap-2 sm:w-auto">
              <CoursePicker
                courses={courseList}
                value={search.course}
                onChange={setCourse}
                counts={perCourse}
                countLabel="materi"
                className="min-w-0 flex-1 sm:flex-none"
              />
              <MeetingPicker
                value={search.meeting}
                meetings={courseMeetings}
                onChange={(meeting) => setSearch({ meeting })}
                className="min-w-0 flex-1 sm:flex-none"
              />
            </div>
            <SortMenu value={sort} hasQuery={!!q} onChange={(s) => setSearch({ sort: s === (q ? 'relevance' : 'newest') ? undefined : s })} />
            <ViewToggle value={view} grouping={selectedCourse ? 'meeting' : 'course'} onChange={(v) => setSearch({ view: v === 'group' ? undefined : v })} />
            <p className="ml-auto flex min-h-11 items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
              <span>
                <strong className="font-bold text-foreground tabular-nums">{shown.length}</strong>
                {filtered ? ` dari ${total} materi` : ' materi'}
                {unlinked > 0 && ` · ${unlinked} tanpa pertemuan tidak ikut`}
              </span>
              {filtered && (
                <Button variant="ghost" size="sm" onClick={reset}>
                  <XIcon /> Hapus filter
                </Button>
              )}
            </p>
          </div>
        </div>
      )}

      {body}
      {dialogs}

      <Dialog open={adding !== null} onOpenChange={(o) => !o && setAdding(null)}>
        <DialogContent>
          {adding && (
            <AddMaterialForm
              courses={courseList.map((c) => ({ id: c.id, name: c.name, code: c.code, color: c.color }))}
              defaultCourseId={adding.courseId}
              defaultMeetingId={adding.meetingId}
              onDone={() => setAdding(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// --------------------------------------------------------------- header

/** Page header card: semester, title, totals, and how materials spread over courses. */
function MaterialsHeader({
  semester,
  materials,
  courses,
  now,
  canAdd,
  onAdd,
}: {
  semester?: string
  materials?: Material[]
  courses: Course[]
  now: Date
  canAdd: boolean
  onAdd: () => void
}) {
  const stats = useMemo(() => {
    if (!materials) return undefined
    const per = new Map<string, number>()
    for (const m of materials) per.set(m.course_id, (per.get(m.course_id) ?? 0) + 1)
    const spread = courses
      .filter((c) => per.has(c.id))
      .map((c) => ({ id: c.id, name: c.name, color: c.color, count: per.get(c.id) ?? 0 }))
      .sort((a, b) => b.count - a.count)
    return { total: materials.length, week: addedThisWeek(materials, now), covered: spread.length, spread }
  }, [materials, courses, now])
  const top = stats?.spread[0]

  return (
    <PageHero
      icon={FolderOpenIcon}
      title="Materi"
      eyebrow={
        semester && (
          <Link to="/semester" className={cn(heroChipClass, 'transition-colors hover:bg-white/15')}>
            <span aria-hidden className="size-2 rounded-full bg-brand" />
            {semester}
          </Link>
        )
      }
      aside={
        <Button variant="brand" className="px-4" onClick={onAdd} disabled={!canAdd} aria-label="Tambah materi">
          <PlusIcon className="size-5" /> Tambah
        </Button>
      }
      action={
        <Button variant="brand" onClick={onAdd} disabled={!canAdd}>
          <PlusIcon /> Tambah materi
        </Button>
      }
    >
      <dl className="grid grid-cols-3 gap-2">
        <HeroStat label="Total materi" short="Total" value={stats?.total} accent="text-brand" />
        <HeroStat label="Baru minggu ini" short="Minggu ini" value={stats?.week} />
        <HeroStat label="Matkul tercakup" short="Matkul" value={stats ? `${stats.covered}/${courses.length}` : undefined} />
      </dl>
      <HeroBar caption={!stats ? 'Memuat' : top ? `Terbanyak: ${top.name} · ${top.count}` : 'Belum ada materi'}>
        {stats?.spread.map((s) => (
          <span
            key={s.id}
            style={{ ...courseStyle(s.color), width: `${(s.count / stats.total) * 100}%` }}
            className="tint-solid block h-full first:rounded-l-full last:rounded-r-full"
          />
        ))}
      </HeroBar>
    </PageHero>
  )
}

// -------------------------------------------------------------- toolbar

const pill = 'shadow-xs ring-1 ring-black/[0.04] dark:ring-white/[0.06]'

/** Segmented filter by kind with counts that follow the other filters. */
function KindFilter({
  value,
  counts,
  onChange,
}: {
  value?: MaterialKind
  counts: Record<MaterialKind | 'all', number>
  onChange: (kind: MaterialKind | undefined) => void
}) {
  const options: { value?: MaterialKind; label: string }[] = [{ label: 'Semua' }, ...kinds.map((k) => ({ value: k, label: materialKindLabel[k] }))]
  return (
    <div role="group" aria-label="Filter jenis" className={cn('grid grid-cols-4 gap-1 rounded-full bg-card p-1 lg:inline-grid lg:w-auto', pill)}>
      {options.map((o) => {
        const on = value === o.value
        const Icon = o.value ? kindIcon[o.value] : undefined
        return (
          <button
            key={o.label}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={cn(
              'flex h-9 items-center justify-center gap-1.5 rounded-full px-2 text-sm font-semibold whitespace-nowrap transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none sm:px-3.5',
              on ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {Icon && <Icon className="hidden size-4 sm:block" aria-hidden />}
            {o.label}
            <span
              className={cn(
                'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[0.7rem] font-bold tabular-nums',
                on ? 'bg-primary-foreground/15' : 'bg-foreground/[0.07]',
              )}
            >
              {counts[o.value ?? 'all']}
            </span>
          </button>
        )
      })}
    </div>
  )
}

const triggerClass = cn(
  'inline-flex h-11 min-w-0 shrink-0 items-center gap-2 rounded-full bg-card px-4 text-sm font-semibold outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/40',
  pill,
)

function Selected() {
  return (
    <>
      <CheckIcon aria-hidden />
      <span className="sr-only">(dipilih)</span>
    </>
  )
}

/** Exam scope, materials without a meeting, or one meeting of the selected course. */
function MeetingPicker({
  value,
  meetings,
  onChange,
  className,
}: {
  value?: MeetingFilter
  meetings?: Meeting[]
  onChange: (v: MeetingFilter | undefined) => void
  className?: string
}) {
  const withMaterial = meetings?.filter((m) => m.material_count > 0) ?? []
  const one = meetings?.find((m) => m.id === value)
  const label = !value ? (
    <>
      <span className="sm:hidden">Pertemuan</span>
      <span className="hidden sm:inline">Semua pertemuan</span>
    </>
  ) : isNamedScope(value) ? (
    examScopeLabel[value]
  ) : one ? (
    `Pertemuan ${one.number}`
  ) : (
    'Pertemuan'
  )
  const scopes: { value: 'uts' | 'uas' | 'none'; hint: string }[] = [
    { value: 'uts', hint: 'Pertemuan sampai UTS' },
    { value: 'uas', hint: 'Pertemuan setelah UTS' },
    { value: 'none', hint: 'Belum ditautkan ke pertemuan' },
  ]
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={cn(triggerClass, value && 'bg-primary text-primary-foreground ring-transparent hover:bg-primary/85', className)}>
        <CalendarDaysIcon className="size-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-left">{label}</span>
        <ChevronDownIcon className="size-4 shrink-0 opacity-60" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-[min(28rem,70dvh)] w-72 overflow-y-auto">
        <DropdownMenuItem onSelect={() => onChange(undefined)}>
          <span className="flex-1">Semua pertemuan</span>
          {!value && <Selected />}
        </DropdownMenuItem>
        {scopes.map((s) => (
          <DropdownMenuItem key={s.value} onSelect={() => onChange(s.value)}>
            <span className="flex-1 py-1.5">
              <span className="block">{examScopeLabel[s.value]}</span>
              <span className="block text-xs text-muted-foreground">{s.hint}</span>
            </span>
            {value === s.value && <Selected />}
          </DropdownMenuItem>
        ))}
        {withMaterial.length > 0 && (
          <>
            <p className="px-3 pt-3 pb-1 text-[0.7rem] font-bold tracking-[0.12em] text-muted-foreground uppercase">Pertemuan</p>
            {withMaterial.map((m) => (
              <DropdownMenuItem key={m.id} onSelect={() => onChange(m.id)}>
                <span className="w-7 shrink-0 font-bold tabular-nums">{m.number}</span>
                <span className="min-w-0 flex-1 truncate">{m.topic || (m.kind !== 'lecture' ? meetingKindLabel[m.kind] : `Pertemuan ${m.number}`)}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {m.material_count}
                  <span className="sr-only"> materi</span>
                </span>
                {value === m.id && <Selected />}
              </DropdownMenuItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function SortMenu({ value, hasQuery, onChange }: { value: MaterialSort; hasQuery: boolean; onChange: (s: MaterialSort) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={`Urutkan: ${materialSortLabel[value]}`} className={triggerClass}>
        <ArrowDownWideNarrowIcon className="size-4" aria-hidden />
        <span className="hidden sm:inline">Urutkan</span>
        <ChevronDownIcon className="size-4 opacity-60" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-60">
        {sorts
          .filter((s) => hasQuery || s !== 'relevance')
          .map((s) => (
            <DropdownMenuItem key={s} onSelect={() => onChange(s)}>
              <span className="flex-1">{materialSortLabel[s]}</span>
              {value === s && <Selected />}
            </DropdownMenuItem>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function ViewToggle({ value, grouping, onChange }: { value: View; grouping: 'course' | 'meeting'; onChange: (v: View) => void }) {
  const options = [
    ['group', grouping === 'course' ? 'Kelompokkan per matkul' : 'Kelompokkan per pertemuan', LayersIcon],
    ['list', 'Semua kartu', LayoutGridIcon],
  ] as const
  return (
    <div role="group" aria-label="Tampilan" className={cn('flex shrink-0 gap-1 rounded-full bg-card p-1', pill)}>
      {options.map(([v, label, Icon]) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          aria-label={label}
          title={label}
          onClick={() => onChange(v)}
          className={cn(
            'inline-flex size-9 items-center justify-center rounded-full transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none',
            value === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Icon className="size-4" />
        </button>
      ))}
    </div>
  )
}

// --------------------------------------------------------------- groups

/** "3 materi · 2 file · 1 link" */
function groupSummary(items: Material[]): string {
  const c = kindCounts(items)
  return [`${c.all} materi`, ...kinds.filter((k) => c[k] > 0).map((k) => `${c[k]} ${materialKindLabel[k].toLowerCase()}`)].join(' · ')
}

// Panels flow in columns so short groups do not leave gaps under them.
const masonry = 'columns-1 gap-4 lg:columns-2 2xl:columns-3'
const panel = 'mb-4 flex break-inside-avoid flex-col rounded-[1.75rem] bg-foreground/[0.035] p-2.5 md:p-3 dark:bg-white/[0.03]'

function AddInGroup({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button variant="ghost" size="icon" className="shrink-0 bg-card shadow-xs" onClick={onClick} aria-label={label} title={label}>
      <PlusIcon />
    </Button>
  )
}

function CourseGroup({
  course,
  items,
  actions,
  now,
  timeZone,
  onAdd,
}: {
  course: { id: string; name: string; color: string; code?: string }
  items: Material[]
  actions: MaterialActions
  now: Date
  timeZone: string
  onAdd: () => void
}) {
  const headingId = `course-${course.id}`
  return (
    <li aria-labelledby={headingId} className={panel}>
      <div style={courseStyle(course.color)} className="flex items-center gap-3 px-1.5 pt-1 pb-3">
        <span aria-hidden className="tint-bg-strong tint-ink flex size-12 shrink-0 items-center justify-center rounded-2xl">
          <BookOpenIcon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={headingId} className="truncate font-extrabold tracking-tight md:text-[1.05rem]">
            <Link to="/matkul/$courseId" params={{ courseId: course.id }} search={{ tab: 'materi' }} className="hover:underline">
              {course.name}
            </Link>
          </h2>
          <p className="truncate text-sm font-semibold text-muted-foreground">{groupSummary(items)}</p>
        </div>
        <AddInGroup label={`Tambah materi ${course.name}`} onClick={onAdd} />
      </div>
      <ul className="grid grid-cols-1 gap-2.5">
        {items.map((m) => (
          <MaterialCard key={m.id} material={m} actions={actions} now={now} timeZone={timeZone} showCourse={false} />
        ))}
      </ul>
    </li>
  )
}

function MeetingGroup({
  meeting,
  number,
  items,
  today,
  actions,
  now,
  timeZone,
  onAdd,
}: {
  meeting?: Meeting
  number: number | null
  items: Material[]
  today: string
  actions: MaterialActions
  now: Date
  timeZone: string
  onAdd: () => void
}) {
  const none = number === null
  const headingId = `meeting-${meeting?.id ?? 'none'}`
  const isToday = meeting?.date === today
  const exam = meeting && meeting.kind !== 'lecture'
  const title = none ? 'Tanpa pertemuan' : meeting?.topic || `Pertemuan ${number}`
  const when = meeting ? format(parseLocalDate(meeting.date), 'EEE, d MMM', { locale: localeId }) : undefined

  return (
    <li aria-labelledby={headingId} className={cn(panel, isToday && 'bg-brand/[0.12] ring-1 ring-brand/40', exam && !isToday && 'ring-1 ring-orange-400/50')}>
      <div className="flex items-center gap-3 px-1.5 pt-1 pb-3">
        <span
          aria-hidden
          className={cn(
            'flex size-12 shrink-0 flex-col items-center justify-center rounded-2xl leading-none',
            isToday ? 'bg-brand text-brand-foreground' : exam ? 'bg-orange-400 text-[#2b1400]' : 'bg-card shadow-xs ring-1 ring-black/[0.04] dark:ring-white/[0.06]',
          )}
        >
          {none ? (
            <FolderOpenIcon className="size-5" />
          ) : (
            <>
              <span className="text-[0.6rem] font-bold uppercase opacity-75">Pert</span>
              <span className="mt-0.5 text-xl font-extrabold tabular-nums">{number}</span>
            </>
          )}
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={headingId} className="flex min-w-0 items-center gap-2 font-extrabold tracking-tight md:text-[1.05rem]">
            <span className="truncate">{title}</span>
            {exam && <span className="shrink-0 rounded-full bg-orange-400 px-2 py-0.5 text-xs font-bold text-[#2b1400]">{meetingKindLabel[meeting.kind]}</span>}
          </h2>
          <p className="truncate text-sm font-semibold text-muted-foreground">
            {[!none && meeting?.topic ? `Pertemuan ${number}` : undefined, isToday ? 'Hari ini' : when, groupSummary(items)].filter(Boolean).join(' · ')}
          </p>
        </div>
        <AddInGroup label={none ? 'Tambah materi tanpa pertemuan' : `Tambah materi pertemuan ${number}`} onClick={onAdd} />
      </div>
      <ul className="grid grid-cols-1 gap-2.5">
        {items.map((m) => (
          <MaterialCard key={m.id} material={m} actions={actions} now={now} timeZone={timeZone} showCourse={false} showMeeting={false} />
        ))}
      </ul>
    </li>
  )
}
