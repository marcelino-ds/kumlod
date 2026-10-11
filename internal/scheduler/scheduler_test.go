package scheduler

import (
	"context"
	"errors"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"kumlod/internal/clock"
	"kumlod/internal/db"
	"kumlod/internal/domain"
	"kumlod/internal/push"
	"kumlod/internal/store"
)

type fakePusher struct {
	msgs []push.Message
	fail bool // simulate network errors on every device
}

func (f *fakePusher) Broadcast(_ context.Context, msg push.Message) (push.Result, error) {
	if f.fail {
		return push.Result{Failed: 1, Retryable: 1}, nil
	}
	f.msgs = append(f.msgs, msg)
	return push.Result{Sent: 1}, nil
}

func (f *fakePusher) titles() []string {
	var out []string
	for _, m := range f.msgs {
		out = append(out, m.Title)
	}
	return out
}

type fixture struct {
	st     *store.Store
	clk    *clock.Fake
	pusher *fakePusher
	sched  *Scheduler
	loc    *time.Location
	ctx    context.Context
}

func setup(t *testing.T, now time.Time) *fixture {
	t.Helper()
	conn, err := db.Open(filepath.Join(t.TempDir(), "s.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { conn.Close() })
	ctx := context.Background()
	if err := db.Migrate(ctx, conn, nil); err != nil {
		t.Fatal(err)
	}
	clk := clock.NewFake(now)
	st := store.New(conn, clk)
	loc, _ := time.LoadLocation("Asia/Jakarta")
	p := &fakePusher{}
	if err := st.UpsertPushSubscription(ctx, store.PushSubscription{Endpoint: "https://push.example/x", P256dh: "k", Auth: "a"}); err != nil {
		t.Fatal(err)
	}
	return &fixture{st: st, clk: clk, pusher: p, sched: New(st, p, clk, nil), loc: loc, ctx: ctx}
}

// only enables the given reminder kinds and disables the rest.
func (f *fixture) only(t *testing.T, task, attendance, digest bool) {
	t.Helper()
	st, err := f.st.GetSettings(f.ctx)
	if err != nil {
		t.Fatal(err)
	}
	st.Reminders.TaskEnabled = task
	st.Reminders.AttendanceEnabled = attendance
	st.Reminders.DigestEnabled = digest
	if err := f.st.SaveSettings(f.ctx, st); err != nil {
		t.Fatal(err)
	}
}

func (f *fixture) tick(t *testing.T) {
	t.Helper()
	if err := f.sched.Tick(f.ctx); err != nil {
		t.Fatal(err)
	}
}

func (f *fixture) semester(t *testing.T) store.Semester {
	t.Helper()
	sem, err := f.st.CreateSemester(f.ctx, store.Semester{Name: "S3", Term: domain.TermOdd, StartDate: "2026-09-07", EndDate: "2027-01-15"}, true)
	if err != nil {
		t.Fatal(err)
	}
	return sem
}

func (f *fixture) course(t *testing.T, semID string, meetings []store.Meeting) store.Course {
	t.Helper()
	c, err := f.st.CreateCourse(f.ctx, store.Course{SemesterID: semID, Name: "Basis Data", Credits: 3, Color: "#6366f1", TotalMeetings: 16, MinAttendancePct: 75}, nil, meetings)
	if err != nil {
		t.Fatal(err)
	}
	return c
}

func TestTaskRemindersEachWindowOnce(t *testing.T) {
	start := time.Date(2026, 10, 11, 0, 0, 0, 0, time.UTC)
	f := setup(t, start)
	f.only(t, true, false, false)
	f.semester(t)
	deadline := start.Add(100 * time.Hour)
	task, err := f.st.CreateTask(f.ctx, store.Task{Title: "Laporan", Deadline: deadline})
	if err != nil {
		t.Fatal(err)
	}

	f.tick(t) // 100h left: nothing
	if len(f.pusher.msgs) != 0 {
		t.Fatalf("too early: %v", f.pusher.titles())
	}
	// Walk the clock every 30 minutes until past the deadline.
	for f.clk.Now().Before(deadline.Add(time.Hour)) {
		f.clk.Advance(30 * time.Minute)
		f.tick(t)
	}
	got := f.pusher.titles()
	want := []string{"Deadline 3 hari lagi: Laporan", "Deadline 24 jam lagi: Laporan", "Deadline 3 jam lagi: Laporan"}
	if strings.Join(got, "|") != strings.Join(want, "|") {
		t.Fatalf("got %v want %v", got, want)
	}
	if f.pusher.msgs[0].URL != "/tugas/"+task.ID {
		t.Errorf("url = %s", f.pusher.msgs[0].URL)
	}
}

func TestTaskCreatedLateGetsOnlyClosestWindow(t *testing.T) {
	start := time.Date(2026, 10, 11, 0, 0, 0, 0, time.UTC)
	f := setup(t, start)
	f.only(t, true, false, false)
	f.semester(t)
	if _, err := f.st.CreateTask(f.ctx, store.Task{Title: "Kuis", Deadline: start.Add(2 * time.Hour)}); err != nil {
		t.Fatal(err)
	}
	f.tick(t)
	f.clk.Advance(time.Hour)
	f.tick(t)
	if got := f.pusher.titles(); len(got) != 1 || got[0] != "Deadline 3 jam lagi: Kuis" {
		t.Fatalf("got %v", got)
	}
}

func TestTaskReminderStopsWhenSubmittedAndResetsOnNewDeadline(t *testing.T) {
	start := time.Date(2026, 10, 11, 0, 0, 0, 0, time.UTC)
	f := setup(t, start)
	f.only(t, true, false, false)
	f.semester(t)
	task, _ := f.st.CreateTask(f.ctx, store.Task{Title: "Esai", Deadline: start.Add(20 * time.Hour)})
	f.tick(t)
	if len(f.pusher.msgs) != 1 {
		t.Fatalf("first reminder: %v", f.pusher.titles())
	}

	// A new deadline resets the reminders.
	task.Deadline = start.Add(70 * time.Hour)
	if _, err := f.st.UpdateTask(f.ctx, task); err != nil {
		t.Fatal(err)
	}
	f.tick(t)
	if len(f.pusher.msgs) != 2 || f.pusher.msgs[1].Title != "Deadline 3 hari lagi: Esai" {
		t.Fatalf("after new deadline: %v", f.pusher.titles())
	}

	if _, err := f.st.SetTaskStatus(f.ctx, task.ID, domain.TaskSubmitted); err != nil {
		t.Fatal(err)
	}
	f.clk.Advance(50 * time.Hour)
	f.tick(t)
	if len(f.pusher.msgs) != 2 {
		t.Fatalf("submitted task must not be reminded: %v", f.pusher.titles())
	}
}

func TestAttendanceReminder(t *testing.T) {
	loc, _ := time.LoadLocation("Asia/Jakarta")
	// Monday 2026-10-12 08:00 local.
	start := time.Date(2026, 10, 12, 8, 0, 0, 0, loc)
	f := setup(t, start)
	f.only(t, false, true, false)
	sem := f.semester(t)
	c := f.course(t, sem.ID, []store.Meeting{
		{Number: 1, Date: "2026-10-12", StartTime: "08:00", EndTime: "09:40", Room: "A1", Kind: domain.KindLecture},
		{Number: 2, Date: "2026-10-12", StartTime: "13:00", EndTime: "14:40", Kind: domain.KindLecture, Status: domain.MeetingCancelled},
	})

	f.tick(t) // 08:00: too early
	f.clk.Set(time.Date(2026, 10, 12, 8, 15, 0, 0, loc))
	f.tick(t)
	f.clk.Advance(10 * time.Minute)
	f.tick(t) // still in window, but already sent
	if got := f.pusher.titles(); len(got) != 1 || got[0] != "Udah absen "+c.Name+"?" {
		t.Fatalf("got %v", got)
	}
	if !strings.HasPrefix(f.pusher.msgs[0].URL, "/?meeting=") {
		t.Errorf("url = %s", f.pusher.msgs[0].URL)
	}
	// Cancelled meeting at 13:00 never triggers.
	f.clk.Set(time.Date(2026, 10, 12, 13, 30, 0, 0, loc))
	f.tick(t)
	if len(f.pusher.msgs) != 1 {
		t.Fatalf("cancelled meeting reminded: %v", f.pusher.titles())
	}
}

func TestAttendanceReminderSkipsRecordedAndLate(t *testing.T) {
	loc, _ := time.LoadLocation("Asia/Jakarta")
	start := time.Date(2026, 10, 12, 12, 0, 0, 0, loc) // more than 2h after 09:40
	f := setup(t, start)
	sem := f.semester(t)
	f.course(t, sem.ID, []store.Meeting{
		{Number: 1, Date: "2026-10-12", StartTime: "08:00", EndTime: "09:40", Kind: domain.KindLecture},
		{Number: 2, Date: "2026-10-12", StartTime: "11:00", EndTime: "12:40", Kind: domain.KindLecture},
	})
	meetings, _ := f.st.ListMeetingsOnDate(f.ctx, sem.ID, "2026-10-12")
	present := domain.AttendancePresent
	if _, err := f.st.SetAttendance(f.ctx, meetings[1].Meeting.ID, &present); err != nil {
		t.Fatal(err)
	}
	f.tick(t)
	if len(f.pusher.msgs) != 0 {
		t.Fatalf("got %v", f.pusher.titles())
	}
}

func TestDigestOncePerDay(t *testing.T) {
	loc, _ := time.LoadLocation("Asia/Jakarta")
	start := time.Date(2026, 10, 12, 5, 59, 0, 0, loc)
	f := setup(t, start)
	sem := f.semester(t)
	f.course(t, sem.ID, []store.Meeting{{Number: 1, Date: "2026-10-12", StartTime: "08:00", EndTime: "09:40", Kind: domain.KindLecture}})
	if _, err := f.st.CreateTask(f.ctx, store.Task{Title: "Laporan", Deadline: start.Add(30 * time.Hour)}); err != nil {
		t.Fatal(err)
	}

	f.tick(t) // 05:59: before digest time
	// The task reminder (24h window) may fire; count digests only.
	f.clk.Set(time.Date(2026, 10, 12, 6, 0, 0, 0, loc))
	f.tick(t)
	f.clk.Set(time.Date(2026, 10, 12, 7, 0, 0, 0, loc))
	f.tick(t)
	digests := 0
	for _, m := range f.pusher.msgs {
		if m.Tag == "digest" {
			digests++
			if !strings.Contains(m.Body, "1 kuliah: Basis Data 08:00.") || !strings.Contains(m.Body, "1 tugas deadline 48 jam ke depan: Laporan.") {
				t.Errorf("body = %q", m.Body)
			}
			if m.Title != "Ringkasan Sen, 12 Okt" {
				t.Errorf("title = %q", m.Title)
			}
		}
	}
	if digests != 1 {
		t.Fatalf("digests = %d (%v)", digests, f.pusher.titles())
	}

	// Next day after the 2-hour window: no digest.
	f.clk.Set(time.Date(2026, 10, 13, 8, 1, 0, 0, loc))
	f.tick(t)
	for _, m := range f.pusher.msgs[len(f.pusher.msgs)-1:] {
		if m.Tag == "digest" && m.Title != "Ringkasan Sen, 12 Okt" {
			t.Errorf("late digest sent: %q", m.Title)
		}
	}
}

func TestDigestSkippedWhenNothingToReport(t *testing.T) {
	loc, _ := time.LoadLocation("Asia/Jakarta")
	f := setup(t, time.Date(2026, 10, 12, 6, 30, 0, 0, loc))
	f.semester(t)
	f.tick(t)
	if len(f.pusher.msgs) != 0 {
		t.Fatalf("got %v", f.pusher.titles())
	}
}

func TestRetryAfterNetworkFailure(t *testing.T) {
	start := time.Date(2026, 10, 11, 0, 0, 0, 0, time.UTC)
	f := setup(t, start)
	f.only(t, true, false, false)
	f.semester(t)
	if _, err := f.st.CreateTask(f.ctx, store.Task{Title: "Kuis", Deadline: start.Add(2 * time.Hour)}); err != nil {
		t.Fatal(err)
	}
	f.pusher.fail = true
	f.tick(t)
	f.pusher.fail = false
	f.clk.Advance(time.Minute)
	f.tick(t)
	if got := f.pusher.titles(); len(got) != 1 {
		t.Fatalf("retry: %v", got)
	}
}

func TestNoSubscriptionsSkipsEverything(t *testing.T) {
	start := time.Date(2026, 10, 11, 0, 0, 0, 0, time.UTC)
	f := setup(t, start)
	f.semester(t)
	if err := f.st.DeletePushSubscription(f.ctx, "https://push.example/x"); err != nil {
		t.Fatal(err)
	}
	task, _ := f.st.CreateTask(f.ctx, store.Task{Title: "Kuis", Deadline: start.Add(2 * time.Hour)})
	f.tick(t)
	// Nothing was logged, so the reminder is still pending for later.
	fresh, err := f.st.LogNotification(f.ctx, domain.NotifyTask3h, task.ID+"|"+store.FormatTime(task.Deadline))
	if err != nil || !fresh {
		t.Errorf("reminder should not be logged without devices: %v %v", fresh, err)
	}
}

func TestDisabledReminders(t *testing.T) {
	start := time.Date(2026, 10, 11, 0, 0, 0, 0, time.UTC)
	f := setup(t, start)
	f.semester(t)
	f.only(t, false, true, false)
	if _, err := f.st.CreateTask(f.ctx, store.Task{Title: "Kuis", Deadline: start.Add(2 * time.Hour)}); err != nil {
		t.Fatal(err)
	}
	f.tick(t)
	if len(f.pusher.msgs) != 0 {
		t.Fatalf("disabled: %v", f.pusher.titles())
	}
}

func TestRunStopsOnCancel(t *testing.T) {
	f := setup(t, time.Now())
	f.sched.FirstDelay = time.Millisecond
	f.sched.Interval = time.Millisecond
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() { f.sched.Run(ctx); close(done) }()
	time.Sleep(20 * time.Millisecond)
	cancel()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("Run did not stop")
	}
}

func TestFormatDate(t *testing.T) {
	loc, _ := time.LoadLocation("Asia/Jakarta")
	d := time.Date(2026, 10, 12, 16, 59, 0, 0, time.UTC) // 23:59 WIB
	if got := FormatDateTime(d, loc); got != "Sen, 12 Okt 23:59" {
		t.Errorf("got %q", got)
	}
	if !errors.Is(push.ErrNoSubscriptions, push.ErrNoSubscriptions) {
		t.Fatal("sanity")
	}
}
