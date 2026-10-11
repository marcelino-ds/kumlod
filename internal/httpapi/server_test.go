package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"kumlod/internal/api"
	"kumlod/internal/auth"
	"kumlod/internal/clock"
	"kumlod/internal/db"
	"kumlod/internal/files"
	"kumlod/internal/push"
	"kumlod/internal/store"
)

const testPassword = "rahasia-banget"

type fakePusher struct{ msgs []push.Message }

func (f *fakePusher) Broadcast(_ context.Context, m push.Message) (push.Result, error) {
	f.msgs = append(f.msgs, m)
	return push.Result{Sent: 1}, nil
}

type env struct {
	t      *testing.T
	srv    *httptest.Server
	client *http.Client
	store  *store.Store
	files  *files.Store
	clock  *clock.Fake
	pusher *fakePusher
}

func newEnv(t *testing.T) *env {
	t.Helper()
	dir := t.TempDir()
	conn, err := db.Open(filepath.Join(dir, "kumlod.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { conn.Close() })
	if err := db.Migrate(context.Background(), conn, nil); err != nil {
		t.Fatal(err)
	}
	// Monday 2026-10-12 08:00 WIB.
	clk := clock.NewFake(time.Date(2026, 10, 12, 1, 0, 0, 0, time.UTC))
	st := store.New(conn, clk)
	fs, err := files.New(filepath.Join(dir, "files"))
	if err != nil {
		t.Fatal(err)
	}
	hash, err := auth.HashPassword(testPassword)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := st.CreateUser(context.Background(), "gua", hash); err != nil {
		t.Fatal(err)
	}
	p := &fakePusher{}
	s := New(st, fs, p, clk, nil, Options{Version: "test", MaxUploadBytes: 1 << 20, VAPIDPublicKey: "BPUB"})
	srv := httptest.NewServer(s.Handler(http.NotFoundHandler()))
	t.Cleanup(srv.Close)
	e := &env{t: t, srv: srv, store: st, files: fs, clock: clk, pusher: p}
	e.client = e.newClient()
	return e
}

func (e *env) newClient() *http.Client {
	jar, _ := cookiejar.New(nil)
	return &http.Client{Jar: jar}
}

type reqOpt func(*http.Request)

func noCSRF(r *http.Request) { r.Header.Del(CSRFHeader) }

func (e *env) raw(c *http.Client, method, path string, body io.Reader, contentType string, opts ...reqOpt) *http.Response {
	e.t.Helper()
	req, err := http.NewRequest(method, e.srv.URL+path, body)
	if err != nil {
		e.t.Fatal(err)
	}
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	if method != http.MethodGet {
		req.Header.Set(CSRFHeader, CSRFValue)
	}
	for _, o := range opts {
		o(req)
	}
	resp, err := c.Do(req)
	if err != nil {
		e.t.Fatal(err)
	}
	return resp
}

// call sends JSON with the default client and decodes the response into out.
func (e *env) call(method, path string, body any, wantStatus int, out any, opts ...reqOpt) *http.Response {
	e.t.Helper()
	return e.callWith(e.client, method, path, body, wantStatus, out, opts...)
}

func (e *env) callWith(c *http.Client, method, path string, body any, wantStatus int, out any, opts ...reqOpt) *http.Response {
	e.t.Helper()
	var r io.Reader
	ct := ""
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			e.t.Fatal(err)
		}
		r = bytes.NewReader(b)
		ct = "application/json"
	}
	resp := e.raw(c, method, path, r, ct, opts...)
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != wantStatus {
		e.t.Fatalf("%s %s: status %d want %d: %s", method, path, resp.StatusCode, wantStatus, data)
	}
	if out != nil {
		if err := json.Unmarshal(data, out); err != nil {
			e.t.Fatalf("%s %s: decode %v: %s", method, path, err, data)
		}
	}
	return resp
}

func (e *env) login() {
	e.t.Helper()
	e.call(http.MethodPost, "/api/auth/login", api.LoginRequest{Username: "gua", Password: testPassword}, http.StatusOK, nil)
}

func errCode(t *testing.T, resp *http.Response) api.Error {
	t.Helper()
	var e api.Error
	if err := json.NewDecoder(resp.Body).Decode(&e); err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	return e
}

func TestHealthAndAuthRequired(t *testing.T) {
	e := newEnv(t)
	var h api.Health
	e.call(http.MethodGet, "/api/health", nil, http.StatusOK, &h)
	if h.Status != "ok" || h.Version != "test" {
		t.Errorf("health: %+v", h)
	}
	var er api.Error
	e.call(http.MethodGet, "/api/semesters", nil, http.StatusUnauthorized, &er)
	if er.Error.Code != api.Unauthenticated {
		t.Errorf("code = %s", er.Error.Code)
	}
	e.login()
	e.call(http.MethodGet, "/api/nope", nil, http.StatusNotFound, &er)
	if er.Error.Code != api.NotFound {
		t.Errorf("unknown endpoint code = %s", er.Error.Code)
	}
}

