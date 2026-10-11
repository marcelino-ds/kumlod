import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { BookOpenIcon, CalendarPlusIcon, ListTodoIcon, PlusIcon } from 'lucide-react'

import type { Course } from '@/api/client'
import { coursesQuery, semestersQuery } from '@/api/queries'
import { AttendanceDots, EmptyState, ErrorState, LevelBadge, LoadingList, PageHeader } from '@/components/common'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { attendanceSummaryText, scheduleSummary } from '@/lib/labels'
import { cn, courseStyle, formatNumber } from '@/lib/utils'

export const Route = createFileRoute('/_app/matkul/')({
  validateSearch: (s: Record<string, unknown>): { semester?: string } => ({
    semester: typeof s.semester === 'string' && s.semester ? s.semester : undefined,
  }),
  component: CoursesPage,
})

function CoursesPage() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const semesters = useQuery(semestersQuery)
  const selected = search.semester ?? semesters.data?.find((s) => s.is_active)?.id ?? semesters.data?.[0]?.id ?? ''
  const semester = semesters.data?.find((s) => s.id === selected)
  const courses = useQuery(coursesQuery(selected))

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

  const totalCredits = courses.data?.reduce((sum, c) => sum + c.credits, 0) ?? 0

  return (
    <>
      <PageHeader
        eyebrow={semester?.name}
        title="Matkul"
        description={courses.data ? `${courses.data.length} matkul · ${totalCredits} SKS` : undefined}
        actions={
          <Button asChild>
            <Link to="/matkul/baru" search={{ semester: selected }}>
              <PlusIcon /> Tambah
            </Link>
          </Button>
        }
      />
      {semesters.data.length > 1 && (
        <div className="mb-6 flex items-center gap-3">
          <Label htmlFor="course-semester" className="shrink-0 text-muted-foreground">
            Semester
          </Label>
          <NativeSelect
            id="course-semester"
            value={selected}
            onChange={(e) => void navigate({ search: { semester: e.target.value } })}
            className="h-11 rounded-full font-semibold sm:w-72"
          >
            {semesters.data.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.is_active ? ' (aktif)' : ''}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}

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
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {courses.data.map((c) => (
            <CourseCard key={c.id} course={c} />
          ))}
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
        </ul>
      )}
    </>
  )
}

const chip = 'tint-border inline-flex items-center rounded-full border bg-card/60 px-2.5 py-0.5 text-xs font-semibold'

function CourseCard({ course: c }: { course: Course }) {
  const letter = c.grade.official_letter ?? c.grade.letter
  const a = c.attendance
  return (
    <li>
      <Link
        to="/matkul/$courseId"
        params={{ courseId: c.id }}
        style={courseStyle(c.color)}
        className="tint-bg group flex h-full flex-col rounded-[1.75rem] p-5 transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-lg"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {c.code && <span className={chip}>#{c.code}</span>}
            <span className={chip}>{c.credits} SKS</span>
          </div>
          <span
            className={cn(
              'flex size-12 shrink-0 flex-col items-center justify-center rounded-full leading-none',
              letter ? 'bg-card shadow-xs' : 'border-2 border-dashed border-foreground/20 text-muted-foreground',
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
              {letter
                ? `Nilai ${letter}${c.grade.official_letter ? ' dari KHS' : c.grade.is_final ? '' : ' sementara'}`
                : 'Belum ada nilai'}
            </span>
          </span>
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
