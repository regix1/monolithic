package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"os"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

// Log file paths
const (
	errorLogPath            = "/data/logs/error.log"
	upstreamFallbackLogPath = "/data/logs/upstream-fallback.log"
	accessLogPath           = "/data/logs/access.log"
)

// ---------- types ----------

type ErrorLogEntry struct {
	Time    string `json:"time"`
	Level   string `json:"level"`
	Message string `json:"message"`
}

type UpstreamLogEntry struct {
	Time   string `json:"time"`
	Host   string `json:"host"`
	Status string `json:"status"`
}

type CacheStatusEntry struct {
	Name  string  `json:"name"`
	Value float64 `json:"value"`
	Count int     `json:"count"`
	Color string  `json:"color"`
}

type ErrorRateBucket struct {
	Time   string `json:"time"`
	Errors int    `json:"errors"`
}

type NosliceEvent struct {
	Time  string `json:"time"`
	Host  string `json:"host"`
	Error string `json:"error"`
}

type ResponseTimes struct {
	Avg string `json:"avg"`
	P95 string `json:"p95"`
	P99 string `json:"p99"`
}

type LogStatsResponse struct {
	CacheStatus   []CacheStatusEntry `json:"cache_status"`
	ErrorRate     []ErrorRateBucket  `json:"error_rate"`
	RecentErrors  []ErrorLogEntry    `json:"recent_errors"`
	NosliceEvents []NosliceEvent     `json:"noslice_events"`
	ResponseTimes ResponseTimes      `json:"response_times"`
}

// ---------- regex ----------

// Matches nginx error log lines:
//
//	2026/03/16 14:52:01 [error] 123#0: *456 upstream prematurely closed...
var errorLogRegex = regexp.MustCompile(
	`^(\d{4}/\d{2}/\d{2}\s+\d{2}:\d{2}:\d{2})\s+\[(\w+)\]\s+\d+#\d+:\s+(?:\*\d+\s+)?(.*)`,
)

// Matches text-format access log lines:
//
//	[steam] 192.168.1.100 HIT "GET /depot/123/chunk/abc" 200 1048576 "Mozilla/5.0" 0.142
var textAccessLogRegex = regexp.MustCompile(
	`^\[([^\]]*)\]\s+(\S+)\s+(\S+)\s+"([^"]*)"\s+(\d+)\s+(\d+)\s+"([^"]*)"\s+(\S+)`,
)

// ---------- handlers ----------

// LogErrors handles GET /api/logs/errors.
func LogErrors(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	entries, err := parseErrorLog(errorLogPath, 50)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to read error log: "+err.Error())
		return
	}

	writeJSON(w, entries)
}

// LogUpstream handles GET /api/logs/upstream.
func LogUpstream(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	entries, err := parseUpstreamLog(upstreamFallbackLogPath, 50)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to read upstream log: "+err.Error())
		return
	}

	writeJSON(w, entries)
}

// LogStats handles GET /api/logs/stats.
func LogStats(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	cacheStatus := computeCacheStatus(accessLogPath, 10000)
	errorRate := computeErrorRate(errorLogPath)
	recentErrors, _ := parseErrorLog(errorLogPath, 20)
	if recentErrors == nil {
		recentErrors = []ErrorLogEntry{}
	}
	nosliceEvents := findNosliceEvents(errorLogPath)
	responseTimes := computeResponseTimes(accessLogPath, 1000)

	resp := LogStatsResponse{
		CacheStatus:   cacheStatus,
		ErrorRate:     errorRate,
		RecentErrors:  recentErrors,
		NosliceEvents: nosliceEvents,
		ResponseTimes: responseTimes,
	}

	writeJSON(w, resp)
}

// ---------- tailFile helper ----------

