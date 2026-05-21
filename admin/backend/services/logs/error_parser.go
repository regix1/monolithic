package logs

import (
	"regexp"
	"strings"
	"time"

	"github.com/lancachenet/monolithic/admin/models"
)

// ---------- error log parsing ----------

// ParseErrorLog returns up to n recent error.log entries filtered by since.
// A zero since disables filtering.
func ParseErrorLog(path string, n int, since time.Time) ([]models.ErrorLogEntry, error) {
	lines, err := TailFile(path, n)
	if err != nil {
		return nil, err
	}

	entries := make([]models.ErrorLogEntry, 0, len(lines))
	forEachErrorLogMatch(lines, since, func(m ErrorLogMatch) {
		host := extractHostFromMessage(m.Msg)
		entries = append(entries, models.ErrorLogEntry{
			Time:     convertErrorTimestamp(m.TimeRaw),
			Level:    m.Level,
			ClientIP: extractClientIP(m.Msg),
			Host:     host,
			Service:  ServiceForHost(host),
			Message:  m.Msg,
		})
	})

	return entries, nil
}

// convertErrorTimestamp converts "2026/03/16 14:52:01" to "2026-03-16 14:52:01".
func convertErrorTimestamp(ts string) string {
	return strings.Replace(ts, "/", "-", 2)
}

// ---------- error-log field extractors ----------

// clientIPRegex extracts the client IP from nginx error log messages: "client: 127.0.0.1"
var clientIPRegex = regexp.MustCompile(`client:\s*(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})`)

// extractClientIP returns the IPv4 client address embedded in an nginx error
// message, or "" when no client field is present.
func extractClientIP(msg string) string {
	match := clientIPRegex.FindStringSubmatch(msg)
	if len(match) > 1 {
		return match[1]
	}
	return ""
}

// hostInMessageRegex pulls a hostname out of an error message.
// Looks for patterns like "host: cdn.example.com" or common URL fragments.
var hostInMessageRegex = regexp.MustCompile(`(?:host:\s*"?|upstream:\s*"?https?://|server:\s*"?)([a-zA-Z0-9][-a-zA-Z0-9.]*\.[a-zA-Z]{2,})`)

// extractHostFromMessage returns the first hostname mentioned in an nginx
// error message via the host/upstream/server prefixes, or "" if none match.
func extractHostFromMessage(msg string) string {
	match := hostInMessageRegex.FindStringSubmatch(msg)
	if len(match) > 1 {
		return match[1]
	}
	return ""
}

// ---------- error rate / recent errors / noslice aggregator ----------

// processErrorLog computes error rate buckets, recent errors list, and noslice
// events in a single pass over the error log lines.
func processErrorLog(lines []string, hours int, since time.Time) ([]models.ErrorRateBucket, []models.ErrorLogEntry, []models.NosliceEvent) {
	now := time.Now()
	rateSince := now.Add(-time.Duration(hours) * time.Hour)

	// ---- set up error-rate buckets ----
	var bucketDuration time.Duration
	var bucketCount int
	var labelFormat string

	if hours <= 24 {
		bucketDuration = time.Hour
		bucketCount = hours
		labelFormat = "15:00"
	} else {
		bucketDuration = 24 * time.Hour
		bucketCount = hours / 24
		labelFormat = "Jan 2"
	}

	var bucketStart time.Time
	if hours <= 24 {
		bucketStart = time.Date(rateSince.Year(), rateSince.Month(), rateSince.Day(), rateSince.Hour(), 0, 0, 0, rateSince.Location())
	} else {
		bucketStart = time.Date(rateSince.Year(), rateSince.Month(), rateSince.Day(), 0, 0, 0, 0, rateSince.Location())
	}

	buckets := make(map[string]int)
	bucketTimes := make([]string, 0, bucketCount)
	for i := 0; i < bucketCount; i++ {
		t := bucketStart.Add(time.Duration(i) * bucketDuration)
		label := t.Format(labelFormat)
		buckets[label] = 0
		bucketTimes = append(bucketTimes, label)
	}

	// ---- accumulators ----
	recentErrors := make([]models.ErrorLogEntry, 0, 50)
	nosliceEvents := make([]models.NosliceEvent, 0)

	// Pass time.Time{} as the walker's since — we have two cutoffs
	// (rateSince for buckets, since for recent/noslice) that the body
	// applies individually.
	forEachErrorLogMatch(lines, time.Time{}, func(m ErrorLogMatch) {
		t := m.Time
		ts := convertErrorTimestamp(m.TimeRaw)
		level := m.Level
		msg := m.Msg

		// ---- error rate buckets (uses rateSince which may differ from since) ----
		if !t.Before(rateSince) {
			var bucketTime time.Time
			if hours <= 24 {
				bucketTime = time.Date(t.Year(), t.Month(), t.Day(), t.Hour(), 0, 0, 0, t.Location())
			} else {
				bucketTime = time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, t.Location())
			}
			label := bucketTime.Format(labelFormat)
			if _, ok := buckets[label]; ok {
				buckets[label]++
			}
		}

		// ---- filter by since for recent errors and noslice events ----
		if ApplySinceFilter(t, since) {
			return
		}

		clientIP := extractClientIP(msg)
		host := extractHostFromMessage(msg)
		service := ServiceForHost(host)

		// ---- recent errors (accumulate all, trim to newest 50 after loop) ----
		recentErrors = append(recentErrors, models.ErrorLogEntry{
			Time:     ts,
			Level:    level,
			ClientIP: clientIP,
			Host:     host,
			Service:  service,
			Message:  msg,
		})

		// ---- noslice events ----
		lower := strings.ToLower(m.Raw)
		if strings.Contains(lower, "unexpected status code") || strings.Contains(lower, "slice") {
			nosliceEvents = append(nosliceEvents, models.NosliceEvent{
				Time:     ts,
				ClientIP: clientIP,
				Host:     host,
				Service:  service,
				Error:    msg,
			})
		}
	})

	// Build error rate result
	errorRate := make([]models.ErrorRateBucket, 0, len(bucketTimes))
	for _, label := range bucketTimes {
		errorRate = append(errorRate, models.ErrorRateBucket{
			Time:   label,
			Errors: buckets[label],
		})
	}

	// Keep only the newest 50 errors
	if len(recentErrors) > 50 {
		recentErrors = recentErrors[len(recentErrors)-50:]
	}

	if recentErrors == nil {
		recentErrors = []models.ErrorLogEntry{}
	}

	return errorRate, recentErrors, nosliceEvents
}
