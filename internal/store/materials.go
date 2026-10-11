package store

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"
	"unicode"

	"kumlod/internal/domain"
)

// FileInfo describes a stored upload.
type FileInfo struct {
	ID           string
	OriginalName string
	MimeType     string
	SizeBytes    int64
	SHA256       string
	CreatedAt    time.Time
}

// Material is a link, note, or file attached to a course (and optionally a meeting).
type Material struct {
	ID            string
	CourseID      string
	Course        CourseBrief
	MeetingID     *string
	MeetingNumber *int
	Kind          string
	Title         string
	Description   string
	URL           string
	File          *FileInfo
	CreatedAt     time.Time
	UpdatedAt     time.Time
}

// MaterialFilter narrows ListMaterials. Empty fields do not filter.
type MaterialFilter struct {
	SemesterID string
	CourseID   string
	MeetingID  string
	Query      string // full-text search with word-prefix matching
}

// MaxSearchTokens bounds the number of words used from a search query.
const MaxSearchTokens = 8

const materialCols = `m.id, m.course_id, c.name, c.code, c.color, m.meeting_id, mt.number, m.kind, m.title,
	m.description, m.url, f.id, f.original_name, f.mime_type, f.size_bytes, f.sha256, f.created_at,
	m.created_at, m.updated_at`

const materialJoins = ` FROM materials m
	JOIN courses c ON c.id = m.course_id
	LEFT JOIN meetings mt ON mt.id = m.meeting_id
	LEFT JOIN files f ON f.id = m.file_id`

func scanMaterial(sc scanner) (Material, error) {
	var m Material
	var fID, fName, fMime, fSHA, fCreated sql.NullString
	var fSize sql.NullInt64
	err := sc.Scan(&m.ID, &m.CourseID, &m.Course.Name, &m.Course.Code, &m.Course.Color, &m.MeetingID, &m.MeetingNumber,
		&m.Kind, &m.Title, &m.Description, &m.URL, &fID, &fName, &fMime, &fSize, &fSHA, &fCreated,
		timeCol{&m.CreatedAt}, timeCol{&m.UpdatedAt})
	if err != nil {
		return Material{}, err
	}
	m.Course.ID = m.CourseID
	if fID.Valid {
		created, err := ParseTime(fCreated.String)
		if err != nil {
			return Material{}, err
		}
		m.File = &FileInfo{ID: fID.String, OriginalName: fName.String, MimeType: fMime.String,
			SizeBytes: fSize.Int64, SHA256: fSHA.String, CreatedAt: created}
	}
	return m, nil
}

// SearchExpression turns user input into an FTS5 query that matches every word
// as a prefix, e.g. `basis dat` -> `"basis"* "dat"*`. It returns "" when the
// input has no searchable words.
func SearchExpression(q string) string {
	words := strings.FieldsFunc(q, func(r rune) bool { return !unicode.IsLetter(r) && !unicode.IsNumber(r) })
	if len(words) > MaxSearchTokens {
		words = words[:MaxSearchTokens]
	}
	parts := make([]string, 0, len(words))
	for _, w := range words {
		parts = append(parts, `"`+strings.ReplaceAll(w, `"`, `""`)+`"*`)
	}
	return strings.Join(parts, " ")
}

