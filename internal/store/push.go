package store

import (
	"context"
	"time"
)

// PushSubscription is a Web Push subscription of one device.
type PushSubscription struct {
	ID            string
	Endpoint      string
	P256dh        string
	Auth          string
	UserAgent     string
	CreatedAt     time.Time
	LastSuccessAt *time.Time
}

// UpsertPushSubscription stores a subscription; an existing endpoint gets new keys.
func (s *Store) UpsertPushSubscription(ctx context.Context, sub PushSubscription) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO push_subscriptions (id, endpoint, p256dh, auth, user_agent, created_at, last_success_at)
		VALUES (?, ?, ?, ?, ?, ?, NULL)
		ON CONFLICT (endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent`,
		NewID(), sub.Endpoint, sub.P256dh, sub.Auth, sub.UserAgent, FormatTime(s.now()))
	return err
}

// DeletePushSubscription removes a subscription by endpoint. Missing endpoints are ignored.
func (s *Store) DeletePushSubscription(ctx context.Context, endpoint string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM push_subscriptions WHERE endpoint = ?`, endpoint)
	return err
}

// ListPushSubscriptions returns every subscription.
func (s *Store) ListPushSubscriptions(ctx context.Context) ([]PushSubscription, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id, endpoint, p256dh, auth, user_agent, created_at, last_success_at
		FROM push_subscriptions ORDER BY created_at`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []PushSubscription{}
	for rows.Next() {
		var p PushSubscription
		if err := rows.Scan(&p.ID, &p.Endpoint, &p.P256dh, &p.Auth, &p.UserAgent, timeCol{&p.CreatedAt}, nullTimeCol{&p.LastSuccessAt}); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// CountPushSubscriptions returns the number of subscribed devices.
func (s *Store) CountPushSubscriptions(ctx context.Context) (int, error) {
	var n int
	err := s.db.QueryRowContext(ctx, `SELECT count(*) FROM push_subscriptions`).Scan(&n)
	return n, err
}

// MarkPushSuccess records a successful delivery.
func (s *Store) MarkPushSuccess(ctx context.Context, endpoint string, at time.Time) error {
	_, err := s.db.ExecContext(ctx, `UPDATE push_subscriptions SET last_success_at = ? WHERE endpoint = ?`, FormatTime(at), endpoint)
	return err
}

// LogNotification records that a notification (kind, ref) is being sent. It
// returns false when it was already logged, so each notification goes out once.
func (s *Store) LogNotification(ctx context.Context, kind, ref string) (bool, error) {
	res, err := s.db.ExecContext(ctx, `INSERT INTO notification_log (kind, ref, sent_at) VALUES (?, ?, ?)
		ON CONFLICT (kind, ref) DO NOTHING`, kind, ref, FormatTime(s.now()))
	if err != nil {
		return false, err
	}
	n, err := res.RowsAffected()
	return n == 1, err
}

// UnlogNotification removes a log entry so the notification is retried.
func (s *Store) UnlogNotification(ctx context.Context, kind, ref string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM notification_log WHERE kind = ? AND ref = ?`, kind, ref)
	return err
}

// PruneNotificationLog removes entries older than before.
func (s *Store) PruneNotificationLog(ctx context.Context, before time.Time) (int64, error) {
	res, err := s.db.ExecContext(ctx, `DELETE FROM notification_log WHERE sent_at < ?`, FormatTime(before))
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}
