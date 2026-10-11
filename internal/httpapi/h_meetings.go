package httpapi

import (
	"net/http"

	"kumlod/internal/api"
	"kumlod/internal/domain"
)

// ListMeetings returns the meetings of a course.
func (s *Server) ListMeetings(w http.ResponseWriter, r *http.Request, courseID api.CourseId) {
	list, err := s.store.ListMeetings(r.Context(), courseID)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, api.MeetingList{Items: toMeetings(list)})
}

// CreateMeeting adds a meeting with the next number.
func (s *Server) CreateMeeting(w http.ResponseWriter, r *http.Request, courseID api.CourseId) {
	var in api.MeetingCreate
	if err := decodeJSON(r, &in); err != nil {
		s.fail(w, r, err)
		return
	}
	kind := domain.KindLecture
	if in.Kind != nil {
		kind = string(*in.Kind)
	}
	var v domain.Validator
	id := clientID(&v, in.Id)
	m := validateMeeting(&v, meetingFields{
		Date: in.Date, StartTime: str(in.StartTime), EndTime: str(in.EndTime), Room: str(in.Room),
		Kind: kind, Status: domain.MeetingScheduled, Topic: str(in.Topic), Notes: str(in.Notes),
	})
	if err := v.Err(); err != nil {
		s.fail(w, r, err)
		return
	}
	m.ID = id
	m.CourseID = courseID
	created, err := s.store.CreateMeeting(r.Context(), m)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, toMeeting(created))
}

// GenerateMeetings creates meetings from the course schedule.
func (s *Server) GenerateMeetings(w http.ResponseWriter, r *http.Request, courseID api.CourseId) {
	ctx := r.Context()
	c, err := s.store.GetCourse(ctx, courseID)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	if len(c.Schedules) == 0 {
		s.fail(w, r, domain.Invalid("schedules", "Matkul belum punya jadwal. Tambahkan jadwal dulu."))
		return
	}
	sem, err := s.store.GetSemester(ctx, c.SemesterID)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	planned, err := domain.GenerateMeetings(sem.StartDate, scheduleSlots(c.Schedules), c.TotalMeetings)
	if err != nil {
		s.fail(w, r, domain.Invalid("schedules", err.Error()))
		return
	}
	list, err := s.store.CreateGeneratedMeetings(ctx, courseID, plannedMeetings(planned))
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, api.MeetingList{Items: toMeetings(list)})
}

// UpdateMeeting replaces a meeting's fields.
func (s *Server) UpdateMeeting(w http.ResponseWriter, r *http.Request, meetingID api.MeetingId) {
	var in api.MeetingUpdate
	if err := decodeJSON(r, &in); err != nil {
		s.fail(w, r, err)
		return
	}
	var v domain.Validator
	m := validateMeeting(&v, meetingFields{
		Date: in.Date, StartTime: in.StartTime, EndTime: in.EndTime, Room: in.Room,
		Kind: string(in.Kind), Status: string(in.Status), Topic: in.Topic, Notes: in.Notes,
	})
	if err := v.Err(); err != nil {
		s.fail(w, r, err)
		return
	}
	m.ID = meetingID
	updated, err := s.store.UpdateMeeting(r.Context(), m)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, toMeeting(updated))
}

// DeleteMeeting removes a meeting.
func (s *Server) DeleteMeeting(w http.ResponseWriter, r *http.Request, meetingID api.MeetingId) {
	if err := s.store.DeleteMeeting(r.Context(), meetingID); err != nil {
		s.fail(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// SetAttendance records or clears attendance for a meeting.
func (s *Server) SetAttendance(w http.ResponseWriter, r *http.Request, meetingID api.MeetingId) {
	var in api.AttendanceUpdate
	if err := decodeJSON(r, &in); err != nil {
		s.fail(w, r, err)
		return
	}
	var status *string
	if in.Status != nil {
		v := string(*in.Status)
		if !domain.ValidAttendance(v) {
			s.fail(w, r, domain.Invalid("status", "Status absen harus hadir, izin, sakit, atau alpa"))
			return
		}
		status = &v
	}
	m, err := s.store.SetAttendance(r.Context(), meetingID, status)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, toMeeting(m))
}
