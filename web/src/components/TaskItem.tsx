import { Link } from '@tanstack/react-router'
import { ArrowUpRightIcon, ClockIcon, FlameIcon } from 'lucide-react'

import type { Task } from '@/api/client'
import { useSetTaskStatus } from '@/api/queries'
import { CourseChip } from '@/components/common'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/misc'
import { formatDeadline, timeLeft } from '@/lib/dates'
import { taskStatusLabel } from '@/lib/labels'
import { isOpen } from '@/lib/tasks'
import { cn } from '@/lib/utils'

const DAY = 86_400_000

/** A task card with a round check to mark it submitted (or back to todo). */
export function TaskItem({
  task,
  now,
  timeZone,
  showCourse = true,
}: {
  task: Task
  now: Date
  timeZone: string
  showCourse?: boolean
}) {
  const setStatus = useSetTaskStatus()
  const done = !isOpen(task.status)
  const msLeft = new Date(task.deadline).getTime() - now.getTime()
  const overdue = !done && msLeft < 0
  const soon = !done && !overdue && msLeft < DAY
  const checkboxId = `task-done-${task.id}`

  return (
    <li
      className={cn(
        'group relative flex items-start gap-3 rounded-2xl bg-card p-3.5 shadow-xs ring-1 ring-black/[0.03] transition-shadow hover:shadow-md dark:ring-white/[0.06]',
        done && 'bg-card/60 shadow-none',
      )}
    >
      <div className="relative z-10 -my-2 -ml-2 flex size-11 shrink-0 items-center justify-center">
        <Checkbox
          id={checkboxId}
          checked={done}
          onCheckedChange={(checked) => setStatus.mutate({ id: task.id, status: checked ? 'submitted' : 'todo' })}
          aria-label={done ? `Tandai "${task.title}" belum dikumpulkan` : `Tandai "${task.title}" sudah dikumpulkan`}
        />
      </div>
      <div className="min-w-0 flex-1">
        <Link
          to="/tugas/$taskId"
          params={{ taskId: task.id }}
          className={cn(
            'block leading-snug font-semibold break-words after:absolute after:inset-0 after:rounded-2xl hover:underline',
            done && 'text-muted-foreground line-through',
          )}
        >
          {task.title}
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
          {showCourse && task.course && <CourseChip course={task.course} />}
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-semibold',
              overdue
                ? 'bg-destructive text-white'
                : soon
                  ? 'bg-amber-100 text-amber-950 dark:bg-amber-950 dark:text-amber-200'
                  : 'bg-muted text-muted-foreground',
            )}
          >
            <ClockIcon className="size-3" aria-hidden />
            {formatDeadline(task.deadline, now, timeZone)}
            {!done && <span className="font-medium opacity-80">· {timeLeft(task.deadline, now)}</span>}
          </span>
          {task.priority === 'high' && (
            <Badge variant="danger">
              <FlameIcon aria-hidden /> Penting
            </Badge>
          )}
          {task.status === 'in_progress' && <Badge variant="info">{taskStatusLabel.in_progress}</Badge>}
          {task.status === 'graded' && (
            <Badge variant="success">
              {taskStatusLabel.graded}
              {task.score !== null && ` · ${task.score.toLocaleString('id-ID')}`}
            </Badge>
          )}
        </div>
      </div>
      {task.submission_url && !done && (
        <a
          href={task.submission_url}
          target="_blank"
          rel="noopener noreferrer"
          className="relative z-10 -my-1.5 -mr-1.5 inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-muted text-foreground transition-colors hover:bg-brand hover:text-brand-foreground"
          aria-label={`Buka link pengumpulan ${task.title}`}
        >
          <ArrowUpRightIcon className="size-4" />
        </a>
      )}
    </li>
  )
}