// tailFile reads the last n lines from a file by seeking from the end.
func tailFile(path string, n int) ([]string, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	stat, err := f.Stat()
	if err != nil {
		return nil, err
	}

	size := stat.Size()
	if size == 0 {
		return []string{}, nil
	}

	// Read backwards in chunks to find enough newlines.
	const chunkSize = 8192
	buf := make([]byte, 0, chunkSize)
	lines := 0
	offset := size

	for offset > 0 && lines <= n {
		readSize := int64(chunkSize)
		if readSize > offset {
			readSize = offset
		}
		offset -= readSize

		chunk := make([]byte, readSize)
		_, err := f.ReadAt(chunk, offset)
		if err != nil && err != io.EOF {
			return nil, err
		}

		buf = append(chunk, buf...)

		for _, b := range chunk {
			if b == '\n' {
				lines++
			}
		}
	}

	allLines := strings.Split(string(buf), "\n")

	// Trim trailing empty line from final newline.
	if len(allLines) > 0 && allLines[len(allLines)-1] == "" {
		allLines = allLines[:len(allLines)-1]
	}

	if len(allLines) > n {
		allLines = allLines[len(allLines)-n:]
	}

	return allLines, nil
}

// ---------- error log parsing ----------

func parseErrorLog(path string, n int) ([]ErrorLogEntry, error) {
	lines, err := tailFile(path, n)
	if err != nil {
		return nil, err
	}

	entries := make([]ErrorLogEntry, 0, len(lines))
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		match := errorLogRegex.FindStringSubmatch(line)
		if match == nil {
			continue
		}

		ts := convertErrorTimestamp(match[1])
		entries = append(entries, ErrorLogEntry{
			Time:    ts,
			Level:   match[2],
			Message: match[3],
		})
	}

	return entries, nil
}

// convertErrorTimestamp converts "2026/03/16 14:52:01" to "2026-03-16 14:52:01".
func convertErrorTimestamp(ts string) string {
	return strings.Replace(ts, "/", "-", 2)
}

// ---------- upstream log parsing ----------

func parseUpstreamLog(path string, n int) ([]UpstreamLogEntry, error) {
	lines, err := tailFile(path, n)
	if err != nil {
		return nil, err
	}

	entries := make([]UpstreamLogEntry, 0, len(lines))
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		entry := parseUpstreamLine(line)
		if entry.Time != "" {
			entries = append(entries, entry)
		}
	}

	return entries, nil
}

// parseUpstreamLine extracts timestamp, host, and reason from an upstream fallback log line.
// Expected format variants:
//
//	2026/03/16 14:22:01 steampipe.akamaized.net stale_keepalive
//	[2026-03-16T14:22:01+00:00] steampipe.akamaized.net stale_keepalive
func parseUpstreamLine(line string) UpstreamLogEntry {
	fields := strings.Fields(line)
	if len(fields) < 3 {
		return UpstreamLogEntry{}
	}

	// Try to detect format: if first field looks like a date YYYY/MM/DD
	if len(fields) >= 4 && len(fields[0]) == 10 && (fields[0][4] == '/' || fields[0][4] == '-') {
		ts := convertErrorTimestamp(fields[0]) + " " + fields[1]
		host := fields[2]
		status := ""
		if len(fields) >= 4 {
			status = fields[3]
		}
		return UpstreamLogEntry{Time: ts, Host: host, Status: status}
	}

	// Bracketed timestamp format
	if strings.HasPrefix(fields[0], "[") {
		tsRaw := strings.Trim(fields[0], "[]")
		if t, err := time.Parse(time.RFC3339, tsRaw); err == nil {
			ts := t.Format("2006-01-02 15:04:05")
			host := fields[1]
			status := ""
			if len(fields) >= 3 {
				status = strings.Trim(fields[2], "[]")
			}
			return UpstreamLogEntry{Time: ts, Host: host, Status: status}
		}
	}

	// Fallback: best effort
	return UpstreamLogEntry{
		Time:   fields[0],
		Host:   fields[1],
		Status: strings.Join(fields[2:], " "),
	}
}

// ---------- cache status ----------