func TestSecurityHeaders(t *testing.T) {
	e := newEnv(t)
	resp := e.raw(e.client, http.MethodGet, "/api/health", nil, "")
	resp.Body.Close()
	want := map[string]string{
		"X-Content-Type-Options":  "nosniff",
		"X-Frame-Options":         "DENY",
		"Referrer-Policy":         "same-origin",
		"Cache-Control":           "no-store",
		"Content-Security-Policy": apiCSP,
	}
	for k, v := range want {
		if got := resp.Header.Get(k); got != v {
			t.Errorf("%s = %q want %q", k, got, v)
		}
	}
	if resp.Header.Get("Permissions-Policy") == "" {
		t.Error("Permissions-Policy missing")
	}
}

func TestCSRF(t *testing.T) {
	e := newEnv(t)
	var er api.Error
	e.call(http.MethodPost, "/api/auth/login", api.LoginRequest{Username: "gua", Password: testPassword}, http.StatusForbidden, &er, noCSRF)
	if er.Error.Code != api.CsrfFailed {
		t.Errorf("code = %s", er.Error.Code)
	}
	e.login()
	e.call(http.MethodPost, "/api/semesters", map[string]any{"name": "x"}, http.StatusForbidden, &er, noCSRF)
	e.call(http.MethodDelete, "/api/tasks/x", nil, http.StatusForbidden, &er, noCSRF)
	e.call(http.MethodPut, "/api/settings", map[string]any{}, http.StatusForbidden, &er, func(r *http.Request) {
		r.Header.Set(CSRFHeader, "XMLHttpRequest")
	})
}

func TestLoginLogoutAndCookie(t *testing.T) {
	e := newEnv(t)
	var wrongUser, wrongPass api.Error
	e.call(http.MethodPost, "/api/auth/login", api.LoginRequest{Username: "siapa", Password: "x"}, http.StatusUnauthorized, &wrongUser)
	e.call(http.MethodPost, "/api/auth/login", api.LoginRequest{Username: "gua", Password: "salah"}, http.StatusUnauthorized, &wrongPass)
	if wrongUser.Error.Message != wrongPass.Error.Message {
		t.Errorf("messages differ: %q vs %q", wrongUser.Error.Message, wrongPass.Error.Message)
	}

	var me api.Me
	resp := e.call(http.MethodPost, "/api/auth/login", api.LoginRequest{Username: "GUA", Password: testPassword}, http.StatusOK, &me)
	if me.User.Username != "gua" {
		t.Errorf("me = %+v", me)
	}
	var cookie *http.Cookie
	for _, c := range resp.Cookies() {
		if c.Name == auth.CookieName {
			cookie = c
		}
	}
	if cookie == nil || !cookie.HttpOnly || cookie.SameSite != http.SameSiteLaxMode || cookie.Path != "/" || cookie.MaxAge != 30*24*3600 {
		t.Fatalf("cookie: %+v", cookie)
	}
	// The database stores the hash, not the token.
	if _, _, err := e.store.GetSession(context.Background(), cookie.Value); err == nil {
		t.Error("raw token must not be a session id")
	}
	if _, _, err := e.store.GetSession(context.Background(), auth.HashToken(cookie.Value)); err != nil {
		t.Errorf("hashed token lookup: %v", err)
	}

	e.call(http.MethodGet, "/api/auth/me", nil, http.StatusOK, &me)
	resp = e.call(http.MethodPost, "/api/auth/logout", nil, http.StatusNoContent, nil)
	cleared := false
	for _, c := range resp.Cookies() {
		if c.Name == auth.CookieName && c.MaxAge < 0 {
			cleared = true
		}
	}
	if !cleared {
		t.Error("logout must clear the cookie")
	}
	e.call(http.MethodGet, "/api/auth/me", nil, http.StatusUnauthorized, nil)
}

func TestLoginRateLimit(t *testing.T) {
	e := newEnv(t)
	for i := 0; i < auth.LoginMaxAttempts; i++ {
		e.call(http.MethodPost, "/api/auth/login", api.LoginRequest{Username: "gua", Password: "salah"}, http.StatusUnauthorized, nil)
	}
	var er api.Error
	resp := e.call(http.MethodPost, "/api/auth/login", api.LoginRequest{Username: "gua", Password: testPassword}, http.StatusTooManyRequests, &er)
	if er.Error.Code != api.RateLimited || resp.Header.Get("Retry-After") == "" {
		t.Errorf("rate limit: %+v %q", er, resp.Header.Get("Retry-After"))
	}
	e.clock.Advance(auth.LoginWindow)
	e.login()
}

