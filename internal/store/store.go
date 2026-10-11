// Package store is the only package that talks SQL. It maps rows to plain
// structs and returns domain errors (domain.ErrNotFound, domain.ErrConflict,
// *domain.ValidationError).
package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"modernc.org/sqlite"
	sqlite3 "modernc.org/sqlite/lib"

	"kumlod/internal/clock"
	"kumlod/internal/domain"
)

// TimeFormat is the fixed UTC timestamp format stored in TEXT columns. Text
// order equals time order.
const TimeFormat = "2006-01-02T15:04:05.000Z"

// Store wraps the database handle.
type Store struct {
	db    *sql.DB
	clock clock.Clock
}

// New returns a Store. c provides timestamps for created_at and updated_at.
func New(db *sql.DB, c clock.Clock) *Store {
	if c == nil {
		c = clock.Real{}
	}
	return &Store{db: db, clock: c}
}

// DB exposes the underlying handle (for health checks).
func (s *Store) DB() *sql.DB { return s.db }

func (s *Store) now() time.Time { return s.clock.Now().UTC().Truncate(time.Millisecond) }

// NewID returns a new UUIDv7 string.
func NewID() string { return uuid.Must(uuid.NewV7()).String() }

// NormalizeID returns the canonical lowercase form of a UUID in 8-4-4-4-12 form.
func NormalizeID(id string) (string, bool) {
	if len(id) != 36 {
		return "", false
	}
	u, err := uuid.Parse(id)
	if err != nil {
		return "", false
	}
	return u.String(), true
}

func idOrNew(id string) string {
	if id == "" {
		return NewID()
	}
	return id
}

// FormatTime formats t as a stored timestamp.
func FormatTime(t time.Time) string { return t.UTC().Format(TimeFormat) }

// ParseTime parses a stored timestamp.
func ParseTime(s string) (time.Time, error) { return time.Parse(TimeFormat, s) }

func nullTime(t *time.Time) any {
	if t == nil {
		return nil
	}
	return FormatTime(*t)
}

func nullString(p *string) any {
	if p == nil {
		return nil
	}
	return *p
}

func nullFloat(p *float64) any {
	if p == nil {
		return nil
	}
	return *p
}

// timeCol scans a TEXT timestamp into a time.Time.
type timeCol struct{ dst *time.Time }

func (c timeCol) Scan(v any) error {
	var raw string
	switch x := v.(type) {
	case string:
		raw = x
	case []byte:
		raw = string(x)
	default:
		return fmt.Errorf("timestamp: tipe %T tidak didukung", v)
	}
	t, err := ParseTime(raw)
	if err != nil {
		return err
	}
	*c.dst = t
	return nil
}

// nullTimeCol scans a nullable TEXT timestamp into a *time.Time.
type nullTimeCol struct{ dst **time.Time }

func (c nullTimeCol) Scan(v any) error {
	if v == nil {
		*c.dst = nil
		return nil
	}
	var t time.Time
	if err := (timeCol{&t}).Scan(v); err != nil {
		return err
	}
	*c.dst = &t
	return nil
}

type scanner interface {
	Scan(dest ...any) error
}

type execer interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

// tx runs fn in a transaction (BEGIN IMMEDIATE via the DSN) and commits when fn returns nil.
func (s *Store) tx(ctx context.Context, fn func(tx *sql.Tx) error) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	if err := fn(tx); err != nil {
		_ = tx.Rollback()
		return err
	}
	return tx.Commit()
}

func sqliteCode(err error) int {
	var se *sqlite.Error
	if errors.As(err, &se) {
		return se.Code()
	}
	return 0
}

func isPrimaryKeyViolation(err error) bool {
	return sqliteCode(err) == sqlite3.SQLITE_CONSTRAINT_PRIMARYKEY
}

func isUniqueViolation(err error) bool {
	return sqliteCode(err) == sqlite3.SQLITE_CONSTRAINT_UNIQUE
}

// errIDTaken is returned when a client-supplied ID already exists.
var errIDTaken = domain.Conflict("ID sudah dipakai data lain")

func mapInsertErr(err error) error {
	if isPrimaryKeyViolation(err) {
		return errIDTaken
	}
	return err
}

func notFoundIfNoRows(err error, msg string) error {
	if errors.Is(err, sql.ErrNoRows) {
		return domain.NotFound(msg)
	}
	return err
}

func requireAffected(res sql.Result, msg string) error {
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return domain.NotFound(msg)
	}
	return nil
}

// placeholders returns "?, ?, ?" for n arguments.
func placeholders(n int) string {
	if n <= 0 {
		return ""
	}
	return strings.TrimSuffix(strings.Repeat("?, ", n), ", ")
}

func anySlice[T any](in []T) []any {
	out := make([]any, len(in))
	for i, v := range in {
		out[i] = v
	}
	return out
}

func fieldf(format string, args ...any) string { return fmt.Sprintf(format, args...) }

func boolInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

// Not-found messages shared across files.
const (
	msgSemesterNotFound  = "Semester tidak ditemukan"
	msgCourseNotFound    = "Matkul tidak ditemukan"
	msgMeetingNotFound   = "Pertemuan tidak ditemukan"
	msgTaskNotFound      = "Tugas tidak ditemukan"
	msgMaterialNotFound  = "Materi tidak ditemukan"
	msgFileNotFound      = "File tidak ditemukan"
	msgUserNotFound      = "Pengguna tidak ditemukan"
	msgSessionNotFound   = "Sesi tidak ditemukan"
	msgComponentNotFound = "Komponen nilai tidak ditemukan"
)
