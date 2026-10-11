package httpapi

import (
	"context"
	"time"

	"kumlod/internal/api"
	"kumlod/internal/domain"
	"kumlod/internal/store"
)

// courseData holds everything needed to compute course summaries for a
// semester (or every semester when semesterID is empty).
type courseData struct {
	settings   domain.Settings
	loc        *time.Location
	today      string
	meetings   map[string][]store.Meeting
	components map[string][]store.GradeComponent
	scores     map[string][]float64
	openTasks  map[string]int
}

func (s *Server) settings(ctx context.Context) (domain.Settings, *time.Location, error) {
	st, err := s.store.GetSettings(ctx)
	if err != nil {
		return st, time.UTC, err
	}
	return st, st.Location(), nil
}

func (s *Server) loadCourseData(ctx context.Context, semesterID string) (*courseData, error) {
	st, loc, err := s.settings(ctx)
	if err != nil {
		return nil, err
	}
	d := &courseData{settings: st, loc: loc, today: domain.LocalDate(s.clock.Now(), loc)}
	if d.meetings, err = s.store.ListMeetingsBySemester(ctx, semesterID); err != nil {
		return nil, err
	}
	if d.components, err = s.store.ListGradeComponentsBySemester(ctx, semesterID); err != nil {
		return nil, err
	}
	if d.scores, err = s.store.ListGradedTaskScoresBySemester(ctx, semesterID); err != nil {
		return nil, err
	}
	if d.openTasks, err = s.store.CountOpenTasksByCourse(ctx, semesterID); err != nil {
		return nil, err
	}
	return d, nil
}

func (d *courseData) attendance(c store.Course) domain.AttendanceSummary {
	return domain.SummarizeAttendance(attendanceRecords(d.meetings[c.ID]), c.MinAttendancePct,
		d.settings.CountExcusedAsAbsent, d.today)
}

func (d *courseData) grade(c store.Course) domain.GradeSummary {
	return domain.SummarizeGrades(gradeInputs(d.components[c.ID], d.scores), d.settings.GradeScale)
}

func (d *courseData) view(c store.Course) api.Course {
	g := d.grade(c)
	return api.Course{
		Id:               c.ID,
		SemesterId:       c.SemesterID,
		Code:             c.Code,
		Name:             c.Name,
		Credits:          c.Credits,
		Lecturer:         c.Lecturer,
		Color:            c.Color,
		TotalMeetings:    c.TotalMeetings,
		MinAttendancePct: c.MinAttendancePct,
		FinalGradeLetter: c.FinalGradeLetter,
		Notes:            c.Notes,
		Schedules:        toSchedules(c.Schedules),
		Attendance:       toAttendance(d.attendance(c)),
		Grade: api.CourseGradeBrief{
			CurrentScore:   g.CurrentScore,
			Letter:         g.Letter,
			IsFinal:        g.IsFinal,
			OfficialLetter: c.FinalGradeLetter,
		},
		OpenTaskCount: d.openTasks[c.ID],
		CreatedAt:     c.CreatedAt.UTC(),
		UpdatedAt:     c.UpdatedAt.UTC(),
	}
}

// courseView loads the data for one course and returns its API form.
func (s *Server) courseView(ctx context.Context, c store.Course) (api.Course, error) {
	d, err := s.loadCourseData(ctx, c.SemesterID)
	if err != nil {
		return api.Course{}, err
	}
	return d.view(c), nil
}
