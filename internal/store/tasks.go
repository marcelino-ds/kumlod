package store

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"kumlod/internal/domain"
)

// Task is an assignment with a deadline.
type Task struct {
	ID               string
	SemesterID       string
	CourseID         *string
	MeetingID        *string
	GradeComponentID *string
	Course           *CourseBrief
	Title            string
	Description      string
	Deadline         time.Time
	Status           string
	Priority         string
	SubmissionURL    string
	Score            *float64
	CompletedAt      *time.Time
	CreatedAt        time.Time
	UpdatedAt        time.Time
}

// TaskFilter narrows ListTasks. Empty fields do not filter.
type TaskFilter struct {
	SemesterID string
	CourseID   string
	Statuses   []string
	DueFrom    *time.Time // inclusive
	DueTo      *time.Time // exclusive
}

const taskSelect = `
	SELECT t.id, t.semester_id, t.course_id, t.meeting_id, t.grade_component_id, t.title, t.description,
	       t.deadline, t.status, t.priority, t.submission_url, t.score, t.completed_at, t.created_at, t.updated_at,
	       c.id, c.name, c.code, c.color
	FROM tasks t LEFT JOIN courses c ON c.id = t.course_id`

func scanTask(sc scanner) (Task, error) {
	var t Task
	var cID, cName, cCode, cColor sql.NullString
	err := sc.Scan(&t.ID, &t.SemesterID, &t.CourseID, &t.MeetingID, &t.GradeComponentID, &t.Title, &t.Description,
		timeCol{&t.Deadline}, &t.Status, &t.Priority, &t.SubmissionURL, &t.Score, nullTimeCol{&t.CompletedAt},
		timeCol{&t.CreatedAt}, timeCol{&t.UpdatedAt},
		&cID, &cName, &cCode, &cColor)
	if err != nil {
		return Task{}, err
	}
	if cID.Valid {
		t.Course = &CourseBrief{ID: cID.String, Name: cName.String, Code: cCode.String, Color: cColor.String}
	}
	return t, nil
}

