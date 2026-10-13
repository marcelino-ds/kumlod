import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { CalendarPlusIcon, CalendarRangeIcon, CheckIcon, MoreVerticalIcon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import type { Schemas, Semester } from '@/api/client'
import {
  semestersQuery,
  useActivateSemester,
  useCreateSemester,
  useDeleteSemester,
  useUpdateSemester,
} from '@/api/queries'
import { EmptyState, ErrorState, Field, FormError, invalidProps, LoadingList } from '@/components/common'
import { heroChipClass, HeroStat, PageHero } from '@/components/page-hero'
import { Badge } from '@/components/ui/badge'
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
import { DatePicker } from '@/components/ui/date-picker'
import { Input } from '@/components/ui/input'
import { Checkbox, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/misc'
import { Select } from '@/components/ui/select'
import { formatShortDate, localDate, semesterWeek } from '@/lib/dates'
import { fieldErrors, useAppSettings, useNow } from '@/lib/hooks'
import { labelOptions, termLabel } from '@/lib/labels'
import { uuidv7 } from '@/lib/uuid'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/_app/semester')({
  component: SemesterPage,
})

type Editing = { mode: 'create' } | { mode: 'edit'; semester: Semester } | null

function SemesterPage() {
  const semesters = useQuery(semestersQuery)
  const [editing, setEditing] = useState<Editing>(null)
  const [deleting, setDeleting] = useState<Semester | null>(null)
  const activate = useActivateSemester()
  const remove = useDeleteSemester()

  const list = semesters.data ?? []
  const current = list.find((s) => s.is_active)
  const { timeZone } = useAppSettings()
  const now = useNow()
  const week = current ? semesterWeek(current.start_date, current.end_date, localDate(now, timeZone)) : undefined
  const add = () => setEditing({ mode: 'create' })

  return (
    <div className="mx-auto max-w-[96rem]">
      <PageHero
        icon={CalendarRangeIcon}
        title="Semester"
        eyebrow={
          current && (
            <span className={heroChipClass}>
              <span aria-hidden className="size-2 rounded-full bg-brand" />
              {current.name} aktif
            </span>
          )
        }
        aside={
          <Button variant="brand" className="px-4" onClick={add}>
            <PlusIcon className="size-5" /> Baru
          </Button>
        }
        action={
          <Button variant="brand" onClick={add}>
            <PlusIcon /> Semester baru
          </Button>
        }
      >
        <dl className="grid grid-cols-3 gap-2">
          <HeroStat
            label="Minggu kuliah"
            short="Minggu"
            value={week ? (week.phase === 'during' ? `${week.week}/${week.total}` : week.phase === 'before' ? '0' : `${week.total}/${week.total}`) : undefined}
            hint={week?.phase === 'before' ? 'belum mulai' : week?.phase === 'after' ? 'semester selesai' : undefined}
            accent="text-brand"
          />
          <HeroStat label="Matkul aktif" short="Matkul" value={current?.course_count} />
          <HeroStat label="SKS aktif" short="SKS" value={current?.total_credits} />
        </dl>
      </PageHero>
      {semesters.data === undefined ? (
        semesters.isError ? <ErrorState error={semesters.error} onRetry={() => void semesters.refetch()} /> : <LoadingList />
      ) : semesters.data.length === 0 ? (
        <EmptyState
          icon={<CalendarPlusIcon />}
          title="Belum ada semester"
          description="Semester pertama otomatis jadi semester aktif."
          action={<Button onClick={() => setEditing({ mode: 'create' })}>Buat semester</Button>}
        />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {semesters.data.map((s) => (
            <li
              key={s.id}
              className={cn(
                'relative flex flex-col overflow-hidden rounded-[2rem] p-5',
                s.is_active ? 'bg-brand text-brand-foreground' : 'bg-card shadow-xs ring-1 ring-black/[0.03] dark:ring-white/[0.06]',
              )}
            >
              {s.is_active && <span aria-hidden className="absolute -top-10 -right-10 size-32 rounded-full border-[18px] border-black/[0.06]" />}
              <div className="relative flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {s.is_active ? <Badge className="bg-hero text-hero-foreground">Aktif</Badge> : <Badge variant="secondary">Arsip</Badge>}
                    <span className={cn('text-xs font-semibold', s.is_active ? 'opacity-70' : 'text-muted-foreground')}>
                      {[s.academic_year, termLabel[s.term]].filter(Boolean).join(' · ')}
                    </span>
                  </div>
                  <Link to="/matkul" search={{ semester: s.id }} className="mt-2 block text-2xl leading-tight font-extrabold tracking-tight hover:underline">
                    {s.name}
                  </Link>
                  <p className={cn('mt-1 text-sm', s.is_active ? 'opacity-75' : 'text-muted-foreground')}>
                    {formatShortDate(s.start_date, 0)} - {formatShortDate(s.end_date, 0)}
                  </p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="-mt-1 -mr-1" aria-label={`Aksi untuk ${s.name}`}>
                      <MoreVerticalIcon />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onSelect={() => setEditing({ mode: 'edit', semester: s })}>
                      <PencilIcon /> Ubah
                    </DropdownMenuItem>
                    <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(s)}>
                      <Trash2Icon /> Hapus
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="relative mt-5 flex items-end justify-between gap-3">
                <dl className="flex gap-6">
                  <div>
                    <dt className={cn('text-xs font-semibold', s.is_active ? 'opacity-70' : 'text-muted-foreground')}>Matkul</dt>
                    <dd className="text-3xl font-extrabold tabular-nums">{s.course_count}</dd>
                  </div>
                  <div>
                    <dt className={cn('text-xs font-semibold', s.is_active ? 'opacity-70' : 'text-muted-foreground')}>SKS</dt>
                    <dd className="text-3xl font-extrabold tabular-nums">{s.total_credits}</dd>
                  </div>
                </dl>
                {!s.is_active && (
                  <Button
                    variant="outline"
                    disabled={activate.isPending}
                    onClick={() => activate.mutate(s.id, { onSuccess: () => toast.success(`${s.name} sekarang aktif`) })}
                  >
                    <CheckIcon /> Aktifkan
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          {editing && (
            <SemesterForm
              key={editing.mode === 'edit' ? editing.semester.id : 'new'}
              semester={editing.mode === 'edit' ? editing.semester : undefined}
              isFirst={(semesters.data?.length ?? 0) === 0}
              onDone={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Hapus ${deleting?.name ?? 'semester'}?`}
        description={
          <>
            Semua matkul, pertemuan, absen, tugas, materi, dan file di semester ini ikut terhapus permanen. Ini tidak bisa
            dibatalkan.
          </>
        }
        confirmLabel="Hapus semester"
        pending={remove.isPending}
        onConfirm={() => {
          if (!deleting) return
          remove.mutate(deleting.id, {
            onSuccess: () => {
              toast.success('Semester dihapus')
              setDeleting(null)
            },
          })
        }}
      />
    </div>
  )
}

function SemesterForm({ semester, isFirst, onDone }: { semester?: Semester; isFirst: boolean; onDone: () => void }) {
  const create = useCreateSemester()
  const update = useUpdateSemester()
  const mutation = semester ? update : create
  const errs = fieldErrors(mutation.error)

  const [name, setName] = useState(semester?.name ?? '')
  const [academicYear, setAcademicYear] = useState(semester?.academic_year ?? '')
  const [term, setTerm] = useState<Schemas['SemesterTerm']>(semester?.term ?? 'odd')
  const [start, setStart] = useState(semester?.start_date ?? '')
  const [end, setEnd] = useState(semester?.end_date ?? '')
  const [activate, setActivate] = useState(true)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const body = { name: name.trim(), academic_year: academicYear.trim(), term, start_date: start, end_date: end }
    if (semester) {
      update.mutate({ id: semester.id, body }, { onSuccess: () => (toast.success('Semester disimpan'), onDone()) })
    } else {
      create.mutate({ ...body, id: uuidv7(), activate }, { onSuccess: () => (toast.success('Semester dibuat'), onDone()) })
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>{semester ? 'Ubah semester' : 'Semester baru'}</DialogTitle>
        <DialogDescription>Tanggal mulai dipakai untuk membuat pertemuan otomatis dari jadwal.</DialogDescription>
      </DialogHeader>
      <Field id="sem-name" label="Nama" error={errs.name}>
        <Input
          id="sem-name"
          required
          maxLength={100}
          placeholder="Semester 3"
          value={name}
          onChange={(e) => setName(e.target.value)}
          {...invalidProps('sem-name', errs.name)}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field id="sem-year" label="Tahun ajaran" error={errs.academic_year}>
          <Input id="sem-year" maxLength={20} placeholder="2026/2027" value={academicYear} onChange={(e) => setAcademicYear(e.target.value)} />
        </Field>
        <Field id="sem-term" label="Jenis" error={errs.term}>
          <Select id="sem-term" value={term} onValueChange={(v) => setTerm(v as Schemas['SemesterTerm'])} options={labelOptions(termLabel)} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field id="sem-start" label="Mulai" error={errs.start_date}>
          <DatePicker id="sem-start" value={start} onChange={setStart} {...invalidProps('sem-start', errs.start_date)} />
        </Field>
        <Field id="sem-end" label="Selesai" error={errs.end_date}>
          <DatePicker id="sem-end" value={end} min={start || undefined} onChange={setEnd} {...invalidProps('sem-end', errs.end_date)} />
        </Field>
      </div>
      {!semester && !isFirst && (
        <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-2xl bg-muted px-4 py-3 text-sm font-medium">
          <Checkbox className="size-6" checked={activate} onCheckedChange={(v) => setActivate(v === true)} />
          Jadikan semester aktif (semester aktif sekarang jadi arsip)
        </label>
      )}
      {Object.keys(errs).length === 0 && <FormError error={mutation.error} />}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Batal
        </Button>
        <Button type="submit" disabled={mutation.isPending || !name.trim() || !start || !end}>
          {mutation.isPending ? 'Menyimpan...' : 'Simpan'}
        </Button>
      </DialogFooter>
    </form>
  )
}
