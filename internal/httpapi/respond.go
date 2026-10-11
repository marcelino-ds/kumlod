package httpapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"strings"
	"time"

	"kumlod/internal/api"
	"kumlod/internal/domain"
)

// MaxJSONBody is the limit for JSON request bodies.
const MaxJSONBody = 1 << 20

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(true)
	_ = enc.Encode(v)
}

func writeError(w http.ResponseWriter, status int, code api.ErrorErrorCode, msg string, fields map[string]string) {
	var body api.Error
	body.Error.Code = code
	body.Error.Message = msg
	if len(fields) > 0 {
		body.Error.Fields = &fields
	}
	writeJSON(w, status, body)
}

// errTooLarge marks request bodies over the limit.
var errTooLarge = errors.New("request terlalu besar")

// fail maps an error to the JSON error response.
func (s *Server) fail(w http.ResponseWriter, r *http.Request, err error) {
	var ve *domain.ValidationError
	var mbe *http.MaxBytesError
	switch {
	case errors.As(err, &ve):
		msg := ve.Message
		if msg == "" {
			msg = domain.DefaultValidationMessage
		}
		writeError(w, http.StatusBadRequest, api.ValidationError, msg, ve.Fields)
	case errors.Is(err, domain.ErrNotFound):
		writeError(w, http.StatusNotFound, api.NotFound, err.Error(), nil)
	case errors.Is(err, domain.ErrConflict):
		writeError(w, http.StatusConflict, api.Conflict, err.Error(), nil)
	case errors.As(err, &mbe), errors.Is(err, errTooLarge):
		writeError(w, http.StatusRequestEntityTooLarge, api.FileTooLarge, "Ukuran request melebihi batas", nil)
	default:
		s.log.Error("request gagal", "method", r.Method, "path", r.URL.Path, "err", err)
		writeError(w, http.StatusInternalServerError, api.Internal, "Terjadi kesalahan di server. Coba lagi sebentar lagi.", nil)
	}
}

// paramError handles invalid path or query parameters from the generated router.
func (s *Server) paramError(w http.ResponseWriter, r *http.Request, err error) {
	field := ""
	var ipf *api.InvalidParamFormatError
	var rpe *api.RequiredParamError
	switch {
	case errors.As(err, &ipf):
		field = ipf.ParamName
	case errors.As(err, &rpe):
		field = rpe.ParamName
	}
	msg := "Parameter tidak valid"
	fields := map[string]string{}
	if field != "" {
		msg = fmt.Sprintf("Parameter %s tidak valid", field)
		fields[field] = "Format tidak valid"
	}
	writeError(w, http.StatusBadRequest, api.ValidationError, msg, fields)
}

// decodeJSON reads a JSON body into dst. Errors are *domain.ValidationError or
// a body size error.
func decodeJSON(r *http.Request, dst any) error {
	if ct := r.Header.Get("Content-Type"); ct != "" {
		mt, _, err := mime.ParseMediaType(ct)
		if err != nil || mt != "application/json" {
			return &domain.ValidationError{Message: "Content-Type harus application/json"}
		}
	}
	dec := json.NewDecoder(r.Body)
	if err := dec.Decode(dst); err != nil {
		return jsonError(err)
	}
	if dec.More() {
		return &domain.ValidationError{Message: "Body harus berisi satu objek JSON"}
	}
	// Drain to detect bodies over the limit hidden after the JSON value.
	if _, err := io.Copy(io.Discard, r.Body); err != nil {
		return jsonError(err)
	}
	return nil
}

func jsonError(err error) error {
	var syn *json.SyntaxError
	var typ *json.UnmarshalTypeError
	var mbe *http.MaxBytesError
	var pe *time.ParseError
	switch {
	case errors.As(err, &mbe):
		return err
	case errors.Is(err, io.EOF):
		return &domain.ValidationError{Message: "Body request kosong"}
	case errors.As(err, &syn), errors.Is(err, io.ErrUnexpectedEOF):
		return &domain.ValidationError{Message: "JSON tidak valid"}
	case errors.As(err, &typ):
		field := typ.Field
		if field == "" {
			return &domain.ValidationError{Message: "Body harus berupa objek JSON"}
		}
		return domain.Invalid(field, "Tipe data tidak sesuai")
	case errors.As(err, &pe):
		return &domain.ValidationError{Message: "Format waktu harus RFC 3339, misalnya 2026-10-11T23:59:00+07:00"}
	case strings.Contains(err.Error(), "Time.UnmarshalJSON"):
		return &domain.ValidationError{Message: "Format waktu harus RFC 3339, misalnya 2026-10-11T23:59:00+07:00"}
	}
	return &domain.ValidationError{Message: "Body request tidak valid"}
}