func TestChangePasswordRevokesOtherSessions(t *testing.T) {
	e := newEnv(t)
	e.login()
	other := e.newClient()
	e.callWith(other, http.MethodPost, "/api/auth/login", api.LoginRequest{Username: "gua", Password: testPassword}, http.StatusOK, nil)

	var er api.Error
	e.call(http.MethodPut, "/api/auth/password", api.ChangePasswordRequest{CurrentPassword: "salah", NewPassword: "password-baru"}, http.StatusBadRequest, &er)
	if er.Error.Fields == nil || (*er.Error.Fields)["current_password"] == "" {
		t.Errorf("wrong current: %+v", er)
	}
	e.call(http.MethodPut, "/api/auth/password", api.ChangePasswordRequest{CurrentPassword: testPassword, NewPassword: "pendek"}, http.StatusBadRequest, &er)
	if (*er.Error.Fields)["new_password"] == "" {
		t.Errorf("short new: %+v", er)
	}
	e.call(http.MethodPut, "/api/auth/password", api.ChangePasswordRequest{CurrentPassword: testPassword, NewPassword: "password-baru"}, http.StatusNoContent, nil)

	e.call(http.MethodGet, "/api/auth/me", nil, http.StatusOK, nil)
	e.callWith(other, http.MethodGet, "/api/auth/me", nil, http.StatusUnauthorized, nil)
	e.callWith(other, http.MethodPost, "/api/auth/login", api.LoginRequest{Username: "gua", Password: testPassword}, http.StatusUnauthorized, nil)
	e.callWith(other, http.MethodPost, "/api/auth/login", api.LoginRequest{Username: "gua", Password: "password-baru"}, http.StatusOK, nil)
}

func TestSessionRenewalAndExpiry(t *testing.T) {
	e := newEnv(t)
	e.login()
	e.clock.Advance(16 * 24 * time.Hour)
	resp := e.call(http.MethodGet, "/api/auth/me", nil, http.StatusOK, nil)
	renewed := false
	for _, c := range resp.Cookies() {
		if c.Name == auth.CookieName && c.MaxAge > 0 {
			renewed = true
		}
	}
	if !renewed {
		t.Error("session with less than 15 days left must be renewed")
	}
	e.clock.Advance(29 * 24 * time.Hour)
	e.call(http.MethodGet, "/api/auth/me", nil, http.StatusOK, nil)
	e.clock.Advance(31 * 24 * time.Hour)
	e.call(http.MethodGet, "/api/auth/me", nil, http.StatusUnauthorized, nil)
}

func TestValidationErrors(t *testing.T) {
	e := newEnv(t)
	e.login()
	var er api.Error
	e.call(http.MethodPost, "/api/semesters", map[string]any{
		"name": "S3", "academic_year": "2026/2027", "term": "odd", "start_date": "2026-09-07", "end_date": "2026-09-01",
	}, http.StatusBadRequest, &er)
	if er.Error.Code != api.ValidationError || (*er.Error.Fields)["end_date"] == "" {
		t.Errorf("end before start: %+v", er)
	}
	e.call(http.MethodPost, "/api/semesters", map[string]any{
		"name": "", "term": "winter", "start_date": "2026-02-30", "end_date": "x",
	}, http.StatusBadRequest, &er)
	for _, f := range []string{"name", "term", "start_date", "end_date"} {
		if (*er.Error.Fields)[f] == "" {
			t.Errorf("missing field error %s: %+v", f, er.Error.Fields)
		}
	}

	resp := e.raw(e.client, http.MethodPost, "/api/semesters", strings.NewReader("{bad json"), "application/json")
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("bad json: %d", resp.StatusCode)
	}
	resp.Body.Close()
	resp = e.raw(e.client, http.MethodPost, "/api/semesters", strings.NewReader(`{"name":1}`), "application/json")
	if er := errCode(t, resp); resp.StatusCode != http.StatusBadRequest || (*er.Error.Fields)["name"] == "" {
		t.Errorf("type mismatch: %d %+v", resp.StatusCode, er)
	}
	resp = e.raw(e.client, http.MethodPost, "/api/semesters", strings.NewReader(`{}`), "text/plain")
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("wrong content type: %d", resp.StatusCode)
	}
	resp.Body.Close()
	big := `{"name":"` + strings.Repeat("a", MaxJSONBody) + `"}`
	resp = e.raw(e.client, http.MethodPost, "/api/semesters", strings.NewReader(big), "application/json")
	if resp.StatusCode != http.StatusRequestEntityTooLarge {
		t.Errorf("big body: %d", resp.StatusCode)
	}
	resp.Body.Close()

	var sem api.Semester
	e.call(http.MethodPost, "/api/semesters", map[string]any{
		"name": "S3", "academic_year": "2026/2027", "term": "odd", "start_date": "2026-09-07", "end_date": "2027-01-15",
	}, http.StatusCreated, &sem)
	e.call(http.MethodPost, "/api/semesters/"+sem.Id+"/courses", map[string]any{
		"name": "Basis Data", "credits": 30, "color": "red",
		"schedules": []map[string]any{{"day_of_week": 8, "start_time": "10:00", "end_time": "09:00", "room": ""}},
	}, http.StatusBadRequest, &er)
	for _, f := range []string{"credits", "color", "schedules[0].day_of_week", "schedules[0].end_time"} {
		if (*er.Error.Fields)[f] == "" {
			t.Errorf("course field %s missing: %+v", f, er.Error.Fields)
		}
	}
	e.call(http.MethodPost, "/api/semesters", map[string]any{
		"id": "bukan-uuid", "name": "S4", "term": "even", "start_date": "2027-02-01", "end_date": "2027-06-30",
	}, http.StatusBadRequest, &er)
	if (*er.Error.Fields)["id"] == "" {
		t.Errorf("bad id: %+v", er)
	}
	id := store.NewID()
	body := map[string]any{"id": id, "name": "S4", "term": "even", "start_date": "2027-02-01", "end_date": "2027-06-30"}
	e.call(http.MethodPost, "/api/semesters", body, http.StatusCreated, nil)
	e.call(http.MethodPost, "/api/semesters", body, http.StatusConflict, &er)
	if er.Error.Code != api.Conflict {
		t.Errorf("duplicate id: %+v", er)
	}
	e.call(http.MethodGet, "/api/gpa?target_ipk=abc", nil, http.StatusBadRequest, &er)
	e.call(http.MethodGet, "/api/gpa?target_ipk=5", nil, http.StatusBadRequest, &er)
	e.call(http.MethodGet, "/api/tasks?status=done", nil, http.StatusBadRequest, &er)
}

