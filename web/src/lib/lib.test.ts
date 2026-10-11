import { describe, expect, it } from 'vitest'

import type { components } from '@/api/schema'

import {
  addDays,
  daysBetween,
  formatDeadline,
  formatLongDate,
  localDate,
  localTime,
  relativeDay,
  timeLeft,
  zonedToDate,
} from './dates'
import { attendanceSummaryText, gradeScalePresets, scheduleSummary } from './labels'
import { groupTasks, taskGroup } from './tasks'
import { uuidv7 } from './uuid'

type Task = components['schemas']['Task']
const TZ = 'Asia/Jakarta'

describe('dates', () => {
  it('converts between instants and wall-clock time in the app zone', () => {
    const d = new Date('2026-10-12T16:59:00Z')
    expect(localDate(d, TZ)).toBe('2026-10-12')
    expect(localTime(d, TZ)).toBe('23:59')
    expect(zonedToDate('2026-10-12', '23:59', TZ).toISOString()).toBe('2026-10-12T16:59:00.000Z')
    expect(zonedToDate('2026-10-13', '00:30', TZ).toISOString()).toBe('2026-10-12T17:30:00.000Z')
    expect(zonedToDate('2026-10-12', '08:00', 'UTC').toISOString()).toBe('2026-10-12T08:00:00.000Z')
  })

  it('handles daylight saving time zones', () => {
    // New York switches to EST on 2026-11-01.
    expect(zonedToDate('2026-07-01', '12:00', 'America/New_York').toISOString()).toBe('2026-07-01T16:00:00.000Z')
    expect(zonedToDate('2026-12-01', '12:00', 'America/New_York').toISOString()).toBe('2026-12-01T17:00:00.000Z')
  })

  it('does date arithmetic on calendar dates', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(daysBetween('2026-10-12', '2026-10-19')).toBe(7)
    expect(daysBetween('2026-10-12', '2026-10-11')).toBe(-1)
  })

  it('formats labels in Indonesian', () => {
    expect(formatLongDate('2026-10-12')).toBe('Senin, 12 Oktober 2026')
    expect(relativeDay('2026-10-12', '2026-10-12')).toBe('Hari ini')
    expect(relativeDay('2026-10-13', '2026-10-12')).toBe('Besok')
    expect(relativeDay('2026-10-11', '2026-10-12')).toBe('Kemarin')
    expect(relativeDay('2026-10-19', '2026-10-12')).toBe('Sen, 19 Okt')
    expect(relativeDay('2027-01-04', '2026-10-12')).toBe('Sen, 4 Jan 2027')
    const now = new Date('2026-10-12T01:00:00Z')
    expect(formatDeadline('2026-10-13T16:59:00Z', now, TZ)).toBe('Besok 23:59')
    expect(timeLeft('2026-10-12T04:00:00Z', now)).toBe('3 jam lagi')
    expect(timeLeft('2026-10-15T01:00:00Z', now)).toBe('3 hari lagi')
    expect(timeLeft('2026-10-12T00:30:00Z', now)).toBe('lewat 30 menit')
  })
})

function task(deadline: string, status: Task['status'] = 'todo'): Task {
  return {
    id: deadline,
    semester_id: 's',
    course_id: null,
    course: null,
    meeting_id: null,
    grade_component_id: null,
    title: deadline,
    description: '',
    deadline,
    status,
    priority: 'normal',
    submission_url: '',
    score: null,
    completed_at: null,
    created_at: deadline,
    updated_at: deadline,
  }
}

describe('task grouping', () => {
  // Monday 2026-10-12 08:00 WIB.
  const now = new Date('2026-10-12T01:00:00Z')

  it('puts tasks in the right group by local date', () => {
    expect(taskGroup(task('2026-10-12T00:00:00Z'), now, TZ)).toBe('overdue')
    expect(taskGroup(task('2026-10-12T00:00:00Z', 'submitted'), now, TZ)).toBe('past')
    expect(taskGroup(task('2026-10-12T16:59:00Z'), now, TZ)).toBe('today')
    expect(taskGroup(task('2026-10-12T17:00:00Z'), now, TZ)).toBe('tomorrow') // 00:00 Tuesday WIB
    expect(taskGroup(task('2026-10-19T16:59:00Z'), now, TZ)).toBe('week')
    expect(taskGroup(task('2026-10-19T17:00:00Z'), now, TZ)).toBe('later')
  })

  it('orders groups and tasks', () => {
    const groups = groupTasks(
      [
        task('2026-10-20T10:00:00Z'),
        task('2026-10-12T10:00:00Z'),
        task('2026-10-12T05:00:00Z'),
        task('2026-10-01T00:00:00Z'),
        task('2026-10-05T00:00:00Z', 'graded'),
        task('2026-10-06T00:00:00Z', 'submitted'),
      ],
      now,
      TZ,
    )
    expect(groups.map((g) => g.key)).toEqual(['overdue', 'today', 'later', 'past'])
    expect(groups[1].tasks.map((t) => t.deadline)).toEqual(['2026-10-12T05:00:00Z', '2026-10-12T10:00:00Z'])
    expect(groups[3].tasks.map((t) => t.deadline)).toEqual(['2026-10-06T00:00:00Z', '2026-10-05T00:00:00Z'])
    expect(groups[0].label).toBe('Terlambat')
  })
})

describe('labels', () => {
  it('summarizes schedules and attendance', () => {
    expect(scheduleSummary([])).toBe('Belum ada jadwal')
    expect(
      scheduleSummary([
        { id: '1', day_of_week: 1, start_time: '08:00', end_time: '09:40', room: 'A1' },
        { id: '2', day_of_week: 4, start_time: '13:00', end_time: '14:40', room: '' },
      ]),
    ).toBe('Sen 08:00-09:40 · A1, Kam 13:00-14:40')
    const base = {
      total: 14, held: 5, recorded: 4, present: 3, absences: 1, unrecorded: 1, required_present: 11,
      max_absences: 3, remaining_absences: 2, percentage: 75, level: 'safe' as const,
    }
    expect(attendanceSummaryText(base)).toBe('Hadir 75% · sisa jatah bolos 2 · 1 belum dicatat')
    expect(attendanceSummaryText({ ...base, remaining_absences: -1, unrecorded: 0 })).toBe('Hadir 75% · lewat 1 dari jatah bolos')
    expect(attendanceSummaryText({ ...base, total: 0 })).toBe('Belum ada pertemuan kuliah')
  })

  it('ships valid grade scale presets', () => {
    for (const preset of gradeScalePresets) {
      const letters = new Set(preset.scale.map((e) => e.letter))
      const mins = new Set(preset.scale.map((e) => e.min_score))
      expect(letters.size).toBe(preset.scale.length)
      expect(mins.size).toBe(preset.scale.length)
      expect(preset.scale.some((e) => e.min_score === 0)).toBe(true)
      expect(preset.scale.every((e) => e.points >= 0 && e.points <= 4)).toBe(true)
    }
  })
})

describe('uuidv7', () => {
  it('produces version 7 UUIDs ordered by time', () => {
    const a = uuidv7(1_700_000_000_000)
    const b = uuidv7(1_700_000_000_001)
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(a < b).toBe(true)
    expect(a.slice(0, 13)).toBe('018bcfe5-6800')
    expect(uuidv7()).not.toBe(uuidv7())
  })
})
