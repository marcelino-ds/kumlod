package store

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
	"time"

	"kumlod/internal/clock"
	"kumlod/internal/db"
	"kumlod/internal/domain"
)

func newTestStore(t *testing.T) (*Store, *clock.Fake) {
	t.Helper()
	conn, err := db.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { conn.Close() })
	if err := db.Migrate(context.Background(), conn, nil); err != nil {
		t.Fatal(err)
	}
	clk := clock.NewFake(time.Date(2026, 10, 11, 1, 0, 0, 0, time.UTC))
	return New(conn, clk), clk
}

func mustSemester(t *testing.T, s *Store, name string, activate bool) Semester {
	t.Helper()
	sem, err := s.CreateSemester(context.Background(), Semester{
		Name: name, AcademicYear: "2026/2027", Term: domain.TermOdd, StartDate: "2026-09-07", EndDate: "2027-01-15",
	}, activate)
	if err != nil {
		t.Fatal(err)
	}
	return sem
}

func mustCourse(t *testing.T, s *Store, semesterID, name string, meetings int) Course {
	t.Helper()
	planned, err := domain.GenerateMeetings("2026-09-07", []domain.ScheduleSlot{{DayOfWeek: 1, StartTime: "08:00", EndTime: "09:40", Room: "A1"}}, meetings)
	if err != nil && meetings > 0 {
		t.Fatal(err)
	}
	var ms []Meeting
	for _, p := range planned {
		ms = append(ms, Meeting{Number: p.Number, Date: p.Date, StartTime: p.StartTime, EndTime: p.EndTime, Room: p.Room, Kind: p.Kind})
	}
	comps := []GradeComponent{
		{Name: "Tugas", Weight: 30, Source: domain.SourceTasks},
		{Name: "UTS", Weight: 30, Source: domain.SourceManual},
		{Name: "UAS", Weight: 40, Source: domain.SourceManual},
	}
	c, err := s.CreateCourse(context.Background(), Course{
		SemesterID: semesterID, Name: name, Code: "IF101", Credits: 3, Color: "#6366f1",
		TotalMeetings: 16, MinAttendancePct: 75,
		Schedules: []Schedule{{DayOfWeek: 1, StartTime: "08:00", EndTime: "09:40", Room: "A1"}},
	}, comps, ms)
	if err != nil {
		t.Fatal(err)
	}
	return c
}

