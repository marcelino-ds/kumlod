import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { PlusIcon, SearchIcon } from 'lucide-react'
import { useEffect, useState } from 'react'

import { coursesQuery } from '@/api/queries'
import { CourseFilterChips, EmptyState, PageHeader } from '@/components/common'
import { AddMaterialForm, MaterialList } from '@/components/materials'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useActiveSemester, useDebounced } from '@/lib/hooks'

export const Route = createFileRoute('/_app/materi')({
  validateSearch: (s: Record<string, unknown>): { q?: string; course?: string } => ({
    q: typeof s.q === 'string' && s.q ? s.q : undefined,
    course: typeof s.course === 'string' && s.course ? s.course : undefined,
  }),
  component: MaterialsPage,
})

function MaterialsPage() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const { active, isPending } = useActiveSemester()
  const courses = useQuery(coursesQuery(active?.id ?? ''))
  const [text, setText] = useState(search.q ?? '')
  const q = useDebounced(text.trim(), 300)
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    if ((search.q ?? '') !== q) void navigate({ search: (prev) => ({ ...prev, q: q || undefined }), replace: true })
  }, [q, search.q, navigate])

  const courseList = courses.data ?? []
  const setCourse = (course: string | undefined) => void navigate({ search: (prev) => ({ ...prev, course }) })

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow={active?.name}
        title="Materi"
        description="Semua file, link, dan catatan kuliah di satu tempat."
        actions={
          <Button onClick={() => setAdding(true)} disabled={courseList.length === 0}>
            <PlusIcon /> Tambah
          </Button>
        }
      />
      <div className="mb-7 grid gap-3">
        <div className="relative">
          <Label htmlFor="material-search" className="sr-only">
            Cari materi
          </Label>
          <SearchIcon className="pointer-events-none absolute top-1/2 left-5 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            id="material-search"
            type="search"
            enterKeyHint="search"
            placeholder="Cari judul, isi catatan, atau nama file"
            className="h-14 rounded-full border-transparent pl-13 text-base shadow-xs ring-1 ring-black/[0.03] dark:ring-white/[0.06]"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
        <CourseFilterChips courses={courseList} value={search.course} onChange={setCourse} />
      </div>

      {!isPending && !active ? (
        <EmptyState title="Belum ada semester aktif" description="Materi dikelompokkan per matkul di semester aktif." />
      ) : (
        <MaterialList
          filters={{ course_id: search.course, q: q || undefined }}
          emptyTitle="Belum ada materi"
          emptyAction={
            courseList.length > 0 ? <Button onClick={() => setAdding(true)}>Tambah materi</Button> : undefined
          }
        />
      )}

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent>
          {adding && (
            <AddMaterialForm
              courses={courseList.map((c) => ({ id: c.id, name: c.name, code: c.code, color: c.color }))}
              fixedCourseId={undefined}
              onDone={() => setAdding(false)}
              key={search.course ?? 'all'}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
