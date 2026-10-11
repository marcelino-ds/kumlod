package domain

import "time"

// Notification kinds used as notification_log.kind.
const (
	NotifyTask72h    = "task_72h"
	NotifyTask24h    = "task_24h"
	NotifyTask3h     = "task_3h"
	NotifyAttendance = "attendance"
	NotifyDigest     = "digest"
)

// Reminder timing.
const (
	AttendanceReminderDelay = 15 * time.Minute
	AttendanceReminderGrace = 2 * time.Hour
	DigestGrace             = 2 * time.Hour
	DigestTaskHorizon       = 48 * time.Hour
	TaskReminderHorizon     = 72 * time.Hour
)

// TaskReminderWindow returns the reminder that applies to a task right now.
// Only the closest window is returned, so a task created 2 hours before its
// deadline only gets the 3-hour reminder.
func TaskReminderWindow(deadline, now time.Time) (string, bool) {
	left := deadline.Sub(now)
	switch {
	case left <= 0:
		return "", false
	case left <= 3*time.Hour:
		return NotifyTask3h, true
	case left <= 24*time.Hour:
		return NotifyTask24h, true
	case left <= 72*time.Hour:
		return NotifyTask72h, true
	}
	return "", false
}

// AttendanceReminderDue reports whether an attendance reminder should be sent for
// a meeting on date (local) that starts at startTime and ends at endTime (HH:MM,
// endTime may be empty). It is due from 15 minutes after the start until 2 hours
// after the end, and only on the meeting day.
func AttendanceReminderDue(now time.Time, date, startTime, endTime string, loc *time.Location) bool {
	if LocalDate(now, loc) != date || !ValidTime(startTime) {
		return false
	}
	start, err := LocalDateTime(date, startTime, loc)
	if err != nil {
		return false
	}
	end := start
	if ValidTime(endTime) {
		if e, err := LocalDateTime(date, endTime, loc); err == nil && e.After(start) {
			end = e
		}
	}
	return !now.Before(start.Add(AttendanceReminderDelay)) && !now.After(end.Add(AttendanceReminderGrace))
}

// DigestDue reports whether the daily digest window is open: from digestTime
// until 2 hours later, on the current local day.
func DigestDue(now time.Time, digestTime string, loc *time.Location) bool {
	at, err := LocalDateTime(LocalDate(now, loc), digestTime, loc)
	if err != nil {
		return false
	}
	return !now.Before(at) && !now.After(at.Add(DigestGrace))
}
