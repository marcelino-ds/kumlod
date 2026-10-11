package store

import (
	"context"
	"database/sql"
	"time"
)

// Semester is an academic period. At most one is active.
type Semester struct {
	ID           string
	Name         string
	AcademicYear string
	Term         string
	StartDate    string
	EndDate      string
	IsActive     bool
	CourseCount  int
	TotalCredits int
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

const semesterSelect = `
	SELECT s.id, s.name, s.academic_year, s.term, s.start_date, s.end_date, s.is_active,
	       s.created_at, s.updated_at,
	       (SELECT count(*) FROM courses c WHERE c.semester_id = s.id),
	       (SELECT coalesce(sum(c.credits), 0) FROM courses c WHERE c.semester_id = s.id)
	FROM semesters s`

func scanSemester(sc scanner) (Semester, error) {
	var x Semester
	var active int
	err := sc.Scan(&x.ID, &x.Name, &x.AcademicYear, &x.Term, &x.StartDate, &x.EndDate, &active,
		timeCol{&x.CreatedAt}, timeCol{&x.UpdatedAt}, &x.CourseCount, &x.TotalCredits)
	x.IsActive = active == 1
	return x, err
}

// ListSemesters returns all semesters, newest start date first.
func (s *Store) ListSemesters(ctx context.Context) ([]Semester, error) {
	rows, err := s.db.QueryContext(ctx, semesterSelect+` ORDER BY s.start_date DESC, s.created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Semester{}
	for rows.Next() {
		x, err := scanSemester(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, x)
	}
	return out, rows.Err()
}

// GetSemester returns one semester.
func (s *Store) GetSemester(ctx context.Context, id string) (Semester, error) {
	return getSemester(ctx, s.db, id)
}

func getSemester(ctx context.Context, q execer, id string) (Semester, error) {
	x, err := scanSemester(q.QueryRowContext(ctx, semesterSelect+` WHERE s.id = ?`, id))
	return x, notFoundIfNoRows(err, msgSemesterNotFound)
}

// GetActiveSemester returns the active semester or domain.ErrNotFound.
func (s *Store) GetActiveSemester(ctx context.Context) (Semester, error) {
	x, err := scanSemester(s.db.QueryRowContext(ctx, semesterSelect+` WHERE s.is_active = 1`))
	return x, notFoundIfNoRows(err, "Belum ada semester aktif")
}

// CreateSemester inserts a semester. The first semester is always active; when
// activate is true every other semester becomes inactive.
func (s *Store) CreateSemester(ctx context.Context, in Semester, activate bool) (Semester, error) {
	now := s.now()
	in.ID = idOrNew(in.ID)
	err := s.tx(ctx, func(tx *sql.Tx) error {
		var count int
		if err := tx.QueryRowContext(ctx, `SELECT count(*) FROM semesters`).Scan(&count); err != nil {
			return err
		}
		if count == 0 {
			activate = true
		}
		if activate {
			if _, err := tx.ExecContext(ctx, `UPDATE semesters SET is_active = 0, updated_at = ? WHERE is_active = 1`, FormatTime(now)); err != nil {
				return err
			}
		}
		_, err := tx.ExecContext(ctx, `
			INSERT INTO semesters (id, name, academic_year, term, start_date, end_date, is_active, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			in.ID, in.Name, in.AcademicYear, in.Term, in.StartDate, in.EndDate, boolInt(activate), FormatTime(now), FormatTime(now))
		return mapInsertErr(err)
	})
	if err != nil {
		return Semester{}, err
	}
	return s.GetSemester(ctx, in.ID)
}

// UpdateSemester replaces the editable fields of a semester.
func (s *Store) UpdateSemester(ctx context.Context, in Semester) (Semester, error) {
	res, err := s.db.ExecContext(ctx, `
		UPDATE semesters SET name = ?, academic_year = ?, term = ?, start_date = ?, end_date = ?, updated_at = ?
		WHERE id = ?`,
		in.Name, in.AcademicYear, in.Term, in.StartDate, in.EndDate, FormatTime(s.now()), in.ID)
	if err != nil {
		return Semester{}, err
	}
	if err := requireAffected(res, msgSemesterNotFound); err != nil {
		return Semester{}, err
	}
	return s.GetSemester(ctx, in.ID)
}

// ActivateSemester makes id the only active semester.
func (s *Store) ActivateSemester(ctx context.Context, id string) (Semester, error) {
	now := FormatTime(s.now())
	err := s.tx(ctx, func(tx *sql.Tx) error {
		if _, err := getSemester(ctx, tx, id); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `UPDATE semesters SET is_active = 0, updated_at = ? WHERE is_active = 1 AND id <> ?`, now, id); err != nil {
			return err
		}
		_, err := tx.ExecContext(ctx, `UPDATE semesters SET is_active = 1, updated_at = ? WHERE id = ? AND is_active = 0`, now, id)
		return err
	})
	if err != nil {
		return Semester{}, err
	}
	return s.GetSemester(ctx, id)
}

// DeleteSemester removes a semester with all its courses, meetings, tasks, and
// materials. It returns the IDs of files whose rows were removed so the caller
// can delete them from disk after the commit.
func (s *Store) DeleteSemester(ctx context.Context, id string) ([]string, error) {
	var fileIDs []string
	err := s.tx(ctx, func(tx *sql.Tx) error {
		if _, err := getSemester(ctx, tx, id); err != nil {
			return err
		}
		const materialsOf = `SELECT m.id FROM materials m JOIN courses c ON c.id = m.course_id WHERE c.semester_id = ?`
		var err error
		fileIDs, err = collectFileIDs(ctx, tx,
			`SELECT m.file_id FROM materials m JOIN courses c ON c.id = m.course_id WHERE c.semester_id = ? AND m.file_id IS NOT NULL`, id)
		if err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM materials_fts WHERE material_id IN (`+materialsOf+`)`, id); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM semesters WHERE id = ?`, id); err != nil {
			return err
		}
		return deleteFileRows(ctx, tx, fileIDs)
	})
	if err != nil {
		return nil, err
	}
	return fileIDs, nil
}

func collectFileIDs(ctx context.Context, tx *sql.Tx, query string, args ...any) ([]string, error) {
	rows, err := tx.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	ids := []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

func deleteFileRows(ctx context.Context, tx *sql.Tx, ids []string) error {
	for _, id := range ids {
		if _, err := tx.ExecContext(ctx, `DELETE FROM files WHERE id = ?`, id); err != nil {
			return err
		}
	}
	return nil
}
