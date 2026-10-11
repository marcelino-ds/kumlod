package domain

import "time"

// Task statuses.
const (
	TaskTodo       = "todo"
	TaskInProgress = "in_progress"
	TaskSubmitted  = "submitted"
	TaskGraded     = "graded"
)

// Task priorities.
const (
	PriorityLow    = "low"
	PriorityNormal = "normal"
	PriorityHigh   = "high"
)

// Semester terms.
const (
	TermOdd   = "odd"
	TermEven  = "even"
	TermShort = "short"
)

// Material kinds.
const (
	MaterialLink = "link"
	MaterialNote = "note"
	MaterialFile = "file"
)

// ValidTaskStatus reports whether s is a known task status.
func ValidTaskStatus(s string) bool {
	switch s {
	case TaskTodo, TaskInProgress, TaskSubmitted, TaskGraded:
		return true
	}
	return false
}

// ValidTaskPriority reports whether p is a known priority.
func ValidTaskPriority(p string) bool {
	return p == PriorityLow || p == PriorityNormal || p == PriorityHigh
}

// ValidTerm reports whether t is a known semester term.
func ValidTerm(t string) bool { return t == TermOdd || t == TermEven || t == TermShort }

// TaskIsOpen reports whether a task still needs work (todo or in_progress).
func TaskIsOpen(status string) bool { return status == TaskTodo || status == TaskInProgress }

// TaskIsDone reports whether a task has been submitted or graded.
func TaskIsDone(status string) bool { return status == TaskSubmitted || status == TaskGraded }

// CompletedAt returns the completion timestamp after a status change. Moving into
// submitted or graded sets it (keeping the earlier time if the task was already
// done), moving back to todo or in_progress clears it.
func CompletedAt(prevStatus string, prevCompletedAt *time.Time, newStatus string, now time.Time) *time.Time {
	if !TaskIsDone(newStatus) {
		return nil
	}
	if TaskIsDone(prevStatus) && prevCompletedAt != nil {
		t := *prevCompletedAt
		return &t
	}
	t := now
	return &t
}
