package domain

import (
	"fmt"
	"math"
	"strings"
	"time"
)

// ReminderSettings toggles each reminder kind.
type ReminderSettings struct {
	TaskEnabled       bool   `json:"task_enabled"`
	AttendanceEnabled bool   `json:"attendance_enabled"`
	DigestEnabled     bool   `json:"digest_enabled"`
	DigestTime        string `json:"digest_time"`
}

// Settings are the application settings stored under settings.key = 'app'.
type Settings struct {
	Timezone                string           `json:"timezone"`
	GradeScale              GradeScale       `json:"grade_scale"`
	GradeScaleConfirmed     bool             `json:"grade_scale_confirmed"`
	CountExcusedAsAbsent    bool             `json:"count_excused_as_absent"`
	DefaultMinAttendancePct int              `json:"default_min_attendance_pct"`
	DefaultTotalMeetings    int              `json:"default_total_meetings"`
	Reminders               ReminderSettings `json:"reminders"`
	Baseline                Baseline         `json:"baseline"`
}

// DefaultTimezone is used until the user picks another zone.
const DefaultTimezone = "Asia/Jakarta"

// DefaultGradeScale is the plus-minus preset.
func DefaultGradeScale() GradeScale {
	return GradeScale{
		{Letter: "A", MinScore: 85, Points: 4.0},
		{Letter: "A-", MinScore: 80, Points: 3.7},
		{Letter: "B+", MinScore: 75, Points: 3.3},
		{Letter: "B", MinScore: 70, Points: 3.0},
		{Letter: "B-", MinScore: 65, Points: 2.7},
		{Letter: "C+", MinScore: 60, Points: 2.3},
		{Letter: "C", MinScore: 55, Points: 2.0},
		{Letter: "D", MinScore: 40, Points: 1.0},
		{Letter: "E", MinScore: 0, Points: 0.0},
	}
}

// DefaultSettings returns the settings used before anything is saved.
func DefaultSettings() Settings {
	return Settings{
		Timezone:                DefaultTimezone,
		GradeScale:              DefaultGradeScale(),
		GradeScaleConfirmed:     false,
		CountExcusedAsAbsent:    true,
		DefaultMinAttendancePct: 75,
		DefaultTotalMeetings:    16,
		Reminders: ReminderSettings{
			TaskEnabled:       true,
			AttendanceEnabled: true,
			DigestEnabled:     true,
			DigestTime:        "06:00",
		},
		Baseline: Baseline{GPA: nil, Credits: 0},
	}
}

// Location returns the settings time zone, falling back to the default zone and then UTC.
func (s Settings) Location() *time.Location {
	if loc, err := LoadTimezone(s.Timezone); err == nil {
		return loc
	}
	if loc, err := time.LoadLocation(DefaultTimezone); err == nil {
		return loc
	}
	return time.UTC
}

// LoadTimezone loads an IANA zone name. "Local" and empty names are rejected.
func LoadTimezone(name string) (*time.Location, error) {
	if name == "" || name == "Local" || strings.TrimSpace(name) != name {
		return nil, fmt.Errorf("zona waktu tidak valid: %q", name)
	}
	return time.LoadLocation(name)
}

// Settings limits.
const (
	MaxGradeScaleEntries = 20
	MaxBaselineCredits   = 300
	MaxTotalMeetings     = 40
)

// ValidateGradeScale checks a grade scale and records errors under prefix (e.g. "grade_scale").
func ValidateGradeScale(v *Validator, scale GradeScale, prefix string) {
	if len(scale) == 0 {
		v.Add(prefix, "Skala nilai minimal punya satu huruf")
		return
	}
	if len(scale) > MaxGradeScaleEntries {
		v.Add(prefix, fmt.Sprintf("Skala nilai maksimal %d huruf", MaxGradeScaleEntries))
		return
	}
	letters := map[string]bool{}
	mins := map[float64]bool{}
	hasZero := false
	for i, e := range scale {
		f := fmt.Sprintf("%s[%d]", prefix, i)
		letter := strings.TrimSpace(e.Letter)
		switch {
		case letter == "" || letter != e.Letter:
			v.Add(f+".letter", "Huruf wajib diisi tanpa spasi di awal atau akhir")
		case RuneLen(letter) > 3:
			v.Add(f+".letter", "Huruf maksimal 3 karakter")
		case letters[letter]:
			v.Add(f+".letter", fmt.Sprintf("Huruf %s muncul lebih dari sekali", letter))
		}
		letters[letter] = true

		switch {
		case math.IsNaN(e.MinScore) || e.MinScore < 0 || e.MinScore > 100:
			v.Add(f+".min_score", "Nilai minimal harus 0-100")
		case mins[e.MinScore]:
			v.Add(f+".min_score", "Nilai minimal tidak boleh sama dengan huruf lain")
		}
		mins[e.MinScore] = true
		if e.MinScore == 0 {
			hasZero = true
		}

		if math.IsNaN(e.Points) || e.Points < 0 || e.Points > 4 {
			v.Add(f+".points", "Bobot huruf harus 0-4")
		}
	}
	if !hasZero {
		v.Add(prefix, "Skala nilai harus punya huruf dengan nilai minimal 0")
	}
}

// ValidateSettings returns a *ValidationError when s is invalid.
func ValidateSettings(s Settings) error {
	var v Validator
	if _, err := LoadTimezone(s.Timezone); err != nil {
		v.Add("timezone", "Zona waktu harus nama zona IANA yang valid, misalnya Asia/Jakarta")
	}
	ValidateGradeScale(&v, s.GradeScale, "grade_scale")
	v.Check(s.DefaultMinAttendancePct >= 0 && s.DefaultMinAttendancePct <= 100,
		"default_min_attendance_pct", "Batas minimal hadir harus 0-100")
	v.Check(s.DefaultTotalMeetings >= 1 && s.DefaultTotalMeetings <= MaxTotalMeetings,
		"default_total_meetings", fmt.Sprintf("Jumlah pertemuan harus 1-%d", MaxTotalMeetings))
	v.Check(ValidTime(s.Reminders.DigestTime), "reminders.digest_time", "Jam ringkasan harus format HH:MM")
	if s.Baseline.GPA != nil {
		g := *s.Baseline.GPA
		v.Check(!math.IsNaN(g) && g >= 0 && g <= 4, "baseline.gpa", "IPK awal harus 0-4")
	}
	v.Check(s.Baseline.Credits >= 0 && s.Baseline.Credits <= MaxBaselineCredits,
		"baseline.credits", fmt.Sprintf("SKS awal harus 0-%d", MaxBaselineCredits))
	return v.Err()
}