var cacheStatusColors = map[string]string{
	"HIT":      "#4ade80",
	"MISS":     "#60a5fa",
	"EXPIRED":  "#fbbf24",
	"STALE":    "#a0a0a0",
	"BYPASS":   "#f87171",
	"UPDATING": "#c084fc",
}

// cacheStatusOrder defines the display order.
var cacheStatusOrder = []string{"HIT", "MISS", "EXPIRED", "STALE", "BYPASS", "UPDATING"}

func computeCacheStatus(path string, n int) []CacheStatusEntry {
	lines, err := tailFile(path, n)
	if err != nil {
		return []CacheStatusEntry{}
	}

	counts := make(map[string]int)
	total := 0

	for _, line := range lines {
		status := extractCacheStatus(line)
		if status == "" {
			continue
		}
		counts[status]++
		total++
	}

	if total == 0 {
		return []CacheStatusEntry{}
	}

	entries := make([]CacheStatusEntry, 0, len(cacheStatusOrder))
	for _, name := range cacheStatusOrder {
		count := counts[name]
		if count == 0 {
			continue
		}
		pct := float64(count) / float64(total) * 100
		pct = math.Round(pct*10) / 10

		color := cacheStatusColors[name]
		entries = append(entries, CacheStatusEntry{
			Name:  name,
			Value: pct,
			Count: count,
			Color: color,
		})
	}

	return entries
}

// extractCacheStatus returns the cache status (HIT, MISS, etc.) from an access log line.
// Handles both text and JSON formats.
func extractCacheStatus(line string) string {
	line = strings.TrimSpace(line)
	if line == "" {
		return ""
	}

	// JSON format: first char is '{'
	if line[0] == '{' {
		var entry struct {
			CacheStatus string `json:"cache_status"`
		}
		if err := json.Unmarshal([]byte(line), &entry); err == nil && entry.CacheStatus != "" {
			return strings.ToUpper(entry.CacheStatus)
		}
		return ""
	}

	// Text format: [cache_id] client_ip cache_status "request" ...
	if line[0] == '[' {
		match := textAccessLogRegex.FindStringSubmatch(line)
		if match != nil {
			return strings.ToUpper(match[3])
		}
	}

	return ""
}

// ---------- error rate (5-minute buckets, last hour) ----------

func computeErrorRate(path string) []ErrorRateBucket {
	lines, err := tailFile(path, 5000)
	if err != nil {
		return []ErrorRateBucket{}
	}

	now := time.Now()
	oneHourAgo := now.Add(-1 * time.Hour)

	// Round oneHourAgo down to nearest 5-minute boundary so bucket labels align.
	startMinute := oneHourAgo.Minute() - (oneHourAgo.Minute() % 5)
	bucketStart := time.Date(oneHourAgo.Year(), oneHourAgo.Month(), oneHourAgo.Day(),
		oneHourAgo.Hour(), startMinute, 0, 0, oneHourAgo.Location())

	// Create 12 five-minute buckets covering the last hour.
	buckets := make(map[string]int)
	bucketTimes := make([]string, 0, 12)

	for i := 0; i < 12; i++ {
		t := bucketStart.Add(time.Duration(i) * 5 * time.Minute)
		label := t.Format("15:04")
		buckets[label] = 0
		bucketTimes = append(bucketTimes, label)
	}

	for _, line := range lines {
		match := errorLogRegex.FindStringSubmatch(line)
		if match == nil {
			continue
		}

		// Use local timezone since nginx logs use server-local time.
		t, err := time.ParseInLocation("2006/01/02 15:04:05", match[1], time.Local)
		if err != nil {
			continue
		}

		if t.Before(oneHourAgo) {
			continue
		}

		// Round down to 5-minute bucket.
		minute := t.Minute()
		bucketMinute := minute - (minute % 5)
		label := fmt.Sprintf("%02d:%02d", t.Hour(), bucketMinute)

		if _, ok := buckets[label]; ok {
			buckets[label]++
		}
	}

	result := make([]ErrorRateBucket, 0, len(bucketTimes))
	for _, label := range bucketTimes {
		result = append(result, ErrorRateBucket{
			Time:   label,
			Errors: buckets[label],
		})
	}

	return result
}

