package httpapi

import (
	"context"
	"net/http"

	"kumlod/internal/api"
	"kumlod/internal/domain"
)

// ListSemesters returns all semesters.
func (s *Server) ListSemesters(w http.ResponseWriter, r *http.Request) {
	list, err := s.store.ListSemesters(r.Context())
	if err != nil {
		s.fail(w, r, err)
		return
	}
	out := api.SemesterList{Items: make([]api.Semester, 0, len(list))}
	for _, x := range list {
		out.Items = append(out.Items, toSemester(x))
	}
	writeJSON(w, http.StatusOK, out)
}

// CreateSemester creates a semester; the first one becomes active.
func (s *Server) CreateSemester(w http.ResponseWriter, r *http.Request) {
	var in api.SemesterCreate
	if err := decodeJSON(r, &in); err != nil {
		s.fail(w, r, err)
		return
	}
	var v domain.Validator
	id := clientID(&v, in.Id)
	x := validateSemester(&v, api.SemesterUpdate{
		Name: in.Name, AcademicYear: in.AcademicYear, Term: in.Term, StartDate: in.StartDate, EndDate: in.EndDate,
	})
	if err := v.Err(); err != nil {
		s.fail(w, r, err)
		return
	}
	x.ID = id
	created, err := s.store.CreateSemester(r.Context(), x, in.Activate != nil && *in.Activate)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, toSemester(created))
}

// GetSemester returns one semester.
func (s *Server) GetSemester(w http.ResponseWriter, r *http.Request, semesterID api.SemesterId) {
	x, err := s.store.GetSemester(r.Context(), semesterID)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, toSemester(x))
}

// UpdateSemester replaces a semester's fields.
func (s *Server) UpdateSemester(w http.ResponseWriter, r *http.Request, semesterID api.SemesterId) {
	var in api.SemesterUpdate
	if err := decodeJSON(r, &in); err != nil {
		s.fail(w, r, err)
		return
	}
	var v domain.Validator
	x := validateSemester(&v, in)
	if err := v.Err(); err != nil {
		s.fail(w, r, err)
		return
	}
	x.ID = semesterID
	updated, err := s.store.UpdateSemester(r.Context(), x)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, toSemester(updated))
}

// DeleteSemester removes a semester with all of its data and files.
func (s *Server) DeleteSemester(w http.ResponseWriter, r *http.Request, semesterID api.SemesterId) {
	fileIDs, err := s.store.DeleteSemester(r.Context(), semesterID)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	s.removeFiles(r.Context(), fileIDs)
	w.WriteHeader(http.StatusNoContent)
}

// ActivateSemester makes a semester the active one.
func (s *Server) ActivateSemester(w http.ResponseWriter, r *http.Request, semesterID api.SemesterId) {
	x, err := s.store.ActivateSemester(r.Context(), semesterID)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, toSemester(x))
}

// removeFiles deletes files from disk after their rows were removed.
func (s *Server) removeFiles(_ context.Context, ids []string) {
	for _, id := range ids {
		if err := s.files.Remove(id); err != nil {
			s.log.Warn("hapus file dari disk gagal", "file_id", id, "err", err)
		}
	}
}
