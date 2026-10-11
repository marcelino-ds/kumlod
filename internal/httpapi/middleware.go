package httpapi

import (
	"context"
	"errors"
	"net"
	"net/http"
	"runtime/debug"
	"strconv"
	"strings"
	"time"

	"kumlod/internal/api"
	"kumlod/internal/auth"
	"kumlod/internal/domain"
	"kumlod/internal/store"
)

// CSRFHeader and CSRFValue must accompany every state-changing request.
const (
	CSRFHeader = "X-Requested-With"
	CSRFValue  = "kumlod"
)

// apiCSP is sent with API responses; HTML pages get their own policy from webui.
const apiCSP = "default-src 'none'; frame-ancestors 'none'"

type statusWriter struct {
	http.ResponseWriter
	status int
	bytes  int64
}

func (w *statusWriter) WriteHeader(code int) {
	if w.status == 0 {
		w.status = code
	}
	w.ResponseWriter.WriteHeader(code)
}

func (w *statusWriter) Write(b []byte) (int, error) {
	if w.status == 0 {
		w.status = http.StatusOK
	}
	n, err := w.ResponseWriter.Write(b)
	w.bytes += int64(n)
	return n, err
}

func (w *statusWriter) Unwrap() http.ResponseWriter { return w.ResponseWriter }

func (s *Server) recoverer(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sw, ok := w.(*statusWriter)
		defer func() {
			rec := recover()
			if rec == nil {
				return
			}
			if rec == http.ErrAbortHandler {
				panic(rec)
			}
			s.log.Error("panic", "method", r.Method, "path", r.URL.Path, "panic", rec, "stack", string(debug.Stack()))
			if !ok || sw.status == 0 {
				writeError(w, http.StatusInternalServerError, api.Internal, "Terjadi kesalahan di server", nil)
			}
		}()
		next.ServeHTTP(w, r)
	})
}

func (s *Server) logRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		sw := &statusWriter{ResponseWriter: w}
		defer func() {
			status := sw.status
			if status == 0 {
				status = http.StatusOK
			}
			level := s.log.Info
			if !strings.HasPrefix(r.URL.Path, "/api/") || r.URL.Path == "/api/health" {
				level = s.log.Debug
			}
			if status >= 500 {
				level = s.log.Error
			}
			level("http",
				"method", r.Method,
				"path", r.URL.Path,
				"status", status,
				"bytes", sw.bytes,
				"duration_ms", time.Since(start).Milliseconds())
		}()
		next.ServeHTTP(sw, r)
	})
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "same-origin")
		h.Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
		h.Set("Cross-Origin-Opener-Policy", "same-origin")
		next.ServeHTTP(w, r)
	})
}

// publicPaths do not need a session.
var publicPaths = map[string]bool{
	"/api/health":     true,
	"/api/auth/login": true,
}

const uploadPath = "/api/materials/upload"

// apiGuard applies body limits, CSRF protection, and session authentication to /api/.
func (s *Server) apiGuard(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.URL.Path, "/api/") {
			next.ServeHTTP(w, r)
			return
		}
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Content-Security-Policy", apiCSP)

		limit := int64(MaxJSONBody)
		if r.URL.Path == uploadPath {
			limit = s.opts.MaxUploadBytes + 1<<20
		}
		if r.ContentLength > limit {
			writeError(w, http.StatusRequestEntityTooLarge, api.FileTooLarge, tooLargeMessage(r.URL.Path, s.opts.MaxUploadBytes), nil)
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, limit)

		switch r.Method {
		case http.MethodGet, http.MethodHead, http.MethodOptions:
		default:
			if r.Header.Get(CSRFHeader) != CSRFValue {
				writeError(w, http.StatusForbidden, api.CsrfFailed, "Request ditolak: header X-Requested-With tidak ada", nil)
				return
			}
		}

		if publicPaths[r.URL.Path] {
			next.ServeHTTP(w, r)
			return
		}
		info, err := s.authenticate(w, r)
		if err != nil {
			if errors.Is(err, errUnauthenticated) {
				writeError(w, http.StatusUnauthorized, api.Unauthenticated, "Sesi berakhir. Silakan login lagi.", nil)
				return
			}
			s.fail(w, r, err)
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), sessionKey{}, info)))
	})
}

func formatMB(b int64) string { return strconv.FormatInt(b>>20, 10) + " MB" }

func tooLargeMessage(path string, maxUpload int64) string {
	if path == uploadPath {
		return "Ukuran file melebihi batas " + formatMB(maxUpload)
	}
	return "Ukuran request melebihi batas 1 MB"
}

type sessionKey struct{}

type sessionInfo struct {
	Session store.Session
	User    store.User
}

var errUnauthenticated = errors.New("unauthenticated")

func currentSession(ctx context.Context) *sessionInfo {
	info, _ := ctx.Value(sessionKey{}).(*sessionInfo)
	return info
}

// authenticate validates the session cookie, refreshes last_seen_at at most
// every 5 minutes, and extends sessions with less than 15 days left.
func (s *Server) authenticate(w http.ResponseWriter, r *http.Request) (*sessionInfo, error) {
	c, err := r.Cookie(auth.CookieName)
	if err != nil || !auth.PlausibleToken(c.Value) {
		return nil, errUnauthenticated
	}
	ctx := r.Context()
	id := auth.HashToken(c.Value)
	sess, user, err := s.store.GetSession(ctx, id)
	if errors.Is(err, domain.ErrNotFound) {
		return nil, errUnauthenticated
	}
	if err != nil {
		return nil, err
	}
	now := s.clock.Now()
	if !now.Before(sess.ExpiresAt) {
		_ = s.store.DeleteSession(ctx, id)
		return nil, errUnauthenticated
	}
	renew := sess.ExpiresAt.Sub(now) < auth.SessionRenewBelow
	if renew || now.Sub(sess.LastSeenAt) >= auth.SessionTouchEvery {
		expires := sess.ExpiresAt
		if renew {
			expires = now.Add(auth.SessionTTL)
		}
		if err := s.store.TouchSession(ctx, id, now, expires); err != nil {
			s.log.Warn("perbarui sesi gagal", "err", err)
		} else {
			sess.LastSeenAt, sess.ExpiresAt = now, expires
			if renew {
				s.setSessionCookie(w, c.Value)
			}
		}
	}
	return &sessionInfo{Session: sess, User: user}, nil
}

func (s *Server) setSessionCookie(w http.ResponseWriter, token string) {
	http.SetCookie(w, &http.Cookie{
		Name:     auth.CookieName,
		Value:    token,
		Path:     "/",
		MaxAge:   int(auth.SessionTTL / time.Second),
		HttpOnly: true,
		Secure:   s.opts.CookieSecure,
		SameSite: http.SameSiteLaxMode,
	})
}

func (s *Server) clearSessionCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     auth.CookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   s.opts.CookieSecure,
		SameSite: http.SameSiteLaxMode,
	})
}

// clientIP returns the client address. With TrustProxy, the last
// X-Forwarded-For entry (the one added by the local reverse proxy) is used.
func (s *Server) clientIP(r *http.Request) string {
	if s.opts.TrustProxy {
		if vals := r.Header.Values("X-Forwarded-For"); len(vals) > 0 {
			parts := strings.Split(vals[len(vals)-1], ",")
			ip := strings.TrimSpace(parts[len(parts)-1])
			if net.ParseIP(ip) != nil {
				return ip
			}
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
