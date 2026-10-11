package domain

// Meeting kinds.
const (
	KindLecture = "lecture"
	KindMidterm = "midterm"
	KindFinal   = "final"
)

// Meeting statuses.
const (
	MeetingScheduled = "scheduled"
	MeetingCancelled = "cancelled"
)

// Attendance values.
const (
	AttendancePresent = "present"
	AttendanceExcused = "excused"
	AttendanceSick    = "sick"
	AttendanceAbsent  = "absent"
)

// ValidMeetingKind reports whether k is a known meeting kind.
func ValidMeetingKind(k string) bool {
	return k == KindLecture || k == KindMidterm || k == KindFinal
}

// ValidMeetingStatus reports whether s is a known meeting status.
func ValidMeetingStatus(s string) bool {
	return s == MeetingScheduled || s == MeetingCancelled
}

// ValidAttendance reports whether a is a known attendance value.
func ValidAttendance(a string) bool {
	switch a {
	case AttendancePresent, AttendanceExcused, AttendanceSick, AttendanceAbsent:
		return true
	}
	return false
}

// AttendanceLevel classifies how close a course is to the absence limit.
type AttendanceLevel string

// Attendance levels.
const (
	LevelSafe     AttendanceLevel = "safe"
	LevelWarning  AttendanceLevel = "warning"
	LevelCritical AttendanceLevel = "critical"
	LevelExceeded AttendanceLevel = "exceeded"
)

// AttendanceRecord is the part of a meeting that matters for attendance.
type AttendanceRecord struct {
	Date       string // YYYY-MM-DD
	Kind       string
	Status     string
	Attendance string // empty when not recorded
}

// AttendanceSummary is the attendance state of one course.
type AttendanceSummary struct {
	Total             int // counted meetings: lectures that are not cancelled
	Held              int // counted meetings dated today or earlier
	Recorded          int
	Present           int
	Absences          int
	Unrecorded        int // counted meetings before today without a record
	RequiredPresent   int
	MaxAbsences       int
	RemainingAbsences int // negative when the limit is exceeded
	Percentage        *float64
	Level             AttendanceLevel
}

// SummarizeAttendance computes the attendance summary of a course.
// minPct is the minimum attendance percentage, today is the local date (YYYY-MM-DD).
// When countExcusedAsAbsent is true, excused and sick count as absences.
func SummarizeAttendance(records []AttendanceRecord, minPct int, countExcusedAsAbsent bool, today string) AttendanceSummary {
	var s AttendanceSummary
	for _, r := range records {
		if r.Kind != KindLecture || r.Status != MeetingScheduled {
			continue
		}
		s.Total++
		if r.Date <= today {
			s.Held++
		}
		if r.Attendance == "" {
			if r.Date < today {
				s.Unrecorded++
			}
			continue
		}
		s.Recorded++
		switch r.Attendance {
		case AttendancePresent:
			s.Present++
		case AttendanceExcused, AttendanceSick:
			if !countExcusedAsAbsent {
				s.Present++
			}
		}
	}
	s.Absences = s.Recorded - s.Present

	if minPct < 0 {
		minPct = 0
	}
	if minPct > 100 {
		minPct = 100
	}
	s.RequiredPresent = (minPct*s.Total + 99) / 100
	s.MaxAbsences = s.Total - s.RequiredPresent
	s.RemainingAbsences = s.MaxAbsences - s.Absences

	if s.Recorded > 0 {
		p := Round(float64(s.Present)*100/float64(s.Recorded), 1)
		s.Percentage = &p
	}

	switch {
	case s.Total == 0 || s.RemainingAbsences > 1:
		s.Level = LevelSafe
	case s.RemainingAbsences == 1:
		s.Level = LevelWarning
	case s.RemainingAbsences == 0:
		s.Level = LevelCritical
	default:
		s.Level = LevelExceeded
	}
	return s
}

// NeedsAttention reports whether the summary should appear as a dashboard alert.
func (s AttendanceSummary) NeedsAttention() bool {
	return s.Level != LevelSafe || s.Unrecorded > 0
}
