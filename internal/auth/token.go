package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"time"
)

// Session settings.
const (
	CookieName        = "kumlod_session"
	SessionTTL        = 30 * 24 * time.Hour
	SessionRenewBelow = 15 * 24 * time.Hour
	SessionTouchEvery = 5 * time.Minute
	tokenBytes        = 32
)

// NewToken returns a random cookie token and the ID (hex SHA-256) stored in the database.
func NewToken() (token, id string, err error) {
	b := make([]byte, tokenBytes)
	if _, err := rand.Read(b); err != nil {
		return "", "", err
	}
	token = base64.RawURLEncoding.EncodeToString(b)
	return token, HashToken(token), nil
}

// HashToken returns the session ID for a cookie token.
func HashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

// PlausibleToken reports whether a cookie value has the shape of a token, so
// garbage cookies are rejected without a database lookup.
func PlausibleToken(token string) bool {
	if len(token) != base64.RawURLEncoding.EncodedLen(tokenBytes) {
		return false
	}
	_, err := base64.RawURLEncoding.DecodeString(token)
	return err == nil
}
