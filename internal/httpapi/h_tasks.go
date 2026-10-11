package httpapi

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"kumlod/internal/api"
	"kumlod/internal/domain"
	"kumlod/internal/store"
)

// resolveSemesterFilter turns the semester_id query parameter into a store
// filter: empty means the active semester, "all" means every semester. ok is
// false when the active semester is requested but none exists.
func (s *Server) resolveSemesterFilter(ctx context.Context, param *string) (id string, ok bool, err error) {
	v := strings.TrimSpace(str(param))
	switch v {
	case "all":
		return "", true, nil
	case "":
		sem, err := s.store.GetActiveSemester(ctx)
		if errors.Is(err, domain.ErrNotFound) {
			return "", false, nil
		}
		if err != nil {
			return "", false, err
		}
		return sem.ID, true, nil
	}
	return v, true, nil
}

// ListTasks returns tasks filtered by semester, course, status, and deadline.
func (s *Server) ListTasks(w http.ResponseWriter, r *http.Request, params api.ListTasksParams) {
	ctx := r.Context()
	semID, ok, err := s.resolveSemesterFilter(ctx, params.SemesterId)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	if !ok {
		writeJSON(w, http.StatusOK, api.TaskList{Items: []api.Task{}})
		return
	}
	f := store.TaskFilter{SemesterID: semID, CourseID: strings.TrimSpace(str(params.CourseId)), DueFrom: params.DueFrom, DueTo: params.DueTo}
	if params.Status != nil {
		for _, st := range *params.Status {
			if !domain.ValidTaskStatus(string(st)) {
				s.fail(w, r, domain.Invalid("status", "Status tugas tidak dikenal: "+string(st)))
				return
			}
			f.Statuses = append(f.Statuses, string(st))
		}
	}
	list, err := s.store.ListTasks(ctx, f)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, api.TaskList{Items: toTasks(list)})
}

func validateTaskText(v *domain.Validator, title, description, submissionURL string) (string, string, string) {
	title = strings.TrimSpace(title)
	checkLen(v, "title", title, 1, maxTaskTitle, "Judul tugas")
	checkLen(v, "description", description, 0, maxTaskDesc, "Deskripsi")
	return title, description, validateSubmissionURL(v, "submission_url", submissionURL)
}

// CreateTask creates a task.
func (s *Server) CreateTask(w http.ResponseWriter, r *http.Request) {
	var in api.TaskCreate
	if err := decodeJSON(r, &in); err != nil {
		s.fail(w, r, err)
		return
	}
	var v domain.Validator
	t := store.Task{
		ID:               clientID(&v, in.Id),
		SemesterID:       str(optionalID(in.SemesterId)),
		CourseID:         optionalID(in.CourseId),
		MeetingID:        optionalID(in.MeetingId),
		GradeComponentID: optionalID(in.GradeComponentId),
		Deadline:         in.Deadline,
		Status:           domain.TaskTodo,
		Priority:         domain.PriorityNormal,
	}
	t.Title, t.Description, t.SubmissionURL = validateTaskText(&v, in.Title, str(in.Description), str(in.SubmissionUrl))
	v.Check(!in.Deadline.IsZero(), "deadline", "Deadline wajib diisi")
	if in.Priority != nil {
		t.Priority = string(*in.Priority)
		v.Check(domain.ValidTaskPriority(t.Priority), "priority", "Prioritas harus low, normal, atau high")
	}
	if err := v.Err(); err != nil {
		s.fail(w, r, err)
		return
	}
	created, err := s.store.CreateTask(r.Context(), t)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, toTask(created))
}

// GetTask returns one task.
func (s *Server) GetTask(w http.ResponseWriter, r *http.Request, taskID api.TaskId) {
	t, err := s.store.GetTask(r.Context(), taskID)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, toTask(t))
}

// UpdateTask replaces a task's fields.
func (s *Server) UpdateTask(w http.ResponseWriter, r *http.Request, taskID api.TaskId) {
	var in api.TaskUpdate
	if err := decodeJSON(r, &in); err != nil {
		s.fail(w, r, err)
		return
	}
	var v domain.Validator
	t := store.Task{
		ID:               taskID,
		CourseID:         optionalID(in.CourseId),
		MeetingID:        optionalID(in.MeetingId),
		GradeComponentID: optionalID(in.GradeComponentId),
		Deadline:         in.Deadline,
		Status:           string(in.Status),
		Priority:         string(in.Priority),
		Score:            in.Score,
	}
	t.Title, t.Description, t.SubmissionURL = validateTaskText(&v, in.Title, in.Description, in.SubmissionUrl)
	v.Check(!in.Deadline.IsZero(), "deadline", "Deadline wajib diisi")
	v.Check(domain.ValidTaskStatus(t.Status), "status", "Status tugas tidak dikenal")
	v.Check(domain.ValidTaskPriority(t.Priority), "priority", "Prioritas harus low, normal, atau high")
	if t.Score != nil {
		v.Check(*t.Score >= 0 && *t.Score <= 100, "score", "Nilai tugas harus 0-100")
	}
	if err := v.Err(); err != nil {
		s.fail(w, r, err)
		return
	}
	updated, err := s.store.UpdateTask(r.Context(), t)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, toTask(updated))
}

// SetTaskStatus changes only the status of a task.
func (s *Server) SetTaskStatus(w http.ResponseWriter, r *http.Request, taskID api.TaskId) {
	var in api.TaskStatusUpdate
	if err := decodeJSON(r, &in); err != nil {
		s.fail(w, r, err)
		return
	}
	if !domain.ValidTaskStatus(string(in.Status)) {
		s.fail(w, r, domain.Invalid("status", "Status tugas tidak dikenal"))
		return
	}
	t, err := s.store.SetTaskStatus(r.Context(), taskID, string(in.Status))
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, toTask(t))
}

// DeleteTask removes a task.
func (s *Server) DeleteTask(w http.ResponseWriter, r *http.Request, taskID api.TaskId) {
	if err := s.store.DeleteTask(r.Context(), taskID); err != nil {
		s.fail(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
