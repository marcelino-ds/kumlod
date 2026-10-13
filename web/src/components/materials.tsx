import { useQuery } from '@tanstack/react-query'
import {
  CopyIcon,
  DownloadIcon,
  ExternalLinkIcon,
  EyeIcon,
  FileIcon,
  FolderOpenIcon,
  LinkIcon,
  MoreVerticalIcon,
  PencilIcon,
  StickyNoteIcon,
  Trash2Icon,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import type * as React from 'react'
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
import { formatShortDate, formatTimestamp } from '@/lib/dates'
import { fieldErrors, useAppSettings, useNow } from '@/lib/hooks'
import { materialKindLabel, meetingKindLabel } from '@/lib/labels'
import { addedAgo, fileExtension, hostOf, type MaterialKind } from '@/lib/materials'
import { uuidv7 } from '@/lib/uuid'
import { cn, courseStyle, formatBytes } from '@/lib/utils'

export const kindIcon: Record<MaterialKind, React.ComponentType<{ className?: string }>> = {
  file: FileIcon,
  link: LinkIcon,
  note: StickyNoteIcon,
}

export const kindTone: Record<MaterialKind, string> = {
  file: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  link: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300',
  note: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300',
}

/** Where a material opens: the link itself or the stored file. Notes have none. */
function materialHref(m: Material): string | undefined {
  if (m.kind === 'link') return m.url
  return m.file ? fileUrl(m.file.id) : undefined
}

function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0
}

async function copyText(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(`${what} disalin`)
  } catch {
    toast.error(`${what} gagal disalin`)
  }
}

// ------------------------------------------------------------ actions

export type MaterialActions = {
  view: (m: Material) => void
  edit: (m: Material) => void
  remove: (m: Material) => void
}

