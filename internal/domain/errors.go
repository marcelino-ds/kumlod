// Package domain holds Kumlod's pure business logic: attendance, grades, GPA,
// meeting generation, reminder windows, and settings validation. It performs no
// I/O and receives the current time from callers.
package domain

import (
	"errors"
	"sort"
	"strings"
)

// Sentinel errors. Use errors.Is to test for them.
var (
	ErrNotFound = errors.New("data tidak ditemukan")
	ErrConflict = errors.New("data bentrok dengan data yang sudah ada")
)

type kindError struct {
	kind error
	msg  string
}

func (e *kindError) Error() string        { return e.msg }
func (e *kindError) Is(target error) bool { return target == e.kind }

// NotFound returns an error matching ErrNotFound with a custom message.
func NotFound(msg string) error { return &kindError{kind: ErrNotFound, msg: msg} }

// Conflict returns an error matching ErrConflict with a custom message.
func Conflict(msg string) error { return &kindError{kind: ErrConflict, msg: msg} }

// ValidationError reports invalid input. Fields maps JSON field paths to messages.
type ValidationError struct {
	Message string
	Fields  map[string]string
}

func (e *ValidationError) Error() string {
	if len(e.Fields) == 0 {
		return e.Message
	}
	keys := make([]string, 0, len(e.Fields))
	for k := range e.Fields {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	parts := make([]string, 0, len(keys))
	for _, k := range keys {
		parts = append(parts, k+": "+e.Fields[k])
	}
	return e.Message + " (" + strings.Join(parts, "; ") + ")"
}

// DefaultValidationMessage is used when a validation error has no specific message.
const DefaultValidationMessage = "Data tidak valid. Periksa isian yang ditandai."

// Invalid returns a validation error for a single field.
func Invalid(field, msg string) error {
	return &ValidationError{Message: msg, Fields: map[string]string{field: msg}}
}

// Validator collects field errors. The first message per field wins.
type Validator struct {
	fields map[string]string
}

// Add records msg for field unless the field already has a message.
func (v *Validator) Add(field, msg string) {
	if v.fields == nil {
		v.fields = map[string]string{}
	}
	if _, ok := v.fields[field]; !ok {
		v.fields[field] = msg
	}
}

// Check records msg for field when ok is false.
func (v *Validator) Check(ok bool, field, msg string) {
	if !ok {
		v.Add(field, msg)
	}
}

// Has reports whether field already has an error.
func (v *Validator) Has(field string) bool {
	_, ok := v.fields[field]
	return ok
}

// Valid reports whether no errors were recorded.
func (v *Validator) Valid() bool { return len(v.fields) == 0 }

// Err returns nil when valid, otherwise a *ValidationError.
func (v *Validator) Err() error {
	if v.Valid() {
		return nil
	}
	msg := DefaultValidationMessage
	if len(v.fields) == 1 {
		for _, m := range v.fields {
			msg = m
		}
	}
	fields := make(map[string]string, len(v.fields))
	for k, m := range v.fields {
		fields[k] = m
	}
	return &ValidationError{Message: msg, Fields: fields}
}
