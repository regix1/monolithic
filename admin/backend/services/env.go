package services

import (
	"fmt"
	"os"
	"strings"
	"time"
)

// EnvFlag reads a boolean-shaped environment variable, returning def when the
// value is missing. Anything not equal to "true" (case-sensitive, matching the
// existing EnvOrDefault("X","false")=="true" idiom) is treated as false.
func EnvFlag(key string, def bool) bool {
	v, ok := os.LookupEnv(key)
	if !ok || v == "" {
		return def
	}
	return v == "true"
}

// SinceHoursAgo returns the timestamp `hours` hours before now. A non-positive
// hours yields a zero time (no since-filter) — useful for the "all data" path.
func SinceHoursAgo(hours int) time.Time {
	if hours <= 0 {
		return time.Time{}
	}
	return time.Now().Add(-time.Duration(hours) * time.Hour)
}

// NginxSignal invokes `nginx -s <signal>` via the shared RunCommand helper.
// On non-zero exit it returns an error whose message embeds nginx's stderr.
func NginxSignal(sig string) error {
	output, err := RunCommand("nginx", "-s", sig)
	if err != nil {
		if output != "" {
			return fmt.Errorf("nginx -s %s failed: %w: %s", sig, err, output)
		}
		return fmt.Errorf("nginx -s %s failed: %w", sig, err)
	}
	return nil
}

// ReadConfigHash returns the trimmed CONFIGHASH marker. A missing file is NOT
// an error — it returns ("", nil) so callers can render an empty hash. Any
// other I/O error is propagated.
func ReadConfigHash() (string, error) {
	data, err := os.ReadFile(ConfigHashPath)
	if err != nil {
		if os.IsNotExist(err) {
			return "", nil
		}
		return "", err
	}
	return strings.TrimSpace(string(data)), nil
}
