import { CheckIcon, FileTextIcon, ThermometerIcon, XIcon } from 'lucide-react'

import type { AttendanceValue, Meeting } from '@/api/client'
import { useSetAttendance } from '@/api/queries'
import { attendanceLabel, attendanceOrder } from '@/lib/labels'
import { cn } from '@/lib/utils'

const pressed: Record<AttendanceValue, string> = {
  present: 'bg-emerald-600 text-white shadow-sm',
  excused: 'bg-sky-600 text-white shadow-sm',
  sick: 'bg-amber-400 text-amber-950 shadow-sm',
  absent: 'bg-red-600 text-white shadow-sm',
}

const icons: Record<AttendanceValue, typeof CheckIcon> = {
  present: CheckIcon,
  excused: FileTextIcon,
  sick: ThermometerIcon,
  absent: XIcon,
}

/**
 * Four toggle buttons: Hadir, Izin, Sakit, Alpa. Tapping the active one clears
 * the record. The change shows immediately and is sent when online.
 */
export function AttendancePicker({
  meeting,
  label,
  className,
}: {
  meeting: Pick<Meeting, 'id' | 'course_id' | 'attendance'>
  label: string
  className?: string
}) {
  const setAttendance = useSetAttendance()
  return (
    <div
      role="group"
      aria-label={`Absen ${label}`}
      className={cn('grid grid-cols-4 gap-1 rounded-full bg-foreground/[0.05] p-1 dark:bg-black/20', className)}
    >
      {attendanceOrder.map((value) => {
        const active = meeting.attendance === value
        const Icon = icons[value]
        return (
          <button
            key={value}
            type="button"
            aria-pressed={active}
            onClick={() => setAttendance.mutate({ meeting, status: active ? null : value })}
            className={cn(
              'inline-flex h-11 items-center justify-center gap-1.5 rounded-full px-1 text-sm font-semibold transition-all focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none active:scale-95',
              active ? pressed[value] : 'text-foreground/75 hover:bg-card hover:text-foreground',
            )}
          >
            <Icon className={cn('hidden size-4 min-[380px]:block', !active && 'opacity-60')} strokeWidth={2.5} aria-hidden />
            {attendanceLabel[value]}
          </button>
        )
      })}
    </div>
  )
}
