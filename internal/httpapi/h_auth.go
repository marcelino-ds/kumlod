package httpapi

import (
	"context"
	"errors"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"

	"kumlod/internal/api"
	"kumlod/internal/auth"
	"kumlod/internal/domain"
	"kumlod/internal/store"
)

// GetHealth reports server status without requiring a session.
func (s *Server) GetHealth(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	if err := s.store.DB().PingContext(ctx); err != nil {
		s.log.Error("health: database tidak bisa diakses", "err", err)
		writeJSON(w, http.StatusServiceUnavailable, api.Health{Status: "database_error", Version: s.opts.Version})
		return
	}
	writeJSON(w, http.StatusOK, api.Health{Status: "ok", Version: s.opts.Version})
}

const msgBadCredentials = "Username atau password salah"

// Login checks credentials and starts a session.
func (s *Server) Login(w http.ResponseWriter, r *http.Request) {
	var in api.LoginRequest
	if err := decodeJSON(r, &in); err != nil {
		s.fail(w, r, err)
		return
	}
	var v domain.Validator
	username := strings.TrimSpace(in.Username)
	checkLen(&v, "username", username, 1, 64, "Username")
	checkLen(&v, "password", in.Password, 1, auth.MaxPasswordLen, "Password")
	if err := v.Err(); err != nil {
		s.fail(w, r, err)
		return
	}

	ip := s.clientIP(r)
	if !s.limiter.Attempt(ip) {
		wait := s.limiter.RetryAfter(ip)
		w.Header().Set("Retry-After", strconv.Itoa(int(math.Ceil(wait.Seconds()))))
		writeError(w, http.StatusTooManyRequests, api.RateLimited,
			"Terlalu banyak percobaan login. Coba lagi dalam "+strconv.Itoa(int(math.Ceil(wait.Minutes())))+" menit.", nil)
		return
	}

	ctx := r.Context()
	user, err := s.store.GetUserByUsername(ctx, username)
	if errors.Is(err, domain.ErrNotFound) {
		auth.BurnTime(in.Password)
		s.log.Warn("login gagal", "ip", ip, "reason", "unknown_user")
		writeError(w, http.StatusUnauthorized, api.Unauthenticated, msgBadCredentials, nil)
		return
	}
	if err != nil {
		s.fail(w, r, err)
		return
	}
	ok, err := auth.VerifyPassword(in.Password, user.PasswordHash)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	if !ok {
		s.log.Warn("login gagal", "ip", ip, "reason", "wrong_password")
		writeError(w, http.StatusUnauthorized, api.Unauthenticated, msgBadCredentials, nil)
		return
	}
	s.limiter.Reset(ip)

	token, id, err := auth.NewToken()
	if err != nil {
		s.fail(w, r, err)
		return
	}
	now := s.clock.Now()
	ua := r.UserAgent()
	if len(ua) > 300 {
		ua = ua[:300]
	}
	if err := s.store.CreateSession(ctx, store.Session{
		ID: id, UserID: user.ID, UserAgent: ua, CreatedAt: now, LastSeenAt: now, ExpiresAt: now.Add(auth.SessionTTL),
	}); err != nil {
		s.fail(w, r, err)
		return
	}
	s.setSessionCookie(w, token)
	s.log.Info("login berhasil", "ip", ip, "user", user.Username)
	writeJSON(w, http.StatusOK, api.Me{User: api.User{Id: user.ID, Username: user.Username}})
}

// Logout ends the current session.
func (s *Server) Logout(w http.ResponseWriter, r *http.Request) {
	info := currentSession(r.Context())
	if err := s.store.DeleteSession(r.Context(), info.Session.ID); err != nil {
		s.fail(w, r, err)
		return
	}
	s.clearSessionCookie(w)
	w.WriteHeader(http.StatusNoContent)
}

// GetMe returns the logged-in user.
func (s *Server) GetMe(w http.ResponseWriter, r *http.Request) {
	info := currentSession(r.Context())
	writeJSON(w, http.StatusOK, api.Me{User: api.User{Id: info.User.ID, Username: info.User.Username}})
}

// ChangePassword verifies the current password, sets a new one, and revokes
// every other session.
func (s *Server) ChangePassword(w http.ResponseWriter, r *http.Request) {
	var in api.ChangePasswordRequest
	if err := decodeJSON(r, &in); err != nil {
		s.fail(w, r, err)
		return
	}
	info := currentSession(r.Context())
	var v domain.Validator
	switch n := domain.RuneLen(in.NewPassword); {
	case n < auth.MinPasswordLen:
		v.Add("new_password", "Password baru minimal "+strconv.Itoa(auth.MinPasswordLen)+" karakter")
	case n > auth.MaxPasswordLen:
		v.Add("new_password", "Password baru maksimal "+strconv.Itoa(auth.MaxPasswordLen)+" karakter")
	}
	if in.CurrentPassword == "" {
		v.Add("current_password", "Password lama wajib diisi")
	} else if domain.RuneLen(in.CurrentPassword) > auth.MaxPasswordLen {
		v.Add("current_password", "Password lama salah")
	}
	if err := v.Err(); err != nil {
		s.fail(w, r, err)
		return
	}
	ok, err := auth.VerifyPassword(in.CurrentPassword, info.User.PasswordHash)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	if !ok {
		s.fail(w, r, domain.Invalid("current_password", "Password lama salah"))
		return
	}
	hash, err := auth.HashPassword(in.NewPassword)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	if err := s.store.ChangePassword(r.Context(), info.User.ID, hash, info.Session.ID); err != nil {
		s.fail(w, r, err)
		return
	}
	s.log.Info("password diganti, sesi lain dicabut", "user", info.User.Username)
	w.WriteHeader(http.StatusNoContent)
}
