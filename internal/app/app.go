// Package app wires configuration, storage, the HTTP server, and the scheduler.
package app

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"time"

	"kumlod/internal/clock"
	"kumlod/internal/config"
	"kumlod/internal/db"
	"kumlod/internal/domain"
	"kumlod/internal/files"
	"kumlod/internal/httpapi"
	"kumlod/internal/push"
	"kumlod/internal/scheduler"
	"kumlod/internal/store"
	"kumlod/internal/webui"
)

// OpenStore opens the database, applies migrations, and returns a store.
func OpenStore(ctx context.Context, cfg config.Config, log *slog.Logger) (*store.Store, *sql.DB, error) {
	conn, err := db.Open(cfg.DBPath())
	if err != nil {
		return nil, nil, err
	}
	if err := db.Migrate(ctx, conn, log); err != nil {
		conn.Close()
		return nil, nil, err
	}
	return store.New(conn, clock.Real{}), conn, nil
}

// ensureVAPID returns the stored VAPID keys, creating them on first start.
func ensureVAPID(ctx context.Context, st *store.Store, log *slog.Logger) (push.Keys, error) {
	k, err := st.GetVAPIDKeys(ctx)
	if err == nil {
		return push.Keys{PublicKey: k.PublicKey, PrivateKey: k.PrivateKey}, nil
	}
	if !errors.Is(err, domain.ErrNotFound) {
		return push.Keys{}, err
	}
	gen, err := push.GenerateKeys()
	if err != nil {
		return push.Keys{}, err
	}
	k, err = st.InitVAPIDKeys(ctx, store.VAPIDKeys{PublicKey: gen.PublicKey, PrivateKey: gen.PrivateKey})
	if err != nil {
		return push.Keys{}, err
	}
	log.Info("kunci VAPID baru dibuat")
	return push.Keys{PublicKey: k.PublicKey, PrivateKey: k.PrivateKey}, nil
}

// pushRepo adapts the store to push.Repo.
type pushRepo struct{ st *store.Store }

func (p pushRepo) ListSubscriptions(ctx context.Context) ([]push.Subscription, error) {
	list, err := p.st.ListPushSubscriptions(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]push.Subscription, 0, len(list))
	for _, s := range list {
		out = append(out, push.Subscription{Endpoint: s.Endpoint, P256dh: s.P256dh, Auth: s.Auth})
	}
	return out, nil
}

func (p pushRepo) DeleteSubscription(ctx context.Context, endpoint string) error {
	return p.st.DeletePushSubscription(ctx, endpoint)
}

func (p pushRepo) MarkSuccess(ctx context.Context, endpoint string, at time.Time) error {
	return p.st.MarkPushSuccess(ctx, endpoint, at)
}

// Run starts the server and scheduler and blocks until ctx is cancelled.
func Run(ctx context.Context, cfg config.Config, log *slog.Logger, version string) error {
	st, conn, err := OpenStore(ctx, cfg, log)
	if err != nil {
		return err
	}
	defer conn.Close()

	fstore, err := files.New(cfg.FilesDir())
	if err != nil {
		return err
	}
	if n, err := fstore.CleanTemp(time.Hour); err != nil {
		log.Warn("bersihkan upload sementara gagal", "err", err)
	} else if n > 0 {
		log.Info("upload sementara yang tertinggal dihapus", "count", n)
	}

	if n, err := st.CountUsers(ctx); err == nil && n == 0 {
		log.Warn("belum ada akun. Buat dengan: kumlod user create <username>")
	}

	keys, err := ensureVAPID(ctx, st, log)
	if err != nil {
		return fmt.Errorf("siapkan kunci VAPID: %w", err)
	}
	clk := clock.Real{}
	broadcaster := push.NewBroadcaster(push.NewWebPush(keys, cfg.VAPIDSubject), pushRepo{st}, clk, log)

	api := httpapi.New(st, fstore, broadcaster, clk, log, httpapi.Options{
		Version:        version,
		CookieSecure:   cfg.CookieSecure,
		TrustProxy:     cfg.TrustProxy,
		MaxUploadBytes: cfg.MaxUploadBytes(),
		VAPIDPublicKey: keys.PublicKey,
	})
	srv := &http.Server{
		Addr:              cfg.Addr,
		Handler:           api.Handler(webui.Handler()),
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       120 * time.Second,
		MaxHeaderBytes:    64 << 10,
		ErrorLog:          slog.NewLogLogger(log.Handler(), slog.LevelWarn),
	}

	ln, err := net.Listen("tcp", cfg.Addr)
	if err != nil {
		return fmt.Errorf("listen %s: %w", cfg.Addr, err)
	}

	schedCtx, stopSched := context.WithCancel(context.Background())
	schedDone := make(chan struct{})
	go func() {
		defer close(schedDone)
		scheduler.New(st, broadcaster, clk, log).Run(schedCtx)
	}()

	serveErr := make(chan error, 1)
	go func() { serveErr <- srv.Serve(ln) }()
	log.Info("Kumlod jalan", "addr", cfg.Addr, "version", version, "data_dir", cfg.DataDir, "dev", cfg.Dev)

	var runErr error
	select {
	case <-ctx.Done():
		log.Info("mematikan server")
	case err := <-serveErr:
		if !errors.Is(err, http.ErrServerClosed) {
			runErr = err
		}
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Warn("shutdown server tidak bersih", "err", err)
	}
	stopSched()
	<-schedDone
	return runErr
}
