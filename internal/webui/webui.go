// Package webui serves the embedded frontend build with an SPA fallback.
package webui

import (
	"bytes"
	"crypto/sha256"
	"embed"
	"encoding/hex"
	"io/fs"
	"mime"
	"net/http"
	"path"
	"strings"
	"sync"
	"time"
)

//go:embed all:dist
var dist embed.FS

// CSP is the Content-Security-Policy for HTML pages.
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
	"img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; worker-src 'self'; " +
	"manifest-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"

// Handler serves the embedded build in internal/webui/dist.
func Handler() http.Handler {
	sub, err := fs.Sub(dist, "dist")
	if err != nil {
		return placeholder{}
	}
	return New(sub)
}

// New serves fsys as a single-page app. When fsys has no index.html it serves
// a page explaining that the frontend has not been built.
func New(fsys fs.FS) http.Handler {
	if _, err := fs.Stat(fsys, "index.html"); err != nil {
		return placeholder{}
	}
	return &spa{fsys: fsys, etags: map[string]string{}}
}

type spa struct {
	fsys  fs.FS
	mu    sync.Mutex
	etags map[string]string
}

var contentTypes = map[string]string{
	".html":        "text/html; charset=utf-8",
	".js":          "text/javascript; charset=utf-8",
	".mjs":         "text/javascript; charset=utf-8",
	".css":         "text/css; charset=utf-8",
	".json":        "application/json",
	".webmanifest": "application/manifest+json",
	".svg":         "image/svg+xml",
	".png":         "image/png",
	".ico":         "image/x-icon",
	".webp":        "image/webp",
	".woff2":       "font/woff2",
	".txt":         "text/plain; charset=utf-8",
	".map":         "application/json",
}

// noCache files must always be revalidated so updates reach the PWA quickly.
var noCache = map[string]bool{
	"index.html": true, "sw.js": true, "manifest.webmanifest": true, "registerSW.js": true,
}

func (h *spa) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.Header().Set("Allow", "GET, HEAD")
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}
	name := strings.TrimPrefix(path.Clean("/"+r.URL.Path), "/")
	if name == "" {
		name = "index.html"
	}
	data, err := fs.ReadFile(h.fsys, name)
	if err != nil {
		// Missing static files are real 404s; other paths are client routes.
		if strings.HasPrefix(name, "assets/") || isStaticExt(path.Ext(name)) {
			http.NotFound(w, r)
			return
		}
		name = "index.html"
		data, err = fs.ReadFile(h.fsys, name)
		if err != nil {
			http.Error(w, "index.html tidak ditemukan", http.StatusInternalServerError)
			return
		}
	}
	h.serve(w, r, name, data)
}

func isStaticExt(ext string) bool {
	_, ok := contentTypes[ext]
	return ok && ext != ".html"
}

func (h *spa) etag(name string, data []byte) string {
	h.mu.Lock()
	defer h.mu.Unlock()
	if e, ok := h.etags[name]; ok {
		return e
	}
	sum := sha256.Sum256(data)
	e := `"` + hex.EncodeToString(sum[:8]) + `"`
	h.etags[name] = e
	return e
}

func (h *spa) serve(w http.ResponseWriter, r *http.Request, name string, data []byte) {
	hdr := w.Header()
	ext := path.Ext(name)
	ct := contentTypes[ext]
	if ct == "" {
		ct = mime.TypeByExtension(ext)
	}
	if ct == "" {
		ct = http.DetectContentType(data)
	}
	hdr.Set("Content-Type", ct)
	switch {
	case strings.HasPrefix(name, "assets/"):
		hdr.Set("Cache-Control", "public, max-age=31536000, immutable")
	case noCache[name]:
		hdr.Set("Cache-Control", "no-cache")
	default:
		hdr.Set("Cache-Control", "public, max-age=3600")
	}
	if strings.HasPrefix(ct, "text/html") {
		hdr.Set("Content-Security-Policy", CSP)
	}
	hdr.Set("ETag", h.etag(name, data))
	http.ServeContent(w, r, name, time.Time{}, bytes.NewReader(data))
}

type placeholder struct{}

const placeholderHTML = `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Kumlod</title></head>
<body style="font-family: system-ui, sans-serif; max-width: 40rem; margin: 3rem auto; padding: 0 1rem; line-height: 1.5">
<h1>Frontend Kumlod belum di-build</h1>
<p>API sudah jalan di <code>/api</code>. Untuk menyajikan aplikasi, jalankan <code>npm run build</code> di folder <code>web/</code>,
lalu build ulang binary. Saat development, buka Vite dev server (<code>npm run dev</code>).</p>
</body></html>`

func (placeholder) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusServiceUnavailable)
	_, _ = w.Write([]byte(placeholderHTML))
}
