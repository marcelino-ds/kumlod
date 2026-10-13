package httpapi

import (
	"net/http"
	"strings"

	"kumlod/internal/api"
	"kumlod/internal/domain"
)

// GetSettings returns the app settings.
func (s *Server) GetSettings(w http.ResponseWriter, r *http.Request) {
	st, _, err := s.settings(r.Context())
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, toSettings(st))
}

// UpdateSettings validates and stores the settings. The grade scale counts as
// confirmed once a request sets confirm_grade_scale; other saves (a reminder
// switch, the time zone) keep the current confirmation state.
func (s *Server) UpdateSettings(w http.ResponseWriter, r *http.Request) {
	var in api.SettingsUpdate
	if err := decodeJSON(r, &in); err != nil {
		s.fail(w, r, err)
		return
	}
	current, _, err := s.settings(r.Context())
	if err != nil {
		s.fail(w, r, err)
		return
	}
	scale := make(domain.GradeScale, 0, len(in.GradeScale))
	for _, e := range in.GradeScale {
		scale = append(scale, domain.GradeScaleEntry{Letter: strings.TrimSpace(e.Letter), MinScore: e.MinScore, Points: e.Points})
	}
	st := domain.Settings{
		Timezone:                strings.TrimSpace(in.Timezone),
		GradeScale:              scale,
		GradeScaleConfirmed:     current.GradeScaleConfirmed || (in.ConfirmGradeScale != nil && *in.ConfirmGradeScale),
		CountExcusedAsAbsent:    in.CountExcusedAsAbsent,
		DefaultMinAttendancePct: in.DefaultMinAttendancePct,
		DefaultTotalMeetings:    in.DefaultTotalMeetings,
		Reminders: domain.ReminderSettings{
			TaskEnabled:       in.Reminders.TaskEnabled,
			AttendanceEnabled: in.Reminders.AttendanceEnabled,
			DigestEnabled:     in.Reminders.DigestEnabled,
			DigestTime:        strings.TrimSpace(in.Reminders.DigestTime),
		},
		Baseline: domain.Baseline{GPA: in.Baseline.Gpa, Credits: in.Baseline.Credits},
	}
	if err := domain.ValidateSettings(st); err != nil {
		s.fail(w, r, err)
		return
	}
	st.GradeScale = st.GradeScale.Sorted()
	if err := s.store.SaveSettings(r.Context(), st); err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, toSettings(st))
}
