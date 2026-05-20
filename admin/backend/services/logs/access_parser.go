package logs

import (
	"encoding/json"
	"regexp"
	"strings"
	"time"
)

// ---------- access log regex ----------

// textAccessLogRegex matches text-format access log lines (lancache cachelog
// format):
//
//	[steam] 192.168.1.100 / - - [17/Mar/2026:14:22:01 +0000] "GET /path HTTP/1.1" 200 1048576 "-" "User-Agent" "HIT" "host" "-" 0.123
//
// Groups: 1=cache_id, 2=status_code, 3=bytes, 4=cache_status, 5=host, 6=range, 7=response_time
var textAccessLogRegex = regexp.MustCompile(
	`^\[([^\]]*)\]\s+.*?"[A-Z]+\s+\S+.*?"\s+(\d+)\s+(\d+)\s+"[^"]*"\s+"[^"]*"\s+"([^"]*)"\s+"([^"]*)"\s+"([^"]*)"\s*(\S*)`,
)

// bandwidthLogRegex captures: 1=cache_id, 2=client_ip, 3=bytes_sent, 4=cache_status
var bandwidthLogRegex = regexp.MustCompile(
	`^\[([^\]]*)\]\s+(\S+)\s+.*?"[A-Z]+\s+\S+.*?"\s+\d+\s+(\d+)\s+"[^"]*"\s+"[^"]*"\s+"([^"]*)"`,
)

// accessLogTimeRegex extracts the nginx timestamp from access log lines: [02/Jan/2006:15:04:05 -0700]
var accessLogTimeRegex = regexp.MustCompile(`\[(\d{2}/\w{3}/\d{4}:\d{2}:\d{2}:\d{2}\s+[^\]]+)\]`)

// jsonTimeLocalRegex extracts time_local from JSON access log lines: "time_local":"17/Mar/2026:14:22:01 +0000"
var jsonTimeLocalRegex = regexp.MustCompile(`"time_local"\s*:\s*"([^"]+)"`)

// ---------- access log time parsing ----------

// parseAccessLogTime extracts and parses the timestamp from an access log line
// (text or JSON format).
func parseAccessLogTime(line string) (time.Time, bool) {
	if m := accessLogTimeRegex.FindStringSubmatch(line); m != nil {
		if t, err := time.Parse("02/Jan/2006:15:04:05 -0700", m[1]); err == nil {
			return t, true
		}
	}
	if len(line) > 0 && line[0] == '{' {
		if m := jsonTimeLocalRegex.FindStringSubmatch(line); m != nil {
			if t, err := time.Parse("02/Jan/2006:15:04:05 -0700", m[1]); err == nil {
				return t, true
			}
		}
	}
	return time.Time{}, false
}

// AccessLogTimeParser is the parser closure used by ForEachLogLine when
// walking access logs leniently — lines without a recoverable timestamp
// are still delivered to body (with parsed=zero) so caller bookkeeping
// that doesn't need a time (cache-status extraction, host counting, etc.)
// still runs. Matches the previous "safe default: keep" behaviour.
func AccessLogTimeParser(line string) (time.Time, bool) {
	t, _ := parseAccessLogTime(line)
	return t, true
}

// ---------- cache status extraction ----------

// extractCacheStatus returns the cache status (HIT, MISS, etc.) from an access
// log line. Handles both text and JSON formats.
func extractCacheStatus(line string) string {
	line = strings.TrimSpace(line)
	if line == "" {
		return ""
	}

	// JSON format: first char is '{'
	if line[0] == '{' {
		var entry struct {
			CacheStatus string `json:"upstream_cache_status"`
		}
		if err := json.Unmarshal([]byte(line), &entry); err == nil && entry.CacheStatus != "" {
			return strings.ToUpper(entry.CacheStatus)
		}
		return ""
	}

	// Text format: cache_status is in quotes near end of line (group 4)
	if line[0] == '[' {
		match := textAccessLogRegex.FindStringSubmatch(line)
		if len(match) > 4 {
			status := strings.TrimSpace(match[4])
			if status != "" && status != "-" {
				return strings.ToUpper(status)
			}
		}
	}

	return ""
}

// ---------- since-filtering for pre-loaded line slices ----------

// filterAccessLinesSince returns only access log lines with a timestamp >= since.
// Lines without a parseable timestamp are kept (safe default).
func filterAccessLinesSince(lines []string, since time.Time) []string {
	if since.IsZero() {
		return lines
	}
	out := make([]string, 0, len(lines))
	for _, line := range lines {
		t, _ := parseAccessLogTime(line)
		if ApplySinceFilter(t, since) {
			continue
		}
		out = append(out, line)
	}
	return out
}

// filterErrorLinesSince returns only error log lines with a timestamp >= since.
// Lines without a parseable timestamp are kept (safe default).
func filterErrorLinesSince(lines []string, since time.Time) []string {
	if since.IsZero() {
		return lines
	}
	out := make([]string, 0, len(lines))
	for _, line := range lines {
		var parsed time.Time
		if m, ok := parseErrorLogLine(line); ok {
			parsed = m.Time
		}
		if ApplySinceFilter(parsed, since) {
			continue
		}
		out = append(out, line)
	}
	return out
}
