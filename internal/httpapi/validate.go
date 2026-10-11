package httpapi

import (
	"fmt"
	"strings"

	"kumlod/internal/api"
	"kumlod/internal/domain"
	"kumlod/internal/store"
)

// Field length limits from the API contract.
const (
	maxSemesterName  = 100
	maxAcademicYear  = 20
	maxCourseCode    = 30
	maxCourseName    = 150
	maxLecturer      = 150
	maxCourseNotes   = 5000
	maxSchedules     = 14
	maxRoom          = 100
	maxTopic         = 300
	maxMeetingNotes  = 10000
	maxComponents    = 20
	maxComponentName = 60
	maxTaskTitle     = 200
	maxTaskDesc      = 10000
	maxURL           = 2000
	maxMaterialTitle = 200
	maxMaterialDesc  = 20000
	maxEndpoint      = 2000
	maxPushKey       = 256
)

const defaultCourseColor = "#6366f1"

func str(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

// optionalID trims an optional reference; empty strings mean "not set".
func optionalID(p *string) *string {
	if p == nil {
		return nil
	}
	v := strings.TrimSpace(*p)
	if v == "" {
		return nil
	}
	return &v
}

// clientID validates an optional client-supplied UUID.
func clientID(v *domain.Validator, p *string) string {
	id := strings.TrimSpace(str(p))
	if id == "" {
		return ""
	}
	norm, ok := store.NormalizeID(id)
	if !ok {
		v.Add("id", "ID harus UUID")
		return ""
	}
	return norm
}

func checkLen(v *domain.Validator, field, value string, min, max int, label string) {
	n := domain.RuneLen(value)
	switch {
	case min > 0 && n < min:
		v.Add(field, label+" wajib diisi")
	case n > max:
		v.Add(field, fmt.Sprintf("%s maksimal %d karakter", label, max))
	}
}

func validateSemester(v *domain.Validator, in api.SemesterUpdate) store.Semester {
	x := store.Semester{
		Name:         strings.TrimSpace(in.Name),
		AcademicYear: strings.TrimSpace(in.AcademicYear),
		Term:         string(in.Term),
		StartDate:    in.StartDate,
		EndDate:      in.EndDate,
	}
	checkLen(v, "name", x.Name, 1, maxSemesterName, "Nama semester")
	checkLen(v, "academic_year", x.AcademicYear, 0, maxAcademicYear, "Tahun ajaran")
	v.Check(domain.ValidTerm(x.Term), "term", "Jenis semester harus ganjil, genap, atau pendek")
	v.Check(domain.ValidDate(x.StartDate), "start_date", "Tanggal mulai tidak valid")
	v.Check(domain.ValidDate(x.EndDate), "end_date", "Tanggal selesai tidak valid")
	if domain.ValidDate(x.StartDate) && domain.ValidDate(x.EndDate) && x.EndDate < x.StartDate {
		v.Add("end_date", "Tanggal selesai tidak boleh sebelum tanggal mulai")
	}
	return x
}

type courseFields struct {
	Code, Name, Lecturer, Color, Notes string
	Credits, TotalMeetings, MinPct     int
	Schedules                          []api.ScheduleInput
}

func validateCourse(v *domain.Validator, in courseFields) store.Course {
	c := store.Course{
		Code:             strings.TrimSpace(in.Code),
		Name:             strings.TrimSpace(in.Name),
		Credits:          in.Credits,
		Lecturer:         strings.TrimSpace(in.Lecturer),
		Color:            strings.TrimSpace(in.Color),
		TotalMeetings:    in.TotalMeetings,
		MinAttendancePct: in.MinPct,
		Notes:            in.Notes,
	}
	if c.Color == "" {
		c.Color = defaultCourseColor
	}
	checkLen(v, "code", c.Code, 0, maxCourseCode, "Kode matkul")
	checkLen(v, "name", c.Name, 1, maxCourseName, "Nama matkul")
	v.Check(c.Credits >= 0 && c.Credits <= 24, "credits", "SKS harus 0-24")
	checkLen(v, "lecturer", c.Lecturer, 0, maxLecturer, "Nama dosen")
	v.Check(domain.ValidHexColor(c.Color), "color", "Warna harus format #RRGGBB")
	v.Check(c.TotalMeetings >= 1 && c.TotalMeetings <= domain.MaxTotalMeetings, "total_meetings",
		fmt.Sprintf("Jumlah pertemuan harus 1-%d", domain.MaxTotalMeetings))
	v.Check(c.MinAttendancePct >= 0 && c.MinAttendancePct <= 100, "min_attendance_pct", "Batas minimal hadir harus 0-100")
	checkLen(v, "notes", c.Notes, 0, maxCourseNotes, "Catatan")
	c.Color = strings.ToLower(c.Color)

	if len(in.Schedules) > maxSchedules {
		v.Add("schedules", fmt.Sprintf("Maksimal %d slot jadwal", maxSchedules))
	}
	c.Schedules = make([]store.Schedule, 0, len(in.Schedules))
	for i, sc := range in.Schedules {
		f := fmt.Sprintf("schedules[%d]", i)
		room := strings.TrimSpace(sc.Room)
		v.Check(sc.DayOfWeek >= 1 && sc.DayOfWeek <= 7, f+".day_of_week", "Hari harus 1 (Senin) sampai 7 (Minggu)")
		startOK := domain.ValidTime(sc.StartTime)
		endOK := domain.ValidTime(sc.EndTime)
		v.Check(startOK, f+".start_time", "Jam mulai harus format HH:MM")
		v.Check(endOK, f+".end_time", "Jam selesai harus format HH:MM")
		if startOK && endOK && sc.EndTime <= sc.StartTime {
			v.Add(f+".end_time", "Jam selesai harus setelah jam mulai")
		}
		checkLen(v, f+".room", room, 0, maxRoom, "Ruang")
		c.Schedules = append(c.Schedules, store.Schedule{DayOfWeek: sc.DayOfWeek, StartTime: sc.StartTime, EndTime: sc.EndTime, Room: room})
	}
	return c
}

func validateComponents(v *domain.Validator, prefix string, in []api.GradeComponentInput) []store.GradeComponent {
	if len(in) > maxComponents {
		v.Add(prefix, fmt.Sprintf("Maksimal %d komponen nilai", maxComponents))
	}
	out := make([]store.GradeComponent, 0, len(in))
	for i, c := range in {
		f := fmt.Sprintf("%s[%d]", prefix, i)
		g := store.GradeComponent{Name: strings.TrimSpace(c.Name), Weight: c.Weight, Source: string(c.Source), Score: c.Score}
		if c.Id != nil && strings.TrimSpace(*c.Id) != "" {
			if id, ok := store.NormalizeID(strings.TrimSpace(*c.Id)); ok {
				g.ID = id
			} else {
				v.Add(f+".id", "ID harus UUID")
			}
		}
		checkLen(v, f+".name", g.Name, 1, maxComponentName, "Nama komponen")
		v.Check(g.Weight > 0 && g.Weight <= 100, f+".weight", "Bobot harus lebih dari 0 dan paling besar 100")
		v.Check(domain.ValidGradeSource(g.Source), f+".source", "Sumber nilai harus manual atau tasks")
		if g.Source == domain.SourceTasks {
			g.Score = nil
		} else if g.Score != nil {
			v.Check(*g.Score >= 0 && *g.Score <= 100, f+".score", "Nilai harus 0-100")
		}
		out = append(out, g)
	}
	return out
}

type meetingFields struct {
	Date, StartTime, EndTime, Room, Kind, Status, Topic, Notes string
}

func validateMeeting(v *domain.Validator, in meetingFields) store.Meeting {
	m := store.Meeting{
		Date:      in.Date,
		StartTime: strings.TrimSpace(in.StartTime),
		EndTime:   strings.TrimSpace(in.EndTime),
		Room:      strings.TrimSpace(in.Room),
		Kind:      in.Kind,
		Status:    in.Status,
		Topic:     strings.TrimSpace(in.Topic),
		Notes:     in.Notes,
	}
	v.Check(domain.ValidDate(m.Date), "date", "Tanggal tidak valid")
	v.Check(domain.ValidOptionalTime(m.StartTime), "start_time", "Jam mulai harus format HH:MM atau kosong")
	v.Check(domain.ValidOptionalTime(m.EndTime), "end_time", "Jam selesai harus format HH:MM atau kosong")
	if m.EndTime != "" && m.StartTime == "" && domain.ValidTime(m.EndTime) {
		v.Add("start_time", "Isi jam mulai kalau jam selesai diisi")
	}
	if domain.ValidTime(m.StartTime) && domain.ValidTime(m.EndTime) && m.EndTime <= m.StartTime {
		v.Add("end_time", "Jam selesai harus setelah jam mulai")
	}
	checkLen(v, "room", m.Room, 0, maxRoom, "Ruang")
	v.Check(domain.ValidMeetingKind(m.Kind), "kind", "Jenis pertemuan harus kuliah, UTS, atau UAS")
	v.Check(domain.ValidMeetingStatus(m.Status), "status", "Status pertemuan harus terjadwal atau batal")
	checkLen(v, "topic", m.Topic, 0, maxTopic, "Topik")
	checkLen(v, "notes", m.Notes, 0, maxMeetingNotes, "Catatan")
	return m
}

func validateSubmissionURL(v *domain.Validator, field, u string) string {
	u = strings.TrimSpace(u)
	if u == "" {
		return ""
	}
	if domain.RuneLen(u) > maxURL {
		v.Add(field, fmt.Sprintf("Link maksimal %d karakter", maxURL))
	} else if !domain.ValidHTTPURL(u) {
		v.Add(field, "Link harus diawali http:// atau https://")
	}
	return u
}
