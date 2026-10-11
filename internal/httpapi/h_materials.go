package httpapi

import (
	"errors"
	"io"
	"io/fs"
	"mime"
	"net/http"
	"strings"

	"kumlod/internal/api"
	"kumlod/internal/domain"
	"kumlod/internal/files"
	"kumlod/internal/store"
)

// ListMaterials lists or searches materials.
func (s *Server) ListMaterials(w http.ResponseWriter, r *http.Request, params api.ListMaterialsParams) {
	ctx := r.Context()
	semID, ok, err := s.resolveSemesterFilter(ctx, params.SemesterId)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	if !ok {
		writeJSON(w, http.StatusOK, api.MaterialList{Items: []api.Material{}})
		return
	}
	q := str(params.Q)
	if domain.RuneLen(q) > 200 {
		s.fail(w, r, domain.Invalid("q", "Kata kunci maksimal 200 karakter"))
		return
	}
	list, err := s.store.ListMaterials(ctx, store.MaterialFilter{
		SemesterID: semID,
		CourseID:   strings.TrimSpace(str(params.CourseId)),
		MeetingID:  strings.TrimSpace(str(params.MeetingId)),
		Query:      q,
	})
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, api.MaterialList{Items: toMaterials(list)})
}

func validateMaterialText(v *domain.Validator, title, description string) (string, string) {
	title = strings.TrimSpace(title)
	checkLen(v, "title", title, 1, maxMaterialTitle, "Judul materi")
	checkLen(v, "description", description, 0, maxMaterialDesc, "Deskripsi")
	return title, description
}

// CreateMaterial adds a link or note.
func (s *Server) CreateMaterial(w http.ResponseWriter, r *http.Request) {
	var in api.MaterialCreate
	if err := decodeJSON(r, &in); err != nil {
		s.fail(w, r, err)
		return
	}
	var v domain.Validator
	m := store.Material{
		ID:        clientID(&v, in.Id),
		CourseID:  strings.TrimSpace(in.CourseId),
		MeetingID: optionalID(in.MeetingId),
		Kind:      string(in.Kind),
	}
	v.Check(m.CourseID != "", "course_id", "Pilih matkul")
	m.Title, m.Description = validateMaterialText(&v, in.Title, str(in.Description))
	switch m.Kind {
	case domain.MaterialLink:
		m.URL = strings.TrimSpace(str(in.Url))
		if m.URL == "" {
			v.Add("url", "Link wajib diisi")
		} else {
			m.URL = validateSubmissionURL(&v, "url", m.URL)
		}
	case domain.MaterialNote:
		m.URL = ""
	default:
		v.Add("kind", "Jenis materi harus link atau note. Untuk file pakai upload.")
	}
	if err := v.Err(); err != nil {
		s.fail(w, r, err)
		return
	}
	created, err := s.store.CreateMaterial(r.Context(), m, nil)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, toMaterial(created))
}

// uploadFields are the accepted text parts of the upload form.
var uploadFields = map[string]bool{"course_id": true, "meeting_id": true, "title": true, "description": true, "id": true}

const maxUploadField = 64 << 10

// UploadMaterial stores an uploaded file as a material. The multipart body is
// streamed to disk so large files never sit in memory.
func (s *Server) UploadMaterial(w http.ResponseWriter, r *http.Request) {
	mt, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || mt != "multipart/form-data" {
		s.fail(w, r, &domain.ValidationError{Message: "Content-Type harus multipart/form-data"})
		return
	}
	mr, err := r.MultipartReader()
	if err != nil {
		s.fail(w, r, &domain.ValidationError{Message: "Form upload tidak valid"})
		return
	}

	fields := map[string]string{}
	var upload *files.Upload
	var fileName string
	committed := false
	defer func() {
		if !committed {
			s.files.Discard(upload)
		}
	}()

	for {
		part, err := mr.NextPart()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			s.uploadError(w, r, err)
			return
		}
		name := part.FormName()
		switch {
		case name == "file" && part.FileName() != "":
			if upload != nil {
				part.Close()
				s.fail(w, r, domain.Invalid("file", "Upload satu file per request"))
				return
			}
			fileName = files.SanitizeName(part.FileName())
			upload, err = s.files.Receive(part, s.opts.MaxUploadBytes)
			if err != nil {
				part.Close()
				s.uploadError(w, r, err)
				return
			}
		case uploadFields[name]:
			b, err := io.ReadAll(io.LimitReader(part, maxUploadField+1))
			if err != nil {
				part.Close()
				s.uploadError(w, r, err)
				return
			}
			if len(b) > maxUploadField {
				part.Close()
				s.fail(w, r, domain.Invalid(name, "Isian terlalu panjang"))
				return
			}
			fields[name] = string(b)
		default:
			_, _ = io.Copy(io.Discard, part)
		}
		part.Close()
	}

	var v domain.Validator
	if upload == nil {
		v.Add("file", "Pilih file yang mau diunggah")
	} else if upload.Size == 0 {
		v.Add("file", "File kosong")
	}
	idField := fields["id"]
	m := store.Material{
		ID:        clientID(&v, &idField),
		CourseID:  strings.TrimSpace(fields["course_id"]),
		MeetingID: optionalID(ptr(fields["meeting_id"])),
		Kind:      domain.MaterialFile,
	}
	v.Check(m.CourseID != "", "course_id", "Pilih matkul")
	title := strings.TrimSpace(fields["title"])
	if title == "" && fileName != "" {
		title = truncateRunes(files.TitleFromName(fileName), maxMaterialTitle)
	}
	m.Title, m.Description = validateMaterialText(&v, title, fields["description"])
	if err := v.Err(); err != nil {
		s.fail(w, r, err)
		return
	}

	ctx := r.Context()
	info := &store.FileInfo{
		ID:           store.NewID(),
		OriginalName: fileName,
		MimeType:     files.DetectMIME(upload.Head, fileName),
		SizeBytes:    upload.Size,
		SHA256:       upload.SHA256,
	}
	created, err := s.store.CreateMaterial(ctx, m, info)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	if err := s.files.Commit(upload, info.ID); err != nil {
		if _, derr := s.store.DeleteMaterial(ctx, created.ID); derr != nil {
			s.log.Error("batalkan materi setelah gagal simpan file", "material_id", created.ID, "err", derr)
		}
		s.fail(w, r, err)
		return
	}
	committed = true
	writeJSON(w, http.StatusCreated, toMaterial(created))
}

