package auth

import (
	"strings"
	"testing"
	"time"

	"kumlod/internal/clock"
)

func TestPasswordHashAndVerify(t *testing.T) {
	h, err := HashPassword("rahasia-banget")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(h, "$argon2id$v=19$m=65536,t=3,p=2$") {
		t.Errorf("unexpected format: %s", h)
	}
	ok, err := VerifyPassword("rahasia-banget", h)
	if err != nil || !ok {
		t.Errorf("verify correct: %v %v", ok, err)
	}
	ok, err = VerifyPassword("salah", h)
	if err != nil || ok {
		t.Errorf("verify wrong: %v %v", ok, err)
	}
	h2, _ := HashPassword("rahasia-banget")
	if h == h2 {
		t.Error("salts must differ")
	}
	for _, bad := range []string{"", "plain", "$argon2i$v=19$m=65536,t=3,p=2$c2FsdHNhbHQ$aGFzaA", "$argon2id$v=19$m=999999999,t=3,p=2$c2FsdHNhbHRzYWx0$aGFzaGhhc2hoYXNoaGFzaA"} {
		if _, err := VerifyPassword("x", bad); err == nil {
			t.Errorf("expected error for %q", bad)
		}
	}
	if ValidateNewPassword("1234567") == nil || ValidateNewPassword("12345678") != nil || ValidateNewPassword(strings.Repeat("a", 257)) == nil {
		t.Error("password length validation")
	}
}

func TestToken(t *testing.T) {
	tok, id, err := NewToken()
	if err != nil {
		t.Fatal(err)
	}
	if !PlausibleToken(tok) || HashToken(tok) != id || len(id) != 64 {
		t.Errorf("token %q id %q", tok, id)
	}
	tok2, _, _ := NewToken()
	if tok == tok2 {
		t.Error("tokens must be random")
	}
	if PlausibleToken("short") || PlausibleToken(strings.Repeat("!", 43)) {
		t.Error("plausibility check")
	}
}

func TestLimiter(t *testing.T) {
	clk := clock.NewFake(time.Date(2026, 10, 11, 0, 0, 0, 0, time.UTC))
	l := NewLimiter(clk, 5, 15*time.Minute)
	for i := 0; i < 5; i++ {
		if !l.Attempt("1.2.3.4") {
			t.Fatalf("attempt %d should be allowed", i+1)
		}
		clk.Advance(time.Minute)
	}
	if l.Attempt("1.2.3.4") {
		t.Fatal("6th attempt must be blocked")
	}
	if !l.Attempt("5.6.7.8") {
		t.Fatal("other IPs are independent")
	}
	if ra := l.RetryAfter("1.2.3.4"); ra != 10*time.Minute {
		t.Errorf("retry after = %v", ra)
	}
	// The oldest attempt leaves the window after 15 minutes.
	clk.Advance(10 * time.Minute)
	if !l.Attempt("1.2.3.4") {
		t.Fatal("should be allowed after the window slides")
	}
	if l.Attempt("1.2.3.4") {
		t.Fatal("only one slot was freed")
	}
	l.Reset("1.2.3.4")
	if !l.Attempt("1.2.3.4") {
		t.Fatal("reset must clear attempts")
	}
}
