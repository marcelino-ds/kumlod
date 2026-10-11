package store

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"kumlod/internal/domain"
)

// Schedule is a weekly slot of a course.
type Schedule struct {
	ID        string
	CourseID  string
	DayOfWeek int
	StartTime string
	EndTime   string
	Room      string
}

// Course is a subject within a semester.
type Course struct {
	ID               string
	SemesterID       string
	Code             string
	Name             string
	Credits          int
	Lecturer         string
	Color            string
	TotalMeetings    int
	MinAttendancePct int
	FinalGradeLetter *string
	Notes            string
	CreatedAt        time.Time
	UpdatedAt        time.Time
	Schedules        []Schedule
}

// CourseBrief is the short form of a course used in lists.
type CourseBrief struct {
	ID    string
	Name  string
	Code  string
	Color string
}

// Brief returns the short form of c.
func (c Course) Brief() CourseBrief {
	return CourseBrief{ID: c.ID, Name: c.Name, Code: c.Code, Color: c.Color}
}

// GradeComponent is a weighted part of a course grade.
type GradeComponent struct {
	ID       string
	CourseID string
	Name     string
	Weight   float64
	Score    *float64
	Source   string
	Position int
}

const courseCols = `c.id, c.semester_id, c.code, c.name, c.credits, c.lecturer, c.color, c.total_meetings,
	c.min_attendance_pct, c.final_grade_letter, c.notes, c.created_at, c.updated_at`

func scanCourse(sc scanner) (Course, error) {
	var c Course
	err := sc.Scan(&c.ID, &c.SemesterID, &c.Code, &c.Name, &c.Credits, &c.Lecturer, &c.Color, &c.TotalMeetings,
		&c.MinAttendancePct, &c.FinalGradeLetter, &c.Notes, timeCol{&c.CreatedAt}, timeCol{&c.UpdatedAt})
	return c, err
}

