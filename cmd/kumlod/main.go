// Command kumlod runs the Kumlod server and its admin CLI.
package main

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"os"
	"os/signal"
	"runtime/debug"
	"strings"
	"syscall"
	_ "time/tzdata" // embed the time zone database so any IANA zone works on every OS

	"golang.org/x/term"

	"kumlod/internal/app"
	"kumlod/internal/auth"
	"kumlod/internal/config"
	"kumlod/internal/domain"
)

// version is set at build time with -ldflags "-X main.version=...".
var version = "dev"

const usage = `Kumlod - asisten kuliah pribadi

Pemakaian:
  kumlod [serve]                               jalankan server (default)
  kumlod migrate                               jalankan migrasi database
  kumlod user create <username> [--password-stdin]
  kumlod user passwd <username> [--password-stdin]
  kumlod version

Konfigurasi dibaca dari environment dan file .env (lihat docs/DEVELOPMENT.md).
`

// defaultMemoryLimit is the soft Go heap limit when GOMEMLIMIT is not set. The
// PRD budget is 100 MB of RAM; the live heap stays far below this except for
// the 64 MiB argon2id buffer during a login.
const defaultMemoryLimit = 100 << 20

func main() {
	if _, set := os.LookupEnv("GOMEMLIMIT"); !set {
		debug.SetMemoryLimit(defaultMemoryLimit)
	}
	os.Exit(run(os.Args[1:], os.Stdin, os.Stdout, os.Stderr))
}

func run(args []string, stdin io.Reader, stdout, stderr io.Writer) int {
	cmd := "serve"
	if len(args) > 0 {
		cmd, args = args[0], args[1:]
	}
	switch cmd {
	case "version", "--version", "-v":
		fmt.Fprintln(stdout, version)
		return 0
	case "help", "--help", "-h":
		fmt.Fprint(stdout, usage)
		return 0
	}

	cfg, err := config.Load()
	if err != nil {
		fmt.Fprintln(stderr, "konfigurasi tidak valid:", err)
		return 1
	}
	log := newLogger(cfg, stderr)

	switch cmd {
	case "serve":
		ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
		defer stop()
		if err := app.Run(ctx, cfg, log, version); err != nil {
			log.Error("server berhenti dengan error", "err", err)
			return 1
		}
		return 0
	case "migrate":
		_, conn, err := app.OpenStore(context.Background(), cfg, log)
		if err != nil {
			fmt.Fprintln(stderr, "migrasi gagal:", err)
			return 1
		}
		conn.Close()
		fmt.Fprintln(stdout, "Migrasi selesai.")
		return 0
	case "user":
		return runUser(cfg, args, stdin, stdout, stderr)
	}
	fmt.Fprintf(stderr, "perintah tidak dikenal: %s\n\n%s", cmd, usage)
	return 2
}

func newLogger(cfg config.Config, w io.Writer) *slog.Logger {
	opts := &slog.HandlerOptions{Level: slog.LevelInfo}
	if cfg.Dev {
		opts.Level = slog.LevelDebug
	}
	if cfg.LogFormat == "text" {
		return slog.New(slog.NewTextHandler(w, opts))
	}
	return slog.New(slog.NewJSONHandler(w, opts))
}

func runUser(cfg config.Config, args []string, stdin io.Reader, stdout, stderr io.Writer) int {
	var positional []string
	fromStdin := false
	for _, a := range args {
		switch a {
		case "--password-stdin":
			fromStdin = true
		default:
			if strings.HasPrefix(a, "-") {
				fmt.Fprintf(stderr, "opsi tidak dikenal: %s\n", a)
				return 2
			}
			positional = append(positional, a)
		}
	}
	if len(positional) != 2 || (positional[0] != "create" && positional[0] != "passwd") {
		fmt.Fprint(stderr, usage)
		return 2
	}
	sub, username := positional[0], strings.TrimSpace(positional[1])
	if username == "" || len(username) > 64 || strings.ContainsAny(username, " \t\r\n") {
		fmt.Fprintln(stderr, "username harus 1-64 karakter tanpa spasi")
		return 2
	}

	ctx := context.Background()
	st, conn, err := app.OpenStore(ctx, cfg, slog.New(slog.DiscardHandler))
	if err != nil {
		fmt.Fprintln(stderr, "buka database gagal:", err)
		return 1
	}
	defer conn.Close()

	if sub == "create" {
		if n, err := st.CountUsers(ctx); err != nil {
			fmt.Fprintln(stderr, err)
			return 1
		} else if n > 0 {
			fmt.Fprintln(stderr, "akun sudah ada. Kumlod hanya untuk satu pengguna; pakai `kumlod user passwd <username>` untuk ganti password.")
			return 1
		}
	}

	password, err := readPassword(stdin, stderr, fromStdin)
	if err != nil {
		fmt.Fprintln(stderr, err)
		return 1
	}
	if err := auth.ValidateNewPassword(password); err != nil {
		fmt.Fprintln(stderr, err)
		return 1
	}
	hash, err := auth.HashPassword(password)
	if err != nil {
		fmt.Fprintln(stderr, err)
		return 1
	}

	switch sub {
	case "create":
		if _, err := st.CreateUser(ctx, username, hash); err != nil {
			fmt.Fprintln(stderr, "buat akun gagal:", err)
			return 1
		}
		fmt.Fprintf(stdout, "Akun %s dibuat.\n", username)
	case "passwd":
		u, err := st.GetUserByUsername(ctx, username)
		if errors.Is(err, domain.ErrNotFound) {
			fmt.Fprintf(stderr, "akun %s tidak ditemukan\n", username)
			return 1
		}
		if err != nil {
			fmt.Fprintln(stderr, err)
			return 1
		}
		if err := st.ChangePassword(ctx, u.ID, hash, ""); err != nil {
			fmt.Fprintln(stderr, "ganti password gagal:", err)
			return 1
		}
		fmt.Fprintf(stdout, "Password %s diganti. Semua sesi login dicabut.\n", u.Username)
	}
	return 0
}

// readPassword reads one line from stdin with --password-stdin, or prompts
// twice without echo on a terminal.
func readPassword(stdin io.Reader, stderr io.Writer, fromStdin bool) (string, error) {
	if fromStdin {
		line, err := bufio.NewReader(stdin).ReadString('\n')
		if err != nil && !errors.Is(err, io.EOF) {
			return "", err
		}
		return strings.TrimRight(line, "\r\n"), nil
	}
	f, ok := stdin.(*os.File)
	if !ok || !term.IsTerminal(int(f.Fd())) {
		return "", errors.New("stdin bukan terminal; pakai --password-stdin")
	}
	fmt.Fprint(stderr, "Password: ")
	p1, err := term.ReadPassword(int(f.Fd()))
	fmt.Fprintln(stderr)
	if err != nil {
		return "", err
	}
	fmt.Fprint(stderr, "Ulangi password: ")
	p2, err := term.ReadPassword(int(f.Fd()))
	fmt.Fprintln(stderr)
	if err != nil {
		return "", err
	}
	if string(p1) != string(p2) {
		return "", errors.New("password tidak sama")
	}
	return string(p1), nil
}
