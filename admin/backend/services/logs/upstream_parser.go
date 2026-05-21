package logs

import (
	"fmt"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/lancachenet/monolithic/admin/models"
)

// ---------- upstream log parsing ----------

// ParseUpstreamLog returns up to n recent upstream-fallback.log entries
// filtered by since. A zero since disables filtering.
func ParseUpstreamLog(path string, n int, since time.Time) ([]models.UpstreamLogEntry, error) {
	lines, err := TailFile(path, n)
	if err != nil {
		return nil, err
	}

	entries := make([]models.UpstreamLogEntry, 0, len(lines))
	ForEachLogLine(lines, since, upstreamCombinedTimeParser, func(line string, parsed time.Time) {
		entry := parseUpstreamLine(line)
		if entry.Time != "" {
			entries = append(entries, entry)
		}
	})

	return entries, nil
}

// upstreamCombinedTimeParser is a lenient parser for upstream-fallback.log
// lines. Lines that don't match the nginx combined-log regex are still
// delivered to body (with parsed=zero) so legacy-format lines fall through
// to parseUpstreamLine, matching the pre-refactor "keep unparseable" semantics.
func upstreamCombinedTimeParser(line string) (time.Time, bool) {
	m := upstreamCombinedRegex.FindStringSubmatch(line)
	if m == nil {
		return time.Time{}, true // keep line, no since filter
	}
	t, err := time.Parse("02/Jan/2006:15:04:05 -0700", m[2])
	if err != nil {
		return time.Time{}, true // keep line, no since filter
	}
	return t, true
}

// upstreamCombinedRegex matches nginx combined log format used by upstream-fallback.log:
//
//	127.0.0.1 - - [17/Mar/2026:15:43:43 -0500] "GET /depot/2807966/chunk/... HTTP/1.0" 200 262208 "-" "Valve/Steam HTTP Client 1.0"
var upstreamCombinedRegex = regexp.MustCompile(
	`^(\S+)\s+\S+\s+\S+\s+\[([^\]]+)\]\s+"([A-Z]+)\s+(\S+)\s+[^"]*"\s+(\d+)\s+(\d+)`,
)

// parseUpstreamLine extracts timestamp, host/path, and status from an upstream fallback log line.
func parseUpstreamLine(line string) models.UpstreamLogEntry {
	// Try nginx combined format (actual upstream-fallback.log format)
	if m := upstreamCombinedRegex.FindStringSubmatch(line); m != nil {
		ts := parseNginxTimestamp(m[2])
		path := m[4]
		status := "fallback"
		httpStatus := m[5]
		if httpStatus == "200" || httpStatus == "206" {
			status = "fallback_ok"
		} else if httpStatus == "502" || httpStatus == "504" {
			status = "upstream_error"
		}
		return models.UpstreamLogEntry{Time: ts, Host: path, Status: status}
	}

	// Legacy format: YYYY/MM/DD HH:MM:SS hostname status
	fields := strings.Fields(line)
	if len(fields) >= 4 && len(fields[0]) == 10 && (fields[0][4] == '/' || fields[0][4] == '-') {
		ts := convertErrorTimestamp(fields[0]) + " " + fields[1]
		return models.UpstreamLogEntry{Time: ts, Host: fields[2], Status: fields[3]}
	}

	return models.UpstreamLogEntry{}
}

// parseNginxTimestamp converts "17/Mar/2026:15:43:43 -0500" to "2026-03-17 15:43:43".
func parseNginxTimestamp(raw string) string {
	t, err := time.Parse("02/Jan/2006:15:04:05 -0700", raw)
	if err != nil {
		return raw
	}
	return t.Format("2006-01-02 15:04:05")
}

// ---------- upstream health ----------

// ComputeUpstreamHealth reads upstream-error.log and delegates to
// computeUpstreamHealthFromLines with deduplication.
func ComputeUpstreamHealth(path string, n int, since time.Time) models.UpstreamHealthSummary {
	lines, err := TailFile(path, n)
	if err != nil {
		return models.UpstreamHealthSummary{TopHosts: []models.UpstreamErrorHost{}}
	}
	return computeUpstreamHealthFromLines(lines, since)
}

// computeUpstreamHealthFromLines computes upstream health stats from pre-loaded
// lines. Nginx writes 2-4 error lines per failed upstream request; lines sharing
// the same second-level timestamp AND client IP are deduplicated so each failed
// request counts as exactly one error.
func computeUpstreamHealthFromLines(lines []string, since time.Time) models.UpstreamHealthSummary {
	summary := models.UpstreamHealthSummary{TopHosts: []models.UpstreamErrorHost{}}
	hostCounts := make(map[string]int)

	// seen deduplicates lines by "unix_second:clientIP" so that multiple nginx
	// error lines emitted for the same upstream request count as one error.
	seen := make(map[string]bool)

	forEachErrorLogMatch(lines, since, func(m ErrorLogMatch) {
		clientIP := extractClientIP(m.Msg)

		// Deduplicate: same second + same client IP → same upstream request.
		dedupKey := fmt.Sprintf("%d:%s", m.Time.Unix(), clientIP)
		if seen[dedupKey] {
			return
		}
		seen[dedupKey] = true

		summary.TotalErrors++

		// Classify error type.
		lower := strings.ToLower(m.Msg)
		if strings.Contains(lower, "timed out") {
			summary.Timeouts++
		} else if strings.Contains(lower, "connection refused") {
			summary.ConnRefused++
		} else if strings.Contains(lower, "could not be resolved") || strings.Contains(lower, "resolver") {
			summary.DnsFailures++
		} else {
			summary.Other++
		}

		// Extract host from message.
		host := extractHostFromMessage(m.Msg)
		if host != "" {
			hostCounts[host]++
		}
	})

	// Build top hosts list sorted by count.
	type hostCount struct {
		host  string
		count int
	}
	var sorted []hostCount
	for h, c := range hostCounts {
		sorted = append(sorted, hostCount{h, c})
	}
	sort.Slice(sorted, func(i, j int) bool {
		return sorted[i].count > sorted[j].count
	})

	limit := 5
	if len(sorted) < limit {
		limit = len(sorted)
	}
	for i := 0; i < limit; i++ {
		summary.TopHosts = append(summary.TopHosts, models.UpstreamErrorHost{
			Host:    sorted[i].host,
			Service: ServiceForHost(sorted[i].host),
			Count:   sorted[i].count,
		})
	}

	return summary
}