// TestCourseFlow walks through the main flow: semester, course with generated
// meetings, attendance, tasks, grades, GPA, and the dashboard.
func TestCourseFlow(t *testing.T) {
	e := newEnv(t)
	e.login()

	var dash api.Dashboard
	e.call(http.MethodGet, "/api/dashboard", nil, http.StatusOK, &dash)
	if dash.Semester != nil || dash.Date != "2026-10-12" || dash.Timezone != "Asia/Jakarta" {
		t.Fatalf("empty dashboard: %+v", dash)
	}
	var tasks api.TaskList
	e.call(http.MethodGet, "/api/tasks", nil, http.StatusOK, &tasks)
	if len(tasks.Items) != 0 {
		t.Fatal("no active semester means no tasks")
	}
	var er api.Error
	e.call(http.MethodPost, "/api/tasks", map[string]any{"title": "Umum", "deadline": "2026-10-12T16:59:00Z"}, http.StatusBadRequest, &er)
	if (*er.Error.Fields)["semester_id"] == "" {
		t.Errorf("task without semester: %+v", er)
	}

	var sem api.Semester
	e.call(http.MethodPost, "/api/semesters", map[string]any{
		"name": "Semester 3", "academic_year": "2026/2027", "term": "odd", "start_date": "2026-09-07", "end_date": "2027-01-15",
	}, http.StatusCreated, &sem)
	if !sem.IsActive {
		t.Fatal("first semester must be active")
	}

	var course api.Course
	e.call(http.MethodPost, "/api/semesters/"+sem.Id+"/courses", map[string]any{
		"name": "Basis Data", "code": "IF201", "credits": 3,
		"schedules": []map[string]any{{"day_of_week": 1, "start_time": "08:00", "end_time": "09:40", "room": "A1"}},
	}, http.StatusCreated, &course)
	if course.TotalMeetings != 16 || course.MinAttendancePct != 75 || course.Color != defaultCourseColor || len(course.Schedules) != 1 {
		t.Fatalf("course defaults: %+v", course)
	}
	// 14 lectures (UTS and UAS excluded) and 5 past Mondays (Sep 7 - Oct 5) unrecorded.
	if course.Attendance.Total != 14 || course.Attendance.MaxAbsences != 3 || course.Attendance.Unrecorded != 5 {
		t.Errorf("attendance: %+v", course.Attendance)
	}

	var meetings api.MeetingList
	e.call(http.MethodGet, "/api/courses/"+course.Id+"/meetings", nil, http.StatusOK, &meetings)
	if len(meetings.Items) != 16 || meetings.Items[7].Kind != api.Midterm || meetings.Items[15].Kind != api.Final {
		t.Fatalf("meetings: %d", len(meetings.Items))
	}
	e.call(http.MethodPost, "/api/courses/"+course.Id+"/meetings/generate", nil, http.StatusConflict, &er)

	// Today (Monday 2026-10-12) is meeting 6.
	e.call(http.MethodGet, "/api/dashboard", nil, http.StatusOK, &dash)
	if len(dash.TodayMeetings) != 1 || dash.TodayMeetings[0].Meeting.Number != 6 || dash.TodayMeetings[0].Course.Name != "Basis Data" {
		t.Fatalf("today: %+v", dash.TodayMeetings)
	}
	if len(dash.AttendanceAlerts) != 1 {
		t.Errorf("alerts (unrecorded): %+v", dash.AttendanceAlerts)
	}
	today := dash.TodayMeetings[0].Meeting
	var m api.Meeting
	e.call(http.MethodPut, "/api/meetings/"+today.Id+"/attendance", map[string]any{"status": "present"}, http.StatusOK, &m)
	if m.Attendance == nil || *m.Attendance != api.MeetingAttendancePresent || m.AttendanceAt == nil {
		t.Fatalf("attendance: %+v", m)
	}
	e.call(http.MethodPut, "/api/meetings/"+today.Id+"/attendance", map[string]any{"status": "bolos"}, http.StatusBadRequest, nil)
	for _, past := range meetings.Items[:5] {
		e.call(http.MethodPut, "/api/meetings/"+past.Id+"/attendance", map[string]any{"status": "absent"}, http.StatusOK, nil)
	}
	e.call(http.MethodGet, "/api/courses/"+course.Id, nil, http.StatusOK, &course)
	if course.Attendance.Absences != 5 || course.Attendance.RemainingAbsences != -2 || course.Attendance.Level != api.Exceeded {
		t.Errorf("exceeded: %+v", course.Attendance)
	}
	e.call(http.MethodPut, "/api/meetings/"+today.Id+"/attendance", map[string]any{"status": nil}, http.StatusOK, &m)
	if m.Attendance != nil {
		t.Error("null must clear attendance")
	}

	// Cancel a meeting via full update.
	upd := map[string]any{
		"date": meetings.Items[9].Date, "start_time": "08:00", "end_time": "09:40", "room": "A1",
		"kind": "lecture", "status": "cancelled", "topic": "Libur", "notes": "",
	}
	e.call(http.MethodPut, "/api/meetings/"+meetings.Items[9].Id, upd, http.StatusOK, &m)
	if m.Status != api.Cancelled || m.Topic != "Libur" {
		t.Errorf("cancel: %+v", m)
	}
	var extra api.Meeting
	e.call(http.MethodPost, "/api/courses/"+course.Id+"/meetings", map[string]any{"date": "2027-01-04", "start_time": "08:00", "end_time": "09:40"}, http.StatusCreated, &extra)
	if extra.Number != 17 {
		t.Errorf("extra meeting number: %d", extra.Number)
	}

	// Grades: components and a task-sourced score.
	var grades api.GradeSummary
	e.call(http.MethodGet, "/api/courses/"+course.Id+"/grades", nil, http.StatusOK, &grades)
	if len(grades.Components) != 3 || grades.Components[0].Source != api.Tasks || grades.TotalWeight != 100 {
		t.Fatalf("default components: %+v", grades.Components)
	}
	tasksComp := grades.Components[0].Id

	var task api.Task
	e.call(http.MethodPost, "/api/tasks", map[string]any{
		"title": "Tugas ERD", "deadline": "2026-10-12T16:59:00Z", "course_id": course.Id, "grade_component_id": tasksComp,
		"submission_url": "javascript:alert(1)",
	}, http.StatusBadRequest, &er)
	if (*er.Error.Fields)["submission_url"] == "" {
		t.Errorf("unsafe url accepted: %+v", er)
	}
	e.call(http.MethodPost, "/api/tasks", map[string]any{
		"title": "Tugas ERD", "deadline": "2026-10-12T16:59:00Z", "course_id": course.Id, "grade_component_id": tasksComp,
	}, http.StatusCreated, &task)
	if task.SemesterId != sem.Id || task.Status != api.Todo || task.Priority != api.Normal || task.Course == nil {
		t.Fatalf("task: %+v", task)
	}
	var quick api.Task
	e.call(http.MethodPost, "/api/tasks", map[string]any{"title": "Beli buku", "deadline": "2026-10-11T16:59:00Z"}, http.StatusCreated, &quick)
	if quick.SemesterId != sem.Id || quick.CourseId != nil {
		t.Errorf("quick task: %+v", quick)
	}

	e.call(http.MethodGet, "/api/dashboard", nil, http.StatusOK, &dash)
	if len(dash.OverdueTasks) != 1 || dash.OverdueTasks[0].Id != quick.Id || len(dash.UpcomingTasks) != 1 {
		t.Errorf("dashboard tasks: overdue %d upcoming %d", len(dash.OverdueTasks), len(dash.UpcomingTasks))
	}

	e.call(http.MethodPut, "/api/tasks/"+task.Id+"/status", map[string]any{"status": "submitted"}, http.StatusOK, &task)
	if task.CompletedAt == nil {
		t.Error("completed_at must be set")
	}
	full := map[string]any{
		"course_id": course.Id, "meeting_id": nil, "grade_component_id": tasksComp, "title": "Tugas ERD",
		"description": "", "deadline": "2026-10-12T16:59:00Z", "status": "graded", "priority": "high",
		"submission_url": "https://lms.example/tugas/1", "score": 90,
	}
	e.call(http.MethodPut, "/api/tasks/"+task.Id, full, http.StatusOK, &task)
	if task.Status != api.Graded || task.Score == nil || *task.Score != 90 || task.CompletedAt == nil {
		t.Errorf("graded: %+v", task)
	}
	e.call(http.MethodGet, "/api/tasks?status=todo&status=in_progress", nil, http.StatusOK, &tasks)
	if len(tasks.Items) != 1 || tasks.Items[0].Id != quick.Id {
		t.Errorf("status filter: %d", len(tasks.Items))
	}
	e.call(http.MethodGet, "/api/tasks?course_id="+course.Id, nil, http.StatusOK, &tasks)
	if len(tasks.Items) != 1 {
		t.Errorf("course filter: %d", len(tasks.Items))
	}

	uts := 80.0
	e.call(http.MethodPut, "/api/courses/"+course.Id+"/grades/components", map[string]any{
		"components": []map[string]any{
			{"id": tasksComp, "name": "Tugas", "weight": 30, "score": nil, "source": "tasks"},
			{"name": "UTS", "weight": 30, "score": uts, "source": "manual"},
			{"name": "UAS", "weight": 40, "score": nil, "source": "manual"},
		},
	}, http.StatusOK, &grades)
	// (30*90 + 30*80) / 60 = 85
	if grades.CurrentScore == nil || *grades.CurrentScore != 85 || grades.Letter == nil || *grades.Letter != "A" {
		t.Fatalf("grades: %+v", grades)
	}
	if grades.Components[0].GradedTaskCount != 1 || grades.Components[0].Id != tasksComp {
		t.Errorf("tasks component kept: %+v", grades.Components[0])
	}

	// Official letter and GPA.
	courseUpd := map[string]any{
		"code": "IF201", "name": "Basis Data", "credits": 3, "lecturer": "Bu Dosen", "color": "#22C55E",
		"total_meetings": 16, "min_attendance_pct": 75, "final_grade_letter": "Z", "notes": "",
		"schedules": []map[string]any{{"day_of_week": 1, "start_time": "08:00", "end_time": "09:40", "room": "A1"}},
	}
	e.call(http.MethodPut, "/api/courses/"+course.Id, courseUpd, http.StatusBadRequest, &er)
	courseUpd["final_grade_letter"] = "B+"
	e.call(http.MethodPut, "/api/courses/"+course.Id, courseUpd, http.StatusOK, &course)
	if course.Color != "#22c55e" || course.Grade.OfficialLetter == nil || *course.Grade.OfficialLetter != "B+" {
		t.Errorf("course update: %+v", course)
	}

	var gpa api.GpaSummary
	e.call(http.MethodGet, "/api/gpa?target_ipk=3.5", nil, http.StatusOK, &gpa)
	if len(gpa.Semesters) != 1 || gpa.Semesters[0].Ips == nil || *gpa.Semesters[0].Ips != 3.3 || gpa.IsProjected {
		t.Fatalf("gpa: %+v", gpa)
	}
	if gpa.Simulation == nil || gpa.Simulation.Status != api.GpaSimulationStatusPossible || *gpa.Simulation.RequiredIps != 3.5 {
		t.Errorf("simulation: %+v", gpa.Simulation)
	}

	// List courses with summaries.
	var courses api.CourseList
	e.call(http.MethodGet, "/api/semesters/"+sem.Id+"/courses", nil, http.StatusOK, &courses)
	if len(courses.Items) != 1 || courses.Items[0].OpenTaskCount != 0 {
		t.Errorf("courses: %+v", courses.Items)
	}

	// Delete the semester: everything goes.
	e.call(http.MethodDelete, "/api/semesters/"+sem.Id, nil, http.StatusNoContent, nil)
	e.call(http.MethodGet, "/api/courses/"+course.Id, nil, http.StatusNotFound, &er)
	e.call(http.MethodGet, "/api/tasks/"+task.Id, nil, http.StatusNotFound, nil)
}

