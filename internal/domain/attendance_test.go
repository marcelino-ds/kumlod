package domain

import "testing"

func lectures(dates []string, att []string) []AttendanceRecord {
	out := make([]AttendanceRecord, len(dates))
	for i, d := range dates {
		a := ""
		if i < len(att) {
			a = att[i]
		}
		out[i] = AttendanceRecord{Date: d, Kind: KindLecture, Status: MeetingScheduled, Attendance: a}
	}
	return out
}

func fourteenLectures() []string {
	dates := make([]string, 14)
	for i := range dates {
		d, _ := AddDays("2026-09-01", i*7)
		dates[i] = d
	}
	return dates
}

func TestSummarizeAttendance(t *testing.T) {
	f := func(v float64) *float64 { return &v }
	tests := []struct {
		name        string
		records     []AttendanceRecord
		minPct      int
		countExcuse bool
		today       string
		want        AttendanceSummary
	}{
		{
			name:    "no meetings is safe",
			records: nil, minPct: 75, countExcuse: true, today: "2026-09-10",
			want: AttendanceSummary{Level: LevelSafe},
		},
		{
			name:    "14 lectures at 75 percent allows 3 absences",
			records: lectures(fourteenLectures(), nil), minPct: 75, countExcuse: true, today: "2026-08-01",
			want: AttendanceSummary{Total: 14, RequiredPresent: 11, MaxAbsences: 3, RemainingAbsences: 3, Level: LevelSafe},
		},
		{
			name: "excused and sick count as absent by default",
			records: lectures(fourteenLectures(),
				[]string{AttendancePresent, AttendanceExcused, AttendanceSick}),
			minPct: 75, countExcuse: true, today: "2026-09-15",
			want: AttendanceSummary{
				Total: 14, Held: 3, Recorded: 3, Present: 1, Absences: 2, Unrecorded: 0,
				RequiredPresent: 11, MaxAbsences: 3, RemainingAbsences: 1,
				Percentage: f(33.3), Level: LevelWarning,
			},
		},
		{
			name: "excused and sick count as present when the rule is off",
			records: lectures(fourteenLectures(),
				[]string{AttendancePresent, AttendanceExcused, AttendanceSick}),
			minPct: 75, countExcuse: false, today: "2026-09-15",
			want: AttendanceSummary{
				Total: 14, Held: 3, Recorded: 3, Present: 3, Absences: 0,
				RequiredPresent: 11, MaxAbsences: 3, RemainingAbsences: 3,
				Percentage: f(100), Level: LevelSafe,
			},
		},
		{
			name: "critical when no absences remain",
			records: lectures(fourteenLectures(),
				[]string{AttendanceAbsent, AttendanceAbsent, AttendanceAbsent, AttendancePresent}),
			minPct: 75, countExcuse: true, today: "2026-09-22",
			want: AttendanceSummary{
				Total: 14, Held: 4, Recorded: 4, Present: 1, Absences: 3,
				RequiredPresent: 11, MaxAbsences: 3, RemainingAbsences: 0,
				Percentage: f(25), Level: LevelCritical,
			},
		},
		{
			name: "exceeded when absences pass the limit",
			records: lectures(fourteenLectures(),
				[]string{AttendanceAbsent, AttendanceAbsent, AttendanceAbsent, AttendanceAbsent}),
			minPct: 75, countExcuse: true, today: "2026-09-22",
			want: AttendanceSummary{
				Total: 14, Held: 4, Recorded: 4, Present: 0, Absences: 4,
				RequiredPresent: 11, MaxAbsences: 3, RemainingAbsences: -1,
				Percentage: f(0), Level: LevelExceeded,
			},
		},
		{
			name: "unrecorded counts past meetings only, today is held but not unrecorded",
			records: lectures([]string{"2026-09-01", "2026-09-08", "2026-09-15", "2026-09-22"},
				[]string{AttendancePresent}),
			minPct: 75, countExcuse: true, today: "2026-09-15",
			want: AttendanceSummary{
				Total: 4, Held: 3, Recorded: 1, Present: 1, Absences: 0, Unrecorded: 1,
				RequiredPresent: 3, MaxAbsences: 1, RemainingAbsences: 1,
				Percentage: f(100), Level: LevelWarning,
			},
		},
		{
			name: "cancelled meetings and exams are not counted",
			records: []AttendanceRecord{
				{Date: "2026-09-01", Kind: KindLecture, Status: MeetingScheduled, Attendance: AttendancePresent},
				{Date: "2026-09-08", Kind: KindLecture, Status: MeetingCancelled, Attendance: AttendanceAbsent},
				{Date: "2026-09-15", Kind: KindMidterm, Status: MeetingScheduled},
				{Date: "2026-09-22", Kind: KindFinal, Status: MeetingScheduled, Attendance: AttendanceAbsent},
				{Date: "2026-09-29", Kind: KindLecture, Status: MeetingScheduled},
			},
			minPct: 100, countExcuse: true, today: "2026-10-30",
			want: AttendanceSummary{
				Total: 2, Held: 2, Recorded: 1, Present: 1, Absences: 0, Unrecorded: 1,
				RequiredPresent: 2, MaxAbsences: 0, RemainingAbsences: 0,
				Percentage: f(100), Level: LevelCritical,
			},
		},
		{
			name:    "zero minimum allows every meeting to be missed",
			records: lectures([]string{"2026-09-01", "2026-09-08"}, nil), minPct: 0, countExcuse: true, today: "2026-08-01",
			want: AttendanceSummary{Total: 2, RequiredPresent: 0, MaxAbsences: 2, RemainingAbsences: 2, Level: LevelSafe},
		},
		{
			name:    "required present rounds up",
			records: lectures([]string{"2026-09-01", "2026-09-08", "2026-09-15"}, nil), minPct: 75, countExcuse: true, today: "2026-08-01",
			want: AttendanceSummary{Total: 3, RequiredPresent: 3, MaxAbsences: 0, RemainingAbsences: 0, Level: LevelCritical},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := SummarizeAttendance(tt.records, tt.minPct, tt.countExcuse, tt.today)
			if !equalAttendance(got, tt.want) {
				t.Errorf("got %+v (pct %v)\nwant %+v (pct %v)", got, deref(got.Percentage), tt.want, deref(tt.want.Percentage))
			}
		})
	}
}

func TestNeedsAttention(t *testing.T) {
	tests := []struct {
		s    AttendanceSummary
		want bool
	}{
		{AttendanceSummary{Level: LevelSafe}, false},
		{AttendanceSummary{Level: LevelSafe, Unrecorded: 1}, true},
		{AttendanceSummary{Level: LevelWarning}, true},
		{AttendanceSummary{Level: LevelExceeded}, true},
	}
	for _, tt := range tests {
		if got := tt.s.NeedsAttention(); got != tt.want {
			t.Errorf("%+v: got %v want %v", tt.s, got, tt.want)
		}
	}
}

func equalAttendance(a, b AttendanceSummary) bool {
	if (a.Percentage == nil) != (b.Percentage == nil) {
		return false
	}
	if a.Percentage != nil && *a.Percentage != *b.Percentage {
		return false
	}
	a.Percentage, b.Percentage = nil, nil
	return a == b
}

func deref(p *float64) any {
	if p == nil {
		return nil
	}
	return *p
}
