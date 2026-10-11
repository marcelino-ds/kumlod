package domain

import (
	"testing"
	"time"
)

func jakarta(t *testing.T) *time.Location {
	t.Helper()
	loc, err := time.LoadLocation("Asia/Jakarta")
	if err != nil {
		t.Fatal(err)
	}
	return loc
}

func TestTaskReminderWindow(t *testing.T) {
	deadline := time.Date(2026, 10, 20, 16, 59, 0, 0, time.UTC)
	tests := []struct {
		left time.Duration
		want string
		ok   bool
	}{
		{100 * time.Hour, "", false},
		{72*time.Hour + time.Second, "", false},
		{72 * time.Hour, NotifyTask72h, true},
		{30 * time.Hour, NotifyTask72h, true},
		{24 * time.Hour, NotifyTask24h, true},
		{4 * time.Hour, NotifyTask24h, true},
		{3 * time.Hour, NotifyTask3h, true},
		{time.Minute, NotifyTask3h, true},
		{0, "", false},
		{-time.Hour, "", false},
	}
	for _, tt := range tests {
		got, ok := TaskReminderWindow(deadline, deadline.Add(-tt.left))
		if got != tt.want || ok != tt.ok {
			t.Errorf("left %v: got %q %v want %q %v", tt.left, got, ok, tt.want, tt.ok)
		}
	}
}

func TestAttendanceReminderDue(t *testing.T) {
	loc := jakarta(t)
	at := func(day, hh, mm int) time.Time { return time.Date(2026, 10, day, hh, mm, 0, 0, loc) }
	tests := []struct {
		name       string
		now        time.Time
		date       string
		start, end string
		want       bool
	}{
		{"before start", at(12, 8, 0), "2026-10-12", "08:00", "09:40", false},
		{"14 minutes after start", at(12, 8, 14), "2026-10-12", "08:00", "09:40", false},
		{"15 minutes after start", at(12, 8, 15), "2026-10-12", "08:00", "09:40", true},
		{"during class", at(12, 9, 0), "2026-10-12", "08:00", "09:40", true},
		{"2 hours after end", at(12, 11, 40), "2026-10-12", "08:00", "09:40", true},
		{"past the grace period", at(12, 11, 41), "2026-10-12", "08:00", "09:40", false},
		{"other day", at(13, 8, 30), "2026-10-12", "08:00", "09:40", false},
		{"no start time", at(12, 8, 30), "2026-10-12", "", "", false},
		{"no end time uses start", at(12, 10, 0), "2026-10-12", "08:00", "", true},
		{"no end time grace ends 2h after start", at(12, 10, 1), "2026-10-12", "08:00", "", false},
		{"utc input is converted to local", time.Date(2026, 10, 12, 1, 30, 0, 0, time.UTC), "2026-10-12", "08:00", "09:40", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := AttendanceReminderDue(tt.now, tt.date, tt.start, tt.end, loc); got != tt.want {
				t.Errorf("got %v want %v", got, tt.want)
			}
		})
	}
}

func TestDigestDue(t *testing.T) {
	loc := jakarta(t)
	at := func(hh, mm int) time.Time { return time.Date(2026, 10, 12, hh, mm, 0, 0, loc) }
	tests := []struct {
		now  time.Time
		time string
		want bool
	}{
		{at(5, 59), "06:00", false},
		{at(6, 0), "06:00", true},
		{at(7, 30), "06:00", true},
		{at(8, 0), "06:00", true},
		{at(8, 1), "06:00", false},
		{at(23, 59), "23:00", true},
		{at(6, 0), "bad", false},
	}
	for _, tt := range tests {
		if got := DigestDue(tt.now, tt.time, loc); got != tt.want {
			t.Errorf("%s at %s: got %v want %v", tt.time, tt.now.Format("15:04"), got, tt.want)
		}
	}
}

func TestCompletedAt(t *testing.T) {
	now := time.Date(2026, 10, 12, 1, 0, 0, 0, time.UTC)
	earlier := now.Add(-time.Hour)
	tests := []struct {
		name     string
		prev     string
		prevAt   *time.Time
		next     string
		wantNil  bool
		wantTime time.Time
	}{
		{"todo to submitted sets now", TaskTodo, nil, TaskSubmitted, false, now},
		{"in progress to graded sets now", TaskInProgress, nil, TaskGraded, false, now},
		{"submitted to graded keeps time", TaskSubmitted, &earlier, TaskGraded, false, earlier},
		{"submitted to todo clears", TaskSubmitted, &earlier, TaskTodo, true, time.Time{}},
		{"graded to in progress clears", TaskGraded, &earlier, TaskInProgress, true, time.Time{}},
		{"todo to in progress stays empty", TaskTodo, nil, TaskInProgress, true, time.Time{}},
		{"done without timestamp gets now", TaskSubmitted, nil, TaskSubmitted, false, now},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := CompletedAt(tt.prev, tt.prevAt, tt.next, now)
			if tt.wantNil {
				if got != nil {
					t.Errorf("got %v want nil", got)
				}
				return
			}
			if got == nil || !got.Equal(tt.wantTime) {
				t.Errorf("got %v want %v", got, tt.wantTime)
			}
		})
	}
}
