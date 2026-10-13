import type { components } from '@/api/schema'

import { gradeScalePresets, type GradeScaleEntry } from './labels'

type Settings = components['schemas']['Settings']
type SettingsUpdate = components['schemas']['SettingsUpdate']

/** The writable part of settings, for a full PUT. */
export function toUpdate(s: Settings, confirmGradeScale = false): SettingsUpdate {
  return {
    timezone: s.timezone,
    grade_scale: s.grade_scale,
    count_excused_as_absent: s.count_excused_as_absent,
    default_min_attendance_pct: s.default_min_attendance_pct,
    default_total_meetings: s.default_total_meetings,
    reminders: s.reminders,
    baseline: s.baseline,
    ...(confirmGradeScale ? { confirm_grade_scale: true } : {}),
  }
}

/** Parses "3,5" or "3.5"; empty or invalid input gives NaN. */
export function parseDecimal(v: string): number {
  const t = v.trim().replace(',', '.')
  return t === '' ? Number.NaN : Number(t)
}

export type ScaleRow = { key: string; letter: string; min: string; points: string }

export function rowsToScale(rows: ScaleRow[]): GradeScaleEntry[] {
  return rows.map((r) => ({ letter: r.letter.trim(), min_score: parseDecimal(r.min), points: parseDecimal(r.points) }))
}

function sameScale(a: GradeScaleEntry[], b: GradeScaleEntry[]): boolean {
  const key = (s: GradeScaleEntry[]) =>
    [...s]
      .sort((x, y) => y.min_score - x.min_score)
      .map((e) => `${e.letter}|${e.min_score}|${e.points}`)
      .join(';')
  return a.length === b.length && key(a) === key(b)
}

/** Id of the preset the scale matches exactly, or undefined for a custom scale. */
export function matchPreset(scale: GradeScaleEntry[]): string | undefined {
  return gradeScalePresets.find((p) => sameScale(p.scale, scale))?.id
}

/** Whether the edited rows differ from the saved scale. */
export function scaleChanged(rows: ScaleRow[], saved: GradeScaleEntry[]): boolean {
  const scale = rowsToScale(rows)
  if (scale.some((e) => Number.isNaN(e.min_score) || Number.isNaN(e.points))) return true
  return !sameScale(scale, saved)
}

export type ScaleIssues = { rows: Record<string, Partial<Record<'letter' | 'min' | 'points', string>>>; general: string[] }

/** The same checks as the server, so problems show while typing. */
export function scaleIssues(rows: ScaleRow[]): ScaleIssues {
  const issues: ScaleIssues = { rows: {}, general: [] }
  const add = (key: string, field: 'letter' | 'min' | 'points', msg: string) => {
    issues.rows[key] = { ...issues.rows[key], [field]: issues.rows[key]?.[field] ?? msg }
  }
  if (rows.length === 0) issues.general.push('Skala nilai minimal punya satu huruf.')
  const letters = new Map<string, number>()
  const mins = new Map<number, number>()
  for (const r of rows) {
    const letter = r.letter.trim()
    if (letter) letters.set(letter.toUpperCase(), (letters.get(letter.toUpperCase()) ?? 0) + 1)
    const min = parseDecimal(r.min)
    if (!Number.isNaN(min)) mins.set(min, (mins.get(min) ?? 0) + 1)
  }
  for (const r of rows) {
    const letter = r.letter.trim()
    if (!letter) add(r.key, 'letter', 'Isi huruf')
    else if ([...letter].length > 3) add(r.key, 'letter', 'Maksimal 3 karakter')
    else if ((letters.get(letter.toUpperCase()) ?? 0) > 1) add(r.key, 'letter', 'Huruf dobel')
    const min = parseDecimal(r.min)
    if (Number.isNaN(min) || min < 0 || min > 100) add(r.key, 'min', 'Isi 0-100')
    else if ((mins.get(min) ?? 0) > 1) add(r.key, 'min', 'Nilai minimal dobel')
    const points = parseDecimal(r.points)
    if (Number.isNaN(points) || points < 0 || points > 4) add(r.key, 'points', 'Isi 0-4')
  }
  if (rows.length > 0 && !rows.some((r) => parseDecimal(r.min) === 0)) {
    issues.general.push('Harus ada huruf dengan nilai minimal 0, biasanya E.')
  }
  return issues
}

export type ScaleBand = { letter: string; from: number; to: number; points: number }

/** Score bands from 0 to 100 for the scale preview, lowest first. Invalid rows are skipped. */
export function scaleBands(rows: ScaleRow[]): ScaleBand[] {
  const valid = rowsToScale(rows)
    .filter((e) => e.letter && !Number.isNaN(e.min_score) && e.min_score >= 0 && e.min_score <= 100 && !Number.isNaN(e.points))
    .sort((a, b) => a.min_score - b.min_score)
  return valid.map((e, i) => ({ letter: e.letter, from: e.min_score, to: valid[i + 1]?.min_score ?? 100, points: e.points }))
}

/**
 * Lecture meetings and allowed absences for a new course with the default
 * meeting count: with 4 or more meetings, one is UTS and one is UAS.
 */
export function absenceAllowance(totalMeetings: number, minPct: number): { lectures: number; required: number; allowed: number } {
  const lectures = totalMeetings >= 4 ? totalMeetings - 2 : totalMeetings
  const required = Math.ceil((Math.min(Math.max(minPct, 0), 100) * lectures) / 100)
  return { lectures, required, allowed: lectures - required }
}

/** The browser's time zone, if it reports one. */
export function deviceTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined
  } catch {
    return undefined
  }
}

const indonesia: Record<string, string> = {
  'Asia/Jakarta': 'WIB',
  'Asia/Pontianak': 'WIB',
  'Asia/Makassar': 'WITA',
  'Asia/Jayapura': 'WIT',
}

/** "WIB", "WITA", "WIT", or the UTC offset such as "UTC+9". */
export function timeZoneShort(timeZone: string, at = new Date()): string {
  if (indonesia[timeZone]) return indonesia[timeZone]
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'shortOffset' })
      .formatToParts(at)
      .find((p) => p.type === 'timeZoneName')?.value
    return part ? part.replace('GMT', 'UTC') : timeZone
  } catch {
    return timeZone
  }
}
