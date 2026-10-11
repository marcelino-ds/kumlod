// Package push sends Web Push notifications signed with VAPID.
package push

import (
	"context"
	"crypto/ecdh"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	webpush "github.com/SherClockHolmes/webpush-go"

	"kumlod/internal/clock"
)

// Keys is a VAPID key pair encoded as unpadded base64url.
type Keys struct {
	PublicKey  string
	PrivateKey string
}

// GenerateKeys creates a new P-256 VAPID key pair.
func GenerateKeys() (Keys, error) {
	priv, err := ecdh.P256().GenerateKey(rand.Reader)
	if err != nil {
		return Keys{}, err
	}
	return Keys{
		PublicKey:  base64.RawURLEncoding.EncodeToString(priv.PublicKey().Bytes()),
		PrivateKey: base64.RawURLEncoding.EncodeToString(priv.Bytes()),
	}, nil
}

// Message is the JSON payload read by the service worker.
type Message struct {
	Title string `json:"title"`
	Body  string `json:"body"`
	URL   string `json:"url"`
	Tag   string `json:"tag,omitempty"`
}

// Subscription identifies one browser/device.
type Subscription struct {
	Endpoint string
	P256dh   string
	Auth     string
}

// Sender delivers one encrypted payload and returns the push service status code.
type Sender interface {
	Send(ctx context.Context, sub Subscription, payload []byte) (int, error)
}

// Notification options.
const (
	TTL         = 12 * 60 * 60 // seconds
	sendTimeout = 15 * time.Second
)

// WebPush is the real Sender.
type WebPush struct {
	keys    Keys
	subject string
	client  *http.Client
}

// NewWebPush returns a sender. subject is "mailto:..." or "https://...".
func NewWebPush(keys Keys, subject string) *WebPush {
	return &WebPush{keys: keys, subject: subject, client: &http.Client{Timeout: sendTimeout}}
}

// Send implements Sender.
func (w *WebPush) Send(ctx context.Context, sub Subscription, payload []byte) (int, error) {
	// webpush-go prepends "mailto:" itself unless the subscriber is an https URL.
	subscriber := strings.TrimPrefix(w.subject, "mailto:")
	resp, err := webpush.SendNotificationWithContext(ctx, payload,
		&webpush.Subscription{Endpoint: sub.Endpoint, Keys: webpush.Keys{P256dh: sub.P256dh, Auth: sub.Auth}},
		&webpush.Options{
			HTTPClient:      w.client,
			Subscriber:      subscriber,
			TTL:             TTL,
			Urgency:         webpush.UrgencyHigh,
			VAPIDPublicKey:  w.keys.PublicKey,
			VAPIDPrivateKey: w.keys.PrivateKey,
		})
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 64<<10))
	return resp.StatusCode, nil
}

// Repo is the subscription storage used by Broadcaster.
type Repo interface {
	ListSubscriptions(ctx context.Context) ([]Subscription, error)
	DeleteSubscription(ctx context.Context, endpoint string) error
	MarkSuccess(ctx context.Context, endpoint string, at time.Time) error
}

// Result summarizes a broadcast.
type Result struct {
	Sent      int // delivered
	Failed    int // not delivered (includes Gone and Retryable)
	Gone      int // subscriptions removed after 404 or 410
	Retryable int // network errors, 429, or 5xx
}

// Broadcaster sends a message to every subscribed device.
type Broadcaster struct {
	sender Sender
	repo   Repo
	clock  clock.Clock
	log    *slog.Logger
}

// NewBroadcaster wires a sender to the subscription storage.
func NewBroadcaster(sender Sender, repo Repo, c clock.Clock, log *slog.Logger) *Broadcaster {
	if log == nil {
		log = slog.New(slog.DiscardHandler)
	}
	return &Broadcaster{sender: sender, repo: repo, clock: c, log: log}
}

// ErrNoSubscriptions is returned by Broadcast when no device is subscribed.
var ErrNoSubscriptions = errors.New("belum ada perangkat yang mengaktifkan notifikasi")

// Broadcast sends msg to all devices. Subscriptions answered with 404 or 410
// are deleted; successful ones get last_success_at updated.
func (b *Broadcaster) Broadcast(ctx context.Context, msg Message) (Result, error) {
	var res Result
	subs, err := b.repo.ListSubscriptions(ctx)
	if err != nil {
		return res, err
	}
	if len(subs) == 0 {
		return res, ErrNoSubscriptions
	}
	payload, err := json.Marshal(msg)
	if err != nil {
		return res, err
	}
	for _, sub := range subs {
		status, err := b.sender.Send(ctx, sub, payload)
		switch {
		case err != nil:
			res.Failed++
			res.Retryable++
			b.log.Warn("push gagal dikirim", "endpoint", endpointHost(sub.Endpoint), "err", err)
		case status >= 200 && status < 300:
			res.Sent++
			if err := b.repo.MarkSuccess(ctx, sub.Endpoint, b.clock.Now()); err != nil {
				b.log.Warn("catat push sukses gagal", "err", err)
			}
		case status == http.StatusNotFound || status == http.StatusGone:
			res.Failed++
			res.Gone++
			if err := b.repo.DeleteSubscription(ctx, sub.Endpoint); err != nil {
				b.log.Warn("hapus subscription gagal", "err", err)
			} else {
				b.log.Info("subscription kedaluwarsa dihapus", "endpoint", endpointHost(sub.Endpoint), "status", status)
			}
		case status == http.StatusTooManyRequests || status >= 500:
			res.Failed++
			res.Retryable++
			b.log.Warn("push service menolak sementara", "endpoint", endpointHost(sub.Endpoint), "status", status)
		default:
			res.Failed++
			b.log.Warn("push ditolak", "endpoint", endpointHost(sub.Endpoint), "status", status)
		}
	}
	return res, nil
}

// endpointHost keeps logs free of the secret part of push endpoints.
func endpointHost(endpoint string) string {
	rest := strings.TrimPrefix(endpoint, "https://")
	if i := strings.IndexByte(rest, '/'); i >= 0 {
		return rest[:i]
	}
	return rest
}
