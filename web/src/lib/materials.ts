import type { components } from '@/api/schema'

import { daysBetween, formatShortDate, localDate } from './dates'

type Material = components['schemas']['Material']
type Meeting = components['schemas']['Meeting']
export type MaterialKind = components['schemas']['MaterialKind']

export type MaterialSort = 'relevance' | 'newest' | 'oldest' | 'title' | 'meeting'

export const materialSortLabel: Record<MaterialSort, string> = {
  relevance: 'Paling relevan',
  newest: 'Terbaru ditambahkan',
  oldest: 'Terlama ditambahkan',
  title: 'Judul (A-Z)',
  meeting: 'Urutan pertemuan',
}

/**
 * Meeting filter: all, exam scope (material up to and including UTS, or
 * after UTS), material without a meeting, or one meeting id.
 */
export type MeetingFilter = 'uts' | 'uas' | 'none' | (string & {})

export const examScopeLabel = { uts: 'Bahan UTS', uas: 'Bahan UAS', none: 'Tanpa pertemuan' } as const

export function isExamScope(f: MeetingFilter | undefined): f is 'uts' | 'uas' {
  return f === 'uts' || f === 'uas'
}

/** Whether the filter is a named scope (UTS, UAS, or no meeting) rather than one meeting id. */
export function isNamedScope(f: MeetingFilter | undefined): f is keyof typeof examScopeLabel {
  return f === 'uts' || f === 'uas' || f === 'none'
}

/**
 * Last meeting number that still counts toward UTS: the first midterm
 * meeting, or half the meetings when the course has no midterm.
 */
export function midtermCutoff(meetings: Pick<Meeting, 'number' | 'kind'>[]): number {
  const midterms = meetings.filter((m) => m.kind === 'midterm').map((m) => m.number)
  if (midterms.length > 0) return Math.min(...midterms)
  const last = Math.max(0, ...meetings.map((m) => m.number))
  return Math.ceil(last / 2)
}

/**
 * Whether a material matches the meeting filter. cutoffs maps course id to
 * midtermCutoff; materials of courses without loaded meetings never match an
 * exam scope.
 */
export function matchesMeeting(
  m: Pick<Material, 'course_id' | 'meeting_id' | 'meeting_number'>,
  filter: MeetingFilter | undefined,
  cutoffs: Map<string, number>,
): boolean {
  if (!filter) return true
  if (filter === 'none') return m.meeting_id === null
  if (isExamScope(filter)) {
    const cutoff = cutoffs.get(m.course_id)
    if (m.meeting_number === null || cutoff === undefined) return false
    return filter === 'uts' ? m.meeting_number <= cutoff : m.meeting_number > cutoff
  }
  return m.meeting_id === filter
}

/** Sorts a copy of the list. relevance keeps the server order (search rank). */
export function sortMaterials<T extends Pick<Material, 'title' | 'created_at' | 'meeting_number'>>(list: T[], sort: MaterialSort): T[] {
  if (sort === 'relevance') return [...list]
  const newest = (a: T, b: T) => b.created_at.localeCompare(a.created_at)
  const cmp: Record<Exclude<MaterialSort, 'relevance'>, (a: T, b: T) => number> = {
    newest,
    oldest: (a, b) => a.created_at.localeCompare(b.created_at),
    title: (a, b) => a.title.localeCompare(b.title, 'id', { sensitivity: 'base' }) || newest(a, b),
    meeting: (a, b) => (a.meeting_number ?? Number.MAX_SAFE_INTEGER) - (b.meeting_number ?? Number.MAX_SAFE_INTEGER) || newest(a, b),
  }
  return [...list].sort(cmp[sort])
}

export type MaterialGroup<T> = { key: string; items: T[] }

/** Groups by course, in the order each course first appears in the (sorted) list. */
export function groupByCourse<T extends Pick<Material, 'course_id'>>(list: T[]): MaterialGroup<T>[] {
  const groups = new Map<string, T[]>()
  for (const m of list) groups.set(m.course_id, [...(groups.get(m.course_id) ?? []), m])
  return [...groups].map(([key, items]) => ({ key, items }))
}

/** Groups by meeting number ascending; materials without a meeting go last under key "none". */
export function groupByMeeting<T extends Pick<Material, 'meeting_id' | 'meeting_number'>>(list: T[]): MaterialGroup<T>[] {
  const groups = new Map<string, { n: number; items: T[] }>()
  for (const m of list) {
    const key = m.meeting_id ?? 'none'
    const g = groups.get(key) ?? { n: m.meeting_number ?? Number.MAX_SAFE_INTEGER, items: [] }
    g.items.push(m)
    groups.set(key, g)
  }
  return [...groups].sort((a, b) => a[1].n - b[1].n).map(([key, g]) => ({ key, items: g.items }))
}

/** Number of materials per kind. */
export function kindCounts(list: Pick<Material, 'kind'>[]): Record<MaterialKind | 'all', number> {
  const counts = { all: list.length, file: 0, link: 0, note: 0 }
  for (const m of list) counts[m.kind]++
  return counts
}

/** "PDF", "PPTX", ... from a file name, falling back to the MIME subtype. */
export function fileExtension(name: string, mime = ''): string {
  const dot = name.lastIndexOf('.')
  const ext = dot > 0 && dot < name.length - 1 ? name.slice(dot + 1) : (mime.split('/')[1] ?? '')
  return ext.replace(/[^a-z0-9]/gi, '').slice(0, 4).toUpperCase()
}

/** Host name of a URL without "www.", or the input when it is not a URL. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** "Baru saja", "5 menit lalu", "3 jam lalu", "Kemarin", "4 hari lalu", or a short date after a week. */
export function addedAgo(iso: string, now: Date, timeZone: string): string {
  const created = new Date(iso)
  const minutes = Math.floor((now.getTime() - created.getTime()) / 60_000)
  if (minutes < 1) return 'Baru saja'
  if (minutes < 60) return `${minutes} menit lalu`
  const today = localDate(now, timeZone)
  const day = localDate(created, timeZone)
  if (day === today) return `${Math.floor(minutes / 60)} jam lalu`
  const days = daysBetween(day, today)
  if (days === 1) return 'Kemarin'
  if (days < 7) return `${days} hari lalu`
  return formatShortDate(day, Number(today.slice(0, 4)))
}

/** Materials created in the last 7 days. */
export function addedThisWeek(list: Pick<Material, 'created_at'>[], now: Date): number {
  const since = now.getTime() - 7 * 86_400_000
  return list.filter((m) => new Date(m.created_at).getTime() >= since).length
}