func (s *Server) uploadError(w http.ResponseWriter, r *http.Request, err error) {
	var mbe *http.MaxBytesError
	if errors.Is(err, files.ErrTooLarge) || errors.As(err, &mbe) {
		writeError(w, http.StatusRequestEntityTooLarge, api.FileTooLarge,
			"Ukuran file melebihi batas "+formatMB(s.opts.MaxUploadBytes), nil)
		return
	}
	if strings.Contains(err.Error(), "multipart") {
		s.fail(w, r, &domain.ValidationError{Message: "Form upload tidak valid"})
		return
	}
	s.fail(w, r, err)
}

func ptr(s string) *string { return &s }

func truncateRunes(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return strings.TrimSpace(string(r[:n]))
}

// GetMaterial returns one material.
func (s *Server) GetMaterial(w http.ResponseWriter, r *http.Request, materialID api.MaterialId) {
	m, err := s.store.GetMaterial(r.Context(), materialID)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, toMaterial(m))
}

// UpdateMaterial replaces the meeting, title, description, and (for links) URL.
func (s *Server) UpdateMaterial(w http.ResponseWriter, r *http.Request, materialID api.MaterialId) {
	var in api.MaterialUpdate
	if err := decodeJSON(r, &in); err != nil {
		s.fail(w, r, err)
		return
	}
	ctx := r.Context()
	prev, err := s.store.GetMaterial(ctx, materialID)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	var v domain.Validator
	m := store.Material{ID: materialID, MeetingID: optionalID(in.MeetingId)}
	m.Title, m.Description = validateMaterialText(&v, in.Title, in.Description)
	if prev.Kind == domain.MaterialLink {
		m.URL = strings.TrimSpace(in.Url)
		if m.URL == "" {
			v.Add("url", "Link wajib diisi")
		} else {
			m.URL = validateSubmissionURL(&v, "url", m.URL)
		}
	}
	if err := v.Err(); err != nil {
		s.fail(w, r, err)
		return
	}
	updated, err := s.store.UpdateMaterial(ctx, m)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, toMaterial(updated))
}

// DeleteMaterial removes a material and its file.
func (s *Server) DeleteMaterial(w http.ResponseWriter, r *http.Request, materialID api.MaterialId) {
	fileID, err := s.store.DeleteMaterial(r.Context(), materialID)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	if fileID != "" {
		s.removeFiles(r.Context(), []string{fileID})
	}
	w.WriteHeader(http.StatusNoContent)
}

// DownloadFile streams a stored file. PDFs and common images open inline;
// everything else is an attachment with a sandboxing CSP.
func (s *Server) DownloadFile(w http.ResponseWriter, r *http.Request, fileID api.FileId, params api.DownloadFileParams) {
	info, err := s.store.GetFile(r.Context(), fileID)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	f, err := s.files.Open(info.ID)
	if errors.Is(err, fs.ErrNotExist) {
		s.log.Error("file ada di database tapi tidak ada di disk", "file_id", info.ID)
		writeError(w, http.StatusNotFound, api.NotFound, "File tidak ditemukan di server", nil)
		return
	}
	if err != nil {
		s.fail(w, r, err)
		return
	}
	defer f.Close()

	forceDownload := params.Download != nil && *params.Download
	inline := files.InlineTypes[files.BaseType(info.MimeType)] && !forceDownload
	disposition := "attachment"
	h := w.Header()
	if inline {
		disposition = "inline"
		h.Del("Content-Security-Policy")
	} else {
		h.Set("Content-Security-Policy", "default-src 'none'; sandbox")
	}
	if cd := mime.FormatMediaType(disposition, map[string]string{"filename": info.OriginalName}); cd != "" {
		h.Set("Content-Disposition", cd)
	} else {
		h.Set("Content-Disposition", disposition)
	}
	h.Set("Content-Type", info.MimeType)
	h.Set("Cache-Control", "private, no-cache")
	h.Set("ETag", `"`+info.SHA256+`"`)
	http.ServeContent(w, r, "", info.CreatedAt, f)
}
