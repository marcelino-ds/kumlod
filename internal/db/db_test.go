package db

import (
	"context"
	"path/filepath"
	"testing"
)

func TestOpenAndMigrate(t *testing.T) {
	path := filepath.Join(t.TempDir(), "sub", "kumlod.db")
	conn, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()

	ctx := context.Background()
	if err := Migrate(ctx, conn, nil); err != nil {
		t.Fatal(err)
	}
	// Running again is a no-op.
	if err := Migrate(ctx, conn, nil); err != nil {
		t.Fatal(err)
	}

	var fk, busy int
	var mode string
	if err := conn.QueryRow("PRAGMA foreign_keys").Scan(&fk); err != nil {
		t.Fatal(err)
	}
	if err := conn.QueryRow("PRAGMA journal_mode").Scan(&mode); err != nil {
		t.Fatal(err)
	}
	if err := conn.QueryRow("PRAGMA busy_timeout").Scan(&busy); err != nil {
		t.Fatal(err)
	}
	if fk != 1 || mode != "wal" || busy != 5000 {
		t.Errorf("pragmas: foreign_keys=%d journal_mode=%s busy_timeout=%d", fk, mode, busy)
	}

	// FTS5 must be available.
	if _, err := conn.Exec(`INSERT INTO materials_fts (material_id, title, description, file_name) VALUES ('x', 'Basis Data', '', '')`); err != nil {
		t.Fatal(err)
	}
	var n int
	if err := conn.QueryRow(`SELECT count(*) FROM materials_fts WHERE materials_fts MATCH '"basis"*'`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Errorf("fts match = %d", n)
	}
}