// ListTasks returns tasks ordered by deadline.
func (s *Store) ListTasks(ctx context.Context, f TaskFilter) ([]Task, error) {
	query := taskSelect + ` WHERE 1 = 1`
	var args []any
	if f.SemesterID != "" {
		query += ` AND t.semester_id = ?`
		args = append(args, f.SemesterID)
	}
	if f.CourseID != "" {
		query += ` AND t.course_id = ?`
		args = append(args, f.CourseID)
	}
	if len(f.Statuses) > 0 {
		query += ` AND t.status IN (` + placeholders(len(f.Statuses)) + `)`
		args = append(args, anySlice(f.Statuses)...)
	}
	if f.DueFrom != nil {
		query += ` AND t.deadline >= ?`
		args = append(args, FormatTime(*f.DueFrom))
	}
	if f.DueTo != nil {
		query += ` AND t.deadline < ?`
		args = append(args, FormatTime(*f.DueTo))
	}
	query += ` ORDER BY t.deadline, t.created_at`
	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Task{}
	for rows.Next() {
		t, err := scanTask(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

// GetTask returns one task.
func (s *Store) GetTask(ctx context.Context, id string) (Task, error) {
	return getTask(ctx, s.db, id)
}

func getTask(ctx context.Context, q execer, id string) (Task, error) {
	t, err := scanTask(q.QueryRowContext(ctx, taskSelect+` WHERE t.id = ?`, id))
	return t, notFoundIfNoRows(err, msgTaskNotFound)
}

// checkTaskLinks validates that the meeting and component belong to the course.
func checkTaskLinks(ctx context.Context, tx *sql.Tx, v *domain.Validator, courseID, meetingID, componentID *string) error {
	if courseID == nil {
		if meetingID != nil {
			v.Add("meeting_id", "Pilih matkul dulu sebelum memilih pertemuan")
		}
		if componentID != nil {
			v.Add("grade_component_id", "Pilih matkul dulu sebelum memilih komponen nilai")
		}
		return nil
	}
	if meetingID != nil {
		var owner string
		err := tx.QueryRowContext(ctx, `SELECT course_id FROM meetings WHERE id = ?`, *meetingID).Scan(&owner)
		switch {
		case errors.Is(err, sql.ErrNoRows):
			v.Add("meeting_id", msgMeetingNotFound)
		case err != nil:
			return err
		case owner != *courseID:
			v.Add("meeting_id", "Pertemuan bukan milik matkul ini")
		}
	}
	if componentID != nil {
		var owner string
		err := tx.QueryRowContext(ctx, `SELECT course_id FROM grade_components WHERE id = ?`, *componentID).Scan(&owner)
		switch {
		case errors.Is(err, sql.ErrNoRows):
			v.Add("grade_component_id", msgComponentNotFound)
		case err != nil:
			return err
		case owner != *courseID:
			v.Add("grade_component_id", "Komponen nilai bukan milik matkul ini")
		}
	}
	return nil
}

// soleTasksComponent returns the course's only tasks-sourced grade component,
// or nil when there is none or more than one. New tasks link to it by default
// so their scores count without extra taps.
func soleTasksComponent(ctx context.Context, tx *sql.Tx, courseID string) (*string, error) {
	rows, err := tx.QueryContext(ctx, `SELECT id FROM grade_components WHERE course_id = ? AND source = 'tasks' LIMIT 2`, courseID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(ids) != 1 {
		return nil, nil
	}
	return &ids[0], nil
}

func courseSemester(ctx context.Context, tx *sql.Tx, courseID string) (string, bool, error) {
	var semesterID string
	err := tx.QueryRowContext(ctx, `SELECT semester_id FROM courses WHERE id = ?`, courseID).Scan(&semesterID)
	if errors.Is(err, sql.ErrNoRows) {
		return "", false, nil
	}
	return semesterID, err == nil, err
}

// CreateTask inserts a task. When SemesterID is empty it uses the course's
// semester, or the active semester for tasks without a course.
func (s *Store) CreateTask(ctx context.Context, t Task) (Task, error) {
	now := s.now()
	t.ID = idOrNew(t.ID)
	if t.Status == "" {
		t.Status = domain.TaskTodo
	}
	if t.Priority == "" {
		t.Priority = domain.PriorityNormal
	}
	t.CompletedAt = domain.CompletedAt("", nil, t.Status, now)
	err := s.tx(ctx, func(tx *sql.Tx) error {
		var v domain.Validator
		switch {
		case t.CourseID != nil:
			semID, ok, err := courseSemester(ctx, tx, *t.CourseID)
			if err != nil {
				return err
			}
			if !ok {
				v.Add("course_id", msgCourseNotFound)
				break
			}
			if t.SemesterID != "" && t.SemesterID != semID {
				v.Add("course_id", "Matkul bukan bagian dari semester yang dipilih")
			}
			t.SemesterID = semID
			if t.GradeComponentID == nil {
				id, err := soleTasksComponent(ctx, tx, *t.CourseID)
				if err != nil {
					return err
				}
				t.GradeComponentID = id
			}
		case t.SemesterID != "":
			if _, err := getSemester(ctx, tx, t.SemesterID); err != nil {
				if errors.Is(err, domain.ErrNotFound) {
					v.Add("semester_id", msgSemesterNotFound)
				} else {
					return err
				}
			}
		default:
			err := tx.QueryRowContext(ctx, `SELECT id FROM semesters WHERE is_active = 1`).Scan(&t.SemesterID)
			if errors.Is(err, sql.ErrNoRows) {
				v.Add("semester_id", "Belum ada semester aktif. Buat semester atau pilih matkul dulu.")
			} else if err != nil {
				return err
			}
		}
		if err := checkTaskLinks(ctx, tx, &v, t.CourseID, t.MeetingID, t.GradeComponentID); err != nil {
			return err
		}
		if err := v.Err(); err != nil {
			return err
		}
		_, err := tx.ExecContext(ctx, `
			INSERT INTO tasks (id, semester_id, course_id, meeting_id, grade_component_id, title, description, deadline,
			                   status, priority, submission_url, score, completed_at, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			t.ID, t.SemesterID, nullString(t.CourseID), nullString(t.MeetingID), nullString(t.GradeComponentID),
			t.Title, t.Description, FormatTime(t.Deadline), t.Status, t.Priority, t.SubmissionURL, nullFloat(t.Score),
			nullTime(t.CompletedAt), FormatTime(now), FormatTime(now))
		return mapInsertErr(err)
	})
	if err != nil {
		return Task{}, err
	}
	return s.GetTask(ctx, t.ID)
}

// UpdateTask replaces the editable fields of a task. The course must be in the
// task's semester, and completed_at follows the status change.
func (s *Store) UpdateTask(ctx context.Context, t Task) (Task, error) {
	now := s.now()
	err := s.tx(ctx, func(tx *sql.Tx) error {
		prev, err := getTask(ctx, tx, t.ID)
		if err != nil {
			return err
		}
		var v domain.Validator
		if t.CourseID != nil {
			semID, ok, err := courseSemester(ctx, tx, *t.CourseID)
			if err != nil {
				return err
			}
			switch {
			case !ok:
				v.Add("course_id", msgCourseNotFound)
			case semID != prev.SemesterID:
				v.Add("course_id", "Matkul harus dari semester yang sama dengan tugas")
			}
		}
		if err := checkTaskLinks(ctx, tx, &v, t.CourseID, t.MeetingID, t.GradeComponentID); err != nil {
			return err
		}
		if err := v.Err(); err != nil {
			return err
		}
		completed := domain.CompletedAt(prev.Status, prev.CompletedAt, t.Status, now)
		_, err = tx.ExecContext(ctx, `
			UPDATE tasks SET course_id = ?, meeting_id = ?, grade_component_id = ?, title = ?, description = ?,
			       deadline = ?, status = ?, priority = ?, submission_url = ?, score = ?, completed_at = ?, updated_at = ?
			WHERE id = ?`,
			nullString(t.CourseID), nullString(t.MeetingID), nullString(t.GradeComponentID), t.Title, t.Description,
			FormatTime(t.Deadline), t.Status, t.Priority, t.SubmissionURL, nullFloat(t.Score), nullTime(completed),
			FormatTime(now), t.ID)
		return err
	})
	if err != nil {
		return Task{}, err
	}
	return s.GetTask(ctx, t.ID)
}

// SetTaskStatus changes only the status (and completed_at) of a task.
func (s *Store) SetTaskStatus(ctx context.Context, id, status string) (Task, error) {
	now := s.now()
	err := s.tx(ctx, func(tx *sql.Tx) error {
		prev, err := getTask(ctx, tx, id)
		if err != nil {
			return err
		}
		completed := domain.CompletedAt(prev.Status, prev.CompletedAt, status, now)
		_, err = tx.ExecContext(ctx, `UPDATE tasks SET status = ?, completed_at = ?, updated_at = ? WHERE id = ?`,
			status, nullTime(completed), FormatTime(now), id)
		return err
	})
	if err != nil {
		return Task{}, err
	}
	return s.GetTask(ctx, id)
}

// DeleteTask removes a task.
func (s *Store) DeleteTask(ctx context.Context, id string) error {
	res, err := s.db.ExecContext(ctx, `DELETE FROM tasks WHERE id = ?`, id)
	if err != nil {
		return err
	}
	return requireAffected(res, msgTaskNotFound)
}
