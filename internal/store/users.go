package store

import (
	"context"
	"database/sql"
	"time"

	"kumlod/internal/domain"
)

// User is an account. Kumlod has a single user, created from the CLI.
type User struct {
	ID           string
	Username     string
	PasswordHash string
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

// Session is a login session. ID is the hex SHA-256 of the cookie token.
type Session struct {
	ID         string
	UserID     string
	UserAgent  string
	CreatedAt  time.Time
	LastSeenAt time.Time
	ExpiresAt  time.Time
}

const userCols = `id, username, password_hash, created_at, updated_at`

func scanUser(sc scanner) (User, error) {
	var u User
	err := sc.Scan(&u.ID, &u.Username, &u.PasswordHash, timeCol{&u.CreatedAt}, timeCol{&u.UpdatedAt})
	return u, err
}

// CreateUser inserts a user. Usernames are unique case-insensitively.
func (s *Store) CreateUser(ctx context.Context, username, passwordHash string) (User, error) {
	now := s.now()
	u := User{ID: NewID(), Username: username, PasswordHash: passwordHash, CreatedAt: now, UpdatedAt: now}
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
		u.ID, u.Username, u.PasswordHash, FormatTime(now), FormatTime(now))
	if isUniqueViolation(err) {
		return User{}, domain.Conflict("Username sudah dipakai")
	}
	if err != nil {
		return User{}, err
	}
	return u, nil
}

// CountUsers returns the number of accounts.
func (s *Store) CountUsers(ctx context.Context) (int, error) {
	var n int
	err := s.db.QueryRowContext(ctx, `SELECT count(*) FROM users`).Scan(&n)
	return n, err
}

// GetUserByUsername finds a user, ignoring case.
func (s *Store) GetUserByUsername(ctx context.Context, username string) (User, error) {
	u, err := scanUser(s.db.QueryRowContext(ctx, `SELECT `+userCols+` FROM users WHERE username = ?`, username))
	return u, notFoundIfNoRows(err, msgUserNotFound)
}

// GetUser finds a user by ID.
func (s *Store) GetUser(ctx context.Context, id string) (User, error) {
	u, err := scanUser(s.db.QueryRowContext(ctx, `SELECT `+userCols+` FROM users WHERE id = ?`, id))
	return u, notFoundIfNoRows(err, msgUserNotFound)
}

// SetPassword replaces a user's password hash.
func (s *Store) SetPassword(ctx context.Context, userID, passwordHash string) error {
	res, err := s.db.ExecContext(ctx, `UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`,
		passwordHash, FormatTime(s.now()), userID)
	if err != nil {
		return err
	}
	return requireAffected(res, msgUserNotFound)
}

// CreateSession stores a session.
func (s *Store) CreateSession(ctx context.Context, sess Session) error {
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO sessions (id, user_id, user_agent, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)`,
		sess.ID, sess.UserID, sess.UserAgent, FormatTime(sess.CreatedAt), FormatTime(sess.LastSeenAt), FormatTime(sess.ExpiresAt))
	return err
}

// GetSession returns a session and its user. Expiry is checked by the caller.
func (s *Store) GetSession(ctx context.Context, id string) (Session, User, error) {
	var sess Session
	var u User
	err := s.db.QueryRowContext(ctx, `
		SELECT s.id, s.user_id, s.user_agent, s.created_at, s.last_seen_at, s.expires_at,
		       u.id, u.username, u.password_hash, u.created_at, u.updated_at
		FROM sessions s JOIN users u ON u.id = s.user_id
		WHERE s.id = ?`, id).Scan(
		&sess.ID, &sess.UserID, &sess.UserAgent, timeCol{&sess.CreatedAt}, timeCol{&sess.LastSeenAt}, timeCol{&sess.ExpiresAt},
		&u.ID, &u.Username, &u.PasswordHash, timeCol{&u.CreatedAt}, timeCol{&u.UpdatedAt})
	if err != nil {
		return Session{}, User{}, notFoundIfNoRows(err, msgSessionNotFound)
	}
	return sess, u, nil
}

// TouchSession updates last_seen_at and expires_at.
func (s *Store) TouchSession(ctx context.Context, id string, lastSeen, expires time.Time) error {
	_, err := s.db.ExecContext(ctx, `UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?`,
		FormatTime(lastSeen), FormatTime(expires), id)
	return err
}

// DeleteSession removes one session. Missing sessions are ignored.
func (s *Store) DeleteSession(ctx context.Context, id string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM sessions WHERE id = ?`, id)
	return err
}

// DeleteSessionsExcept removes all sessions of a user except keepID (which may be empty).
func (s *Store) DeleteSessionsExcept(ctx context.Context, userID, keepID string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM sessions WHERE user_id = ? AND id <> ?`, userID, keepID)
	return err
}

// DeleteExpiredSessions removes sessions that expired before now.
func (s *Store) DeleteExpiredSessions(ctx context.Context, now time.Time) (int64, error) {
	res, err := s.db.ExecContext(ctx, `DELETE FROM sessions WHERE expires_at < ?`, FormatTime(now))
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

// ChangePassword updates the hash and revokes every other session in one transaction.
func (s *Store) ChangePassword(ctx context.Context, userID, passwordHash, keepSessionID string) error {
	return s.tx(ctx, func(tx *sql.Tx) error {
		res, err := tx.ExecContext(ctx, `UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`,
			passwordHash, FormatTime(s.now()), userID)
		if err != nil {
			return err
		}
		if err := requireAffected(res, msgUserNotFound); err != nil {
			return err
		}
		_, err = tx.ExecContext(ctx, `DELETE FROM sessions WHERE user_id = ? AND id <> ?`, userID, keepSessionID)
		return err
	})
}
