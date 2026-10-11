import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeftIcon } from 'lucide-react'

import { CourseForm } from '@/components/CourseForm'
import { backLinkClass, EmptyState, LoadingList, PageHeader } from '@/components/common'
import { Button } from '@/components/ui/button'
import { useActiveSemester, useAppSettings } from '@/lib/hooks'

export const Route = createFileRoute('/_app/matkul/baru')({
  validateSearch: (s: Record<string, unknown>): { semester?: string } => ({
    semester: typeof s.semester === 'string' && s.semester ? s.semester : undefined,
  }),
  component: NewCoursePage,
})

function NewCoursePage() {
  const search = Route.useSearch()
  const { active, data: semesters, isPending } = useActiveSemester()
  const settings = useAppSettings()
  const semesterId = search.semester ?? active?.id
  const semester = semesters?.find((s) => s.id === semesterId)

  return (
    <div className="mx-auto max-w-2xl">
      <Link to="/matkul" search={{ semester: semesterId }} className={backLinkClass}>
        <ArrowLeftIcon /> Matkul
      </Link>
      <PageHeader title="Tambah matkul" description={semester?.name} />
      {isPending || settings.isPending ? (
        <LoadingList rows={4} />
      ) : !semester ? (
        <EmptyState
          title="Pilih semester dulu"
          action={
            <Button asChild>
              <Link to="/semester">Ke halaman semester</Link>
            </Button>
          }
        />
      ) : (
        <CourseForm
          mode="create"
          semesterId={semester.id}
          defaults={{
            totalMeetings: settings.data?.default_total_meetings ?? 16,
            minPct: settings.data?.default_min_attendance_pct ?? 75,
          }}
        />
      )}
    </div>
  )
}