// ListCourses returns the courses of a semester ordered by name, with schedules.
// An empty semesterID lists every course.
func (s *Store) ListCourses(ctx context.Context, semesterID string) ([]Course, error) {
	query := `SELECT ` + courseCols + ` FROM courses c`
	var args []any
	if semesterID != "" {
		query += ` WHERE c.semester_id = ?`
		args = append(args, semesterID)
	}
	query += ` ORDER BY c.name COLLATE NOCASE, c.created_at`
	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Course{}
	idx := map[string]int{}
	for rows.Next() {
		c, err := scanCourse(rows)
		if err != nil {
			return nil, err
		}
		c.Schedules = []Schedule{}
		idx[c.ID] = len(out)
		out = append(out, c)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	rows.Close()

	schedQuery := `SELECT cs.id, cs.course_id, cs.day_of_week, cs.start_time, cs.end_time, cs.room
		FROM course_schedules cs JOIN courses c ON c.id = cs.course_id`
	if semesterID != "" {
		schedQuery += ` WHERE c.semester_id = ?`
	}
	schedQuery += ` ORDER BY cs.day_of_week, cs.start_time`
	srows, err := s.db.QueryContext(ctx, schedQuery, args...)
	if err != nil {
		return nil, err
	}
	defer srows.Close()
	for srows.Next() {
		var sc Schedule
		if err := srows.Scan(&sc.ID, &sc.CourseID, &sc.DayOfWeek, &sc.StartTime, &sc.EndTime, &sc.Room); err != nil {
			return nil, err
		}
		if i, ok := idx[sc.CourseID]; ok {
			out[i].Schedules = append(out[i].Schedules, sc)
		}
	}
	return out, srows.Err()
}

// GetCourse returns one course with its schedules.
func (s *Store) GetCourse(ctx context.Context, id string) (Course, error) {
	return getCourse(ctx, s.db, id)
}

func getCourse(ctx context.Context, q execer, id string) (Course, error) {
	c, err := scanCourse(q.QueryRowContext(ctx, `SELECT `+courseCols+` FROM courses c WHERE c.id = ?`, id))
	if err != nil {
		return Course{}, notFoundIfNoRows(err, msgCourseNotFound)
	}
	c.Schedules, err = listSchedules(ctx, q, id)
	return c, err
}

func listSchedules(ctx context.Context, q execer, courseID string) ([]Schedule, error) {
	rows, err := q.QueryContext(ctx, `SELECT id, course_id, day_of_week, start_time, end_time, room
		FROM course_schedules WHERE course_id = ? ORDER BY day_of_week, start_time`, courseID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Schedule{}
	for rows.Next() {
		var sc Schedule
		if err := rows.Scan(&sc.ID, &sc.CourseID, &sc.DayOfWeek, &sc.StartTime, &sc.EndTime, &sc.Room); err != nil {
			return nil, err
		}
		out = append(out, sc)
	}
	return out, rows.Err()
}

func insertSchedules(ctx context.Context, tx *sql.Tx, courseID string, schedules []Schedule) error {
	for _, sc := range schedules {
		if _, err := tx.ExecContext(ctx, `INSERT INTO course_schedules (id, course_id, day_of_week, start_time, end_time, room)
			VALUES (?, ?, ?, ?, ?, ?)`, NewID(), courseID, sc.DayOfWeek, sc.StartTime, sc.EndTime, sc.Room); err != nil {
			return err
		}
	}
	return nil
}

// CreateCourse inserts a course with its schedules, grade components, and
// (optionally) generated meetings in one transaction.
func (s *Store) CreateCourse(ctx context.Context, c Course, components []GradeComponent, meetings []Meeting) (Course, error) {
	now := s.now()
	c.ID = idOrNew(c.ID)
	err := s.tx(ctx, func(tx *sql.Tx) error {
		if _, err := getSemester(ctx, tx, c.SemesterID); err != nil {
			return err
		}
		_, err := tx.ExecContext(ctx, `
			INSERT INTO courses (id, semester_id, code, name, credits, lecturer, color, total_meetings,
			                     min_attendance_pct, final_grade_letter, notes, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			c.ID, c.SemesterID, c.Code, c.Name, c.Credits, c.Lecturer, c.Color, c.TotalMeetings,
			c.MinAttendancePct, nullString(c.FinalGradeLetter), c.Notes, FormatTime(now), FormatTime(now))
		if err != nil {
			return mapInsertErr(err)
		}
		if err := insertSchedules(ctx, tx, c.ID, c.Schedules); err != nil {
			return err
		}
		for i, gc := range components {
			gc.CourseID = c.ID
			gc.Position = i
			if err := insertComponent(ctx, tx, gc); err != nil {
				return err
			}
		}
		return insertMeetings(ctx, tx, c.ID, meetings, now)
	})
	if err != nil {
		return Course{}, err
	}
	return s.GetCourse(ctx, c.ID)
}

// UpdateCourse replaces the editable fields and the schedules of a course.
func (s *Store) UpdateCourse(ctx context.Context, c Course) (Course, error) {
	err := s.tx(ctx, func(tx *sql.Tx) error {
		res, err := tx.ExecContext(ctx, `
			UPDATE courses SET code = ?, name = ?, credits = ?, lecturer = ?, color = ?, total_meetings = ?,
			       min_attendance_pct = ?, final_grade_letter = ?, notes = ?, updated_at = ?
			WHERE id = ?`,
			c.Code, c.Name, c.Credits, c.Lecturer, c.Color, c.TotalMeetings,
			c.MinAttendancePct, nullString(c.FinalGradeLetter), c.Notes, FormatTime(s.now()), c.ID)
		if err != nil {
			return err
		}
		if err := requireAffected(res, msgCourseNotFound); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM course_schedules WHERE course_id = ?`, c.ID); err != nil {
			return err
		}
		return insertSchedules(ctx, tx, c.ID, c.Schedules)
	})
	if err != nil {
		return Course{}, err
	}
	return s.GetCourse(ctx, c.ID)
}

// DeleteCourse removes a course with its meetings, tasks, and materials. It
// returns the IDs of files to delete from disk after the commit.
func (s *Store) DeleteCourse(ctx context.Context, id string) ([]string, error) {
	var fileIDs []string
	err := s.tx(ctx, func(tx *sql.Tx) error {
		var exists int
		if err := tx.QueryRowContext(ctx, `SELECT 1 FROM courses WHERE id = ?`, id).Scan(&exists); err != nil {
			return notFoundIfNoRows(err, msgCourseNotFound)
		}
		var err error
		fileIDs, err = collectFileIDs(ctx, tx, `SELECT file_id FROM materials WHERE course_id = ? AND file_id IS NOT NULL`, id)
		if err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM materials_fts WHERE material_id IN (SELECT id FROM materials WHERE course_id = ?)`, id); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM courses WHERE id = ?`, id); err != nil {
			return err
		}
		return deleteFileRows(ctx, tx, fileIDs)
	})
	if err != nil {
		return nil, err
	}
	return fileIDs, nil
}

func insertComponent(ctx context.Context, tx *sql.Tx, gc GradeComponent) error {
	_, err := tx.ExecContext(ctx, `INSERT INTO grade_components (id, course_id, name, weight, score, source, position)
		VALUES (?, ?, ?, ?, ?, ?, ?)`,
		idOrNew(gc.ID), gc.CourseID, gc.Name, gc.Weight, nullFloat(gc.Score), gc.Source, gc.Position)
	return mapInsertErr(err)
}

const componentCols = `id, course_id, name, weight, score, source, position`

func scanComponent(sc scanner) (GradeComponent, error) {
	var g GradeComponent
	err := sc.Scan(&g.ID, &g.CourseID, &g.Name, &g.Weight, &g.Score, &g.Source, &g.Position)
	return g, err
}

// ListGradeComponents returns the components of a course in display order.
func (s *Store) ListGradeComponents(ctx context.Context, courseID string) ([]GradeComponent, error) {
	return queryComponents(ctx, s.db, `SELECT `+componentCols+` FROM grade_components WHERE course_id = ? ORDER BY position, name`, courseID)
}

// ListGradeComponentsBySemester returns components grouped by course. An empty
// semesterID covers every semester.
func (s *Store) ListGradeComponentsBySemester(ctx context.Context, semesterID string) (map[string][]GradeComponent, error) {
	query := `SELECT g.id, g.course_id, g.name, g.weight, g.score, g.source, g.position FROM grade_components g`
	var args []any
	if semesterID != "" {
		query += ` JOIN courses c ON c.id = g.course_id WHERE c.semester_id = ?`
		args = append(args, semesterID)
	}
	query += ` ORDER BY g.position, g.name`
	list, err := queryComponents(ctx, s.db, query, args...)
	if err != nil {
		return nil, err
	}
	out := map[string][]GradeComponent{}
	for _, g := range list {
		out[g.CourseID] = append(out[g.CourseID], g)
	}
	return out, nil
}

func queryComponents(ctx context.Context, q execer, query string, args ...any) ([]GradeComponent, error) {
	rows, err := q.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []GradeComponent{}
	for rows.Next() {
		g, err := scanComponent(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, g)
	}
	return out, rows.Err()
}

// ReplaceGradeComponents makes the course's components equal to comps. Components
// whose ID already belongs to the course are updated in place so task links
// survive; others are inserted; missing ones are deleted (tasks are unlinked).
func (s *Store) ReplaceGradeComponents(ctx context.Context, courseID string, comps []GradeComponent) error {
	return s.tx(ctx, func(tx *sql.Tx) error {
		var exists int
		if err := tx.QueryRowContext(ctx, `SELECT 1 FROM courses WHERE id = ?`, courseID).Scan(&exists); err != nil {
			return notFoundIfNoRows(err, msgCourseNotFound)
		}
		current, err := queryComponents(ctx, tx, `SELECT `+componentCols+` FROM grade_components WHERE course_id = ?`, courseID)
		if err != nil {
			return err
		}
		existing := map[string]bool{}
		for _, g := range current {
			existing[g.ID] = true
		}

		var v domain.Validator
		keep := map[string]bool{}
		for i, gc := range comps {
			if gc.ID == "" {
				continue
			}
			if keep[gc.ID] {
				v.Add(fieldf("components[%d].id", i), "ID komponen muncul lebih dari sekali")
				continue
			}
			keep[gc.ID] = true
			if !existing[gc.ID] {
				var owner string
				err := tx.QueryRowContext(ctx, `SELECT course_id FROM grade_components WHERE id = ?`, gc.ID).Scan(&owner)
				if err == nil {
					v.Add(fieldf("components[%d].id", i), "ID komponen milik matkul lain")
				} else if !errors.Is(err, sql.ErrNoRows) {
					return err
				}
			}
		}
		if err := v.Err(); err != nil {
			return err
		}

		for _, g := range current {
			if !keep[g.ID] {
				if _, err := tx.ExecContext(ctx, `DELETE FROM grade_components WHERE id = ?`, g.ID); err != nil {
					return err
				}
			}
		}
		for i, gc := range comps {
			gc.CourseID = courseID
			gc.Position = i
			if gc.ID != "" && existing[gc.ID] {
				if _, err := tx.ExecContext(ctx, `UPDATE grade_components SET name = ?, weight = ?, score = ?, source = ?, position = ?
					WHERE id = ?`, gc.Name, gc.Weight, nullFloat(gc.Score), gc.Source, gc.Position, gc.ID); err != nil {
					return err
				}
				continue
			}
			if err := insertComponent(ctx, tx, gc); err != nil {
				return err
			}
		}
		return nil
	})
}

// ListGradedTaskScores returns the scores of graded tasks per grade component for
// one course.
func (s *Store) ListGradedTaskScores(ctx context.Context, courseID string) (map[string][]float64, error) {
	return queryTaskScores(ctx, s.db, `SELECT grade_component_id, score FROM tasks
		WHERE course_id = ? AND grade_component_id IS NOT NULL AND score IS NOT NULL`, courseID)
}

// ListGradedTaskScoresBySemester is ListGradedTaskScores for a whole semester.
// An empty semesterID covers every semester.
func (s *Store) ListGradedTaskScoresBySemester(ctx context.Context, semesterID string) (map[string][]float64, error) {
	query := `SELECT grade_component_id, score FROM tasks WHERE grade_component_id IS NOT NULL AND score IS NOT NULL`
	var args []any
	if semesterID != "" {
		query += ` AND semester_id = ?`
		args = append(args, semesterID)
	}
	return queryTaskScores(ctx, s.db, query, args...)
}

func queryTaskScores(ctx context.Context, q execer, query string, args ...any) (map[string][]float64, error) {
	rows, err := q.QueryContext(ctx, query+` ORDER BY deadline`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string][]float64{}
	for rows.Next() {
		var id string
		var score float64
		if err := rows.Scan(&id, &score); err != nil {
			return nil, err
		}
		out[id] = append(out[id], score)
	}
	return out, rows.Err()
}

// CountOpenTasksByCourse counts todo and in_progress tasks per course in a
// semester. An empty semesterID covers every semester.
func (s *Store) CountOpenTasksByCourse(ctx context.Context, semesterID string) (map[string]int, error) {
	query := `SELECT course_id, count(*) FROM tasks
		WHERE course_id IS NOT NULL AND status IN ('todo', 'in_progress')`
	var args []any
	if semesterID != "" {
		query += ` AND semester_id = ?`
		args = append(args, semesterID)
	}
	rows, err := s.db.QueryContext(ctx, query+` GROUP BY course_id`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]int{}
	for rows.Next() {
		var id string
		var n int
		if err := rows.Scan(&id, &n); err != nil {
			return nil, err
		}
		out[id] = n
	}
	return out, rows.Err()
}
