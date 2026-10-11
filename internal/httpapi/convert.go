package httpapi

import (
	"time"

	"kumlod/internal/api"
	"kumlod/internal/domain"
	"kumlod/internal/store"
)

func utcPtr(t *time.Time) *time.Time {
	if t == nil {
		return nil
	}
	u := t.UTC()
	return &u
}

func toSemester(x store.Semester) api.Semester {
	return api.Semester{
		Id:           x.ID,
		Name:         x.Name,
		AcademicYear: x.AcademicYear,
		Term:         api.SemesterTerm(x.Term),
		StartDate:    x.StartDate,
		EndDate:      x.EndDate,
		IsActive:     x.IsActive,
		CourseCount:  x.CourseCount,
		TotalCredits: x.TotalCredits,
		CreatedAt:    x.CreatedAt.UTC(),
		UpdatedAt:    x.UpdatedAt.UTC(),
	}
}

func toCourseBrief(x store.CourseBrief) api.CourseBrief {
	return api.CourseBrief{Id: x.ID, Name: x.Name, Code: x.Code, Color: x.Color}
}

func toSchedules(list []store.Schedule) []api.Schedule {
	out := make([]api.Schedule, 0, len(list))
	for _, sc := range list {
		out = append(out, api.Schedule{
			Id: sc.ID, DayOfWeek: sc.DayOfWeek, StartTime: sc.StartTime, EndTime: sc.EndTime, Room: sc.Room,
		})
	}
	return out
}

func toMeeting(x store.Meeting) api.Meeting {
	m := api.Meeting{
		Id:            x.ID,
		CourseId:      x.CourseID,
		Number:        x.Number,
		Date:          x.Date,
		StartTime:     x.StartTime,
		EndTime:       x.EndTime,
		Room:          x.Room,
		Kind:          api.MeetingKind(x.Kind),
		Status:        api.MeetingStatus(x.Status),
		AttendanceAt:  utcPtr(x.AttendanceAt),
		Topic:         x.Topic,
		Notes:         x.Notes,
		MaterialCount: x.MaterialCount,
		CreatedAt:     x.CreatedAt.UTC(),
		UpdatedAt:     x.UpdatedAt.UTC(),
	}
	if x.Attendance != nil {
		a := api.MeetingAttendance(*x.Attendance)
		m.Attendance = &a
	}
	return m
}

func toMeetings(list []store.Meeting) []api.Meeting {
	out := make([]api.Meeting, 0, len(list))
	for _, m := range list {
		out = append(out, toMeeting(m))
	}
	return out
}

func toTask(x store.Task) api.Task {
	t := api.Task{
		Id:               x.ID,
		SemesterId:       x.SemesterID,
		CourseId:         x.CourseID,
		MeetingId:        x.MeetingID,
		GradeComponentId: x.GradeComponentID,
		Title:            x.Title,
		Description:      x.Description,
		Deadline:         x.Deadline.UTC(),
		Status:           api.TaskStatus(x.Status),
		Priority:         api.TaskPriority(x.Priority),
		SubmissionUrl:    x.SubmissionURL,
		Score:            x.Score,
		CompletedAt:      utcPtr(x.CompletedAt),
		CreatedAt:        x.CreatedAt.UTC(),
		UpdatedAt:        x.UpdatedAt.UTC(),
	}
	if x.Course != nil {
		b := toCourseBrief(*x.Course)
		t.Course = &b
	}
	return t
}

func toTasks(list []store.Task) []api.Task {
	out := make([]api.Task, 0, len(list))
	for _, t := range list {
		out = append(out, toTask(t))
	}
	return out
}

func toMaterial(x store.Material) api.Material {
	m := api.Material{
		Id:            x.ID,
		CourseId:      x.CourseID,
		Course:        toCourseBrief(x.Course),
		MeetingId:     x.MeetingID,
		MeetingNumber: x.MeetingNumber,
		Kind:          api.MaterialKind(x.Kind),
		Title:         x.Title,
		Description:   x.Description,
		Url:           x.URL,
		CreatedAt:     x.CreatedAt.UTC(),
		UpdatedAt:     x.UpdatedAt.UTC(),
	}
	if x.File != nil {
		m.File = &api.FileInfo{
			Id: x.File.ID, OriginalName: x.File.OriginalName, MimeType: x.File.MimeType, SizeBytes: x.File.SizeBytes,
		}
	}
	return m
}

