package files

import (
	"bytes"
	"errors"
	"io"
	"os"
	"strings"
	"testing"
)

func TestReceiveCommitRemove(t *testing.T) {
	s, err := New(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	content := []byte("%PDF-1.7\nhello")
	u, err := s.Receive(bytes.NewReader(content), 1024)
	if err != nil {
		t.Fatal(err)
	}
	if u.Size != int64(len(content)) || len(u.SHA256) != 64 || !bytes.Equal(u.Head, content) {
		t.Errorf("upload: %+v", u)
	}
	id := "0192f1a4-7e2b-7c3d-8e4f-5a6b7c8d9e0f"
	if err := s.Commit(u, id); err != nil {
		t.Fatal(err)
	}
	f, err := s.Open(id)
	if err != nil {
		t.Fatal(err)
	}
	got, _ := io.ReadAll(f)
	f.Close()
	if !bytes.Equal(got, content) {
		t.Error("content mismatch")
	}
	if err := s.Remove(id); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Open(id); !errors.Is(err, os.ErrNotExist) {
		t.Errorf("after remove: %v", err)
	}
	if err := s.Remove(id); err != nil {
		t.Errorf("removing twice: %v", err)
	}
	if _, err := s.Path("../../etc/passwd"); err == nil {
		t.Error("path traversal must be rejected")
	}
}

func TestReceiveTooLarge(t *testing.T) {
	s, _ := New(t.TempDir())
	_, err := s.Receive(strings.NewReader(strings.Repeat("x", 11)), 10)
	if !errors.Is(err, ErrTooLarge) {
		t.Fatalf("err = %v", err)
	}
	entries, _ := os.ReadDir(s.tmp)
	if len(entries) != 0 {
		t.Errorf("temporary file left behind: %d", len(entries))
	}
	if _, err := s.Receive(strings.NewReader(strings.Repeat("x", 10)), 10); err != nil {
		t.Errorf("exactly the limit: %v", err)
	}
}

func TestDetectMIME(t *testing.T) {
	pngHead := []byte("\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR")
	tests := []struct {
		head []byte
		name string
		want string
	}{
		{[]byte("%PDF-1.4"), "a.pdf", "application/pdf"},
		{pngHead, "fake.pdf", "image/png"},
		{[]byte("PK\x03\x04"), "laporan.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"},
		{[]byte("PK\x03\x04"), "arsip.zip", "application/zip"},
		{[]byte("<html><script>alert(1)</script>"), "x.png", "text/html; charset=utf-8"},
	}
	for _, tt := range tests {
		if got := DetectMIME(tt.head, tt.name); got != tt.want {
			t.Errorf("DetectMIME(%q) = %q want %q", tt.name, got, tt.want)
		}
	}
	if BaseType("text/html; charset=utf-8") != "text/html" {
		t.Error("BaseType")
	}
}

func TestSanitizeName(t *testing.T) {
	long := strings.Repeat("a", 250) + ".pdf"
	tests := map[string]string{
		"slide.pdf":                 "slide.pdf",
		`C:\Users\x\Tugas 1.docx`:    "Tugas 1.docx",
		"../../etc/passwd":          "passwd",
		"bad\x00name\n.txt":         "badname.txt",
		"   ":                       "file",
		"..":                        "file",
		"Materi Pertemuan 8 ✓.pptx": "Materi Pertemuan 8 ✓.pptx",
	}
	for in, want := range tests {
		if got := SanitizeName(in); got != want {
			t.Errorf("SanitizeName(%q) = %q want %q", in, got, want)
		}
	}
	got := SanitizeName(long)
	if len([]rune(got)) != MaxNameLen || !strings.HasSuffix(got, ".pdf") {
		t.Errorf("long name: %d %q", len([]rune(got)), got[len(got)-10:])
	}
	if TitleFromName("Bab 2 - Normalisasi.pdf") != "Bab 2 - Normalisasi" || TitleFromName(".pdf") != ".pdf" {
		t.Error("TitleFromName")
	}
}
