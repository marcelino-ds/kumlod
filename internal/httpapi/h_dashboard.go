package httpapi

import (
	"errors"
	"net/http"
	"sort"

	"kumlod/internal/api"
	"kumlod/internal/domain"
	"kumlod/internal/store"
)

// UpcomingDays is how far ahead the dashboard lists open tasks (whole local days after today).
const UpcomingDays = 7

// GetDashboard returns today's overview for the active semester.
func (s *Server) GetDashboard(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	st, loc, err := s.settings(ctx)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	now := s.clock.Now()
	today := domain.LocalDate(now, loc)
	out := api.Dashboard{
		Date:             today,
		Now:              now.UTC(),
		Timezone:         st.Timezone,
		TodayMeetings:    []api.TodayMeeting{},
		OverdueTasks:     []api.Task{},
		UpcomingTasks:    []api.Task{},
		AttendanceAlerts: []api.AttendanceAlert{},
	}

	sem, err := s.store.GetActiveSemester(ctx)
	if errors.Is(err, domain.ErrNotFound) {
		writeJSON(w, http.StatusOK, out)
		return
	}
	if err != nil {
		s.fail(w, r, err)
		return
	}
	semView := toSemester(sem)
	out.Semester = &semView

	meetings, err := s.store.ListMeetingsOnDate(ctx, sem.ID, today)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	for _, m := range meetings {
		out.TodayMeetings = append(out.TodayMeetings, api.TodayMeeting{Meeting: toMeeting(m.Meeting), Course: toCourseBrief(m.Course)})
	}

	endDay, err := domain.AddDays(today, UpcomingDays+1)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	horizon, err := domain.StartOfLocalDay(endDay, loc)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	tasks, err := s.store.ListTasks(ctx, store.TaskFilter{
		SemesterID: sem.ID,
		Statuses:   []string{domain.TaskTodo, domain.TaskInProgress},
		DueTo:      &horizon,
	})
	if err != nil {
		s.fail(w, r, err)
		return
	}
	for _, t := range tasks {
		if t.Deadline.Before(now) {
			out.OverdueTasks = append(out.OverdueTasks, toTask(t))
		} else {
			out.UpcomingTasks = append(out.UpcomingTasks, toTask(t))
		}
	}

	courses, err := s.store.ListCourses(ctx, sem.ID)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	d, err := s.loadCourseData(ctx, sem.ID)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	type alert struct {
		course store.Course
		att    domain.AttendanceSummary
	}
	var alerts []alert
	for _, c := range courses {
		if att := d.attendance(c); att.NeedsAttention() {
			alerts = append(alerts, alert{c, att})
		}
	}
	severity := map[domain.AttendanceLevel]int{
		domain.LevelExceeded: 0, domain.LevelCritical: 1, domain.LevelWarning: 2, domain.LevelSafe: 3,
	}
	sort.SliceStable(alerts, func(i, j int) bool {
		return severity[alerts[i].att.Level] < severity[alerts[j].att.Level]
	})
	for _, a := range alerts {
		out.AttendanceAlerts = append(out.AttendanceAlerts, api.AttendanceAlert{
			Course: toCourseBrief(a.course.Brief()), Attendance: toAttendance(a.att),
		})
	}
	writeJSON(w, http.StatusOK, out)
}
