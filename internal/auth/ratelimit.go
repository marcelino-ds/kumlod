package auth

import (
	"sync"
	"time"

	"kumlod/internal/clock"
)

// Login limits: 5 attempts per IP per 15 minutes.
const (
	LoginMaxAttempts = 5
	LoginWindow      = 15 * time.Minute
)

// Limiter is an in-memory sliding-window limiter keyed by client IP. Every
// attempt counts against the limit until it succeeds and calls Reset, so
// parallel requests cannot slip past the limit while passwords are verified.
type Limiter struct {
	mu      sync.Mutex
	clock   clock.Clock
	max     int
	window  time.Duration
	entries map[string][]time.Time
}

// NewLimiter returns a limiter allowing max attempts per key within window.
func NewLimiter(c clock.Clock, max int, window time.Duration) *Limiter {
	return &Limiter{clock: c, max: max, window: window, entries: map[string][]time.Time{}}
}

func (l *Limiter) prune(key string, now time.Time) []time.Time {
	list := l.entries[key]
	cut := 0
	for cut < len(list) && now.Sub(list[cut]) >= l.window {
		cut++
	}
	list = list[cut:]
	if len(list) == 0 {
		delete(l.entries, key)
		return nil
	}
	l.entries[key] = list
	return list
}

// Attempt registers an attempt. It returns false (and does not register) when
// the key has used up its attempts in the current window.
func (l *Limiter) Attempt(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.clock.Now()
	if len(l.entries) > 10000 {
		for k := range l.entries {
			l.prune(k, now)
		}
	}
	list := l.prune(key, now)
	if len(list) >= l.max {
		return false
	}
	l.entries[key] = append(list, now)
	return true
}

// Reset clears the attempts of key after a successful login.
func (l *Limiter) Reset(key string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.entries, key)
}

// RetryAfter returns how long until key may try again (0 when allowed).
func (l *Limiter) RetryAfter(key string) time.Duration {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.clock.Now()
	list := l.prune(key, now)
	if len(list) < l.max {
		return 0
	}
	return l.window - now.Sub(list[len(list)-l.max])
}