/** Detail, edit, and delete dialogs for materials, plus the callbacks that open them. */
export function useMaterialActions(): { actions: MaterialActions; dialogs: React.ReactNode } {
  const [viewing, setViewing] = useState<Material | null>(null)
  const [editing, setEditing] = useState<Material | null>(null)
  const [deleting, setDeleting] = useState<Material | null>(null)
  const remove = useDeleteMaterial()
  const actions = useMemo<MaterialActions>(() => ({ view: setViewing, edit: setEditing, remove: setDeleting }), [])

  const dialogs = (
    <>
      <Dialog open={viewing !== null} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent>
          {viewing && (
            <MaterialDetail
              material={viewing}
              onEdit={() => {
                setEditing(viewing)
                setViewing(null)
              }}
            />
          )}
        </DialogContent>
      </Dialog>
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
  return { actions, dialogs }
}

// --------------------------------------------------------------- card

/**
 * A compact material card: kind tile, course and meeting, title, where it
 * points (file type and size, host, or note length), when it was added, and
 * a short preview. The whole card opens the material; notes open in a dialog.
 */
export function MaterialCard({
  material: m,
  actions,
  now,
  timeZone,
  showCourse = true,
  showMeeting = true,
}: {
  material: Material
  actions: MaterialActions
  now: Date
  timeZone: string
  showCourse?: boolean
  showMeeting?: boolean
}) {
  const Icon = kindIcon[m.kind]
  const href = materialHref(m)
  const ext = m.file ? fileExtension(m.file.original_name, m.file.mime_type) : ''
  const source =
    m.kind === 'file' && m.file
      ? [ext, formatBytes(m.file.size_bytes)].filter(Boolean).join(' · ')
      : m.kind === 'link'
        ? hostOf(m.url)
        : `${wordCount(m.description)} kata`
  const meeting = showMeeting && m.meeting_number !== null
  const stretch = 'text-left leading-snug font-bold break-words after:absolute after:inset-0 after:rounded-[1.5rem] hover:underline line-clamp-2'

  return (
    <li
      style={courseStyle(m.course.color)}
      className="group relative flex gap-3 rounded-[1.5rem] bg-card py-3.5 pr-1.5 pl-3.5 shadow-xs ring-1 ring-black/[0.04] transition-[box-shadow,transform] hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/[0.06] dark:ring-white/[0.06]"
    >
      <span aria-hidden className={cn('flex size-12 shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl', kindTone[m.kind])}>
        <Icon className="size-5" />
        {ext && <span className="text-[0.55rem] leading-none font-extrabold tracking-wide">{ext}</span>}
      </span>

      <div className="min-w-0 flex-1">
        {(showCourse || meeting) && (
          <div className="mb-1 flex min-w-0 flex-wrap items-center gap-1.5">
            {showCourse && <CourseChip course={m.course} className="max-w-[14rem]" />}
            {meeting && (
              <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">Pertemuan {m.meeting_number}</span>
            )}
          </div>
        )}
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className={stretch}>
            {m.title}
          </a>
        ) : (
          <button type="button" className={stretch} onClick={() => actions.view(m)}>
            {m.title}
          </button>
        )}
        <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <span className="sr-only">{materialKindLabel[m.kind]}, </span>
          <span className="truncate font-semibold">{source}</span>
          <span aria-hidden>·</span>
          <span className="shrink-0">
            <span className="sr-only">ditambahkan </span>
            {addedAgo(m.created_at, now, timeZone)}
          </span>
        </p>
        {m.description && (
          <p className="mt-1.5 line-clamp-2 text-sm leading-snug break-words whitespace-pre-line text-foreground/75">{m.description}</p>
        )}
      </div>

      <div className="relative z-10 -my-1.5 shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={`Aksi untuk ${m.title}`}>
              <MoreVerticalIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {href && (
              <DropdownMenuItem asChild>
                <a href={href} target="_blank" rel="noopener noreferrer">
                  <ExternalLinkIcon /> Buka
                </a>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={() => actions.view(m)}>
              <EyeIcon /> Lihat detail
            </DropdownMenuItem>
            {m.file && (
              <DropdownMenuItem asChild>
                <a href={fileUrl(m.file.id, true)} download>
                  <DownloadIcon /> Unduh
                </a>
              </DropdownMenuItem>
            )}
            {m.kind === 'link' && (
              <DropdownMenuItem onSelect={() => void copyText(m.url, 'Link')}>
                <CopyIcon /> Salin link
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={() => actions.edit(m)}>
              <PencilIcon /> Ubah
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={() => actions.remove(m)}>
              <Trash2Icon /> Hapus
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  )
}

/** Dialog body with the full description or note and the main action for the material. */
function MaterialDetail({ material: m, onEdit }: { material: Material; onEdit: () => void }) {
  const { timeZone } = useAppSettings()
  const href = materialHref(m)
  const Icon = kindIcon[m.kind]
  return (
    <>
      <DialogHeader>
        <span aria-hidden className={cn('mb-1 flex size-11 items-center justify-center rounded-2xl', kindTone[m.kind])}>
          <Icon className="size-5" />
        </span>
        <DialogTitle className="break-words">{m.title}</DialogTitle>
        <DialogDescription asChild>
          <div className="flex flex-wrap items-center gap-1.5">
            <CourseChip course={m.course} />
            {m.meeting_number !== null && (
              <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold">Pertemuan {m.meeting_number}</span>
            )}
            <span className="text-xs">
              {materialKindLabel[m.kind]} · {formatTimestamp(m.created_at, timeZone)}
            </span>
          </div>
        </DialogDescription>
      </DialogHeader>

      {m.file && (
        <p className="rounded-2xl bg-muted px-4 py-3 text-sm">
          <span className="block font-semibold break-all">{m.file.original_name}</span>
          <span className="text-xs text-muted-foreground">
            {[fileExtension(m.file.original_name, m.file.mime_type), formatBytes(m.file.size_bytes)].filter(Boolean).join(' · ')}
          </span>
        </p>
      )}
      {m.kind === 'link' && <p className="rounded-2xl bg-muted px-4 py-3 text-sm font-medium break-all">{m.url}</p>}
      {m.description ? (
        <div className="max-h-[50dvh] overflow-y-auto rounded-2xl ring-1 ring-foreground/10">
          <p className="px-4 py-3 text-sm leading-relaxed break-words whitespace-pre-wrap">{m.description}</p>
        </div>
      ) : (
        m.kind === 'note' && <p className="text-sm text-muted-foreground">Catatan ini masih kosong.</p>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={onEdit}>
          <PencilIcon /> Ubah
        </Button>
        {(m.kind === 'link' || (m.kind === 'note' && m.description)) && (
          <Button variant="outline" onClick={() => void copyText(m.kind === 'link' ? m.url : m.description, m.kind === 'link' ? 'Link' : 'Catatan')}>
            <CopyIcon /> {m.kind === 'link' ? 'Salin link' : 'Salin catatan'}
          </Button>
        )}
        {m.file && (
          <Button variant="outline" asChild>
            <a href={fileUrl(m.file.id, true)} download>
              <DownloadIcon /> Unduh
            </a>
          </Button>
        )}
        {href && (
          <Button asChild>
            <a href={href} target="_blank" rel="noopener noreferrer">
              <ExternalLinkIcon /> Buka
            </a>
          </Button>
        )}
      </DialogFooter>
    </>
  )
}

// --------------------------------------------------------------- list

/** Materials for a fixed filter as a card grid, used on the course page. */
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
  const { actions, dialogs } = useMaterialActions()
  const { timeZone } = useAppSettings()
  const now = useNow()

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
      <ul className={cn('grid gap-2.5 md:grid-cols-2', materials.isPlaceholderData && 'opacity-60')}>
        {materials.data.map((m) => (
          <MaterialCard key={m.id} material={m} actions={actions} now={now} timeZone={timeZone} showCourse={showCourse} />
        ))}
      </ul>
      {dialogs}
    </>
  )
}

// -------------------------------------------------------------- forms

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
            {`Pertemuan ${m.number} · ${formatShortDate(m.date)}${m.kind !== 'lecture' ? ` · ${meetingKindLabel[m.kind]}` : ''}${m.topic ? ` · ${m.topic}` : ''}`}
          </option>
        ))}
      </NativeSelect>
    </Field>
  )
}

