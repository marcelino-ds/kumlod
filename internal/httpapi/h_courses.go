package httpapi

import (
	"net/http"

	"kumlod/internal/api"
	"kumlod/internal/domain"
	"kumlod/internal/store"
)

// ListCourses returns the courses of a semester with summaries.
func (s *Server) ListCourses(w http.ResponseWriter, r *http.Request, semesterID api.SemesterId) {
	ctx := r.Context()
	if _, err := s.store.GetSemester(ctx, semesterID); err != nil {
		s.fail(w, r, err)
		return
	}
	courses, err := s.store.ListCourses(ctx, semesterID)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	d, err := s.loadCourseData(ctx, semesterID)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	out := api.CourseList{Items: make([]api.Course, 0, len(courses))}
	for _, c := range courses {
		out.Items = append(out.Items, d.view(c))
	}
	writeJSON(w, http.StatusOK, out)
}

// CreateCourse creates a course with default components and generated meetings.
func (s *Server) CreateCourse(w http.ResponseWriter, r *http.Request, semesterID api.SemesterId) {
	var in api.CourseCreate
	if err := decodeJSON(r, &in); err != nil {
		s.fail(w, r, err)
		return
	}
	ctx := r.Context()
	sem, err := s.store.GetSemester(ctx, semesterID)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	st, _, err := s.settings(ctx)
	if err != nil {
		s.fail(w, r, err)
		return
	}

	fields := courseFields{
		Code: str(in.Code), Name: in.Name, Lecturer: str(in.Lecturer), Color: str(in.Color), Notes: str(in.Notes),
		Credits: in.Credits, TotalMeetings: st.DefaultTotalMeetings, MinPct: st.DefaultMinAttendancePct,
		Schedules: in.Schedules,
	}
	if in.TotalMeetings != nil {
		fields.TotalMeetings = *in.TotalMeetings
	}
	if in.MinAttendancePct != nil {
		fields.MinPct = *in.MinAttendancePct
	}
	var v domain.Validator
	id := clientID(&v, in.Id)
	c := validateCourse(&v, fields)

	var comps []store.GradeComponent
	if in.GradeComponents != nil && len(*in.GradeComponents) > 0 {
		comps = validateComponents(&v, "grade_components", *in.GradeComponents)
	} else {
		for _, dc := range domain.DefaultGradeComponents() {
			comps = append(comps, store.GradeComponent{Name: dc.Name, Weight: dc.Weight, Source: dc.Source})
		}
	}
	if err := v.Err(); err != nil {
		s.fail(w, r, err)
		return
	}

	var meetings []store.Meeting
	generate := in.GenerateMeetings == nil || *in.GenerateMeetings
	if generate && len(c.Schedules) > 0 {
		planned, err := domain.GenerateMeetings(sem.StartDate, scheduleSlots(c.Schedules), c.TotalMeetings)
		if err != nil {
			s.fail(w, r, domain.Invalid("schedules", err.Error()))
			return
		}
		meetings = plannedMeetings(planned)
	}

	c.ID = id
	c.SemesterID = sem.ID
	created, err := s.store.CreateCourse(ctx, c, comps, meetings)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	view, err := s.courseView(ctx, created)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, view)
}

func scheduleSlots(list []store.Schedule) []domain.ScheduleSlot {
	out := make([]domain.ScheduleSlot, 0, len(list))
	for _, sc := range list {
		out = append(out, domain.ScheduleSlot{DayOfWeek: sc.DayOfWeek, StartTime: sc.StartTime, EndTime: sc.EndTime, Room: sc.Room})
	}
	return out
}

func plannedMeetings(planned []domain.PlannedMeeting) []store.Meeting {
	out := make([]store.Meeting, 0, len(planned))
	for _, p := range planned {
		out = append(out, store.Meeting{
			Number: p.Number, Date: p.Date, StartTime: p.StartTime, EndTime: p.EndTime, Room: p.Room,
			Kind: p.Kind, Status: domain.MeetingScheduled,
		})
	}
	return out
}

// GetCourse returns one course with summaries.
func (s *Server) GetCourse(w http.ResponseWriter, r *http.Request, courseID api.CourseId) {
	c, err := s.store.GetCourse(r.Context(), courseID)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	view, err := s.courseView(r.Context(), c)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, view)
}

// UpdateCourse replaces a course's fields and schedules.
func (s *Server) UpdateCourse(w http.ResponseWriter, r *http.Request, courseID api.CourseId) {
	var in api.CourseUpdate
	if err := decodeJSON(r, &in); err != nil {
		s.fail(w, r, err)
		return
	}
	ctx := r.Context()
	st, _, err := s.settings(ctx)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	var v domain.Validator
	c := validateCourse(&v, courseFields{
		Code: in.Code, Name: in.Name, Lecturer: in.Lecturer, Color: in.Color, Notes: in.Notes,
		Credits: in.Credits, TotalMeetings: in.TotalMeetings, MinPct: in.MinAttendancePct, Schedules: in.Schedules,
	})
	if l := optionalID(in.FinalGradeLetter); l != nil {
		if _, ok := st.GradeScale.Lookup(*l); !ok {
			v.Add("final_grade_letter", "Huruf resmi harus ada di skala nilai")
		}
		c.FinalGradeLetter = l
	}
	if err := v.Err(); err != nil {
		s.fail(w, r, err)
		return
	}
	c.ID = courseID
	updated, err := s.store.UpdateCourse(ctx, c)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	view, err := s.courseView(ctx, updated)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, view)
}

// DeleteCourse removes a course with its meetings, tasks, materials, and files.
func (s *Server) DeleteCourse(w http.ResponseWriter, r *http.Request, courseID api.CourseId) {
	fileIDs, err := s.store.DeleteCourse(r.Context(), courseID)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	s.removeFiles(r.Context(), fileIDs)
	w.WriteHeader(http.StatusNoContent)
}

// GetCourseGrades returns the grade summary of a course.
func (s *Server) GetCourseGrades(w http.ResponseWriter, r *http.Request, courseID api.CourseId) {
	s.writeGrades(w, r, courseID, http.StatusOK)
}

func (s *Server) writeGrades(w http.ResponseWriter, r *http.Request, courseID string, status int) {
	ctx := r.Context()
	c, err := s.store.GetCourse(ctx, courseID)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	comps, err := s.store.ListGradeComponents(ctx, courseID)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	scores, err := s.store.ListGradedTaskScores(ctx, courseID)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	st, _, err := s.settings(ctx)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	sum := domain.SummarizeGrades(gradeInputs(comps, scores), st.GradeScale)
	writeJSON(w, status, toGradeSummary(c, comps, sum))
}

// ReplaceGradeComponents sets all grade components of a course.
func (s *Server) ReplaceGradeComponents(w http.ResponseWriter, r *http.Request, courseID api.CourseId) {
	var in api.GradeComponentsUpdate
	if err := decodeJSON(r, &in); err != nil {
		s.fail(w, r, err)
		return
	}
	var v domain.Validator
	comps := validateComponents(&v, "components", in.Components)
	if err := v.Err(); err != nil {
		s.fail(w, r, err)
		return
	}
	if err := s.store.ReplaceGradeComponents(r.Context(), courseID, comps); err != nil {
		s.fail(w, r, err)
		return
	}
	s.writeGrades(w, r, courseID, http.StatusOK)
}