func uploadBody(t *testing.T, fields map[string]string, fileName string, content []byte) (*bytes.Buffer, string) {
	t.Helper()
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	for k, v := range fields {
		if err := w.WriteField(k, v); err != nil {
			t.Fatal(err)
		}
	}
	if fileName != "" {
		fw, err := w.CreateFormFile("file", fileName)
		if err != nil {
			t.Fatal(err)
		}
		fw.Write(content)
	}
	w.Close()
	return &buf, w.FormDataContentType()
}

func TestUploadAndDownload(t *testing.T) {
	e := newEnv(t)
	e.login()
	var sem api.Semester
	e.call(http.MethodPost, "/api/semesters", map[string]any{
		"name": "S3", "term": "odd", "start_date": "2026-09-07", "end_date": "2027-01-15",
	}, http.StatusCreated, &sem)
	var course api.Course
	e.call(http.MethodPost, "/api/semesters/"+sem.Id+"/courses", map[string]any{"name": "Basis Data", "credits": 3, "schedules": []any{}}, http.StatusCreated, &course)

	pdf := []byte("%PDF-1.7\n" + strings.Repeat("x", 2000))
	body, ct := uploadBody(t, map[string]string{"course_id": course.Id}, "Bab 1 Pengantar.pdf", pdf)
	resp := e.raw(e.client, http.MethodPost, "/api/materials/upload", body, ct)
	if resp.StatusCode != http.StatusCreated {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("upload: %d %s", resp.StatusCode, b)
	}
	var mat api.Material
	json.NewDecoder(resp.Body).Decode(&mat)
	resp.Body.Close()
	if mat.Kind != api.MaterialKindFile || mat.Title != "Bab 1 Pengantar" || mat.File == nil || mat.File.MimeType != "application/pdf" || mat.File.SizeBytes != int64(len(pdf)) {
		t.Fatalf("material: %+v", mat)
	}

	resp = e.raw(e.client, http.MethodGet, "/api/files/"+mat.File.Id, nil, "")
	data, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if resp.StatusCode != 200 || !bytes.Equal(data, pdf) {
		t.Fatalf("download: %d", resp.StatusCode)
	}
	if got := resp.Header.Get("Content-Disposition"); !strings.HasPrefix(got, "inline") || !strings.Contains(got, "Bab 1 Pengantar.pdf") {
		t.Errorf("disposition: %q", got)
	}
	if resp.Header.Get("Content-Type") != "application/pdf" || resp.Header.Get("X-Content-Type-Options") != "nosniff" || resp.Header.Get("Content-Security-Policy") != "" {
		t.Errorf("inline headers: %v", resp.Header)
	}

	resp = e.raw(e.client, http.MethodGet, "/api/files/"+mat.File.Id+"?download=true", nil, "")
	resp.Body.Close()
	if got := resp.Header.Get("Content-Disposition"); !strings.HasPrefix(got, "attachment") {
		t.Errorf("forced download: %q", got)
	}

	resp = e.raw(e.client, http.MethodGet, "/api/files/"+mat.File.Id, nil, "", func(r *http.Request) { r.Header.Set("Range", "bytes=0-3") })
	data, _ = io.ReadAll(resp.Body)
	resp.Body.Close()
	if resp.StatusCode != http.StatusPartialContent || string(data) != "%PDF" {
		t.Errorf("range: %d %q", resp.StatusCode, data)
	}

	// HTML is never rendered inline.
	body, ct = uploadBody(t, map[string]string{"course_id": course.Id, "title": "Halaman"}, "page.html", []byte("<html><script>alert(1)</script></html>"))
	resp = e.raw(e.client, http.MethodPost, "/api/materials/upload", body, ct)
	json.NewDecoder(resp.Body).Decode(&mat)
	resp.Body.Close()
	resp = e.raw(e.client, http.MethodGet, "/api/files/"+mat.File.Id, nil, "")
	resp.Body.Close()
	if !strings.HasPrefix(resp.Header.Get("Content-Disposition"), "attachment") || resp.Header.Get("Content-Security-Policy") != "default-src 'none'; sandbox" {
		t.Errorf("html headers: %v", resp.Header)
	}

	// Files need a session.
	anon := e.newClient()
	resp = e.raw(anon, http.MethodGet, "/api/files/"+mat.File.Id, nil, "")
	resp.Body.Close()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("anonymous download: %d", resp.StatusCode)
	}

	// Too large.
	body, ct = uploadBody(t, map[string]string{"course_id": course.Id}, "big.bin", bytes.Repeat([]byte("x"), (1<<20)+10))
	resp = e.raw(e.client, http.MethodPost, "/api/materials/upload", body, ct)
	if er := errCode(t, resp); resp.StatusCode != http.StatusRequestEntityTooLarge || er.Error.Code != api.FileTooLarge {
		t.Errorf("too large: %d %+v", resp.StatusCode, er)
	}
	// Missing file and course.
	body, ct = uploadBody(t, map[string]string{}, "", nil)
	resp = e.raw(e.client, http.MethodPost, "/api/materials/upload", body, ct)
	if er := errCode(t, resp); resp.StatusCode != http.StatusBadRequest || (*er.Error.Fields)["file"] == "" || (*er.Error.Fields)["course_id"] == "" {
		t.Errorf("missing parts: %d %+v", resp.StatusCode, er)
	}
	entries, _ := os.ReadDir(filepath.Join(e.files.Root(), "tmp"))
	if len(entries) != 0 {
		t.Errorf("temporary uploads left: %d", len(entries))
	}

	// Search and delete.
	var list api.MaterialList
	e.call(http.MethodGet, "/api/materials?q=pengan", nil, http.StatusOK, &list)
	if len(list.Items) != 1 {
		t.Errorf("search: %d", len(list.Items))
	}
	var note api.Material
	e.call(http.MethodPost, "/api/materials", map[string]any{"course_id": course.Id, "kind": "link", "title": "Drive", "url": "ftp://x"}, http.StatusBadRequest, nil)
	e.call(http.MethodPost, "/api/materials", map[string]any{"course_id": course.Id, "kind": "note", "title": "Catatan", "description": "isi"}, http.StatusCreated, &note)
	e.call(http.MethodPut, "/api/materials/"+note.Id, map[string]any{"meeting_id": nil, "title": "Catatan 2", "description": "baru", "url": "https://ignored"}, http.StatusOK, &note)
	if note.Title != "Catatan 2" || note.Url != "" {
		t.Errorf("note update: %+v", note)
	}
	e.call(http.MethodGet, "/api/materials?semester_id=all", nil, http.StatusOK, &list)
	if len(list.Items) != 3 {
		t.Errorf("all materials: %d", len(list.Items))
	}

	path, _ := e.files.Path(mat.File.Id)
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("file on disk: %v", err)
	}
	e.call(http.MethodDelete, "/api/materials/"+mat.Id, nil, http.StatusNoContent, nil)
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Errorf("file must be deleted from disk: %v", err)
	}
	e.call(http.MethodGet, "/api/files/"+mat.File.Id, nil, http.StatusNotFound, nil)
}

