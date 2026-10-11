// Package db opens the SQLite database and applies the embedded migrations.
package db

import (
	"context"
	"database/sql"
	"embed"
	"fmt"
	"io/fs"
	"log/slog"
	"net/url"
	"os"
	"path/filepath"

	"github.com/pressly/goose/v3"
	_ "modernc.org/sqlite" // registers the "sqlite" driver
)

//go:embed migrations/*.sql
var migrations embed.FS

// MaxOpenConns bounds the connection pool.
const MaxOpenConns = 4

// DSN returns the driver connection string for path with Kumlod's pragmas.
func DSN(path string) string {
	q := url.Values{}
	q.Set("_foreign_keys", "1")
	q.Set("_journal_mode", "WAL")
	q.Set("_busy_timeout", "5000")
	q.Set("_synchronous", "NORMAL")
	q.Set("_txlock", "immediate")
	return path + "?" + q.Encode()
}

// Open opens (and creates if needed) the database at path.
func Open(path string) (*sql.DB, error) {
	if dir := filepath.Dir(path); dir != "" {
		if err := os.MkdirAll(dir, 0o750); err != nil {
			return nil, fmt.Errorf("buat folder database: %w", err)
		}
	}
	conn, err := sql.Open("sqlite", DSN(path))
	if err != nil {
		return nil, fmt.Errorf("buka database: %w", err)
	}
	conn.SetMaxOpenConns(MaxOpenConns)
	conn.SetMaxIdleConns(MaxOpenConns)
	conn.SetConnMaxIdleTime(0)
	if err := conn.Ping(); err != nil {
		conn.Close()
		return nil, fmt.Errorf("koneksi database: %w", err)
	}
	return conn, nil
}

// Migrate applies all pending migrations.
func Migrate(ctx context.Context, conn *sql.DB, logger *slog.Logger) error {
	sub, err := fs.Sub(migrations, "migrations")
	if err != nil {
		return err
	}
	opts := []goose.ProviderOption{goose.WithDisableGlobalRegistry(true)}
	if logger != nil {
		opts = append(opts, goose.WithSlog(logger))
	}
	p, err := goose.NewProvider(goose.DialectSQLite3, conn, sub, opts...)
	if err != nil {
		return fmt.Errorf("siapkan migrasi: %w", err)
	}
	// Provider.Close would close conn, which the caller still owns.
	results, err := p.Up(ctx)
	if err != nil {
		return fmt.Errorf("jalankan migrasi: %w", err)
	}
	if logger != nil {
		for _, r := range results {
			logger.Info("migrasi diterapkan", "version", r.Source.Version, "duration", r.Duration)
		}
	}
	return nil
}
