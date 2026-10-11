// Package httpapi implements the REST API defined in api/openapi.yaml.
package httpapi

import (
	"context"
	"log/slog"
	"net/http"

	"kumlod/internal/api"
	"kumlod/internal/auth"
	"kumlod/internal/clock"
	"kumlod/internal/files"
	"kumlod/internal/push"
	"kumlod/internal/store"
)

// Pusher sends a notification to every subscribed device.
type Pusher interface {
	Broadcast(ctx context.Context, msg push.Message) (push.Result, error)
}

// Options configures the server.
type Options struct {
	Version        string
	CookieSecure   bool
	TrustProxy     bool
	MaxUploadBytes int64
	VAPIDPublicKey string
}

// Server implements api.ServerInterface.
type Server struct {
	store   *store.Store
	files   *files.Store
	push    Pusher
	clock   clock.Clock
	limiter *auth.Limiter
	log     *slog.Logger
	opts    Options
}

var _ api.ServerInterface = (*Server)(nil)

// New returns a Server.
func New(st *store.Store, fs *files.Store, p Pusher, c clock.Clock, log *slog.Logger, opts Options) *Server {
	if c == nil {
		c = clock.Real{}
	}
	if log == nil {
		log = slog.New(slog.DiscardHandler)
	}
	if opts.MaxUploadBytes <= 0 {
		opts.MaxUploadBytes = 50 << 20
	}
	return &Server{
		store:   st,
		files:   fs,
		push:    p,
		clock:   c,
		limiter: auth.NewLimiter(c, auth.LoginMaxAttempts, auth.LoginWindow),
		log:     log,
		opts:    opts,
	}
}

// Handler returns the full HTTP handler: the API under /api/ and fallback
// (the embedded frontend) for every other path.
func (s *Server) Handler(fallback http.Handler) http.Handler {
	mux := http.NewServeMux()
	api.HandlerWithOptions(s, api.StdHTTPServerOptions{
		BaseRouter:       mux,
		ErrorHandlerFunc: s.paramError,
	})
	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) {
		writeError(w, http.StatusNotFound, api.NotFound, "Endpoint tidak ditemukan", nil)
	})
	if fallback != nil {
		mux.Handle("/", fallback)
	}

	var h http.Handler = mux
	h = s.apiGuard(h)
	h = s.recoverer(h) // inside logRequests so it sees the statusWriter
	h = securityHeaders(h)
	h = s.logRequests(h)
	return h
}