func toMaterials(list []store.Material) []api.Material {
	out := make([]api.Material, 0, len(list))
	for _, m := range list {
		out = append(out, toMaterial(m))
	}
	return out
}

func toAttendance(x domain.AttendanceSummary) api.AttendanceSummary {
	return api.AttendanceSummary{
		Total:             x.Total,
		Held:              x.Held,
		Recorded:          x.Recorded,
		Present:           x.Present,
		Absences:          x.Absences,
		Unrecorded:        x.Unrecorded,
		RequiredPresent:   x.RequiredPresent,
		MaxAbsences:       x.MaxAbsences,
		RemainingAbsences: x.RemainingAbsences,
		Percentage:        x.Percentage,
		Level:             api.AttendanceLevel(x.Level),
	}
}

func toGradeScale(scale domain.GradeScale) []api.GradeScaleEntry {
	out := make([]api.GradeScaleEntry, 0, len(scale))
	for _, e := range scale {
		out = append(out, api.GradeScaleEntry{Letter: e.Letter, MinScore: e.MinScore, Points: e.Points})
	}
	return out
}

func toBaseline(b domain.Baseline) api.Baseline {
	return api.Baseline{Gpa: b.GPA, Credits: b.Credits}
}

func toSettings(x domain.Settings) api.Settings {
	return api.Settings{
		Timezone:                x.Timezone,
		GradeScale:              toGradeScale(x.GradeScale),
		GradeScaleConfirmed:     x.GradeScaleConfirmed,
		CountExcusedAsAbsent:    x.CountExcusedAsAbsent,
		DefaultMinAttendancePct: x.DefaultMinAttendancePct,
		DefaultTotalMeetings:    x.DefaultTotalMeetings,
		Reminders: api.ReminderSettings{
			TaskEnabled:       x.Reminders.TaskEnabled,
			AttendanceEnabled: x.Reminders.AttendanceEnabled,
			DigestEnabled:     x.Reminders.DigestEnabled,
			DigestTime:        x.Reminders.DigestTime,
		},
		Baseline: toBaseline(x.Baseline),
	}
}

func attendanceRecords(list []store.Meeting) []domain.AttendanceRecord {
	out := make([]domain.AttendanceRecord, 0, len(list))
	for _, m := range list {
		a := ""
		if m.Attendance != nil {
			a = *m.Attendance
		}
		out = append(out, domain.AttendanceRecord{Date: m.Date, Kind: m.Kind, Status: m.Status, Attendance: a})
	}
	return out
}

func gradeInputs(comps []store.GradeComponent, scores map[string][]float64) []domain.GradeComponentInput {
	out := make([]domain.GradeComponentInput, 0, len(comps))
	for _, g := range comps {
		out = append(out, domain.GradeComponentInput{
			ID: g.ID, Weight: g.Weight, Source: g.Source, Score: g.Score, TaskScores: scores[g.ID],
		})
	}
	return out
}

func toGradeSummary(c store.Course, comps []store.GradeComponent, sum domain.GradeSummary) api.GradeSummary {
	out := api.GradeSummary{
		CourseId:       c.ID,
		Components:     make([]api.GradeComponent, 0, len(comps)),
		TotalWeight:    sum.TotalWeight,
		KnownWeight:    sum.KnownWeight,
		CurrentScore:   sum.CurrentScore,
		FinalScore:     sum.FinalScore,
		Letter:         sum.Letter,
		IsFinal:        sum.IsFinal,
		OfficialLetter: c.FinalGradeLetter,
		Targets:        make([]api.GradeTarget, 0, len(sum.Targets)),
	}
	for i, g := range comps {
		res := sum.Components[i]
		out.Components = append(out.Components, api.GradeComponent{
			Id:              g.ID,
			Name:            g.Name,
			Weight:          g.Weight,
			Score:           g.Score,
			Source:          api.GradeSource(g.Source),
			EffectiveScore:  res.EffectiveScore,
			GradedTaskCount: res.GradedTaskCount,
			Position:        g.Position,
		})
	}
	for _, t := range sum.Targets {
		out.Targets = append(out.Targets, api.GradeTarget{
			Letter: t.Letter, MinScore: t.MinScore, RequiredAverage: t.RequiredAverage, Status: api.TargetStatus(t.Status),
		})
	}
	return out
}
