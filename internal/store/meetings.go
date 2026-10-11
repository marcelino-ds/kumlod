package store

import (
	"context"
	"database/sql"
	"time"

	"kumlod/internal/domain"
)

// Meeting is one class session.
type Meeting struct {
	ID            string
	CourseID      string
	Number        int
	Date          string
	StartTime     string
	EndTime       string
	Room          string
	Kind          string
	Status        string
	Attendance    *string
	AttendanceAt  *time.Time
	Topic         string
	Notes         string
	MaterialCount int
	CreatedAt     time.Time
	UpdatedAt     time.Time
}

// MeetingWithCourse pairs a meeting with its course.
type MeetingWithCourse struct {
	Meeting Meeting
	Course  CourseBrief
}

const meetingCols = `m.id, m.course_id, m.number, m.date, m.start_time, m.end_time, m.room, m.kind, m.status,
	m.attendance, m.attendance_at, m.topic, m.notes,
	(SELECT count(*) FROM materials mt WHERE mt.meeting_id = m.id),
	m.created_at, m.updated_at`

func scanMeetingInto(m *Meeting, extra ...any) []any {
	dest := []any{&m.ID, &m.CourseID, &m.Number, &m.Date, &m.StartTime, &m.EndTime, &m.Room, &m.Kind, &m.Status,
		&m.Attendance, nullTimeCol{&m.AttendanceAt}, &m.Topic, &m.Notes, &m.MaterialCount,
		timeCol{&m.CreatedAt}, timeCol{&m.UpdatedAt}}
	return append(dest, extra...)
}

