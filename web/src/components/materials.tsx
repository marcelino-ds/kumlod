import { useQuery } from '@tanstack/react-query'
import {
  DownloadIcon,
  ExternalLinkIcon,
  FileIcon,
  FolderOpenIcon,
  LinkIcon,
  MoreVerticalIcon,
  PencilIcon,
  StickyNoteIcon,
  Trash2Icon,
} from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { fileUrl, type CourseBrief, type Material } from '@/api/client'
import {
  materialsQuery,
  meetingsQuery,
  useCreateMaterial,
  useDeleteMaterial,
  useUpdateMaterial,
  useUploadMaterial,
  type MaterialFilters,
} from '@/api/queries'
import { CourseChip, EmptyState, ErrorState, Field, FormError, invalidProps, LoadingList } from '@/components/common'
import { Button } from '@/components/ui/button'
import {
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/misc'
import { formatShortDate } from '@/lib/dates'
import { fieldErrors } from '@/lib/hooks'
import { materialKindLabel, meetingKindLabel } from '@/lib/labels'
import { uuidv7 } from '@/lib/uuid'
import { cn, formatBytes } from '@/lib/utils'

const kindIcon = { link: LinkIcon, note: StickyNoteIcon, file: FileIcon }

const kindTone = {
  file: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  link: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300',
  note: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300',
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

/** A searchable list of materials with open, edit, and delete actions. */
export function MaterialList({
  filters,
  showCourse = true,
  emptyTitle = 'Belum ada materi',
  emptyAction,
}: {
  filters: MaterialFilters
  showCourse?: boolean
  emptyTitle?: string
  emptyAction?: React.ReactNode
}) {
  const materials = useQuery(materialsQuery(filters))
  const [editing, setEditing] = useState<Material | null>(null)
  const [deleting, setDeleting] = useState<Material | null>(null)
  const remove = useDeleteMaterial()

  if (materials.data === undefined) {
    return materials.isError ? <ErrorState error={materials.error} onRetry={() => void materials.refetch()} /> : <LoadingList />
  }
  if (materials.data.length === 0) {
    return (
      <EmptyState
        icon={<FolderOpenIcon />}
        title={filters.q ? `Tidak ada materi yang cocok dengan "${filters.q}"` : emptyTitle}
        action={filters.q ? undefined : emptyAction}
      />
    )
  }
  return (
    <>
      <ul className={cn('space-y-2.5', materials.isPlaceholderData && 'opacity-60')}>
        {materials.data.map((m) => (
          <MaterialRow key={m.id} material={m} showCourse={showCourse} onEdit={() => setEditing(m)} onDelete={() => setDeleting(m)} />
        ))}
      </ul>
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>{editing && <EditMaterialForm material={editing} onDone={() => setEditing(null)} />}</DialogContent>
      </Dialog>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Hapus materi ini?"
        description={deleting?.kind === 'file' ? `"${deleting.title}" dan file-nya dihapus permanen.` : `"${deleting?.title}" dihapus permanen.`}
        pending={remove.isPending}
        onConfirm={() =>
          deleting &&
          remove.mutate(deleting.id, {
            onSuccess: () => {
              toast.success('Materi dihapus')
              setDeleting(null)
            },
          })
        }
      />
    </>
  )
}

function MaterialRow({
  material: m,
  showCourse,
  onEdit,
  onDelete,
}: {
  material: Material
  showCourse: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const Icon = kindIcon[m.kind]
  const href = m.kind === 'link' ? m.url : m.file ? fileUrl(m.file.id) : undefined

  return (
    <li className="rounded-3xl bg-card p-4 shadow-xs ring-1 ring-black/[0.03] dark:ring-white/[0.06]">
      <div className="flex items-start gap-3">
        <span className={cn('flex size-12 shrink-0 items-center justify-center rounded-2xl', kindTone[m.kind])}>
          <Icon className="size-5" aria-hidden />
          <span className="sr-only">{materialKindLabel[m.kind]}</span>
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
          {href ? (
            <a href={href} target="_blank" rel="noopener noreferrer" className="font-bold break-words hover:underline">
              {m.title}
            </a>
          ) : (
            <button type="button" className="text-left font-bold break-words hover:underline" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
              {m.title}
            </button>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {showCourse && <CourseChip course={m.course} />}
            {m.meeting_number !== null && (
              <span className="rounded-full bg-muted px-2.5 py-0.5 font-semibold">Pertemuan {m.meeting_number}</span>
            )}
            {m.file && (
              <span className="truncate font-medium">
                {m.file.original_name} · {formatBytes(m.file.size_bytes)}
              </span>
            )}
            {m.kind === 'link' && <span className="truncate font-medium">{hostOf(m.url)}</span>}
          </div>
          {m.description && (
            <p className={cn('mt-2 text-sm whitespace-pre-wrap break-words text-foreground/80', !expanded && 'line-clamp-2')}>{m.description}</p>
          )}
          {m.description.length > 140 && (
            <button type="button" className="mt-1 min-h-11 text-sm font-semibold underline decoration-brand decoration-2 underline-offset-4" onClick={() => setExpanded((v) => !v)}>
              {expanded ? 'Ringkas' : 'Selengkapnya'}
            </button>
          )}
        </div>
        <div className="-mr-1 flex shrink-0 items-center">
          {href && (
            <Button variant="ghost" size="icon" asChild>
              <a href={href} target="_blank" rel="noopener noreferrer" aria-label={`Buka ${m.title}`}>
                <ExternalLinkIcon />
              </a>
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={`Aksi untuk ${m.title}`}>
                <MoreVerticalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {m.file && (
                <DropdownMenuItem asChild>
                  <a href={fileUrl(m.file.id, true)} download>
                    <DownloadIcon /> Unduh
                  </a>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={onEdit}>
                <PencilIcon /> Ubah
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                <Trash2Icon /> Hapus
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </li>
  )
}

function MeetingSelect({
  id,
  courseId,
  value,
  onChange,
  error,
}: {
  id: string
  courseId: string
  value: string
  onChange: (v: string) => void
  error?: string
}) {
  const meetings = useQuery(meetingsQuery(courseId))
  return (
    <Field id={id} label="Pertemuan" error={error}>
      <NativeSelect id={id} value={value} onChange={(e) => onChange(e.target.value)} disabled={!courseId}>
        <option value="">Tidak terkait pertemuan</option>
        {meetings.data?.map((m) => (
          <option key={m.id} value={m.id}>
            {`Pertemuan ${m.number} · ${formatShortDate(m.date)}${m.kind !== 'lecture' ? ` · ${meetingKindLabel[m.kind]}` : ''}`}
          </option>
        ))}
      </NativeSelect>
    </Field>
  )
}

type Kind = 'link' | 'note' | 'file'

/** Dialog body to add a link, note, or file. */
export function AddMaterialForm({
  courses,
  fixedCourseId,
  defaultMeetingId,
  onDone,
}: {
  courses: CourseBrief[]
  fixedCourseId?: string
  defaultMeetingId?: string
  onDone: () => void
}) {
  const create = useCreateMaterial()
  const upload = useUploadMaterial()
  const [kind, setKind] = useState<Kind>('file')
  const [courseId, setCourseId] = useState(fixedCourseId ?? courses[0]?.id ?? '')
  const [meetingId, setMeetingId] = useState(defaultMeetingId ?? '')
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [progress, setProgress] = useState(0)
  const mutation = kind === 'file' ? upload : create
  const errs = fieldErrors(mutation.error)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const done = () => {
      toast.success('Materi ditambahkan')
      onDone()
    }
    if (kind === 'file') {
      if (!file) return
      const form = new FormData()
      form.set('id', uuidv7())
      form.set('course_id', courseId)
      if (meetingId) form.set('meeting_id', meetingId)
      if (title.trim()) form.set('title', title.trim())
      if (description) form.set('description', description)
      form.set('file', file, file.name)
      setProgress(0)
      upload.mutate({ form, onProgress: setProgress }, { onSuccess: done })
      return
    }
    create.mutate(
      {
        id: uuidv7(),
        course_id: courseId,
        kind,
        title: title.trim(),
        description,
        ...(kind === 'link' ? { url: url.trim() } : {}),
        ...(meetingId ? { meeting_id: meetingId } : {}),
      },
      { onSuccess: done },
    )
  }

  const canSubmit = courseId && (kind === 'file' ? file !== null : title.trim() && (kind !== 'link' || url.trim()))

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>Tambah materi</DialogTitle>
        <DialogDescription>Upload file, simpan link (Drive, Moodle, YouTube), atau tulis catatan.</DialogDescription>
      </DialogHeader>

      <div role="group" aria-label="Jenis materi" className="grid grid-cols-3 gap-1 rounded-full bg-muted p-1">
        {(['file', 'link', 'note'] as Kind[]).map((k) => {
          const KindIcon = kindIcon[k]
          return (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
              className={cn(
                'inline-flex h-11 items-center justify-center gap-1.5 rounded-full text-sm font-semibold transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none',
                kind === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <KindIcon className="size-4" aria-hidden />
              {k === 'file' ? 'File' : k === 'link' ? 'Link' : 'Catatan'}
            </button>
          )
        })}
      </div>

      {!fixedCourseId && (
        <Field id="m-course" label="Matkul" error={errs.course_id}>
          <NativeSelect
            id="m-course"
            value={courseId}
            onChange={(e) => {
              setCourseId(e.target.value)
              setMeetingId('')
            }}
          >
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
      )}
      <MeetingSelect id="m-meeting" courseId={courseId} value={meetingId} onChange={setMeetingId} error={errs.meeting_id} />

      {kind === 'file' && (
        <Field id="m-file" label="File" error={errs.file} hint="PDF dan gambar bisa dibuka langsung di browser.">
          <Input
            id="m-file"
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="h-auto py-2.5"
            {...invalidProps('m-file', errs.file)}
          />
        </Field>
      )}
      <Field id="m-title" label={kind === 'file' ? 'Judul (opsional)' : 'Judul'} error={errs.title} hint={kind === 'file' ? 'Default nama file' : undefined}>
        <Input id="m-title" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} {...invalidProps('m-title', errs.title)} />
      </Field>
      {kind === 'link' && (
        <Field id="m-url" label="Link" error={errs.url}>
          <Input id="m-url" type="url" inputMode="url" placeholder="https://" maxLength={2000} value={url} onChange={(e) => setUrl(e.target.value)} {...invalidProps('m-url', errs.url)} />
        </Field>
      )}
      <Field id="m-desc" label={kind === 'note' ? 'Isi catatan' : 'Deskripsi'} error={errs.description}>
        <Textarea id="m-desc" rows={kind === 'note' ? 8 : 3} maxLength={20000} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>

      {upload.isPending && (
        <div className="grid gap-1" role="status">
          <div className="h-2.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <p className="text-xs text-muted-foreground">Mengunggah {Math.round(progress * 100)}%</p>
        </div>
      )}
      {Object.keys(errs).length === 0 && <FormError error={mutation.error} />}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Batal
        </Button>
        <Button type="submit" disabled={mutation.isPending || !canSubmit}>
          {mutation.isPending ? 'Menyimpan...' : 'Simpan'}
        </Button>
      </DialogFooter>
    </form>
  )
}

function EditMaterialForm({ material: m, onDone }: { material: Material; onDone: () => void }) {
  const update = useUpdateMaterial()
  const errs = fieldErrors(update.error)
  const [meetingId, setMeetingId] = useState(m.meeting_id ?? '')
  const [title, setTitle] = useState(m.title)
  const [url, setUrl] = useState(m.url)
  const [description, setDescription] = useState(m.description)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    update.mutate(
      { id: m.id, body: { meeting_id: meetingId || null, title: title.trim(), description, url: url.trim() } },
      {
        onSuccess: () => {
          toast.success('Materi disimpan')
          onDone()
        },
      },
    )
  }

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>Ubah materi</DialogTitle>
        <DialogDescription>{m.course.name}</DialogDescription>
      </DialogHeader>
      <MeetingSelect id="me-meeting" courseId={m.course_id} value={meetingId} onChange={setMeetingId} error={errs.meeting_id} />
      <Field id="me-title" label="Judul" error={errs.title}>
        <Input id="me-title" required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} {...invalidProps('me-title', errs.title)} />
      </Field>
      {m.kind === 'link' && (
        <Field id="me-url" label="Link" error={errs.url}>
          <Input id="me-url" type="url" inputMode="url" maxLength={2000} value={url} onChange={(e) => setUrl(e.target.value)} {...invalidProps('me-url', errs.url)} />
        </Field>
      )}
      <Field id="me-desc" label={m.kind === 'note' ? 'Isi catatan' : 'Deskripsi'} error={errs.description}>
        <Textarea id="me-desc" rows={m.kind === 'note' ? 8 : 3} maxLength={20000} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      {Object.keys(errs).length === 0 && <FormError error={update.error} />}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Batal
        </Button>
        <Button type="submit" disabled={update.isPending || !title.trim()}>
          {update.isPending ? 'Menyimpan...' : 'Simpan'}
        </Button>
      </DialogFooter>
    </form>
  )
}
