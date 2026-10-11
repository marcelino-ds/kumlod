package domain

import (
	"fmt"
	"math"
	"net/url"
	"strings"
	"time"
	"unicode/utf8"
)

// DateLayout is the local date format (YYYY-MM-DD).
const DateLayout = "2006-01-02"

// TimeLayout is the local time-of-day format (HH:MM, 24 hours).
const TimeLayout = "15:04"

// ValidDate reports whether s is a real calendar date in YYYY-MM-DD form.
func ValidDate(s string) bool {
	if len(s) != 10 {
		return false
	}
	t, err := time.Parse(DateLayout, s)
	return err == nil && t.Format(DateLayout) == s
}

// ValidTime reports whether s is HH:MM between 00:00 and 23:59.
func ValidTime(s string) bool {
	if len(s) != 5 || s[2] != ':' {
		return false
	}
	for _, i := range []int{0, 1, 3, 4} {
		if s[i] < '0' || s[i] > '9' {
			return false
		}
	}
	h := int(s[0]-'0')*10 + int(s[1]-'0')
	m := int(s[3]-'0')*10 + int(s[4]-'0')
	return h <= 23 && m <= 59
}

// ValidOptionalTime reports whether s is empty or a valid HH:MM time.
func ValidOptionalTime(s string) bool { return s == "" || ValidTime(s) }

// ParseDate parses a YYYY-MM-DD date as midnight UTC.
func ParseDate(s string) (time.Time, error) {
	if !ValidDate(s) {
		return time.Time{}, fmt.Errorf("tanggal tidak valid: %q", s)
	}
	return time.Parse(DateLayout, s)
}

// LocalDate returns the calendar date of t in loc.
func LocalDate(t time.Time, loc *time.Location) string {
	return t.In(loc).Format(DateLayout)
}

// AddDays adds n days to a YYYY-MM-DD date.
func AddDays(date string, n int) (string, error) {
	t, err := ParseDate(date)
	if err != nil {
		return "", err
	}
	return t.AddDate(0, 0, n).Format(DateLayout), nil
}

// LocalDateTime combines a local date and HH:MM time into an instant in loc.
func LocalDateTime(date, hhmm string, loc *time.Location) (time.Time, error) {
	d, err := ParseDate(date)
	if err != nil {
		return time.Time{}, err
	}
	if !ValidTime(hhmm) {
		return time.Time{}, fmt.Errorf("jam tidak valid: %q", hhmm)
	}
	h := int(hhmm[0]-'0')*10 + int(hhmm[1]-'0')
	m := int(hhmm[3]-'0')*10 + int(hhmm[4]-'0')
	return time.Date(d.Year(), d.Month(), d.Day(), h, m, 0, 0, loc), nil
}

// StartOfLocalDay returns midnight of date in loc.
func StartOfLocalDay(date string, loc *time.Location) (time.Time, error) {
	d, err := ParseDate(date)
	if err != nil {
		return time.Time{}, err
	}
	return time.Date(d.Year(), d.Month(), d.Day(), 0, 0, 0, 0, loc), nil
}

// ISOWeekday returns the ISO day of week: 1 = Monday ... 7 = Sunday.
func ISOWeekday(t time.Time) int {
	wd := int(t.Weekday())
	if wd == 0 {
		return 7
	}
	return wd
}

// Round rounds x to the given number of decimal places (half away from zero).
func Round(x float64, places int) float64 {
	p := math.Pow(10, float64(places))
	return math.Round(x*p) / p
}

// CeilTo rounds x up to the given number of decimal places, ignoring
// floating point noise below 1e-9 of the last place.
func CeilTo(x float64, places int) float64 {
	p := math.Pow(10, float64(places))
	return math.Ceil(x*p-1e-9) / p
}

// RoundPtr rounds a nullable number.
func RoundPtr(x *float64, places int) *float64 {
	if x == nil {
		return nil
	}
	r := Round(*x, places)
	return &r
}

// ValidHTTPURL reports whether s is an absolute http or https URL with a host.
func ValidHTTPURL(s string) bool {
	if strings.TrimSpace(s) != s || s == "" {
		return false
	}
	u, err := url.Parse(s)
	if err != nil {
		return false
	}
	return (u.Scheme == "http" || u.Scheme == "https") && u.Host != ""
}

// RuneLen returns the number of characters in s.
func RuneLen(s string) int { return utf8.RuneCountInString(s) }

// ValidHexColor reports whether s is #RRGGBB.
func ValidHexColor(s string) bool {
	if len(s) != 7 || s[0] != '#' {
		return false
	}
	for i := 1; i < 7; i++ {
		c := s[i]
		if !(c >= '0' && c <= '9' || c >= 'a' && c <= 'f' || c >= 'A' && c <= 'F') {
			return false
		}
	}
	return true
}
