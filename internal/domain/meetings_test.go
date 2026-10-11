package domain

import (
	"testing"
)

func TestGenerateMeetings(t *testing.T) {
	// 2026-09-07 is a Monday.
	mon := ScheduleSlot{DayOfWeek: 1, StartTime: "08:00", EndTime: "09:40", Room: "A1"}
	wedLate := ScheduleSlot{DayOfWeek: 3, StartTime: "13:00", EndTime: "14:40", Room: "B2"}
	wedEarly := ScheduleSlot{DayOfWeek: 3, StartTime: "07:00", EndTime: "08:40", Room: "B1"}

	t.Run("weekly slot with 16 meetings", func(t *testing.T) {
		got, err := GenerateMeetings("2026-09-07", []ScheduleSlot{mon}, 16)
		if err != nil {
			t.Fatal(err)
		}
		if len(got) != 16 {
			t.Fatalf("len = %d", len(got))
		}
		if got[0].Date != "2026-09-07" || got[1].Date != "2026-09-14" || got[15].Date != "2026-12-21" {
			t.Errorf("dates: %s %s %s", got[0].Date, got[1].Date, got[15].Date)
		}
		for i, m := range got {
			if m.Number != i+1 || m.StartTime != "08:00" || m.EndTime != "09:40" || m.Room != "A1" {
				t.Errorf("meeting %d: %+v", i, m)
			}
			want := KindLecture
			switch m.Number {
			case 8:
				want = KindMidterm
			case 16:
				want = KindFinal
			}
			if m.Kind != want {
				t.Errorf("meeting %d kind %s want %s", m.Number, m.Kind, want)
			}
		}
	})

	t.Run("start date mid-week and two slots on one day are ordered by time", func(t *testing.T) {
		// Start on Tuesday 2026-09-08: first is Wednesday 07:00, then Wednesday 13:00, then Monday.
		got, err := GenerateMeetings("2026-09-08", []ScheduleSlot{mon, wedLate, wedEarly}, 5)
		if err != nil {
			t.Fatal(err)
		}
		want := []struct{ date, start string }{
			{"2026-09-09", "07:00"},
			{"2026-09-09", "13:00"},
			{"2026-09-14", "08:00"},
			{"2026-09-16", "07:00"},
			{"2026-09-16", "13:00"},
		}
		for i, w := range want {
			if got[i].Date != w.date || got[i].StartTime != w.start {
				t.Errorf("meeting %d = %s %s, want %s %s", i+1, got[i].Date, got[i].StartTime, w.date, w.start)
			}
		}
		// N = 5: midterm is meeting 2, final is meeting 5.
		if got[1].Kind != KindMidterm || got[4].Kind != KindFinal || got[0].Kind != KindLecture {
			t.Errorf("kinds: %s %s %s", got[0].Kind, got[1].Kind, got[4].Kind)
		}
	})

	t.Run("fewer than 4 meetings has no exams", func(t *testing.T) {
		got, err := GenerateMeetings("2026-09-07", []ScheduleSlot{mon}, 3)
		if err != nil {
			t.Fatal(err)
		}
		for _, m := range got {
			if m.Kind != KindLecture {
				t.Errorf("meeting %d kind %s", m.Number, m.Kind)
			}
		}
	})

	t.Run("sunday is ISO day 7", func(t *testing.T) {
		got, err := GenerateMeetings("2026-09-07", []ScheduleSlot{{DayOfWeek: 7, StartTime: "10:00", EndTime: "11:00"}}, 1)
		if err != nil {
			t.Fatal(err)
		}
		if got[0].Date != "2026-09-13" {
			t.Errorf("date = %s", got[0].Date)
		}
	})

	t.Run("errors", func(t *testing.T) {
		if _, err := GenerateMeetings("2026-09-07", nil, 16); err == nil {
			t.Error("expected error without slots")
		}
		if _, err := GenerateMeetings("2026-13-01", []ScheduleSlot{mon}, 16); err == nil {
			t.Error("expected error for invalid date")
		}
		if _, err := GenerateMeetings("2026-09-07", []ScheduleSlot{mon}, 0); err == nil {
			t.Error("expected error for zero meetings")
		}
	})

	t.Run("invalid day of week generates nothing", func(t *testing.T) {
		got, err := GenerateMeetings("2026-09-07", []ScheduleSlot{{DayOfWeek: 9, StartTime: "08:00"}}, 4)
		if err != nil {
			t.Fatal(err)
		}
		if len(got) != 0 {
			t.Errorf("len = %d", len(got))
		}
	})
}
