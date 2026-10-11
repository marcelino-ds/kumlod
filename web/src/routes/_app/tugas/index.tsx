import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ListTodoIcon, PlusIcon } from 'lucide-react'
import { useMemo } from 'react'

import type { TaskStatus } from '@/api/client'
import { coursesQuery, tasksQuery } from '@/api/queries'
import { CourseFilterChips, EmptyState, ErrorState, LoadingList, PageHeader, Section } from '@/components/common'
import { useQuickAdd } from '@/components/QuickAddTask'
import { TaskItem } from '@/components/TaskItem'
import { Button } from '@/components/ui/button'
import { useActiveSemester, useAppSettings, useNow } from '@/lib/hooks'
import { groupTasks } from '@/lib/tasks'
import { cn } from '@/lib/utils'

type StatusFilter = 'open' | 'done' | 'all'

const statusFilters: { value: StatusFilter; label: string; statuses?: TaskStatus[] }[] = [
  { value: 'open', label: 'Belum selesai', statuses: ['todo', 'in_progress'] },
  { value: 'done', label: 'Selesai', statuses: ['submitted', 'graded'] },
  { value: 'all', label: 'Semua' },
]

export const Route = createFileRoute('/_app/tugas/')({
  validateSearch: (s: Record<string, unknown>): { status?: StatusFilter; course?: string } => ({
    status: s.status === 'done' || s.status === 'all' ? s.status : undefined,
    course: typeof s.course === 'string' && s.course ? s.course : undefined,
  }),
  component: TasksPage,
})

function TasksPage() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const status = search.status ?? 'open'
  const filter = statusFilters.find((f) => f.value === status)!
  const { active, isPending: semPending } = useActiveSemester()
  const courses = useQuery(coursesQuery(active?.id ?? ''))
  const tasks = useQuery(tasksQuery({ course_id: search.course, status: filter.statuses }))
  const { timeZone } = useAppSettings()
  const now = useNow()
  const quickAdd = useQuickAdd()
  const groups = useMemo(() => (tasks.data ? groupTasks(tasks.data, now, timeZone) : []), [tasks.data, now, timeZone])
  const setCourse = (course: string | undefined) => void navigate({ search: (prev) => ({ ...prev, course }) })

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow={active?.name}
        title="Tugas"
        description={tasks.data && status === 'open' ? `${tasks.data.length} tugas belum selesai` : undefined}
        actions={
          <Button className="hidden md:inline-flex" onClick={() => quickAdd({ courseId: search.course })}>
            <PlusIcon /> Tambah tugas
          </Button>
        }
      />

      <div className="mb-7 grid gap-3">
        <div role="group" aria-label="Filter status" className="grid grid-cols-3 gap-1 rounded-full bg-card p-1 shadow-xs ring-1 ring-black/[0.03] dark:ring-white/[0.06]">
          {statusFilters.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={status === f.value}
              onClick={() => void navigate({ search: (prev) => ({ ...prev, status: f.value === 'open' ? undefined : f.value }) })}
              className={cn(
                'h-10 rounded-full text-sm font-semibold transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none',
                status === f.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        {courses.data && (
          <CourseFilterChips
            courses={courses.data}
            value={search.course}
            onChange={setCourse}
            counts={Object.fromEntries(courses.data.map((c) => [c.id, c.open_task_count]))}
          />
        )}
      </div>

      {tasks.data === undefined || semPending ? (
        tasks.isError ? <ErrorState error={tasks.error} onRetry={() => void tasks.refetch()} /> : <LoadingList />
      ) : !active ? (
        <EmptyState icon={<ListTodoIcon />} title="Belum ada semester aktif" description="Tugas dikelompokkan per semester. Buat semester dulu." />
      ) : groups.length === 0 ? (
        <EmptyState
          icon={<ListTodoIcon />}
          title={status === 'done' ? 'Belum ada tugas selesai' : 'Tidak ada tugas'}
          description={status === 'open' ? 'Semua beres. Tambah tugas baru lewat tombol +.' : undefined}
        />
      ) : (
        <div className="space-y-8">
          {groups.map((g) => (
            <Section key={g.key} title={g.label} count={g.tasks.length} tone={g.key === 'overdue' ? 'danger' : undefined}>
              <ul className="space-y-2.5">
                {g.tasks.map((t) => (
                  <TaskItem key={t.id} task={t} now={now} timeZone={timeZone} showCourse={!search.course} />
                ))}
              </ul>
            </Section>
          ))}
        </div>
      )}
    </div>
  )
}