func queryMeetings(ctx context.Context, q execer, query string, args ...any) ([]Meeting, error) {
	rows, err := q.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Meeting{}
	for rows.Next() {
		var m Meeting
		if err := rows.Scan(scanMeetingInto(&m)...); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

const meetingOrder = ` ORDER BY m.date, m.start_time, m.number`

// ListMeetings returns the meetings of a course in chronological order.
func (s *Store) ListMeetings(ctx context.Context, courseID string) ([]Meeting, error) {
	var exists int
	if err := s.db.QueryRowContext(ctx, `SELECT 1 FROM courses WHERE id = ?`, courseID).Scan(&exists); err != nil {
		return nil, notFoundIfNoRows(err, msgCourseNotFound)
	}
	return queryMeetings(ctx, s.db, `SELECT `+meetingCols+` FROM meetings m WHERE m.course_id = ?`+meetingOrder, courseID)
}

// ListMeetingsBySemester returns meetings grouped by course for a semester. An
// empty semesterID covers every semester.
func (s *Store) ListMeetingsBySemester(ctx context.Context, semesterID string) (map[string][]Meeting, error) {
	query := `SELECT ` + meetingCols + ` FROM meetings m`
	var args []any
	if semesterID != "" {
		query += ` JOIN courses c ON c.id = m.course_id WHERE c.semester_id = ?`
		args = append(args, semesterID)
	}
	list, err := queryMeetings(ctx, s.db, query+meetingOrder, args...)
	if err != nil {
		return nil, err
	}
	out := map[string][]Meeting{}
	for _, m := range list {
		out[m.CourseID] = append(out[m.CourseID], m)
	}
	return out, nil
}

// ListMeetingsOnDate returns the meetings on a local date for courses in a
// semester, ordered by start time (meetings without a time last).
func (s *Store) ListMeetingsOnDate(ctx context.Context, semesterID, date string) ([]MeetingWithCourse, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT `+meetingCols+`, c.id, c.name, c.code, c.color
		FROM meetings m JOIN courses c ON c.id = m.course_id
		WHERE c.semester_id = ? AND m.date = ?
		ORDER BY m.start_time = '', m.start_time, c.name COLLATE NOCASE, m.number`, semesterID, date)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []MeetingWithCourse{}
	for rows.Next() {
		var x MeetingWithCourse
		if err := rows.Scan(scanMeetingInto(&x.Meeting, &x.Course.ID, &x.Course.Name, &x.Course.Code, &x.Course.Color)...); err != nil {
			return nil, err
		}
		out = append(out, x)
	}
	return out, rows.Err()
}

// GetMeeting returns one meeting.
func (s *Store) GetMeeting(ctx context.Context, id string) (Meeting, error) {
	return getMeeting(ctx, s.db, id)
}

func getMeeting(ctx context.Context, q execer, id string) (Meeting, error) {
	var m Meeting
	err := q.QueryRowContext(ctx, `SELECT `+meetingCols+` FROM meetings m WHERE m.id = ?`, id).Scan(scanMeetingInto(&m)...)
	return m, notFoundIfNoRows(err, msgMeetingNotFound)
}

func insertMeetings(ctx context.Context, tx *sql.Tx, courseID string, meetings []Meeting, now time.Time) error {
	for _, m := range meetings {
		if m.Kind == "" {
			m.Kind = domain.KindLecture
		}
		if m.Status == "" {
			m.Status = domain.MeetingScheduled
		}
		_, err := tx.ExecContext(ctx, `
			INSERT INTO meetings (id, course_id, number, date, start_time, end_time, room, kind, status,
			                      attendance, attendance_at, topic, notes, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?)`,
			idOrNew(m.ID), courseID, m.Number, m.Date, m.StartTime, m.EndTime, m.Room, m.Kind, m.Status,
			m.Topic, m.Notes, FormatTime(now), FormatTime(now))
		if err != nil {
			return mapInsertErr(err)
		}
	}
	return nil
}

// CreateMeeting adds a meeting with the next number of its course.
func (s *Store) CreateMeeting(ctx context.Context, m Meeting) (Meeting, error) {
	m.ID = idOrNew(m.ID)
	err := s.tx(ctx, func(tx *sql.Tx) error {
		var exists int
		if err := tx.QueryRowContext(ctx, `SELECT 1 FROM courses WHERE id = ?`, m.CourseID).Scan(&exists); err != nil {
			return notFoundIfNoRows(err, msgCourseNotFound)
		}
		if err := tx.QueryRowContext(ctx, `SELECT coalesce(max(number), 0) + 1 FROM meetings WHERE course_id = ?`, m.CourseID).Scan(&m.Number); err != nil {
			return err
		}
		return insertMeetings(ctx, tx, m.CourseID, []Meeting{m}, s.now())
	})
	if err != nil {
		return Meeting{}, err
	}
	return s.GetMeeting(ctx, m.ID)
}

// CreateGeneratedMeetings inserts generated meetings. It fails with
// domain.ErrConflict when the course already has meetings.
func (s *Store) CreateGeneratedMeetings(ctx context.Context, courseID string, meetings []Meeting) ([]Meeting, error) {
	err := s.tx(ctx, func(tx *sql.Tx) error {
		var exists int
		if err := tx.QueryRowContext(ctx, `SELECT 1 FROM courses WHERE id = ?`, courseID).Scan(&exists); err != nil {
			return notFoundIfNoRows(err, msgCourseNotFound)
		}
		var count int
		if err := tx.QueryRowContext(ctx, `SELECT count(*) FROM meetings WHERE course_id = ?`, courseID).Scan(&count); err != nil {
			return err
		}
		if count > 0 {
			return domain.Conflict("Matkul ini sudah punya pertemuan")
		}
		return insertMeetings(ctx, tx, courseID, meetings, s.now())
	})
	if err != nil {
		return nil, err
	}
	return s.ListMeetings(ctx, courseID)
}

// UpdateMeeting replaces the editable fields of a meeting.
func (s *Store) UpdateMeeting(ctx context.Context, m Meeting) (Meeting, error) {
	res, err := s.db.ExecContext(ctx, `
		UPDATE meetings SET date = ?, start_time = ?, end_time = ?, room = ?, kind = ?, status = ?,
		       topic = ?, notes = ?, updated_at = ?
		WHERE id = ?`,
		m.Date, m.StartTime, m.EndTime, m.Room, m.Kind, m.Status, m.Topic, m.Notes, FormatTime(s.now()), m.ID)
	if err != nil {
		return Meeting{}, err
	}
	if err := requireAffected(res, msgMeetingNotFound); err != nil {
		return Meeting{}, err
	}
	return s.GetMeeting(ctx, m.ID)
}

// DeleteMeeting removes a meeting. Linked tasks and materials are unlinked.
func (s *Store) DeleteMeeting(ctx context.Context, id string) error {
	res, err := s.db.ExecContext(ctx, `DELETE FROM meetings WHERE id = ?`, id)
	if err != nil {
		return err
	}
	return requireAffected(res, msgMeetingNotFound)
}

// SetAttendance records (or clears, when status is nil) the attendance of a meeting.
func (s *Store) SetAttendance(ctx context.Context, id string, status *string) (Meeting, error) {
	now := s.now()
	var at *time.Time
	if status != nil {
		at = &now
	}
	res, err := s.db.ExecContext(ctx, `UPDATE meetings SET attendance = ?, attendance_at = ?, updated_at = ? WHERE id = ?`,
		nullString(status), nullTime(at), FormatTime(now), id)
	if err != nil {
		return Meeting{}, err
	}
	if err := requireAffected(res, msgMeetingNotFound); err != nil {
		return Meeting{}, err
	}
	return s.GetMeeting(ctx, id)
}

// ListUnrecordedMeetingsOnDate returns scheduled meetings with a start time and no
// attendance on date, for courses in the semester. Used by the reminder scheduler.
func (s *Store) ListUnrecordedMeetingsOnDate(ctx context.Context, semesterID, date string) ([]MeetingWithCourse, error) {
	all, err := s.ListMeetingsOnDate(ctx, semesterID, date)
	if err != nil {
		return nil, err
	}
	out := []MeetingWithCourse{}
	for _, x := range all {
		if x.Meeting.Status == domain.MeetingScheduled && x.Meeting.Attendance == nil && x.Meeting.StartTime != "" {
			out = append(out, x)
		}
	}
	return out, nil
}