func TestSettingsEndpoint(t *testing.T) {
	e := newEnv(t)
	e.login()
	var st api.Settings
	e.call(http.MethodGet, "/api/settings", nil, http.StatusOK, &st)
	if st.GradeScaleConfirmed || st.Timezone != "Asia/Jakarta" || len(st.GradeScale) != 9 {
		t.Fatalf("defaults: %+v", st)
	}
	upd := api.SettingsUpdate{
		Timezone: "Mars/Base", GradeScale: st.GradeScale, CountExcusedAsAbsent: false,
		DefaultMinAttendancePct: 80, DefaultTotalMeetings: 14, Reminders: st.Reminders, Baseline: st.Baseline,
	}
	var er api.Error
	e.call(http.MethodPut, "/api/settings", upd, http.StatusBadRequest, &er)
	if (*er.Error.Fields)["timezone"] == "" {
		t.Errorf("timezone: %+v", er)
	}
	upd.Timezone = "Asia/Makassar"
	upd.GradeScale = []api.GradeScaleEntry{{Letter: "E", MinScore: 0}, {Letter: "A", MinScore: 80, Points: 4}}
	gpa := 3.4
	upd.Baseline = api.Baseline{Gpa: &gpa, Credits: 40}
	e.call(http.MethodPut, "/api/settings", upd, http.StatusOK, &st)
	if !st.GradeScaleConfirmed || st.GradeScale[0].Letter != "A" || st.DefaultTotalMeetings != 14 || *st.Baseline.Gpa != 3.4 {
		t.Errorf("saved: %+v", st)
	}
	var gs api.GpaSummary
	e.call(http.MethodGet, "/api/gpa", nil, http.StatusOK, &gs)
	if gs.Ipk == nil || *gs.Ipk != 3.4 || gs.TotalGradedCredits != 40 || gs.Simulation != nil {
		t.Errorf("baseline only gpa: %+v", gs)
	}
}

