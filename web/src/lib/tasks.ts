import type { components } from '@/api/schema'

import { daysBetween, localDate } from './dates'

type Task = components['schemas']['Task']

export type TaskGroupKey = 'overdue' | 'today' | 'tomorrow' | 'week' | 'later' | 'past'

export const taskGroupLabel: Record<TaskGroupKey, string> = {
  overdue: 'Terlambat',
  today: 'Hari ini',
  tomorrow: 'Besok',
  week: '7 hari ke depan',
  later: 'Nanti',
  past: 'Sudah lewat',
}

const order: TaskGroupKey[] = ['overdue', 'today', 'tomorrow', 'week', 'later', 'past']

export function isOpen(status: Task['status']): boolean {
  return status === 'todo' || status === 'in_progress'
}

/** Which group a task belongs to, based on its deadline in the app time zone. */
export function taskGroup(task: Pick<Task, 'deadline' | 'status'>, now: Date, timeZone: string): TaskGroupKey {
  const deadline = new Date(task.deadline)
  if (deadline.getTime() < now.getTime()) return isOpen(task.status) ? 'overdue' : 'past'
  const diff = daysBetween(localDate(now, timeZone), localDate(deadline, timeZone))
  if (diff <= 0) return 'today'
  if (diff === 1) return 'tomorrow'
  if (diff <= 7) return 'week'
  return 'later'
}

/** Groups tasks into Terlambat, Hari ini, Besok, 7 hari ke depan, Nanti, and Sudah lewat. */
export function groupTasks<T extends Pick<Task, 'deadline' | 'status'>>(
  tasks: T[],
  now: Date,
  timeZone: string,
): { key: TaskGroupKey; label: string; tasks: T[] }[] {
  const buckets = new Map<TaskGroupKey, T[]>()
  for (const t of tasks) {
    const key = taskGroup(t, now, timeZone)
    const list = buckets.get(key) ?? []
    list.push(t)
    buckets.set(key, list)
  }
  return order
    .filter((key) => buckets.has(key))
    .map((key) => {
      const list = [...(buckets.get(key) ?? [])].sort((a, b) => a.deadline.localeCompare(b.deadline))
      if (key === 'past') list.reverse()
      return { key, label: taskGroupLabel[key], tasks: list }
    })
}
