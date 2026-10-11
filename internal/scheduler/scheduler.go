// Package scheduler sends task reminders, attendance reminders, and the daily
// digest. Every notification is logged in notification_log so it goes out once.
package scheduler

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"kumlod/internal/clock"
	"kumlod/internal/domain"
	"kumlod/internal/push"
	"kumlod/internal/store"
)

// Pusher sends a message to every subscribed device.
type Pusher interface {
	Broadcast(ctx context.Context, msg push.Message) (push.Result, error)
}

// Defaults for the run loop.
const (
	DefaultInterval   = time.Minute
	DefaultFirstDelay = 10 * time.Second
	housekeepEvery    = time.Hour
	logRetention      = 60 * 24 * time.Hour
)

// Scheduler runs the reminder jobs.
type Scheduler struct {
	store      *store.Store
	pusher     Pusher
	clock      clock.Clock
	log        *slog.Logger
	Interval   time.Duration
	FirstDelay time.Duration

	lastHousekeeping time.Time
}

// New returns a scheduler with the default timing.
func New(st *store.Store, p Pusher, c clock.Clock, log *slog.Logger) *Scheduler {
	if log == nil {
		log = slog.New(slog.DiscardHandler)
	}
	return &Scheduler{store: st, pusher: p, clock: c, log: log, Interval: DefaultInterval, FirstDelay: DefaultFirstDelay}
}

// Run ticks until ctx is cancelled.
func (s *Scheduler) Run(ctx context.Context) {
	timer := time.NewTimer(s.FirstDelay)
	defer timer.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-timer.C:
		}
		if err := s.Tick(ctx); err != nil && ctx.Err() == nil {
			s.log.Error("scheduler tick gagal", "err", err)
		}
		timer.Reset(s.Interval)
	}
}

// Tick runs every job once.
func (s *Scheduler) Tick(ctx context.Context) error {
	now := s.clock.Now()
	s.housekeeping(ctx, now)

	n, err := s.store.CountPushSubscriptions(ctx)
	if err != nil {
		return err
	}
	if n == 0 {
		return nil
	}
	st, err := s.store.GetSettings(ctx)
	if err != nil {
		return err
	}
	loc := st.Location()
	var errs []error
	if st.Reminders.TaskEnabled {
		errs = append(errs, s.taskReminders(ctx, now, loc))
	}
	if st.Reminders.AttendanceEnabled {
		errs = append(errs, s.attendanceReminders(ctx, now, loc))
	}
	if st.Reminders.DigestEnabled {
		errs = append(errs, s.digest(ctx, now, loc, st.Reminders.DigestTime))
	}
	return errors.Join(errs...)
}

func (s *Scheduler) housekeeping(ctx context.Context, now time.Time) {
	if !s.lastHousekeeping.IsZero() && now.Sub(s.lastHousekeeping) < housekeepEvery {
		return
	}
	s.lastHousekeeping = now
	if n, err := s.store.DeleteExpiredSessions(ctx, now); err != nil {
		s.log.Warn("hapus sesi kedaluwarsa gagal", "err", err)
	} else if n > 0 {
		s.log.Info("sesi kedaluwarsa dihapus", "count", n)
	}
	if _, err := s.store.PruneNotificationLog(ctx, now.Add(-logRetention)); err != nil {
		s.log.Warn("bersihkan notification_log gagal", "err", err)
	}
}

// send logs (kind, ref) and broadcasts msg if it was not sent before. When no
// device could be reached because of temporary errors, the log entry is
// removed so the next tick retries.
func (s *Scheduler) send(ctx context.Context, kind, ref string, msg push.Message) error {
	fresh, err := s.store.LogNotification(ctx, kind, ref)
	if err != nil || !fresh {
		return err
	}
	res, err := s.pusher.Broadcast(ctx, msg)
	if err != nil || (res.Sent == 0 && res.Retryable > 0) {
		if uerr := s.store.UnlogNotification(ctx, kind, ref); uerr != nil {
			return errors.Join(err, uerr)
		}
		if err != nil && !errors.Is(err, push.ErrNoSubscriptions) {
			return err
		}
		return nil
	}
	s.log.Info("notifikasi terkirim", "kind", kind, "sent", res.Sent, "failed", res.Failed)
	return nil
}

func (s *Scheduler) taskReminders(ctx context.Context, now time.Time, loc *time.Location) error {
	to := now.Add(domain.TaskReminderHorizon + time.Millisecond)
	tasks, err := s.store.ListTasks(ctx, store.TaskFilter{
		Statuses: []string{domain.TaskTodo, domain.TaskInProgress},
		DueFrom:  &now,
		DueTo:    &to,
	})
	if err != nil {
		return err
	}
	var errs []error
	for _, t := range tasks {
		kind, ok := domain.TaskReminderWindow(t.Deadline, now)
		if !ok {
			continue
		}
		ref := t.ID + "|" + store.FormatTime(t.Deadline)
		errs = append(errs, s.send(ctx, kind, ref, taskMessage(t, kind, loc)))
	}
	return errors.Join(errs...)
}