func TestPushEndpoints(t *testing.T) {
	e := newEnv(t)
	e.login()
	var pk api.PushPublicKey
	e.call(http.MethodGet, "/api/push/public-key", nil, http.StatusOK, &pk)
	if pk.PublicKey != "BPUB" {
		t.Errorf("public key: %q", pk.PublicKey)
	}
	var er api.Error
	e.call(http.MethodPost, "/api/push/subscriptions", map[string]any{"endpoint": "http://insecure", "keys": map[string]string{"p256dh": "a", "auth": "b"}}, http.StatusBadRequest, &er)
	sub := map[string]any{"endpoint": "https://fcm.googleapis.com/fcm/send/abc", "keys": map[string]string{"p256dh": "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", "auth": "tBHItJI5svbpez7KI4CCXg"}}
	e.call(http.MethodPost, "/api/push/subscriptions", sub, http.StatusNoContent, nil)
	e.call(http.MethodPost, "/api/push/subscriptions", sub, http.StatusNoContent, nil)
	if n, _ := e.store.CountPushSubscriptions(context.Background()); n != 1 {
		t.Errorf("subscriptions: %d", n)
	}
	var res api.PushTestResult
	e.call(http.MethodPost, "/api/push/test", nil, http.StatusOK, &res)
	if res.Sent != 1 || len(e.pusher.msgs) != 1 || e.pusher.msgs[0].URL != "/pengaturan" {
		t.Errorf("test push: %+v %+v", res, e.pusher.msgs)
	}
	e.call(http.MethodPost, "/api/push/unsubscribe", map[string]any{"endpoint": "https://fcm.googleapis.com/fcm/send/abc"}, http.StatusNoContent, nil)
	e.call(http.MethodPost, "/api/push/unsubscribe", map[string]any{"endpoint": "https://unknown"}, http.StatusNoContent, nil)
	if n, _ := e.store.CountPushSubscriptions(context.Background()); n != 0 {
		t.Errorf("after unsubscribe: %d", n)
	}
}

func TestPanicRecovery(t *testing.T) {
	e := newEnv(t)
	s := New(e.store, e.files, nil, e.clock, nil, Options{})
	h := s.recoverer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { panic("boom") }))
	h = s.logRequests(h)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/x", nil))
	if rec.Code != http.StatusInternalServerError || !strings.Contains(rec.Body.String(), `"internal"`) {
		t.Errorf("panic: %d %s", rec.Code, rec.Body.String())
	}
}

func TestClientIP(t *testing.T) {
	s := &Server{opts: Options{TrustProxy: true}}
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	r.RemoteAddr = "127.0.0.1:5555"
	r.Header.Set("X-Forwarded-For", "6.6.6.6, 203.0.113.9")
	if got := s.clientIP(r); got != "203.0.113.9" {
		t.Errorf("trusted proxy: %s", got)
	}
	s.opts.TrustProxy = false
	if got := s.clientIP(r); got != "127.0.0.1" {
		t.Errorf("untrusted: %s", got)
	}
}
