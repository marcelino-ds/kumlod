package domain

import (
	"errors"
	"testing"
)

func TestValidateSettings(t *testing.T) {
	tests := []struct {
		name      string
		mutate    func(s *Settings)
		wantField string // empty means valid
	}{
		{"defaults are valid", func(s *Settings) {}, ""},
		{"utc is valid", func(s *Settings) { s.Timezone = "UTC" }, ""},
		{"invalid timezone", func(s *Settings) { s.Timezone = "Mars/Olympus" }, "timezone"},
		{"local timezone is rejected", func(s *Settings) { s.Timezone = "Local" }, "timezone"},
		{"empty timezone", func(s *Settings) { s.Timezone = "" }, "timezone"},
		{"empty scale", func(s *Settings) { s.GradeScale = nil }, "grade_scale"},
		{"duplicate letter", func(s *Settings) { s.GradeScale[1].Letter = "A" }, "grade_scale[1].letter"},
		{"duplicate min score", func(s *Settings) { s.GradeScale[1].MinScore = 85 }, "grade_scale[1].min_score"},
		{"points above 4", func(s *Settings) { s.GradeScale[0].Points = 4.5 }, "grade_scale[0].points"},
		{"negative points", func(s *Settings) { s.GradeScale[0].Points = -1 }, "grade_scale[0].points"},
		{"min score above 100", func(s *Settings) { s.GradeScale[0].MinScore = 101 }, "grade_scale[0].min_score"},
		{"no zero entry", func(s *Settings) { s.GradeScale = s.GradeScale[:len(s.GradeScale)-1] }, "grade_scale"},
		{"long letter", func(s *Settings) { s.GradeScale[0].Letter = "AAAA" }, "grade_scale[0].letter"},
		{"blank letter", func(s *Settings) { s.GradeScale[0].Letter = " " }, "grade_scale[0].letter"},
		{"min attendance above 100", func(s *Settings) { s.DefaultMinAttendancePct = 101 }, "default_min_attendance_pct"},
		{"zero meetings", func(s *Settings) { s.DefaultTotalMeetings = 0 }, "default_total_meetings"},
		{"too many meetings", func(s *Settings) { s.DefaultTotalMeetings = 41 }, "default_total_meetings"},
		{"bad digest time", func(s *Settings) { s.Reminders.DigestTime = "6:00" }, "reminders.digest_time"},
		{"baseline gpa above 4", func(s *Settings) { g := 4.1; s.Baseline.GPA = &g }, "baseline.gpa"},
		{"baseline credits negative", func(s *Settings) { s.Baseline.Credits = -1 }, "baseline.credits"},
		{"baseline credits too high", func(s *Settings) { s.Baseline.Credits = 301 }, "baseline.credits"},
		{"double letter preset", func(s *Settings) {
			s.GradeScale = GradeScale{
				{"A", 80, 4}, {"AB", 75, 3.5}, {"B", 70, 3}, {"BC", 65, 2.5}, {"C", 60, 2}, {"D", 50, 1}, {"E", 0, 0},
			}
		}, ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := DefaultSettings()
			tt.mutate(&s)
			err := ValidateSettings(s)
			if tt.wantField == "" {
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				return
			}
			var ve *ValidationError
			if !errors.As(err, &ve) {
				t.Fatalf("expected validation error, got %v", err)
			}
			if _, ok := ve.Fields[tt.wantField]; !ok {
				t.Errorf("missing field %q in %v", tt.wantField, ve.Fields)
			}
		})
	}
}

func TestSettingsLocationFallback(t *testing.T) {
	s := DefaultSettings()
	s.Timezone = "Invalid/Zone"
	if got := s.Location().String(); got != DefaultTimezone {
		t.Errorf("fallback = %s", got)
	}
}

func TestFormatHelpers(t *testing.T) {
	dates := map[string]bool{
		"2026-09-01": true, "2026-02-29": false, "2028-02-29": true, "2026-9-01": false, "": false, "2026-13-01": false,
	}
	for in, want := range dates {
		if got := ValidDate(in); got != want {
			t.Errorf("ValidDate(%q) = %v", in, got)
		}
	}
	times := map[string]bool{
		"00:00": true, "23:59": true, "24:00": false, "7:00": false, "07:60": false, "ab:cd": false, "": false,
	}
	for in, want := range times {
		if got := ValidTime(in); got != want {
			t.Errorf("ValidTime(%q) = %v", in, got)
		}
	}
	ceil := []struct{ in, want float64 }{{96.666, 96.67}, {70, 70}, {70.000000000001, 70}, {0.001, 0.01}}
	for _, c := range ceil {
		if got := CeilTo(c.in, 2); got != c.want {
			t.Errorf("CeilTo(%v) = %v want %v", c.in, got, c.want)
		}
	}
	urls := map[string]bool{
		"https://example.com/a": true, "http://x.y": true, "javascript:alert(1)": false, "ftp://x": false, "https://": false, " https://x.y": false,
	}
	for in, want := range urls {
		if got := ValidHTTPURL(in); got != want {
			t.Errorf("ValidHTTPURL(%q) = %v", in, got)
		}
	}
	if !ValidHexColor("#6366f1") || ValidHexColor("#6366f") || ValidHexColor("6366f1a") {
		t.Error("ValidHexColor")
	}
}

func TestValidator(t *testing.T) {
	var v Validator
	if v.Err() != nil {
		t.Fatal("empty validator should be valid")
	}
	v.Add("a", "first")
	v.Add("a", "second")
	v.Check(true, "b", "never")
	err := v.Err()
	var ve *ValidationError
	if !errors.As(err, &ve) || ve.Fields["a"] != "first" || len(ve.Fields) != 1 || ve.Message != "first" {
		t.Errorf("got %#v", err)
	}
	if !errors.Is(NotFound("x"), ErrNotFound) || !errors.Is(Conflict("y"), ErrConflict) || errors.Is(NotFound("x"), ErrConflict) {
		t.Error("sentinel matching")
	}
}
