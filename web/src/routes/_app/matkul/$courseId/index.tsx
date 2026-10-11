import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate, useRouter } from '@tanstack/react-router'
import { ArrowLeftIcon, MoreVerticalIcon, PencilIcon, StickyNoteIcon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { courseQuery, useDeleteCourse } from '@/api/queries'
import { AttendanceDots, backLinkClass, ErrorState, LevelBadge, LoadingList, StatTile } from '@/components/common'
import { GradesTab, MaterialsTab, MeetingsTab, TasksTab } from '@/components/course-tabs'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/misc'
import { attendanceSummaryText, scheduleSummary } from '@/lib/labels'
import { courseStyle, formatNumber } from '@/lib/utils'

const tabs = ['pertemuan', 'tugas', 'materi', 'nilai'] as const
type Tab = (typeof tabs)[number]
const tabLabel: Record<Tab, string> = { pertemuan: 'Pertemuan', tugas: 'Tugas', materi: 'Materi', nilai: 'Nilai' }

export const Route = createFileRoute('/_app/matkul/$courseId/')({
  validateSearch: (s: Record<string, unknown>): { tab?: Tab } => ({
    tab: tabs.includes(s.tab as Tab) ? (s.tab as Tab) : undefined,
  }),
  component: CoursePage,
})

const chip = 'inline-flex items-center rounded-full bg-card/70 px-3 py-1 text-xs font-semibold'

function CoursePage() {
  const { courseId } = Route.useParams()
  const { tab = 'pertemuan' } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const router = useRouter()
  const course = useQuery(courseQuery(courseId))
  const remove = useDeleteCourse()
  const [confirmDelete, setConfirmDelete] = useState(false)

  if (course.data === undefined) {
    return course.isError ? <ErrorState error={course.error} onRetry={() => void course.refetch()} /> : <LoadingList rows={5} />
  }
  const c = course.data
  const a = c.attendance
  const letter = c.grade.official_letter ?? c.grade.letter

  return (
    <>
      <Link to="/matkul" search={{ semester: c.semester_id }} className={backLinkClass}>
        <ArrowLeftIcon /> Matkul
      </Link>

      <section style={courseStyle(c.color)} className="tint-bg-strong relative overflow-hidden rounded-[2rem] p-5 md:p-7">
        <div aria-hidden className="tint-solid absolute -top-16 -right-16 size-48 rounded-full opacity-25 md:size-64" />
        <div aria-hidden className="tint-solid absolute top-24 right-10 size-8 rounded-full opacity-40 md:right-28" />

        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap gap-1.5">
              {c.code && <span className={chip}>#{c.code}</span>}
              <span className={chip}>{c.credits} SKS</span>
              {c.lecturer && <span className={chip}>{c.lecturer}</span>}
            </div>
            <h1 className="mt-3 text-[1.85rem] leading-[1.1] font-extrabold tracking-tight text-balance md:text-4xl">{c.name}</h1>
            <p className="mt-2 text-sm font-medium text-foreground/70">{scheduleSummary(c.schedules)}</p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="border-transparent bg-card/80" aria-label="Aksi matkul">
                <MoreVerticalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem asChild>
                <Link to="/matkul/$courseId/edit" params={{ courseId }}>
                  <PencilIcon /> Ubah matkul
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
                <Trash2Icon /> Hapus matkul
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="relative mt-6 grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3">
          <StatTile
            label="Kehadiran"
            value={a.percentage === null ? '-' : `${formatNumber(a.percentage, 0)}%`}
            hint={a.held > 0 ? `${a.present} dari ${a.held} pertemuan` : 'belum mulai'}
          />
          <StatTile
            label="Sisa jatah bolos"
            value={a.remaining_absences}
            valueClassName={a.remaining_absences < 0 ? 'text-destructive' : undefined}
            hint={`dari ${a.max_absences} pertemuan`}
          />
          <StatTile
            label={c.grade.official_letter ? 'Nilai (KHS)' : c.grade.is_final ? 'Nilai akhir' : 'Nilai sementara'}
            value={letter ?? '-'}
            hint={c.grade.current_score !== null ? `skor ${formatNumber(c.grade.current_score)}` : 'belum ada nilai'}
          />
          <StatTile label="Tugas aktif" value={c.open_task_count} hint="belum dikumpulkan" />
        </div>

        <div className="relative mt-3 rounded-2xl bg-card/70 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <LevelBadge level={a.level} />
            <span className="text-sm font-medium">{attendanceSummaryText(a)}</span>
          </div>
          <AttendanceDots attendance={a} color={c.color} className="mt-3" />
          {a.total > 0 && (
            <p className="mt-3 text-xs text-foreground/65">
              Minimal hadir {a.required_present} dari {a.total} pertemuan kuliah ({c.min_attendance_pct}%), jatah bolos {a.max_absences}.
            </p>
          )}
        </div>
      </section>

      {c.notes && (
        <div className="mt-4 flex gap-3 rounded-3xl bg-card p-4 text-sm shadow-xs ring-1 ring-black/[0.03] dark:ring-white/[0.06]">
          <StickyNoteIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <p className="whitespace-pre-wrap">{c.notes}</p>
        </div>
      )}

      <Tabs
        className="mt-6"
        value={tab}
        onValueChange={(v) => void navigate({ search: { tab: v === 'pertemuan' ? undefined : (v as Tab) }, replace: true })}
      >
        <TabsList className="md:w-fit">
          {tabs.map((t) => (
            <TabsTrigger key={t} value={t} className="md:flex-none md:px-6">
              {tabLabel[t]}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="pertemuan">
          <MeetingsTab course={c} />
        </TabsContent>
        <TabsContent value="tugas">
          <TasksTab course={c} />
        </TabsContent>
        <TabsContent value="materi">
          <MaterialsTab course={c} />
        </TabsContent>
        <TabsContent value="nilai">
          <GradesTab course={c} />
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Hapus ${c.name}?`}
        description="Pertemuan, absen, tugas, materi, dan file matkul ini ikut terhapus permanen."
        confirmLabel="Hapus matkul"
        pending={remove.isPending}
        onConfirm={() =>
          remove.mutate(c.id, {
            onSuccess: () => {
              toast.success('Matkul dihapus')
              void router.navigate({ to: '/matkul', search: { semester: c.semester_id } })
            },
          })
        }
      />
    </>
  )
}
