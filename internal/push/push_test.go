package push

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"crypto/ecdh"
	"crypto/rand"

	"kumlod/internal/clock"
)

type memRepo struct {
	subs    []Subscription
	deleted []string
	success []string
}

func (m *memRepo) ListSubscriptions(context.Context) ([]Subscription, error) { return m.subs, nil }
func (m *memRepo) DeleteSubscription(_ context.Context, e string) error {
	m.deleted = append(m.deleted, e)
	return nil
}
func (m *memRepo) MarkSuccess(_ context.Context, e string, _ time.Time) error {
	m.success = append(m.success, e)
	return nil
}

type fakeSender struct {
	status map[string]int
	err    map[string]error
	got    [][]byte
}

func (f *fakeSender) Send(_ context.Context, sub Subscription, payload []byte) (int, error) {
	f.got = append(f.got, payload)
	if err := f.err[sub.Endpoint]; err != nil {
		return 0, err
	}
	return f.status[sub.Endpoint], nil
}

func TestBroadcast(t *testing.T) {
	repo := &memRepo{subs: []Subscription{
		{Endpoint: "https://ok"}, {Endpoint: "https://gone"}, {Endpoint: "https://missing"},
		{Endpoint: "https://busy"}, {Endpoint: "https://down"}, {Endpoint: "https://bad"},
	}}
	sender := &fakeSender{
		status: map[string]int{"https://ok": 201, "https://gone": 410, "https://missing": 404, "https://busy": 429, "https://bad": 400},
		err:    map[string]error{"https://down": errors.New("dial tcp: timeout")},
	}
	b := NewBroadcaster(sender, repo, clock.Real{}, nil)
	res, err := b.Broadcast(context.Background(), Message{Title: "Hai", Body: "Tes", URL: "/"})
	if err != nil {
		t.Fatal(err)
	}
	want := Result{Sent: 1, Failed: 5, Gone: 2, Retryable: 2}
	if res != want {
		t.Errorf("result %+v want %+v", res, want)
	}
	if len(repo.deleted) != 2 || len(repo.success) != 1 || repo.success[0] != "https://ok" {
		t.Errorf("repo: deleted %v success %v", repo.deleted, repo.success)
	}
	var msg Message
	if err := json.Unmarshal(sender.got[0], &msg); err != nil || msg.Title != "Hai" || msg.URL != "/" {
		t.Errorf("payload: %s", sender.got[0])
	}

	empty := NewBroadcaster(sender, &memRepo{}, clock.Real{}, nil)
	if _, err := empty.Broadcast(context.Background(), Message{}); !errors.Is(err, ErrNoSubscriptions) {
		t.Errorf("no subs: %v", err)
	}
}

func TestGenerateKeys(t *testing.T) {
	k, err := GenerateKeys()
	if err != nil {
		t.Fatal(err)
	}
	pub, err := base64.RawURLEncoding.DecodeString(k.PublicKey)
	if err != nil || len(pub) != 65 || pub[0] != 4 {
		t.Errorf("public key: %d bytes, %v", len(pub), err)
	}
	priv, err := base64.RawURLEncoding.DecodeString(k.PrivateKey)
	if err != nil || len(priv) != 32 {
		t.Errorf("private key: %d bytes, %v", len(priv), err)
	}
}

// TestWebPushSend checks that a real encrypted request reaches the push service
// with VAPID authorization and the expected headers.
func TestWebPushSend(t *testing.T) {
	var gotAuth, gotTTL, gotUrgency, gotEncoding string
	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		gotTTL = r.Header.Get("TTL")
		gotUrgency = r.Header.Get("Urgency")
		gotEncoding = r.Header.Get("Content-Encoding")
		w.WriteHeader(http.StatusCreated)
	}))
	defer srv.Close()

	keys, _ := GenerateKeys()
	// A browser-side key pair for the subscription.
	ua, _ := ecdh.P256().GenerateKey(rand.Reader)
	authSecret := make([]byte, 16)
	rand.Read(authSecret)
	sub := Subscription{
		Endpoint: srv.URL + "/push/abc",
		P256dh:   base64.RawURLEncoding.EncodeToString(ua.PublicKey().Bytes()),
		Auth:     base64.RawURLEncoding.EncodeToString(authSecret),
	}
	wp := NewWebPush(keys, "mailto:admin@example.com")
	wp.client = srv.Client()
	status, err := wp.Send(context.Background(), sub, []byte(`{"title":"x"}`))
	if err != nil || status != http.StatusCreated {
		t.Fatalf("send: %d %v", status, err)
	}
	if gotTTL != "43200" || gotUrgency != "high" || gotEncoding != "aes128gcm" {
		t.Errorf("headers: ttl=%q urgency=%q encoding=%q", gotTTL, gotUrgency, gotEncoding)
	}
	if len(gotAuth) < 20 || gotAuth[:6] != "vapid " {
		t.Errorf("authorization: %q", gotAuth)
	}
}