func taskMessage(t store.Task, kind string, loc *time.Location) push.Message {
	left := map[string]string{
		domain.NotifyTask72h: "3 hari lagi",
		domain.NotifyTask24h: "24 jam lagi",
		domain.NotifyTask3h:  "3 jam lagi",
	}[kind]
	body := "Deadline " + FormatDateTime(t.Deadline, loc)
	if t.Course != nil {
		body = t.Course.Name + " · " + body
	}
	return push.Message{
		Title: "Deadline " + left + ": " + t.Title,
		Body:  body,
		URL:   "/tugas/" + t.ID,
		Tag:   "task-" + t.ID,
	}
}

func (s *Scheduler) attendanceReminders(ctx context.Context, now time.Time, loc *time.Location) error {
	sem, err := s.store.GetActiveSemester(ctx)
	if errors.Is(err, domain.ErrNotFound) {
		return nil
	}
	if err != nil {
		return err
	}
	today := domain.LocalDate(now, loc)
	meetings, err := s.store.ListUnrecordedMeetingsOnDate(ctx, sem.ID, today)
	if err != nil {
		return err
	}
	var errs []error
	for _, x := range meetings {
		m := x.Meeting
		if !domain.AttendanceReminderDue(now, m.Date, m.StartTime, m.EndTime, loc) {
			continue
		}
		when := m.StartTime
		if m.EndTime != "" {
			when += "-" + m.EndTime
		}
		body := fmt.Sprintf("Pertemuan %d · %s", m.Number, when)
		if m.Room != "" {
			body += " · " + m.Room
		}
		errs = append(errs, s.send(ctx, domain.NotifyAttendance, m.ID+"|"+m.Date, push.Message{
			Title: "Udah absen " + x.Course.Name + "?",
			Body:  body + ". Tap buat catat kehadiran.",
			URL:   "/?meeting=" + m.ID,
			Tag:   "attendance-" + m.ID,
		}))
	}
	return errors.Join(errs...)
}

func (s *Scheduler) digest(ctx context.Context, now time.Time, loc *time.Location, digestTime string) error {
	if !domain.DigestDue(now, digestTime, loc) {
		return nil
	}
	today := domain.LocalDate(now, loc)

	var classes []string
	sem, err := s.store.GetActiveSemester(ctx)
	switch {
	case err == nil:
		meetings, err := s.store.ListMeetingsOnDate(ctx, sem.ID, today)
		if err != nil {
			return err
		}
		for _, x := range meetings {
			if x.Meeting.Status == domain.MeetingCancelled {
				continue
			}
			label := x.Course.Name
			if x.Meeting.StartTime != "" {
				label += " " + x.Meeting.StartTime
			}
			classes = append(classes, label)
		}
	case !errors.Is(err, domain.ErrNotFound):
		return err
	}

	to := now.Add(domain.DigestTaskHorizon)
	tasks, err := s.store.ListTasks(ctx, store.TaskFilter{
		Statuses: []string{domain.TaskTodo, domain.TaskInProgress},
		DueFrom:  &now,
		DueTo:    &to,
	})
	if err != nil {
		return err
	}
	if len(classes) == 0 && len(tasks) == 0 {
		return nil
	}
	return s.send(ctx, domain.NotifyDigest, today, push.Message{
		Title: "Ringkasan " + FormatDate(now, loc),
		Body:  digestBody(classes, tasks),
		URL:   "/",
		Tag:   "digest",
	})
}

func digestBody(classes []string, tasks []store.Task) string {
	var parts []string
	if len(classes) > 0 {
		parts = append(parts, fmt.Sprintf("%d kuliah: %s.", len(classes), strings.Join(classes, ", ")))
	} else {
		parts = append(parts, "Ga ada kuliah hari ini.")
	}
	switch len(tasks) {
	case 0:
	case 1:
		parts = append(parts, "1 tugas deadline 48 jam ke depan: "+tasks[0].Title+".")
	default:
		parts = append(parts, fmt.Sprintf("%d tugas deadline 48 jam ke depan.", len(tasks)))
	}
	return strings.Join(parts, " ")
}

var (
	dayNames   = []string{"Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"}
	monthNames = []string{"Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"}
)

// FormatDate formats t in loc as "Sen, 12 Okt".
func FormatDate(t time.Time, loc *time.Location) string {
	l := t.In(loc)
	return fmt.Sprintf("%s, %d %s", dayNames[l.Weekday()], l.Day(), monthNames[l.Month()-1])
}

// FormatDateTime formats t in loc as "Sen, 12 Okt 23:59".
func FormatDateTime(t time.Time, loc *time.Location) string {
	return FormatDate(t, loc) + " " + t.In(loc).Format(domain.TimeLayout)
}
