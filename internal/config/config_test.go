package config

import (
	"os"
	"path/filepath"
	"testing"
)

func lookup(m map[string]string) func(string) (string, bool) {
	return func(k string) (string, bool) { v, ok := m[k]; return v, ok }
}

func TestFromEnvDefaults(t *testing.T) {
	cfg, err := FromEnv(lookup(nil))
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Addr != "127.0.0.1:8080" || cfg.DataDir != "./data" || cfg.Dev || !cfg.CookieSecure || cfg.TrustProxy ||
		cfg.MaxUploadMB != 50 || cfg.LogFormat != "json" || cfg.VAPIDSubject != "mailto:admin@localhost" {
		t.Errorf("defaults: %+v", cfg)
	}
	if cfg.MaxUploadBytes() != 50<<20 || filepath.Base(cfg.DBPath()) != "kumlod.db" {
		t.Errorf("derived: %d %s", cfg.MaxUploadBytes(), cfg.DBPath())
	}
}

func TestFromEnvDev(t *testing.T) {
	cfg, err := FromEnv(lookup(map[string]string{"KUMLOD_DEV": "true", "KUMLOD_MAX_UPLOAD_MB": "10"}))
	if err != nil {
		t.Fatal(err)
	}
	if !cfg.Dev || cfg.CookieSecure || cfg.LogFormat != "text" || cfg.MaxUploadMB != 10 {
		t.Errorf("dev: %+v", cfg)
	}
	cfg, _ = FromEnv(lookup(map[string]string{"KUMLOD_DEV": "true", "KUMLOD_COOKIE_SECURE": "true"}))
	if !cfg.CookieSecure {
		t.Error("explicit KUMLOD_COOKIE_SECURE must win")
	}
}

func TestFromEnvErrors(t *testing.T) {
	bad := []map[string]string{
		{"KUMLOD_DEV": "maybe"},
		{"KUMLOD_MAX_UPLOAD_MB": "0"},
		{"KUMLOD_LOG_FORMAT": "xml"},
		{"KUMLOD_VAPID_SUBJECT": "admin@example.com"},
	}
	for _, m := range bad {
		if _, err := FromEnv(lookup(m)); err == nil {
			t.Errorf("expected error for %v", m)
		}
	}
}

func TestLoadDotEnv(t *testing.T) {
	path := filepath.Join(t.TempDir(), ".env")
	content := "# komentar\nKUMLOD_TEST_A=satu\nexport KUMLOD_TEST_B=\"dua tiga\"\nKUMLOD_TEST_C=empat # catatan\nKUMLOD_TEST_D='lima'\n\n"
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("KUMLOD_TEST_A", "sudah-ada")
	for _, k := range []string{"KUMLOD_TEST_B", "KUMLOD_TEST_C", "KUMLOD_TEST_D"} {
		os.Unsetenv(k)
		t.Cleanup(func() { os.Unsetenv(k) })
	}
	if err := LoadDotEnv(path); err != nil {
		t.Fatal(err)
	}
	want := map[string]string{"KUMLOD_TEST_A": "sudah-ada", "KUMLOD_TEST_B": "dua tiga", "KUMLOD_TEST_C": "empat", "KUMLOD_TEST_D": "lima"}
	for k, v := range want {
		if got := os.Getenv(k); got != v {
			t.Errorf("%s = %q want %q", k, got, v)
		}
	}
	if err := LoadDotEnv(filepath.Join(t.TempDir(), "missing")); err != nil {
		t.Errorf("missing file: %v", err)
	}
	broken := filepath.Join(t.TempDir(), "broken")
	os.WriteFile(broken, []byte("TANPA_SAMA_DENGAN\n"), 0o600)
	if err := LoadDotEnv(broken); err == nil {
		t.Error("expected error for line without =")
	}
}
