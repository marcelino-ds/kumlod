import { format } from 'date-fns'
import { id } from 'date-fns/locale'

/** Calendar parts of an instant in a time zone. */
function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute'), second: get('second') }
}

const pad = (n: number) => String(n).padStart(2, '0')

/** YYYY-MM-DD of an instant in a time zone. */
export function localDate(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone)
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`
}

/** HH:MM of an instant in a time zone. */
export function localTime(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone)
  return `${pad(p.hour)}:${pad(p.minute)}`
}

/** Offset of timeZone from UTC at the given instant, in milliseconds. */
function offsetMs(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone)
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return asUTC - (date.getTime() - date.getMilliseconds())
}

/** Converts a wall-clock date and time in timeZone to an instant. */
export function zonedToDate(date: string, time: string, timeZone: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  const guess = Date.UTC(y, m - 1, d, hh, mm)
  let result = guess - offsetMs(new Date(guess), timeZone)
  // Re-check once in case the offset differs at the result (DST changes).
  const second = guess - offsetMs(new Date(result), timeZone)
  if (second !== result) result = second
  return new Date(result)
}

/** Parses YYYY-MM-DD as a local calendar date (no time zone shift). */
export function parseLocalDate(date: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Adds days to a YYYY-MM-DD date. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + days))
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`
}

/** Whole days from a to b (both YYYY-MM-DD). */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000)
}

/** Monday on or before a YYYY-MM-DD date. */
function mondayOf(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay() // 0 = Sunday
  return addDays(date, -((weekday + 6) % 7))
}

export type SemesterWeek = {
  /** 1-based week of the semester; 0 before it starts, total after it ends. */
  week: number
  /** Number of weeks from the start week through the end week. */
  total: number
  phase: 'before' | 'during' | 'after'
}

/**
 * Week of the semester as campuses count it: week 1 is the Monday-Sunday
 * week that contains the start date, and weeks roll over every Monday.
 */
export function semesterWeek(start: string, end: string, today: string): SemesterWeek {
  const base = mondayOf(start)
  const total = Math.floor(daysBetween(base, end) / 7) + 1
  if (today < start) return { week: 0, total, phase: 'before' }
  if (today > end) return { week: total, total, phase: 'after' }
  return { week: Math.floor(daysBetween(base, today) / 7) + 1, total, phase: 'during' }
}

/** "Minggu ke-6 dari 20", "Mulai Sen, 31 Agt", or "Semester selesai". */
export function semesterWeekLabel(w: SemesterWeek, start: string): string {
  if (w.phase === 'before') return `Mulai ${formatShortDate(start)}`
  if (w.phase === 'after') return 'Semester selesai'
  return `Minggu ke-${w.week} dari ${w.total}`
}

/** "Senin, 12 Oktober 2026" */
export function formatLongDate(date: string): string {
  return format(parseLocalDate(date), 'EEEE, d MMMM yyyy', { locale: id })
}

/** "Sen, 12 Okt" (with the year when it differs from thisYear). */
export function formatShortDate(date: string, thisYear?: number): string {
  const d = parseLocalDate(date)
  const pattern = thisYear !== undefined && d.getFullYear() !== thisYear ? 'EEE, d MMM yyyy' : 'EEE, d MMM'
  return format(d, pattern, { locale: id })
}

/** "Hari ini", "Besok", "Kemarin", or a short date. */
export function relativeDay(date: string, today: string): string {
  const diff = daysBetween(today, date)
  if (diff === 0) return 'Hari ini'
  if (diff === 1) return 'Besok'
  if (diff === -1) return 'Kemarin'
  return formatShortDate(date, Number(today.slice(0, 4)))
}

/** Deadline label in the app time zone, e.g. "Besok 23:59". */
export function formatDeadline(iso: string, now: Date, timeZone: string): string {
  const d = new Date(iso)
  return `${relativeDay(localDate(d, timeZone), localDate(now, timeZone))} ${localTime(d, timeZone)}`
}

/** "3 jam lagi", "2 hari lagi", "lewat 5 jam" for a deadline. */
export function timeLeft(iso: string, now: Date): string {
  const ms = new Date(iso).getTime() - now.getTime()
  const abs = Math.abs(ms)
  const minutes = Math.round(abs / 60_000)
  const hours = Math.round(abs / 3_600_000)
  const days = Math.round(abs / 86_400_000)
  let span: string
  if (minutes < 60) span = `${Math.max(minutes, 1)} menit`
  else if (hours < 48) span = `${hours} jam`
  else span = `${days} hari`
  return ms >= 0 ? `${span} lagi` : `lewat ${span}`
}

/** Formats an RFC 3339 timestamp as "12 Okt 2026, 08:15" in the app time zone. */
export function formatTimestamp(iso: string, timeZone: string): string {
  const d = new Date(iso)
  return `${format(parseLocalDate(localDate(d, timeZone)), 'd MMM yyyy', { locale: id })}, ${localTime(d, timeZone)}`
}

/** Time zone names supported by the browser, with a fallback list. */
export function timeZones(): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
  const list = intl.supportedValuesOf?.('timeZone')
  if (list && list.length > 0) return list.includes('UTC') ? list : ['UTC', ...list]
  return ['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura', 'UTC']
}