/** Dialog body to add a link, note, or file. */
export function AddMaterialForm({
  courses,
  fixedCourseId,
  defaultCourseId,
  defaultMeetingId,
  onDone,
}: {
  courses: CourseBrief[]
  /** Hides the course picker and always uses this course. */
  fixedCourseId?: string
  /** Preselects a course but keeps the picker. */
  defaultCourseId?: string
  defaultMeetingId?: string
  onDone: () => void
}) {
  const create = useCreateMaterial()
  const upload = useUploadMaterial()
  const [kind, setKind] = useState<MaterialKind>('file')
  const [courseId, setCourseId] = useState(fixedCourseId ?? (courses.some((c) => c.id === defaultCourseId) ? defaultCourseId! : (courses[0]?.id ?? '')))
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
        {(['file', 'link', 'note'] as MaterialKind[]).map((k) => {
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
              {materialKindLabel[k]}
            </button>
          )
        })}
      </div>

      <div className={cn('grid gap-4', !fixedCourseId && 'sm:grid-cols-2')}>
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
      </div>

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
      {kind === 'link' && (
        <Field id="m-url" label="Link" error={errs.url}>
          <Input id="m-url" type="url" inputMode="url" placeholder="https://" maxLength={2000} value={url} onChange={(e) => setUrl(e.target.value)} {...invalidProps('m-url', errs.url)} />
        </Field>
      )}
      <Field id="m-title" label={kind === 'file' ? 'Judul (opsional)' : 'Judul'} error={errs.title} hint={kind === 'file' ? 'Kosongkan untuk memakai nama file' : undefined}>
        <Input
          id="m-title"
          maxLength={200}
          placeholder={kind === 'file' && file ? file.name : undefined}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          {...invalidProps('m-title', errs.title)}
        />
      </Field>
      <Field id="m-desc" label={kind === 'note' ? 'Isi catatan' : 'Deskripsi (opsional)'} error={errs.description}>
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
