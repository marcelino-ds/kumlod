// Package config reads Kumlod configuration from environment variables and an optional .env file.
package config

import (
	"bufio"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// Config holds runtime configuration. See docs/DEVELOPMENT.md for the variables.
type Config struct {
	Addr         string
	DataDir      string
	Dev          bool
	CookieSecure bool
	TrustProxy   bool
	VAPIDSubject string
	MaxUploadMB  int
	LogFormat    string // "json" or "text"
}

// DBPath is the SQLite database file inside the data directory.
func (c Config) DBPath() string { return filepath.Join(c.DataDir, "kumlod.db") }

// FilesDir is the directory for uploaded material files.
func (c Config) FilesDir() string { return filepath.Join(c.DataDir, "files") }

// MaxUploadBytes is the upload limit in bytes.
func (c Config) MaxUploadBytes() int64 { return int64(c.MaxUploadMB) << 20 }

// Load reads .env from the working directory (without overriding variables that
// are already set) and then builds the configuration from the environment.
func Load() (Config, error) {
	if err := LoadDotEnv(".env"); err != nil {
		return Config{}, err
	}
	return FromEnv(os.LookupEnv)
}

// FromEnv builds the configuration using lookup to read variables.
func FromEnv(lookup func(string) (string, bool)) (Config, error) {
	get := func(key, def string) string {
		if v, ok := lookup(key); ok && strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
		return def
	}
	var errs []error
	parseBool := func(key string, def bool) bool {
		raw := get(key, "")
		if raw == "" {
			return def
		}
		b, err := strconv.ParseBool(raw)
		if err != nil {
			errs = append(errs, fmt.Errorf("%s: nilai boolean tidak valid %q", key, raw))
			return def
		}
		return b
	}

	cfg := Config{
		Addr:         get("KUMLOD_ADDR", "127.0.0.1:8080"),
		DataDir:      get("KUMLOD_DATA_DIR", "./data"),
		VAPIDSubject: get("KUMLOD_VAPID_SUBJECT", "mailto:admin@localhost"),
	}
	cfg.Dev = parseBool("KUMLOD_DEV", false)
	cfg.CookieSecure = parseBool("KUMLOD_COOKIE_SECURE", !cfg.Dev)
	cfg.TrustProxy = parseBool("KUMLOD_TRUST_PROXY", false)

	defaultFormat := "json"
	if cfg.Dev {
		defaultFormat = "text"
	}
	cfg.LogFormat = strings.ToLower(get("KUMLOD_LOG_FORMAT", defaultFormat))
	if cfg.LogFormat != "json" && cfg.LogFormat != "text" {
		errs = append(errs, fmt.Errorf("KUMLOD_LOG_FORMAT harus json atau text, bukan %q", cfg.LogFormat))
	}

	mb, err := strconv.Atoi(get("KUMLOD_MAX_UPLOAD_MB", "50"))
	if err != nil || mb < 1 || mb > 2048 {
		errs = append(errs, errors.New("KUMLOD_MAX_UPLOAD_MB harus bilangan bulat 1-2048"))
		mb = 50
	}
	cfg.MaxUploadMB = mb

	if !strings.HasPrefix(cfg.VAPIDSubject, "mailto:") && !strings.HasPrefix(cfg.VAPIDSubject, "https:") {
		errs = append(errs, errors.New("KUMLOD_VAPID_SUBJECT harus diawali mailto: atau https:"))
	}

	return cfg, errors.Join(errs...)
}

// LoadDotEnv sets variables from a KEY=VALUE file without overriding existing
// ones. A missing file is not an error. Lines starting with # are comments,
// an optional "export " prefix is accepted, and values may be quoted.
func LoadDotEnv(path string) error {
	f, err := os.Open(path)
	if errors.Is(err, fs.ErrNotExist) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("buka %s: %w", path, err)
	}
	defer f.Close()

	sc := bufio.NewScanner(f)
	lineNo := 0
	for sc.Scan() {
		lineNo++
		line := strings.TrimSpace(sc.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		line = strings.TrimPrefix(line, "export ")
		key, value, ok := strings.Cut(line, "=")
		if !ok {
			return fmt.Errorf("%s baris %d: format harus KEY=VALUE", path, lineNo)
		}
		key = strings.TrimSpace(key)
		value = unquote(strings.TrimSpace(value))
		if key == "" {
			return fmt.Errorf("%s baris %d: nama variabel kosong", path, lineNo)
		}
		if _, exists := os.LookupEnv(key); exists {
			continue
		}
		if err := os.Setenv(key, value); err != nil {
			return fmt.Errorf("%s baris %d: %w", path, lineNo, err)
		}
	}
	return sc.Err()
}

func unquote(v string) string {
	if len(v) >= 2 {
		if (v[0] == '"' && v[len(v)-1] == '"') || (v[0] == '\'' && v[len(v)-1] == '\'') {
			return v[1 : len(v)-1]
		}
	}
	// Strip trailing inline comments for unquoted values: KEY=value # comment
	if i := strings.Index(v, " #"); i >= 0 {
		return strings.TrimSpace(v[:i])
	}
	return v
}
