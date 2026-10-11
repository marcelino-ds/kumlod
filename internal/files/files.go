// Package files stores uploaded material files on disk under
// <root>/<first 2 chars of id>/<id>.
package files

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

// ErrTooLarge is returned when an upload exceeds the size limit.
var ErrTooLarge = errors.New("file terlalu besar")

// Store manages files under a root directory.
type Store struct {
	root string
	tmp  string
}

// New creates the root and temporary directories if needed.
func New(root string) (*Store, error) {
	tmp := filepath.Join(root, "tmp")
	if err := os.MkdirAll(tmp, 0o750); err != nil {
		return nil, fmt.Errorf("buat folder file: %w", err)
	}
	return &Store{root: root, tmp: tmp}, nil
}

// Root returns the root directory.
func (s *Store) Root() string { return s.root }

func validID(id string) bool {
	if len(id) < 8 || len(id) > 64 {
		return false
	}
	for _, r := range id {
		if !(r >= '0' && r <= '9' || r >= 'a' && r <= 'f' || r == '-') {
			return false
		}
	}
	return true
}

// Path returns the location of a stored file.
func (s *Store) Path(id string) (string, error) {
	if !validID(id) {
		return "", fmt.Errorf("id file tidak valid: %q", id)
	}
	return filepath.Join(s.root, id[:2], id), nil
}

// Upload is a received file waiting in the temporary directory.
type Upload struct {
	path   string
	Size   int64
	SHA256 string
	Head   []byte // first bytes, for content sniffing
}

// Receive streams r into a temporary file, hashing it on the way. It returns
// ErrTooLarge (and removes the temporary file) when r has more than max bytes.
func (s *Store) Receive(r io.Reader, max int64) (*Upload, error) {
	f, err := os.CreateTemp(s.tmp, "upload-*")
	if err != nil {
		return nil, err
	}
	u := &Upload{path: f.Name()}
	cleanup := func() {
		f.Close()
		os.Remove(u.path)
	}

	h := sha256.New()
	head := &headWriter{limit: 512}
	n, err := io.Copy(io.MultiWriter(f, h, head), io.LimitReader(r, max+1))
	if err != nil {
		cleanup()
		var mbe *http.MaxBytesError
		if errors.As(err, &mbe) {
			return nil, ErrTooLarge
		}
		return nil, err
	}
	if n > max {
		cleanup()
		return nil, ErrTooLarge
	}
	if err := f.Sync(); err != nil {
		cleanup()
		return nil, err
	}
	if err := f.Close(); err != nil {
		os.Remove(u.path)
		return nil, err
	}
	u.Size = n
	u.SHA256 = hex.EncodeToString(h.Sum(nil))
	u.Head = head.buf
	return u, nil
}

// Commit moves an upload to its final location.
func (s *Store) Commit(u *Upload, id string) error {
	dst, err := s.Path(id)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(dst), 0o750); err != nil {
		return err
	}
	return os.Rename(u.path, dst)
}

// Discard removes an upload that will not be committed.
func (s *Store) Discard(u *Upload) {
	if u != nil {
		os.Remove(u.path)
	}
}

// CleanTemp removes temporary uploads older than age (left over after a crash).
func (s *Store) CleanTemp(age time.Duration) (int, error) {
	entries, err := os.ReadDir(s.tmp)
	if err != nil {
		return 0, err
	}
	n := 0
	cutoff := time.Now().Add(-age)
	for _, e := range entries {
		info, err := e.Info()
		if err != nil || e.IsDir() || info.ModTime().After(cutoff) {
			continue
		}
		if os.Remove(filepath.Join(s.tmp, e.Name())) == nil {
			n++
		}
	}
	return n, nil
}

// Open opens a stored file for reading.
func (s *Store) Open(id string) (*os.File, error) {
	p, err := s.Path(id)
	if err != nil {
		return nil, fs.ErrNotExist
	}
	return os.Open(p)
}

// Remove deletes a stored file. A missing file is not an error.
func (s *Store) Remove(id string) error {
	p, err := s.Path(id)
	if err != nil {
		return err
	}
	if err := os.Remove(p); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return err
	}
	// Remove the shard directory when it became empty; ignore failures.
	_ = os.Remove(filepath.Dir(p))
	return nil
}

type headWriter struct {
	buf   []byte
	limit int
}

func (w *headWriter) Write(p []byte) (int, error) {
	if room := w.limit - len(w.buf); room > 0 {
		if len(p) < room {
			room = len(p)
		}
		w.buf = append(w.buf, p[:room]...)
	}
	return len(p), nil
}

// InlineTypes may be shown in the browser; everything else is downloaded.
var InlineTypes = map[string]bool{
	"application/pdf": true,
	"image/png":       true,
	"image/jpeg":      true,
	"image/gif":       true,
	"image/webp":      true,
}

// zipBased are formats that sniff as application/zip; the extension is more precise.
var zipBased = map[string]bool{
	".docx": true, ".xlsx": true, ".pptx": true, ".odt": true, ".ods": true, ".odp": true, ".epub": true, ".jar": true,
}

// DetectMIME determines the content type from the first bytes, falling back to
// the file extension when sniffing is inconclusive.
func DetectMIME(head []byte, name string) string {
	sniffed := http.DetectContentType(head)
	ext := strings.ToLower(filepath.Ext(name))
	byExt := ""
	if ext != "" {
		byExt = mime.TypeByExtension(ext)
	}
	switch {
	case sniffed == "application/octet-stream" && byExt != "":
		return byExt
	case sniffed == "application/zip" && zipBased[ext] && byExt != "":
		return byExt
	}
	return sniffed
}

// BaseType returns the media type without parameters, e.g. "text/plain".
func BaseType(contentType string) string {
	t, _, err := mime.ParseMediaType(contentType)
	if err != nil {
		return strings.ToLower(strings.TrimSpace(strings.Split(contentType, ";")[0]))
	}
	return t
}

// MaxNameLen is the maximum length of a stored file name in characters.
const MaxNameLen = 200

// SanitizeName strips directories and control characters from an uploaded file
// name and limits it to MaxNameLen characters, keeping the extension.
func SanitizeName(name string) string {
	name = strings.ReplaceAll(name, "\\", "/")
	if i := strings.LastIndex(name, "/"); i >= 0 {
		name = name[i+1:]
	}
	name = strings.Map(func(r rune) rune {
		if unicode.IsControl(r) || r == utf8.RuneError {
			return -1
		}
		return r
	}, name)
	name = strings.TrimSpace(name)
	name = strings.Trim(name, ".")
	name = strings.TrimSpace(name)
	if name == "" {
		return "file"
	}
	if utf8.RuneCountInString(name) > MaxNameLen {
		ext := filepath.Ext(name)
		if utf8.RuneCountInString(ext) > 20 {
			ext = ""
		}
		runes := []rune(strings.TrimSuffix(name, ext))
		keep := MaxNameLen - utf8.RuneCountInString(ext)
		name = strings.TrimSpace(string(runes[:keep])) + ext
	}
	return name
}

// TitleFromName returns the file name without its extension.
func TitleFromName(name string) string {
	t := strings.TrimSpace(strings.TrimSuffix(name, filepath.Ext(name)))
	if t == "" {
		return name
	}
	return t
}