func TestSemesterSingleActive(t *testing.T) {
	s, _ := newTestStore(t)
	ctx := context.Background()

	first := mustSemester(t, s, "Semester 3", false)
	if !first.IsActive {
		t.Fatal("first semester must be active")
	}
	second := mustSemester(t, s, "Semester 4", false)
	if second.IsActive {
		t.Fatal("second semester must not be active unless requested")
	}
	third := mustSemester(t, s, "Semester 5", true)
	if !third.IsActive {
		t.Fatal("activate=true must activate")
	}
	if got, _ := s.GetSemester(ctx, first.ID); got.IsActive {
		t.Error("previous active semester must be deactivated")
	}

	if _, err := s.ActivateSemester(ctx, second.ID); err != nil {
		t.Fatal(err)
	}
	active, err := s.GetActiveSemester(ctx)
	if err != nil || active.ID != second.ID {
		t.Fatalf("active = %v, %v", active.ID, err)
	}
	list, _ := s.ListSemesters(ctx)
	n := 0
	for _, x := range list {
		if x.IsActive {
			n++
		}
	}
	if n != 1 || len(list) != 3 {
		t.Errorf("active count %d, total %d", n, len(list))
	}
	// Activating twice is fine.
	if _, err := s.ActivateSemester(ctx, second.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.ActivateSemester(ctx, NewID()); !errors.Is(err, domain.ErrNotFound) {
		t.Errorf("activate missing: %v", err)
	}
}

func TestCreateWithDuplicateID(t *testing.T) {
	s, _ := newTestStore(t)
	sem := mustSemester(t, s, "S3", false)
	_, err := s.CreateSemester(context.Background(), Semester{ID: sem.ID, Name: "x", Term: domain.TermOdd, StartDate: "2026-09-01", EndDate: "2026-12-01"}, false)
	if !errors.Is(err, domain.ErrConflict) {
		t.Errorf("duplicate id: %v", err)
	}
}

func TestCourseCountsAndCascade(t *testing.T) {
	s, _ := newTestStore(t)
	ctx := context.Background()
	sem := mustSemester(t, s, "S3", false)
	c := mustCourse(t, s, sem.ID, "Basis Data", 16)

	got, err := s.GetSemester(ctx, sem.ID)
	if err != nil || got.CourseCount != 1 || got.TotalCredits != 3 {
		t.Fatalf("semester counts: %+v %v", got, err)
	}
	meetings, err := s.ListMeetings(ctx, c.ID)
	if err != nil || len(meetings) != 16 {
		t.Fatalf("meetings: %d %v", len(meetings), err)
	}
	comps, _ := s.ListGradeComponents(ctx, c.ID)
	if len(comps) != 3 || comps[0].Name != "Tugas" || comps[2].Position != 2 {
		t.Fatalf("components: %+v", comps)
	}

	// A file material and a task linked to a meeting.
	file := &FileInfo{ID: NewID(), OriginalName: "slide-pertemuan-1.pdf", MimeType: "application/pdf", SizeBytes: 10, SHA256: "abc"}
	mat, err := s.CreateMaterial(ctx, Material{CourseID: c.ID, MeetingID: &meetings[0].ID, Kind: domain.MaterialFile, Title: "Slide 1"}, file)
	if err != nil {
		t.Fatal(err)
	}
	if mat.File == nil || mat.MeetingNumber == nil || *mat.MeetingNumber != 1 {
		t.Fatalf("material: %+v", mat)
	}
	if _, err := s.CreateTask(ctx, Task{CourseID: &c.ID, MeetingID: &meetings[0].ID, Title: "Tugas 1", Deadline: time.Now()}); err != nil {
		t.Fatal(err)
	}

	fileIDs, err := s.DeleteCourse(ctx, c.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(fileIDs) != 1 || fileIDs[0] != file.ID {
		t.Errorf("file ids: %v", fileIDs)
	}
	if _, err := s.GetFile(ctx, file.ID); !errors.Is(err, domain.ErrNotFound) {
		t.Errorf("file row should be gone: %v", err)
	}
	if hits, _ := s.ListMaterials(ctx, MaterialFilter{Query: "slide"}); len(hits) != 0 {
		t.Errorf("fts rows should be gone: %d", len(hits))
	}
	if tasks, _ := s.ListTasks(ctx, TaskFilter{}); len(tasks) != 0 {
		t.Errorf("tasks should be gone: %d", len(tasks))
	}
	if _, err := s.DeleteCourse(ctx, c.ID); !errors.Is(err, domain.ErrNotFound) {
		t.Errorf("second delete: %v", err)
	}
}

func TestDeleteSemesterCascadesFiles(t *testing.T) {
	s, _ := newTestStore(t)
	ctx := context.Background()
	sem := mustSemester(t, s, "S3", false)
	other := mustSemester(t, s, "S4", false)
	c1 := mustCourse(t, s, sem.ID, "Algoritma", 4)
	c2 := mustCourse(t, s, other.ID, "Jaringan", 4)

	f1 := &FileInfo{ID: NewID(), OriginalName: "a.pdf", MimeType: "application/pdf", SizeBytes: 1, SHA256: "x"}
	f2 := &FileInfo{ID: NewID(), OriginalName: "b.pdf", MimeType: "application/pdf", SizeBytes: 1, SHA256: "y"}
	if _, err := s.CreateMaterial(ctx, Material{CourseID: c1.ID, Kind: domain.MaterialFile, Title: "A"}, f1); err != nil {
		t.Fatal(err)
	}
	if _, err := s.CreateMaterial(ctx, Material{CourseID: c2.ID, Kind: domain.MaterialFile, Title: "B"}, f2); err != nil {
		t.Fatal(err)
	}
	if _, err := s.CreateTask(ctx, Task{SemesterID: sem.ID, Title: "Tanpa matkul", Deadline: time.Now()}); err != nil {
		t.Fatal(err)
	}

	ids, err := s.DeleteSemester(ctx, sem.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(ids) != 1 || ids[0] != f1.ID {
		t.Errorf("ids = %v", ids)
	}
	if _, err := s.GetCourse(ctx, c1.ID); !errors.Is(err, domain.ErrNotFound) {
		t.Error("course should be deleted")
	}
	if _, err := s.GetFile(ctx, f2.ID); err != nil {
		t.Error("other semester's file must remain")
	}
	if tasks, _ := s.ListTasks(ctx, TaskFilter{}); len(tasks) != 0 {
		t.Errorf("tasks of the semester should be gone: %d", len(tasks))
	}
	if _, err := s.GetActiveSemester(ctx); !errors.Is(err, domain.ErrNotFound) {
		t.Error("deleted semester was the active one")
	}
}

func TestMaterialSearch(t *testing.T) {
	s, _ := newTestStore(t)
	ctx := context.Background()
	sem := mustSemester(t, s, "S3", false)
	c := mustCourse(t, s, sem.ID, "Basis Data", 2)

	add := func(title, desc string, file *FileInfo) Material {
		kind := domain.MaterialNote
		if file != nil {
			kind = domain.MaterialFile
		}
		m, err := s.CreateMaterial(ctx, Material{CourseID: c.ID, Kind: kind, Title: title, Description: desc}, file)
		if err != nil {
			t.Fatal(err)
		}
		return m
	}
	add("Normalisasi", "Bentuk normal pertama sampai ketiga", nil)
	add("Catatan SQL", "Query JOIN dan agregasi", nil)
	upl := add("Slide", "", &FileInfo{ID: NewID(), OriginalName: "Entity-Relationship Diagram.pdf", MimeType: "application/pdf", SizeBytes: 1, SHA256: "z"})

	tests := []struct {
		q    string
		want int
	}{
		{"normal", 1},
		{"NORMALISASI", 1},
		{"agreg", 1},
		{"relation", 1}, // file name is indexed
		{"query join", 1},
		{"query normal", 0},
		{"tidakada", 0},
		{`"; DROP TABLE materials; --`, 0},
		{"   ", 3}, // no searchable words: plain listing
	}
	for _, tt := range tests {
		got, err := s.ListMaterials(ctx, MaterialFilter{Query: tt.q, SemesterID: sem.ID})
		if err != nil {
			t.Fatalf("%q: %v", tt.q, err)
		}
		if len(got) != tt.want {
			t.Errorf("%q: got %d want %d", tt.q, len(got), tt.want)
		}
	}

	// Updating re-indexes.
	if _, err := s.UpdateMaterial(ctx, Material{ID: upl.ID, Title: "Diagram ERD", Description: "kardinalitas"}); err != nil {
		t.Fatal(err)
	}
	if got, _ := s.ListMaterials(ctx, MaterialFilter{Query: "kardinal"}); len(got) != 1 {
		t.Errorf("after update: %d", len(got))
	}
	fileID, err := s.DeleteMaterial(ctx, upl.ID)
	if err != nil || fileID == "" {
		t.Fatalf("delete: %q %v", fileID, err)
	}
	if got, _ := s.ListMaterials(ctx, MaterialFilter{Query: "kardinal"}); len(got) != 0 {
		t.Errorf("after delete: %d", len(got))
	}
}

func TestSearchExpression(t *testing.T) {
	tests := map[string]string{
		"basis dat":     `"basis"* "dat"*`,
		"  ":            "",
		`a"b`:           `"a"* "b"*`,
		"C++ & Java":    `"C"* "Java"*`,
		"pertemuan-8":   `"pertemuan"* "8"*`,
		"sinyal ñandú":  `"sinyal"* "ñandú"*`,
	}
	for in, want := range tests {
		if got := SearchExpression(in); got != want {
			t.Errorf("SearchExpression(%q) = %q want %q", in, got, want)
		}
	}
}

func TestTaskRelationsAndCompletedAt(t *testing.T) {
	s, clk := newTestStore(t)
	ctx := context.Background()
	sem := mustSemester(t, s, "S3", false)
	other := mustSemester(t, s, "S4", false)
	c := mustCourse(t, s, sem.ID, "Basis Data", 4)
	cOther := mustCourse(t, s, other.ID, "Jaringan", 4)
	meetings, _ := s.ListMeetings(ctx, c.ID)
	comps, _ := s.ListGradeComponents(ctx, c.ID)
	otherMeetings, _ := s.ListMeetings(ctx, cOther.ID)

	deadline := time.Date(2026, 10, 20, 16, 59, 0, 0, time.UTC)

	// Defaults to the active semester when there is no course.
	t1, err := s.CreateTask(ctx, Task{Title: "Umum", Deadline: deadline})
	if err != nil || t1.SemesterID != sem.ID || t1.Status != domain.TaskTodo || t1.Priority != domain.PriorityNormal {
		t.Fatalf("t1: %+v %v", t1, err)
	}
	// Uses the course's semester.
	t2, err := s.CreateTask(ctx, Task{CourseID: &cOther.ID, Title: "Lain", Deadline: deadline})
	if err != nil || t2.SemesterID != other.ID || t2.Course == nil || t2.Course.Name != "Jaringan" {
		t.Fatalf("t2: %+v %v", t2, err)
	}

	invalid := []struct {
		name  string
		task  Task
		field string
	}{
		{"semester mismatch", Task{SemesterID: sem.ID, CourseID: &cOther.ID, Title: "x", Deadline: deadline}, "course_id"},
		{"meeting of other course", Task{CourseID: &c.ID, MeetingID: &otherMeetings[0].ID, Title: "x", Deadline: deadline}, "meeting_id"},
		{"meeting without course", Task{MeetingID: &meetings[0].ID, Title: "x", Deadline: deadline}, "meeting_id"},
		{"component without course", Task{GradeComponentID: &comps[0].ID, Title: "x", Deadline: deadline}, "grade_component_id"},
		{"missing course", Task{CourseID: strPtr(NewID()), Title: "x", Deadline: deadline}, "course_id"},
		{"missing semester", Task{SemesterID: NewID(), Title: "x", Deadline: deadline}, "semester_id"},
	}
	for _, tt := range invalid {
		_, err := s.CreateTask(ctx, tt.task)
		var ve *domain.ValidationError
		if !errors.As(err, &ve) || ve.Fields[tt.field] == "" {
			t.Errorf("%s: %v", tt.name, err)
		}
	}

	t3, err := s.CreateTask(ctx, Task{CourseID: &c.ID, MeetingID: &meetings[1].ID, GradeComponentID: &comps[0].ID, Title: "Linked", Deadline: deadline})
	if err != nil {
		t.Fatal(err)
	}

	// Status changes manage completed_at.
	clk.Advance(time.Hour)
	submitted, err := s.SetTaskStatus(ctx, t3.ID, domain.TaskSubmitted)
	if err != nil || submitted.CompletedAt == nil || !submitted.CompletedAt.Equal(clk.Now()) {
		t.Fatalf("submitted: %+v %v", submitted.CompletedAt, err)
	}
	firstDone := *submitted.CompletedAt
	clk.Advance(time.Hour)
	score := 90.0
	graded := submitted
	graded.Status = domain.TaskGraded
	graded.Score = &score
	graded, err = s.UpdateTask(ctx, graded)
	if err != nil || graded.CompletedAt == nil || !graded.CompletedAt.Equal(firstDone) || *graded.Score != 90 {
		t.Fatalf("graded: %+v %v", graded, err)
	}
	reopened, err := s.SetTaskStatus(ctx, t3.ID, domain.TaskInProgress)
	if err != nil || reopened.CompletedAt != nil {
		t.Fatalf("reopened: %+v %v", reopened.CompletedAt, err)
	}

	// Update cannot move the task to a course of another semester.
	moved := reopened
	moved.CourseID = &cOther.ID
	moved.MeetingID, moved.GradeComponentID = nil, nil
	var ve *domain.ValidationError
	if _, err := s.UpdateTask(ctx, moved); !errors.As(err, &ve) || ve.Fields["course_id"] == "" {
		t.Errorf("move: %v", err)
	}

	// Graded task scores feed the tasks component.
	scores, err := s.ListGradedTaskScores(ctx, c.ID)
	if err != nil || len(scores[comps[0].ID]) != 1 {
		t.Errorf("scores: %v %v", scores, err)
	}

	// Filters.
	open, _ := s.ListTasks(ctx, TaskFilter{SemesterID: sem.ID, Statuses: []string{domain.TaskTodo, domain.TaskInProgress}})
	if len(open) != 2 {
		t.Errorf("open tasks in semester: %d", len(open))
	}
	from := deadline.Add(-time.Minute)
	to := deadline.Add(time.Minute)
	if got, _ := s.ListTasks(ctx, TaskFilter{DueFrom: &from, DueTo: &to}); len(got) != 3 {
		t.Errorf("due range: %d", len(got))
	}
	counts, _ := s.CountOpenTasksByCourse(ctx, sem.ID)
	if counts[c.ID] != 1 {
		t.Errorf("open count: %v", counts)
	}

	// Deleting a meeting unlinks the task instead of deleting it.
	if err := s.DeleteMeeting(ctx, meetings[1].ID); err != nil {
		t.Fatal(err)
	}
	after, err := s.GetTask(ctx, t3.ID)
	if err != nil || after.MeetingID != nil {
		t.Errorf("after meeting delete: %+v %v", after.MeetingID, err)
	}
}

func strPtr(s string) *string { return &s }

func TestNewTaskLinksToSoleTasksComponent(t *testing.T) {
	s, _ := newTestStore(t)
	ctx := context.Background()
	sem := mustSemester(t, s, "S3", false)
	c := mustCourse(t, s, sem.ID, "Basis Data", 0)
	comps, _ := s.ListGradeComponents(ctx, c.ID)

	task, err := s.CreateTask(ctx, Task{CourseID: &c.ID, Title: "Auto", Deadline: time.Now()})
	if err != nil {
		t.Fatal(err)
	}
	if task.GradeComponentID == nil || *task.GradeComponentID != comps[0].ID {
		t.Fatalf("expected link to the Tugas component, got %v", task.GradeComponentID)
	}
	explicit, _ := s.CreateTask(ctx, Task{CourseID: &c.ID, GradeComponentID: &comps[1].ID, Title: "Explicit", Deadline: time.Now()})
	if *explicit.GradeComponentID != comps[1].ID {
		t.Error("an explicit component must win")
	}

	// Two tasks-sourced components: no guess.
	if err := s.ReplaceGradeComponents(ctx, c.ID, []GradeComponent{
		{Name: "Tugas", Weight: 20, Source: domain.SourceTasks},
		{Name: "Kuis", Weight: 20, Source: domain.SourceTasks},
		{Name: "UAS", Weight: 60, Source: domain.SourceManual},
	}); err != nil {
		t.Fatal(err)
	}
	ambiguous, _ := s.CreateTask(ctx, Task{CourseID: &c.ID, Title: "Ambiguous", Deadline: time.Now()})
	if ambiguous.GradeComponentID != nil {
		t.Errorf("ambiguous course must not auto-link, got %v", *ambiguous.GradeComponentID)
	}
}

func TestReplaceGradeComponentsKeepsIDs(t *testing.T) {
	s, _ := newTestStore(t)
	ctx := context.Background()
	sem := mustSemester(t, s, "S3", false)
	c := mustCourse(t, s, sem.ID, "Basis Data", 0)
	other := mustCourse(t, s, sem.ID, "Jaringan", 0)
	comps, _ := s.ListGradeComponents(ctx, c.ID)
	otherComps, _ := s.ListGradeComponents(ctx, other.ID)
	tasksComp := comps[0]

	score := 88.0
	task, err := s.CreateTask(ctx, Task{CourseID: &c.ID, GradeComponentID: &tasksComp.ID, Title: "T", Deadline: time.Now(), Score: &score})
	if err != nil {
		t.Fatal(err)
	}

	uts := 75.0
	err = s.ReplaceGradeComponents(ctx, c.ID, []GradeComponent{
		{Name: "Kuis", Weight: 10, Source: domain.SourceManual},
		{ID: tasksComp.ID, Name: "Tugas Besar", Weight: 40, Source: domain.SourceTasks},
		{ID: comps[1].ID, Name: "UTS", Weight: 50, Source: domain.SourceManual, Score: &uts},
	})
	if err != nil {
		t.Fatal(err)
	}
	got, _ := s.ListGradeComponents(ctx, c.ID)
	if len(got) != 3 || got[0].Name != "Kuis" || got[1].ID != tasksComp.ID || got[1].Name != "Tugas Besar" || *got[2].Score != 75 {
		t.Fatalf("components: %+v", got)
	}
	after, _ := s.GetTask(ctx, task.ID)
	if after.GradeComponentID == nil || *after.GradeComponentID != tasksComp.ID {
		t.Error("task link must survive")
	}

	// Removing the component unlinks the task.
	if err := s.ReplaceGradeComponents(ctx, c.ID, []GradeComponent{{Name: "UAS", Weight: 100, Source: domain.SourceManual}}); err != nil {
		t.Fatal(err)
	}
	after, _ = s.GetTask(ctx, task.ID)
	if after.GradeComponentID != nil {
		t.Error("task should be unlinked")
	}

	// IDs of other courses and duplicates are rejected.
	var ve *domain.ValidationError
	err = s.ReplaceGradeComponents(ctx, c.ID, []GradeComponent{{ID: otherComps[0].ID, Name: "X", Weight: 100, Source: domain.SourceManual}})
	if !errors.As(err, &ve) {
		t.Errorf("foreign id: %v", err)
	}
	dup := NewID()
	err = s.ReplaceGradeComponents(ctx, c.ID, []GradeComponent{
		{ID: dup, Name: "X", Weight: 50, Source: domain.SourceManual},
		{ID: dup, Name: "Y", Weight: 50, Source: domain.SourceManual},
	})
	if !errors.As(err, &ve) {
		t.Errorf("duplicate id: %v", err)
	}
	// A fresh client-generated ID is accepted.
	fresh := NewID()
	if err := s.ReplaceGradeComponents(ctx, c.ID, []GradeComponent{{ID: fresh, Name: "Z", Weight: 100, Source: domain.SourceManual}}); err != nil {
		t.Fatal(err)
	}
	if got, _ := s.ListGradeComponents(ctx, c.ID); len(got) != 1 || got[0].ID != fresh {
		t.Errorf("fresh id: %+v", got)
	}
}

func TestMeetingsGenerateConflictAndAttendance(t *testing.T) {
	s, _ := newTestStore(t)
	ctx := context.Background()
	sem := mustSemester(t, s, "S3", false)
	c := mustCourse(t, s, sem.ID, "Basis Data", 4)

	if _, err := s.CreateGeneratedMeetings(ctx, c.ID, []Meeting{{Number: 1, Date: "2026-09-07"}}); !errors.Is(err, domain.ErrConflict) {
		t.Errorf("generate twice: %v", err)
	}
	extra, err := s.CreateMeeting(ctx, Meeting{CourseID: c.ID, Date: "2026-12-30", Kind: domain.KindLecture})
	if err != nil || extra.Number != 5 || extra.Status != domain.MeetingScheduled {
		t.Fatalf("extra: %+v %v", extra, err)
	}
	present := domain.AttendancePresent
	m, err := s.SetAttendance(ctx, extra.ID, &present)
	if err != nil || m.Attendance == nil || *m.Attendance != present || m.AttendanceAt == nil {
		t.Fatalf("attendance: %+v %v", m, err)
	}
	m, err = s.SetAttendance(ctx, extra.ID, nil)
	if err != nil || m.Attendance != nil || m.AttendanceAt != nil {
		t.Fatalf("clear: %+v %v", m, err)
	}
	onDate, err := s.ListMeetingsOnDate(ctx, sem.ID, "2026-09-07")
	if err != nil || len(onDate) != 1 || onDate[0].Course.Name != "Basis Data" {
		t.Fatalf("on date: %+v %v", onDate, err)
	}
	unrecorded, _ := s.ListUnrecordedMeetingsOnDate(ctx, sem.ID, "2026-09-07")
	if len(unrecorded) != 1 {
		t.Errorf("unrecorded: %d", len(unrecorded))
	}
	bySem, _ := s.ListMeetingsBySemester(ctx, sem.ID)
	if len(bySem[c.ID]) != 5 {
		t.Errorf("by semester: %d", len(bySem[c.ID]))
	}
	if _, err := s.SetAttendance(ctx, NewID(), &present); !errors.Is(err, domain.ErrNotFound) {
		t.Errorf("missing meeting: %v", err)
	}
}

func TestSessionsAndUsers(t *testing.T) {
	s, clk := newTestStore(t)
	ctx := context.Background()
	u, err := s.CreateUser(ctx, "Gua", "hash1")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.CreateUser(ctx, "gua", "hash2"); !errors.Is(err, domain.ErrConflict) {
		t.Errorf("duplicate username (case-insensitive): %v", err)
	}
	found, err := s.GetUserByUsername(ctx, "GUA")
	if err != nil || found.ID != u.ID {
		t.Fatalf("lookup: %v", err)
	}

	now := clk.Now()
	for _, id := range []string{"a", "b", "c"} {
		if err := s.CreateSession(ctx, Session{ID: id, UserID: u.ID, CreatedAt: now, LastSeenAt: now, ExpiresAt: now.Add(time.Hour)}); err != nil {
			t.Fatal(err)
		}
	}
	sess, user, err := s.GetSession(ctx, "a")
	if err != nil || sess.UserID != u.ID || user.Username != "Gua" {
		t.Fatalf("session: %+v %v", sess, err)
	}
	if err := s.ChangePassword(ctx, u.ID, "hash3", "a"); err != nil {
		t.Fatal(err)
	}
	if _, _, err := s.GetSession(ctx, "b"); !errors.Is(err, domain.ErrNotFound) {
		t.Error("other sessions must be revoked")
	}
	if _, _, err := s.GetSession(ctx, "a"); err != nil {
		t.Error("current session must stay")
	}
	if got, _ := s.GetUser(ctx, u.ID); got.PasswordHash != "hash3" {
		t.Error("password not updated")
	}
	n, err := s.DeleteExpiredSessions(ctx, now.Add(2*time.Hour))
	if err != nil || n != 1 {
		t.Errorf("expired: %d %v", n, err)
	}
}

func TestSettingsAndVAPID(t *testing.T) {
	s, _ := newTestStore(t)
	ctx := context.Background()
	st, err := s.GetSettings(ctx)
	if err != nil || st.Timezone != domain.DefaultTimezone || st.GradeScaleConfirmed || len(st.GradeScale) != 9 {
		t.Fatalf("defaults: %+v %v", st, err)
	}
	st.Timezone = "Asia/Makassar"
	st.GradeScaleConfirmed = true
	st.GradeScale = domain.GradeScale{{Letter: "E", MinScore: 0}, {Letter: "A", MinScore: 80, Points: 4}}
	if err := s.SaveSettings(ctx, st); err != nil {
		t.Fatal(err)
	}
	got, _ := s.GetSettings(ctx)
	if got.Timezone != "Asia/Makassar" || !got.GradeScaleConfirmed || got.GradeScale[0].Letter != "A" {
		t.Errorf("saved: %+v", got)
	}

	if _, err := s.GetVAPIDKeys(ctx); !errors.Is(err, domain.ErrNotFound) {
		t.Errorf("no keys yet: %v", err)
	}
	k1, err := s.InitVAPIDKeys(ctx, VAPIDKeys{PublicKey: "pub1", PrivateKey: "priv1"})
	if err != nil || k1.PublicKey != "pub1" {
		t.Fatal(err)
	}
	k2, _ := s.InitVAPIDKeys(ctx, VAPIDKeys{PublicKey: "pub2", PrivateKey: "priv2"})
	if k2.PublicKey != "pub1" {
		t.Error("existing keys must not be replaced")
	}
}

func TestPushAndNotificationLog(t *testing.T) {
	s, clk := newTestStore(t)
	ctx := context.Background()
	sub := PushSubscription{Endpoint: "https://push.example/1", P256dh: "k1", Auth: "a1", UserAgent: "UA"}
	if err := s.UpsertPushSubscription(ctx, sub); err != nil {
		t.Fatal(err)
	}
	sub.P256dh = "k2"
	if err := s.UpsertPushSubscription(ctx, sub); err != nil {
		t.Fatal(err)
	}
	list, _ := s.ListPushSubscriptions(ctx)
	if len(list) != 1 || list[0].P256dh != "k2" {
		t.Fatalf("upsert: %+v", list)
	}
	if err := s.MarkPushSuccess(ctx, sub.Endpoint, clk.Now()); err != nil {
		t.Fatal(err)
	}
	list, _ = s.ListPushSubscriptions(ctx)
	if list[0].LastSuccessAt == nil {
		t.Error("last success not set")
	}
	if err := s.DeletePushSubscription(ctx, sub.Endpoint); err != nil {
		t.Fatal(err)
	}
	if n, _ := s.CountPushSubscriptions(ctx); n != 0 {
		t.Errorf("count after delete: %d", n)
	}

	first, err := s.LogNotification(ctx, domain.NotifyTask24h, "t|x")
	if err != nil || !first {
		t.Fatalf("first log: %v %v", first, err)
	}
	second, _ := s.LogNotification(ctx, domain.NotifyTask24h, "t|x")
	if second {
		t.Error("second log must report existing entry")
	}
	if err := s.UnlogNotification(ctx, domain.NotifyTask24h, "t|x"); err != nil {
		t.Fatal(err)
	}
	if again, _ := s.LogNotification(ctx, domain.NotifyTask24h, "t|x"); !again {
		t.Error("log after unlog must insert")
	}
	clk.Advance(48 * time.Hour)
	if n, _ := s.PruneNotificationLog(ctx, clk.Now().Add(-24*time.Hour)); n != 1 {
		t.Errorf("prune: %d", n)
	}
}

func TestNormalizeID(t *testing.T) {
	id := NewID()
	if got, ok := NormalizeID(id); !ok || got != id {
		t.Errorf("valid id: %q %v", got, ok)
	}
	upper := "0192F1A4-7E2B-7C3D-8E4F-5A6B7C8D9E0F"
	if got, ok := NormalizeID(upper); !ok || got != "0192f1a4-7e2b-7c3d-8e4f-5a6b7c8d9e0f" {
		t.Errorf("upper: %q %v", got, ok)
	}
	for _, bad := range []string{"", "abc", "{0192f1a4-7e2b-7c3d-8e4f-5a6b7c8d9e0f}", "0192f1a47e2b7c3d8e4f5a6b7c8d9e0f"} {
		if _, ok := NormalizeID(bad); ok {
			t.Errorf("%q should be invalid", bad)
		}
	}
}
