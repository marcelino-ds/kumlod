// Package auth provides password hashing (argon2id), session tokens, and the
// login rate limiter.
package auth

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"runtime/debug"
	"strings"
	"sync"

	"golang.org/x/crypto/argon2"
)

// Argon2id parameters (memory in KiB).
const (
	argonMemory  = 64 * 1024
	argonTime    = 3
	argonThreads = 2
	argonSaltLen = 16
	argonKeyLen  = 32
)

// Password length limits.
const (
	MinPasswordLen = 8
	MaxPasswordLen = 256
)

// ErrInvalidHash is returned when a stored hash cannot be parsed.
var ErrInvalidHash = errors.New("format hash password tidak dikenali")

// hashSlots serializes argon2 work: each hash needs 64 MiB, and Kumlod targets
// well under 100 MB of RAM, so parallel logins must not hash concurrently.
var hashSlots = make(chan struct{}, 1)

// acquire takes the hash slot. The release function hands the 64 MiB argon2
// buffer back to the operating system right away; otherwise the Go runtime
// keeps it and every login ratchets the process size up. Hashing only happens
// at login and password changes, so the extra GC is cheap.
func acquire() func() {
	hashSlots <- struct{}{}
	return func() {
		debug.FreeOSMemory()
		<-hashSlots
	}
}

// HashPassword returns a PHC-formatted argon2id hash.
func HashPassword(password string) (string, error) {
	salt := make([]byte, argonSaltLen)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	release := acquire()
	key := argon2.IDKey([]byte(password), salt, argonTime, argonMemory, argonThreads, argonKeyLen)
	release()
	return fmt.Sprintf("$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s",
		argon2.Version, argonMemory, argonTime, argonThreads,
		base64.RawStdEncoding.EncodeToString(salt), base64.RawStdEncoding.EncodeToString(key)), nil
}

// VerifyPassword reports whether password matches the encoded hash. The
// parameters are read from the hash so older hashes keep working.
func VerifyPassword(password, encoded string) (bool, error) {
	parts := strings.Split(encoded, "$")
	if len(parts) != 6 || parts[0] != "" || parts[1] != "argon2id" {
		return false, ErrInvalidHash
	}
	var version int
	if _, err := fmt.Sscanf(parts[2], "v=%d", &version); err != nil || version != argon2.Version {
		return false, ErrInvalidHash
	}
	var memory uint32
	var iterations uint32
	var threads uint8
	if _, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &memory, &iterations, &threads); err != nil {
		return false, ErrInvalidHash
	}
	if memory == 0 || memory > 256*1024 || iterations == 0 || iterations > 20 || threads == 0 {
		return false, ErrInvalidHash
	}
	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil || len(salt) < 8 {
		return false, ErrInvalidHash
	}
	want, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil || len(want) < 16 || len(want) > 128 {
		return false, ErrInvalidHash
	}
	release := acquire()
	got := argon2.IDKey([]byte(password), salt, iterations, memory, threads, uint32(len(want)))
	release()
	return subtle.ConstantTimeCompare(got, want) == 1, nil
}

var (
	dummyOnce sync.Once
	dummyHash string
)

// BurnTime runs a verification against a dummy hash so that a login with an
// unknown username takes as long as one with a wrong password.
func BurnTime(password string) {
	dummyOnce.Do(func() {
		h, err := HashPassword("kumlod-dummy-password")
		if err == nil {
			dummyHash = h
		}
	})
	if dummyHash != "" {
		_, _ = VerifyPassword(password, dummyHash)
	}
}

// ValidateNewPassword checks the password length (in characters).
func ValidateNewPassword(password string) error {
	n := len([]rune(password))
	if n < MinPasswordLen {
		return fmt.Errorf("password minimal %d karakter", MinPasswordLen)
	}
	if n > MaxPasswordLen {
		return fmt.Errorf("password maksimal %d karakter", MaxPasswordLen)
	}
	return nil
}
