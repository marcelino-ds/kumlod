package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"

	"kumlod/internal/domain"
)

const (
	settingsKeyApp   = "app"
	settingsKeyVAPID = "vapid"
)

// GetSettings returns the app settings, filling missing fields with defaults.
func (s *Store) GetSettings(ctx context.Context) (domain.Settings, error) {
	st := domain.DefaultSettings()
	var raw string
	err := s.db.QueryRowContext(ctx, `SELECT value FROM settings WHERE key = ?`, settingsKeyApp).Scan(&raw)
	if errors.Is(err, sql.ErrNoRows) {
		return st, nil
	}
	if err != nil {
		return st, err
	}
	if err := json.Unmarshal([]byte(raw), &st); err != nil {
		return domain.DefaultSettings(), err
	}
	if len(st.GradeScale) == 0 {
		st.GradeScale = domain.DefaultGradeScale()
	}
	st.GradeScale = st.GradeScale.Sorted()
	return st, nil
}

// SaveSettings stores the app settings.
func (s *Store) SaveSettings(ctx context.Context, st domain.Settings) error {
	raw, err := json.Marshal(st)
	if err != nil {
		return err
	}
	_, err = s.db.ExecContext(ctx,
		`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
		settingsKeyApp, string(raw))
	return err
}

// VAPIDKeys is the Web Push key pair (base64url, unpadded).
type VAPIDKeys struct {
	PublicKey  string `json:"public_key"`
	PrivateKey string `json:"private_key"`
}

// GetVAPIDKeys returns the stored key pair or domain.ErrNotFound.
func (s *Store) GetVAPIDKeys(ctx context.Context) (VAPIDKeys, error) {
	var raw string
	err := s.db.QueryRowContext(ctx, `SELECT value FROM settings WHERE key = ?`, settingsKeyVAPID).Scan(&raw)
	if err != nil {
		return VAPIDKeys{}, notFoundIfNoRows(err, "Kunci VAPID belum dibuat")
	}
	var k VAPIDKeys
	if err := json.Unmarshal([]byte(raw), &k); err != nil {
		return VAPIDKeys{}, err
	}
	return k, nil
}

// InitVAPIDKeys stores keys unless a pair already exists, and returns the pair in effect.
func (s *Store) InitVAPIDKeys(ctx context.Context, keys VAPIDKeys) (VAPIDKeys, error) {
	raw, err := json.Marshal(keys)
	if err != nil {
		return VAPIDKeys{}, err
	}
	if _, err := s.db.ExecContext(ctx,
		`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO NOTHING`,
		settingsKeyVAPID, string(raw)); err != nil {
		return VAPIDKeys{}, err
	}
	return s.GetVAPIDKeys(ctx)
}
