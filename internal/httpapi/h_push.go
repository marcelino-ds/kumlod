package httpapi

import (
	"encoding/base64"
	"errors"
	"net/http"
	"net/url"
	"strings"

	"kumlod/internal/api"
	"kumlod/internal/domain"
	"kumlod/internal/push"
	"kumlod/internal/store"
)

// GetPushPublicKey returns the VAPID public key for PushManager.subscribe.
func (s *Server) GetPushPublicKey(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, api.PushPublicKey{PublicKey: s.opts.VAPIDPublicKey})
}

func validPushKey(k string) bool {
	if k == "" || len(k) > maxPushKey {
		return false
	}
	k = strings.TrimRight(k, "=")
	_, err := base64.RawURLEncoding.DecodeString(k)
	if err != nil {
		_, err = base64.RawStdEncoding.DecodeString(k)
	}
	return err == nil
}

// SubscribePush stores this device's push subscription.
func (s *Server) SubscribePush(w http.ResponseWriter, r *http.Request) {
	var in api.PushSubscriptionInput
	if err := decodeJSON(r, &in); err != nil {
		s.fail(w, r, err)
		return
	}
	var v domain.Validator
	endpoint := strings.TrimSpace(in.Endpoint)
	u, err := url.Parse(endpoint)
	switch {
	case endpoint == "" || len(endpoint) > maxEndpoint:
		v.Add("endpoint", "Endpoint push tidak valid")
	case err != nil || u.Scheme != "https" || u.Host == "":
		v.Add("endpoint", "Endpoint push harus URL https")
	}
	v.Check(validPushKey(in.Keys.P256dh), "keys.p256dh", "Kunci p256dh tidak valid")
	v.Check(validPushKey(in.Keys.Auth), "keys.auth", "Kunci auth tidak valid")
	if err := v.Err(); err != nil {
		s.fail(w, r, err)
		return
	}
	ua := r.UserAgent()
	if len(ua) > 300 {
		ua = ua[:300]
	}
	if err := s.store.UpsertPushSubscription(r.Context(), store.PushSubscription{
		Endpoint: endpoint, P256dh: in.Keys.P256dh, Auth: in.Keys.Auth, UserAgent: ua,
	}); err != nil {
		s.fail(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// UnsubscribePush removes a device's subscription.
func (s *Server) UnsubscribePush(w http.ResponseWriter, r *http.Request) {
	var in api.PushUnsubscribeInput
	if err := decodeJSON(r, &in); err != nil {
		s.fail(w, r, err)
		return
	}
	if err := s.store.DeletePushSubscription(r.Context(), strings.TrimSpace(in.Endpoint)); err != nil {
		s.fail(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// SendTestPush sends a test notification to every device.
func (s *Server) SendTestPush(w http.ResponseWriter, r *http.Request) {
	if s.push == nil {
		writeJSON(w, http.StatusOK, api.PushTestResult{})
		return
	}
	res, err := s.push.Broadcast(r.Context(), push.Message{
		Title: "Notifikasi Kumlod aktif",
		Body:  "Kalau ini muncul, reminder tugas dan absen bakal sampai ke perangkat ini.",
		URL:   "/pengaturan",
		Tag:   "kumlod-test",
	})
	if errors.Is(err, push.ErrNoSubscriptions) {
		writeJSON(w, http.StatusOK, api.PushTestResult{})
		return
	}
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, api.PushTestResult{Sent: res.Sent, Failed: res.Failed})
}
