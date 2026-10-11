package webui

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
)

func TestSPA(t *testing.T) {
	fsys := fstest.MapFS{
		"index.html":           {Data: []byte("<!doctype html><title>Kumlod</title>")},
		"sw.js":                {Data: []byte("self.addEventListener('push', () => {})")},
		"manifest.webmanifest": {Data: []byte(`{"name":"Kumlod"}`)},
		"assets/app-abc123.js": {Data: []byte("console.log(1)")},
		"icons/icon-192.png":   {Data: []byte("\x89PNG\r\n\x1a\n")},
	}
	h := New(fsys)
	tests := []struct {
		path, wantType, wantCache string
		wantStatus                int
		wantCSP                   bool
	}{
		{"/", "text/html; charset=utf-8", "no-cache", 200, true},
		{"/tugas/123", "text/html; charset=utf-8", "no-cache", 200, true},
		{"/matkul/abc/edit", "text/html; charset=utf-8", "no-cache", 200, true},
		{"/assets/app-abc123.js", "text/javascript; charset=utf-8", "public, max-age=31536000, immutable", 200, false},
		{"/assets/missing.js", "", "", 404, false},
		{"/sw.js", "text/javascript; charset=utf-8", "no-cache", 200, false},
		{"/manifest.webmanifest", "application/manifest+json", "no-cache", 200, false},
		{"/icons/icon-192.png", "image/png", "public, max-age=3600", 200, false},
		{"/missing.png", "", "", 404, false},
		{"/icons/missing.png", "", "", 404, false},
	}
	for _, tt := range tests {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, tt.path, nil))
		if rec.Code != tt.wantStatus {
			t.Errorf("%s: status %d want %d", tt.path, rec.Code, tt.wantStatus)
			continue
		}
		if tt.wantStatus != 200 {
			continue
		}
		if got := rec.Header().Get("Content-Type"); got != tt.wantType {
			t.Errorf("%s: type %q want %q", tt.path, got, tt.wantType)
		}
		if got := rec.Header().Get("Cache-Control"); got != tt.wantCache {
			t.Errorf("%s: cache %q want %q", tt.path, got, tt.wantCache)
		}
		if got := rec.Header().Get("Content-Security-Policy") != ""; got != tt.wantCSP {
			t.Errorf("%s: csp present %v want %v", tt.path, got, tt.wantCSP)
		}
	}

	// ETag revalidation.
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))
	etag := rec.Header().Get("ETag")
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("If-None-Match", etag)
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusNotModified {
		t.Errorf("revalidation: %d", rec.Code)
	}

	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/", nil))
	if rec.Code != http.StatusMethodNotAllowed {
		t.Errorf("POST: %d", rec.Code)
	}
}

func TestPlaceholder(t *testing.T) {
	h := New(fstest.MapFS{".gitkeep": {}})
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))
	if rec.Code != http.StatusServiceUnavailable || !strings.Contains(rec.Body.String(), "belum di-build") {
		t.Errorf("placeholder: %d %s", rec.Code, rec.Body.String())
	}
}
