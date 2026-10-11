import type { components } from '@/api/schema'

type S = components['schemas']

export const taskStatusLabel: Record<S['TaskStatus'], string> = {
  todo: 'Belum',
  in_progress: 'Dikerjakan',
  submitted: 'Dikumpulkan',
  graded: 'Dinilai',
}

export const priorityLabel: Record<S['TaskPriority'], string> = {
  low: 'Rendah',
  normal: 'Normal',
  high: 'Tinggi',
}

export type AttendanceValue = NonNullable<S['Meeting']['attendance']>

export const attendanceLabel: Record<AttendanceValue, string> = {
  present: 'Hadir',
  excused: 'Izin',
  sick: 'Sakit',
  absent: 'Alpa',
}

export const attendanceOrder: AttendanceValue[] = ['present', 'excused', 'sick', 'absent']

export const levelLabel: Record<S['AttendanceLevel'], string> = {
  safe: 'Aman',
  warning: 'Waspada',
  critical: 'Kritis',
  exceeded: 'Lewat batas',
}

export const levelVariant: Record<S['AttendanceLevel'], 'success' | 'warning' | 'danger'> = {
  safe: 'success',
  warning: 'warning',
  critical: 'danger',
  exceeded: 'danger',
}

export const meetingKindLabel: Record<S['MeetingKind'], string> = {
  lecture: 'Kuliah',
  midterm: 'UTS',
  final: 'UAS',
}

export const meetingStatusLabel: Record<S['MeetingStatus'], string> = {
  scheduled: 'Terjadwal',
  cancelled: 'Batal',
}

export const termLabel: Record<S['SemesterTerm'], string> = {
  odd: 'Ganjil',
  even: 'Genap',
  short: 'Pendek',
}

export const targetStatusLabel: Record<S['TargetStatus'], string> = {
  secured: 'Sudah aman',
  possible: 'Mungkin',
  impossible: 'Tidak mungkin',
}

export const simulationStatusLabel: Record<S['GpaSimulation']['status'], string> = {
  secured: 'Sudah aman',
  possible: 'Mungkin',
  impossible: 'Tidak mungkin',
  no_credits: 'Belum ada SKS',
}

export const materialKindLabel: Record<S['MaterialKind'], string> = {
  link: 'Link',
  note: 'Catatan',
  file: 'File',
}

/** ISO day of week (1 = Senin) to its name. */
export const dayNames = ['', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu']
export const dayShort = ['', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min']

/** "Sen 08:00-09:40 · A1" for each slot, joined with commas. */
export function scheduleSummary(schedules: S['Schedule'][]): string {
  if (schedules.length === 0) return 'Belum ada jadwal'
  return schedules
    .map((s) => `${dayShort[s.day_of_week]} ${s.start_time}-${s.end_time}${s.room ? ` · ${s.room}` : ''}`)
    .join(', ')
}

/** One line describing attendance, e.g. "Hadir 85,7% · sisa jatah bolos 2". */
export function attendanceSummaryText(a: S['AttendanceSummary']): string {
  if (a.total === 0) return 'Belum ada pertemuan kuliah'
  const parts: string[] = []
  parts.push(a.percentage === null ? 'Belum ada absen' : `Hadir ${a.percentage.toLocaleString('id-ID')}%`)
  if (a.remaining_absences >= 0) parts.push(`sisa jatah bolos ${a.remaining_absences}`)
  else parts.push(`lewat ${-a.remaining_absences} dari jatah bolos`)
  if (a.unrecorded > 0) parts.push(`${a.unrecorded} belum dicatat`)
  return parts.join(' · ')
}

export type GradeScaleEntry = S['GradeScaleEntry']

export const gradeScalePresets: { id: string; label: string; scale: GradeScaleEntry[] }[] = [
  {
    id: 'plus-minus',
    label: 'Plus-minus (A, A-, B+, ...)',
    scale: [
      { letter: 'A', min_score: 85, points: 4 },
      { letter: 'A-', min_score: 80, points: 3.7 },
      { letter: 'B+', min_score: 75, points: 3.3 },
      { letter: 'B', min_score: 70, points: 3 },
      { letter: 'B-', min_score: 65, points: 2.7 },
      { letter: 'C+', min_score: 60, points: 2.3 },
      { letter: 'C', min_score: 55, points: 2 },
      { letter: 'D', min_score: 40, points: 1 },
      { letter: 'E', min_score: 0, points: 0 },
    ],
  },
  {
    id: 'double-letter',
    label: 'Huruf ganda (A, AB, B, BC, ...)',
    scale: [
      { letter: 'A', min_score: 80, points: 4 },
      { letter: 'AB', min_score: 75, points: 3.5 },
      { letter: 'B', min_score: 70, points: 3 },
      { letter: 'BC', min_score: 65, points: 2.5 },
      { letter: 'C', min_score: 60, points: 2 },
      { letter: 'D', min_score: 50, points: 1 },
      { letter: 'E', min_score: 0, points: 0 },
    ],
  },
]

/** Colors offered when creating a course. */
export const courseColors = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#14b8a6', '#64748b']
