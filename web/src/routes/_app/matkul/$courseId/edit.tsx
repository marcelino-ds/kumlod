import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeftIcon } from 'lucide-react'

import { courseQuery } from '@/api/queries'
import { CourseForm } from '@/components/CourseForm'
import { backLinkClass, ErrorState, LoadingList, PageHeader } from '@/components/common'
import { useAppSettings } from '@/lib/hooks'

export const Route = createFileRoute('/_app/matkul/$courseId/edit')({
  component: EditCoursePage,
})

function EditCoursePage() {
  const { courseId } = Route.useParams()
  const course = useQuery(courseQuery(courseId))
  const settings = useAppSettings()

  return (
    <div className="mx-auto max-w-2xl">
      <Link to="/matkul/$courseId" params={{ courseId }} className={backLinkClass}>
        <ArrowLeftIcon /> {course.data?.name ?? 'Matkul'}
      </Link>
      <PageHeader title="Ubah matkul" />
      {course.data === undefined ? (
        course.isError ? <ErrorState error={course.error} onRetry={() => void course.refetch()} /> : <LoadingList rows={4} />
      ) : settings.isPending ? (
        <LoadingList rows={4} />
      ) : (
        <CourseForm
          key={course.data.updated_at}
          mode="edit"
          course={course.data}
          letters={settings.data?.grade_scale.map((e) => e.letter) ?? []}
        />
      )}
    </div>
  )
}