// ---------- noslice events ----------

func findNosliceEvents(path string) []NosliceEvent {
	lines, err := tailFile(path, 5000)
	if err != nil {
		return []NosliceEvent{}
	}

	events := make([]NosliceEvent, 0)

	for _, line := range lines {
		lower := strings.ToLower(line)
		if !strings.Contains(lower, "unexpected status code") && !strings.Contains(lower, "slice") {
			continue
		}

		match := errorLogRegex.FindStringSubmatch(line)
		if match == nil {
			continue
		}

		ts := convertErrorTimestamp(match[1])
		msg := match[3]
		host := extractHostFromMessage(msg)

		events = append(events, NosliceEvent{
			Time:  ts,
			Host:  host,
			Error: msg,
		})
	}

	return events
}

// extractHostFromMessage attempts to pull a hostname from an error message.
// Looks for patterns like "host: cdn.example.com" or common URL fragments.
var hostInMessageRegex = regexp.MustCompile(`(?:host:\s*"?|upstream:\s*"?https?://|server:\s*"?)([a-zA-Z0-9][-a-zA-Z0-9.]*\.[a-zA-Z]{2,})`)

func extractHostFromMessage(msg string) string {
	match := hostInMessageRegex.FindStringSubmatch(msg)
	if len(match) > 1 {
		return match[1]
	}
	return ""
}

// ---------- response times ----------

func computeResponseTimes(path string, n int) ResponseTimes {
	lines, err := tailFile(path, n)
	if err != nil {
		return ResponseTimes{Avg: "-", P95: "-", P99: "-"}
	}

	times := make([]float64, 0, len(lines))

	for _, line := range lines {
		rt := extractResponseTime(line)
		if rt >= 0 {
			times = append(times, rt)
		}
	}

	if len(times) == 0 {
		return ResponseTimes{Avg: "-", P95: "-", P99: "-"}
	}

	sort.Float64s(times)

	avg := mean(times)
	p95 := percentile(times, 95)
	p99 := percentile(times, 99)

	return ResponseTimes{
		Avg: fmt.Sprintf("%.3fs", avg),
		P95: fmt.Sprintf("%.3fs", p95),
		P99: fmt.Sprintf("%.3fs", p99),
	}
}

// extractResponseTime returns the upstream response time from an access log line.
// Returns -1 if not found or not parseable.
func extractResponseTime(line string) float64 {
	line = strings.TrimSpace(line)
	if line == "" {
		return -1
	}

	// JSON format
	if line[0] == '{' {
		var entry struct {
			UpstreamResponseTime string `json:"upstream_response_time"`
		}
		if err := json.Unmarshal([]byte(line), &entry); err == nil && entry.UpstreamResponseTime != "" {
			if v, err := strconv.ParseFloat(entry.UpstreamResponseTime, 64); err == nil {
				return v
			}
		}
		return -1
	}

	// Text format: last field is the upstream_response_time
	if line[0] == '[' {
		match := textAccessLogRegex.FindStringSubmatch(line)
		if len(match) > 8 {
			if v, err := strconv.ParseFloat(match[8], 64); err == nil {
				return v
			}
		}
	}

	return -1
}

func mean(vals []float64) float64 {
	if len(vals) == 0 {
		return 0
	}
	sum := 0.0
	for _, v := range vals {
		sum += v
	}
	return sum / float64(len(vals))
}

func percentile(sorted []float64, pct float64) float64 {
	if len(sorted) == 0 {
		return 0
	}
	idx := int(math.Ceil(pct/100*float64(len(sorted)))) - 1
	if idx < 0 {
		idx = 0
	}
	if idx >= len(sorted) {
		idx = len(sorted) - 1
	}
	return sorted[idx]
}