// ListMaterials returns materials, newest first, or by relevance when Query is set.
func (s *Store) ListMaterials(ctx context.Context, f MaterialFilter) ([]Material, error) {
	var where []string
	var args []any
	if f.SemesterID != "" {
		where = append(where, `c.semester_id = ?`)
		args = append(args, f.SemesterID)
	}
	if f.CourseID != "" {
		where = append(where, `m.course_id = ?`)
		args = append(args, f.CourseID)
	}
	if f.MeetingID != "" {
		where = append(where, `m.meeting_id = ?`)
		args = append(args, f.MeetingID)
	}
	cond := ""
	if len(where) > 0 {
		cond = ` WHERE ` + strings.Join(where, ` AND `)
	}

	var query string
	if expr := SearchExpression(f.Query); expr != "" {
		query = `WITH hits AS (SELECT material_id, rank FROM materials_fts WHERE materials_fts MATCH ?)
			SELECT ` + materialCols + materialJoins + ` JOIN hits h ON h.material_id = m.id` + cond +
			` ORDER BY h.rank, m.created_at DESC LIMIT 200`
		args = append([]any{expr}, args...)
	} else {
		query = `SELECT ` + materialCols + materialJoins + cond + ` ORDER BY m.created_at DESC, m.id DESC LIMIT 500`
	}

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Material{}
	for rows.Next() {
		m, err := scanMaterial(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// GetMaterial returns one material.
func (s *Store) GetMaterial(ctx context.Context, id string) (Material, error) {
	return getMaterial(ctx, s.db, id)
}

func getMaterial(ctx context.Context, q execer, id string) (Material, error) {
	m, err := scanMaterial(q.QueryRowContext(ctx, `SELECT `+materialCols+materialJoins+` WHERE m.id = ?`, id))
	return m, notFoundIfNoRows(err, msgMaterialNotFound)
}

func checkMaterialMeeting(ctx context.Context, tx *sql.Tx, v *domain.Validator, courseID string, meetingID *string) error {
	if meetingID == nil {
		return nil
	}
	var owner string
	err := tx.QueryRowContext(ctx, `SELECT course_id FROM meetings WHERE id = ?`, *meetingID).Scan(&owner)
	switch {
	case errors.Is(err, sql.ErrNoRows):
		v.Add("meeting_id", msgMeetingNotFound)
	case err != nil:
		return err
	case owner != courseID:
		v.Add("meeting_id", "Pertemuan bukan milik matkul ini")
	}
	return nil
}

func indexMaterial(ctx context.Context, tx *sql.Tx, id, title, description, fileName string) error {
	if _, err := tx.ExecContext(ctx, `DELETE FROM materials_fts WHERE material_id = ?`, id); err != nil {
		return err
	}
	_, err := tx.ExecContext(ctx, `INSERT INTO materials_fts (material_id, title, description, file_name) VALUES (?, ?, ?, ?)`,
		id, title, description, fileName)
	return err
}

// CreateMaterial inserts a material, its file row (for uploads), and its search
// index entry in one transaction.
func (s *Store) CreateMaterial(ctx context.Context, m Material, file *FileInfo) (Material, error) {
	now := s.now()
	m.ID = idOrNew(m.ID)
	err := s.tx(ctx, func(tx *sql.Tx) error {
		var v domain.Validator
		var exists int
		err := tx.QueryRowContext(ctx, `SELECT 1 FROM courses WHERE id = ?`, m.CourseID).Scan(&exists)
		switch {
		case errors.Is(err, sql.ErrNoRows):
			v.Add("course_id", msgCourseNotFound)
		case err != nil:
			return err
		default:
			if err := checkMaterialMeeting(ctx, tx, &v, m.CourseID, m.MeetingID); err != nil {
				return err
			}
		}
		if err := v.Err(); err != nil {
			return err
		}

		var fileID any
		fileName := ""
		if file != nil {
			if _, err := tx.ExecContext(ctx, `INSERT INTO files (id, original_name, mime_type, size_bytes, sha256, created_at)
				VALUES (?, ?, ?, ?, ?, ?)`, file.ID, file.OriginalName, file.MimeType, file.SizeBytes, file.SHA256,
				FormatTime(now)); err != nil {
				return mapInsertErr(err)
			}
			fileID = file.ID
			fileName = file.OriginalName
		}
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO materials (id, course_id, meeting_id, kind, title, description, url, file_id, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			m.ID, m.CourseID, nullString(m.MeetingID), m.Kind, m.Title, m.Description, m.URL, fileID,
			FormatTime(now), FormatTime(now)); err != nil {
			return mapInsertErr(err)
		}
		return indexMaterial(ctx, tx, m.ID, m.Title, m.Description, fileName)
	})
	if err != nil {
		return Material{}, err
	}
	return s.GetMaterial(ctx, m.ID)
}

// UpdateMaterial replaces the meeting, title, description, and URL of a material.
func (s *Store) UpdateMaterial(ctx context.Context, m Material) (Material, error) {
	err := s.tx(ctx, func(tx *sql.Tx) error {
		prev, err := getMaterial(ctx, tx, m.ID)
		if err != nil {
			return err
		}
		var v domain.Validator
		if err := checkMaterialMeeting(ctx, tx, &v, prev.CourseID, m.MeetingID); err != nil {
			return err
		}
		if err := v.Err(); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `UPDATE materials SET meeting_id = ?, title = ?, description = ?, url = ?, updated_at = ?
			WHERE id = ?`, nullString(m.MeetingID), m.Title, m.Description, m.URL, FormatTime(s.now()), m.ID); err != nil {
			return err
		}
		fileName := ""
		if prev.File != nil {
			fileName = prev.File.OriginalName
		}
		return indexMaterial(ctx, tx, m.ID, m.Title, m.Description, fileName)
	})
	if err != nil {
		return Material{}, err
	}
	return s.GetMaterial(ctx, m.ID)
}

// DeleteMaterial removes a material with its index entry and file row. It
// returns the file ID (or "") so the caller can delete the file from disk.
func (s *Store) DeleteMaterial(ctx context.Context, id string) (string, error) {
	var fileID sql.NullString
	err := s.tx(ctx, func(tx *sql.Tx) error {
		if err := tx.QueryRowContext(ctx, `SELECT file_id FROM materials WHERE id = ?`, id).Scan(&fileID); err != nil {
			return notFoundIfNoRows(err, msgMaterialNotFound)
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM materials_fts WHERE material_id = ?`, id); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM materials WHERE id = ?`, id); err != nil {
			return err
		}
		if fileID.Valid {
			_, err := tx.ExecContext(ctx, `DELETE FROM files WHERE id = ?`, fileID.String)
			return err
		}
		return nil
	})
	if err != nil {
		return "", err
	}
	return fileID.String, nil
}

// GetFile returns the metadata of a stored file.
func (s *Store) GetFile(ctx context.Context, id string) (FileInfo, error) {
	var f FileInfo
	err := s.db.QueryRowContext(ctx, `SELECT id, original_name, mime_type, size_bytes, sha256, created_at FROM files WHERE id = ?`, id).
		Scan(&f.ID, &f.OriginalName, &f.MimeType, &f.SizeBytes, &f.SHA256, timeCol{&f.CreatedAt})
	return f, notFoundIfNoRows(err, msgFileNotFound)
}

// ListFileIDs returns every stored file ID (used to find orphans on disk).
func (s *Store) ListFileIDs(ctx context.Context) (map[string]bool, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id FROM files`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]bool{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out[id] = true
	}
	return out, rows.Err()
}
