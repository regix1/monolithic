package services

import (
	"encoding/json"
	"io"
	"math"
	"os"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/lancachenet/monolithic/admin/models"
)

// Log file paths
const (
	ErrorLogPath            = "/data/logs/error.log"
	UpstreamFallbackLogPath = "/data/logs/upstream-fallback.log"
	AccessLogPath           = "/data/logs/access.log"
	UpstreamErrorLogPath    = "/data/logs/upstream-error.log"
)

// ---------- log stats cache ----------

var (
	logStatsCache     *models.LogStatsResponse
	logStatsCacheTime time.Time
	logStatsCacheTTL  = 30 * time.Second
	logStatsMu        sync.Mutex
)

func GetCachedLogStats() *models.LogStatsResponse {
	logStatsMu.Lock()
	defer logStatsMu.Unlock()
	if logStatsCache != nil && time.Since(logStatsCacheTime) < logStatsCacheTTL {
		return logStatsCache
	}
	return nil
}

func CacheLogStats(resp *models.LogStatsResponse) {
	logStatsMu.Lock()
	defer logStatsMu.Unlock()
	logStatsCache = resp
	logStatsCacheTime = time.Now()
}

// ---------- regex ----------

// Matches nginx error log lines:
//
//	2026/03/16 14:52:01 [error] 123#0: *456 upstream prematurely closed...
var errorLogRegex = regexp.MustCompile(
	`^(\d{4}/\d{2}/\d{2}\s+\d{2}:\d{2}:\d{2})\s+\[(\w+)\]\s+\d+#\d+:\s+(?:\*\d+\s+)?(.*)`,
)

// Matches text-format access log lines (lancache cachelog format):
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

func ParseErrorLog(path string, n int, since time.Time) ([]models.ErrorLogEntry, error) {
	lines, err := tailFile(path, n)
	if err != nil {
		return nil, err
	}

	entries := make([]models.ErrorLogEntry, 0, len(lines))
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		match := errorLogRegex.FindStringSubmatch(line)
		if match == nil {
			continue
		}

		// Filter by time window
		if !since.IsZero() {
			if t, err := time.ParseInLocation("2006/01/02 15:04:05", match[1], time.Local); err == nil {
				if t.Before(since) {
					continue
				}
			}
		}

		ts := convertErrorTimestamp(match[1])
		entries = append(entries, models.ErrorLogEntry{
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

func ParseUpstreamLog(path string, n int) ([]models.UpstreamLogEntry, error) {
	lines, err := tailFile(path, n)
	if err != nil {
		return nil, err
	}

	entries := make([]models.UpstreamLogEntry, 0, len(lines))
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
		// Extract a short path segment for display
		host := path
		if len(path) > 40 {
			host = path[:40] + "..."
		}
		return models.UpstreamLogEntry{Time: ts, Host: host, Status: status}
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

// ---------- cache status ----------

var cacheStatusColors = map[string]string{
	"HIT":      "#4ade80",
	"MISS":     "#60a5fa",
	"EXPIRED":  "#fbbf24",
	"STALE":    "#a0a0a0",
	"BYPASS":   "#a78bfa",
	"UPDATING": "#c084fc",
}

// cacheStatusOrder defines the display order.
var cacheStatusOrder = []string{"HIT", "MISS", "EXPIRED", "STALE", "BYPASS", "UPDATING"}

// accessLogTimeRegex extracts the nginx timestamp from access log lines: [02/Jan/2006:15:04:05 -0700]
var accessLogTimeRegex = regexp.MustCompile(`\[(\d{2}/\w{3}/\d{4}:\d{2}:\d{2}:\d{2}\s+[^\]]+)\]`)

func ComputeCacheStatus(path string, n int, since time.Time) []models.CacheStatusEntry {
	lines, err := tailFile(path, n)
	if err != nil {
		return []models.CacheStatusEntry{}
	}

	counts := make(map[string]int)
	total := 0

	for _, line := range lines {
		// Filter by time window
		if !since.IsZero() {
			if m := accessLogTimeRegex.FindStringSubmatch(line); m != nil {
				if t, err := time.Parse("02/Jan/2006:15:04:05 -0700", m[1]); err == nil {
					if t.Before(since) {
						continue
					}
				}
			}
		}

		status := extractCacheStatus(line)
		if status == "" {
			continue
		}
		counts[status]++
		total++
	}

	if total == 0 {
		return []models.CacheStatusEntry{}
	}

	entries := make([]models.CacheStatusEntry, 0, len(cacheStatusOrder))
	for _, name := range cacheStatusOrder {
		count := counts[name]
		if count == 0 {
			continue
		}
		pct := float64(count) / float64(total) * 100
		pct = math.Round(pct*10) / 10

		color := cacheStatusColors[name]
		entries = append(entries, models.CacheStatusEntry{
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
		if match != nil && len(match) > 4 {
			status := strings.TrimSpace(match[4])
			if status != "" && status != "-" {
				return strings.ToUpper(status)
			}
		}
	}

	return ""
}

// ---------- error rate (adaptive buckets) ----------

// ComputeErrorRate computes error counts in time buckets over the given duration.
// Bucket size adapts: <=24h uses hourly buckets, >24h uses daily buckets.
func ComputeErrorRate(path string, hours int) []models.ErrorRateBucket {
	lines, err := tailFile(path, 20000)
	if err != nil {
		return []models.ErrorRateBucket{}
	}

	now := time.Now()
	since := now.Add(-time.Duration(hours) * time.Hour)

	// Choose bucket size and count based on duration
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

	// Round start down to bucket boundary
	var bucketStart time.Time
	if hours <= 24 {
		bucketStart = time.Date(since.Year(), since.Month(), since.Day(), since.Hour(), 0, 0, 0, since.Location())
	} else {
		bucketStart = time.Date(since.Year(), since.Month(), since.Day(), 0, 0, 0, 0, since.Location())
	}

	buckets := make(map[string]int)
	bucketTimes := make([]string, 0, bucketCount)

	for i := 0; i < bucketCount; i++ {
		t := bucketStart.Add(time.Duration(i) * bucketDuration)
		label := t.Format(labelFormat)
		buckets[label] = 0
		bucketTimes = append(bucketTimes, label)
	}

	for _, line := range lines {
		match := errorLogRegex.FindStringSubmatch(line)
		if match == nil {
			continue
		}

		t, err := time.ParseInLocation("2006/01/02 15:04:05", match[1], time.Local)
		if err != nil {
			continue
		}

		if t.Before(since) {
			continue
		}

		// Round down to bucket
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

	result := make([]models.ErrorRateBucket, 0, len(bucketTimes))
	for _, label := range bucketTimes {
		result = append(result, models.ErrorRateBucket{
			Time:   label,
			Errors: buckets[label],
		})
	}

	return result
}

// ---------- noslice events ----------

func FindNosliceEvents(path string, since time.Time) []models.NosliceEvent {
	lines, err := tailFile(path, 5000)
	if err != nil {
		return []models.NosliceEvent{}
	}

	events := make([]models.NosliceEvent, 0)

	for _, line := range lines {
		lower := strings.ToLower(line)
		if !strings.Contains(lower, "unexpected status code") && !strings.Contains(lower, "slice") {
			continue
		}

		match := errorLogRegex.FindStringSubmatch(line)
		if match == nil {
			continue
		}

		// Filter by time window
		if !since.IsZero() {
			if t, err := time.ParseInLocation("2006/01/02 15:04:05", match[1], time.Local); err == nil {
				if t.Before(since) {
					continue
				}
			}
		}

		ts := convertErrorTimestamp(match[1])
		msg := match[3]
		host := extractHostFromMessage(msg)

		events = append(events, models.NosliceEvent{
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

// ---------- upstream health ----------

func ComputeUpstreamHealth(path string, n int, since time.Time) models.UpstreamHealthSummary {
	lines, err := tailFile(path, n)
	if err != nil {
		return models.UpstreamHealthSummary{TopHosts: []models.UpstreamErrorHost{}}
	}

	summary := models.UpstreamHealthSummary{TopHosts: []models.UpstreamErrorHost{}}
	hostCounts := make(map[string]int)

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		match := errorLogRegex.FindStringSubmatch(line)
		if match == nil {
			continue
		}

		// Filter by time window (skip if since is zero — no filter)
		if !since.IsZero() {
			if t, err := time.ParseInLocation("2006/01/02 15:04:05", match[1], time.Local); err == nil {
				if t.Before(since) {
					continue
				}
			}
		}

		msg := match[3]
		summary.TotalErrors++

		// Classify error type
		lower := strings.ToLower(msg)
		if strings.Contains(lower, "timed out") {
			summary.Timeouts++
		} else if strings.Contains(lower, "connection refused") {
			summary.ConnRefused++
		} else if strings.Contains(lower, "could not be resolved") || strings.Contains(lower, "resolver") {
			summary.DnsFailures++
		} else {
			summary.Other++
		}

		// Extract host from message
		host := extractHostFromMessage(msg)
		if host != "" {
			hostCounts[host]++
		}
	}

	// Build top hosts list sorted by count
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
			Host:  sorted[i].host,
			Count: sorted[i].count,
		})
	}

	return summary
}

// ---------- combined single-pass log stats ----------

// ComputeAllLogStats reads access.log and error.log once each, then computes
// all log statistics in a single pass per file. Upstream-error.log is handled
// separately because it is a different file.
func ComputeAllLogStats(accessLogPath, errorLogPath, upstreamErrorLogPath string, hours int, since time.Time) models.LogStatsResponse {
	// Read each file once
	accessLines, _ := tailFile(accessLogPath, 20000)
	errorLines, _ := tailFile(errorLogPath, 10000)

	// Single pass over access.log
	cacheStatus, bandwidth, svcStats := processAccessLog(accessLines, since)

	// Single pass over error.log
	errorRate, recentErrors, nosliceEvents := processErrorLog(errorLines, hours, since)

	// Upstream errors (separate file, cannot combine)
	upstreamHealth := ComputeUpstreamHealth(upstreamErrorLogPath, 5000, since)

	return models.LogStatsResponse{
		CacheStatus:    cacheStatus,
		ErrorRate:      errorRate,
		RecentErrors:   recentErrors,
		NosliceEvents:  nosliceEvents,
		ResponseTimes:  models.ResponseTimes{Avg: "-", P95: "-", P99: "-"},
		UpstreamHealth: upstreamHealth,
		Bandwidth:      bandwidth,
		Services:       svcStats,
	}
}

// processAccessLog computes cache status distribution, bandwidth summary, and
// per-service stats in a single pass over the access log lines.
func processAccessLog(lines []string, since time.Time) ([]models.CacheStatusEntry, models.BandwidthSummary, []models.ServiceStats) {
	// ---- cache status accumulators ----
	csCounts := make(map[string]int)
	csTotal := 0

	// ---- bandwidth accumulators ----
	var totalBytes, hitBytes uint64
	clients := make(map[string]bool)

	type svcAccum struct {
		requests int
		bytes    uint64
		bytesHit uint64
	}
	svcMap := make(map[string]*svcAccum)

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		// Time-window filter (shared between cache status and bandwidth)
		if !since.IsZero() {
			if m := accessLogTimeRegex.FindStringSubmatch(line); m != nil {
				if t, err := time.Parse("02/Jan/2006:15:04:05 -0700", m[1]); err == nil {
					if t.Before(since) {
						continue
					}
				}
			}
		}

		// ---- cache status extraction ----
		cacheStatus := extractCacheStatus(line)
		if cacheStatus != "" {
			csCounts[cacheStatus]++
			csTotal++
		}

		// ---- bandwidth / service extraction ----
		if line[0] == '[' {
			match := bandwidthLogRegex.FindStringSubmatch(line)
			if match != nil {
				cacheID := match[1]
				clientIP := match[2]
				bytesStr := match[3]
				bwCacheStatus := strings.ToUpper(strings.TrimSpace(match[4]))

				bytes, err := strconv.ParseUint(bytesStr, 10, 64)
				if err == nil {
					totalBytes += bytes
					if bwCacheStatus == "HIT" {
						hitBytes += bytes
					}
					clients[clientIP] = true

					svc, ok := svcMap[cacheID]
					if !ok {
						svc = &svcAccum{}
						svcMap[cacheID] = svc
					}
					svc.requests++
					svc.bytes += bytes
					if bwCacheStatus == "HIT" {
						svc.bytesHit += bytes
					}
				}
			}
		} else if line[0] == '{' {
			var entry struct {
				CacheIdentifier string `json:"cache_identifier"`
				RemoteAddr      string `json:"remote_addr"`
				BytesSent       uint64 `json:"bytes_sent"`
				CacheStatus     string `json:"upstream_cache_status"`
			}
			if err := json.Unmarshal([]byte(line), &entry); err == nil {
				totalBytes += entry.BytesSent
				status := strings.ToUpper(entry.CacheStatus)
				if status == "HIT" {
					hitBytes += entry.BytesSent
				}
				if entry.RemoteAddr != "" {
					clients[entry.RemoteAddr] = true
				}

				cacheID := entry.CacheIdentifier
				if cacheID == "" {
					cacheID = "unknown"
				}
				svc, ok := svcMap[cacheID]
				if !ok {
					svc = &svcAccum{}
					svcMap[cacheID] = svc
				}
				svc.requests++
				svc.bytes += entry.BytesSent
				if status == "HIT" {
					svc.bytesHit += entry.BytesSent
				}
			}
		}
	}

	// ---- build cache status result ----
	csEntries := make([]models.CacheStatusEntry, 0, len(cacheStatusOrder))
	if csTotal > 0 {
		for _, name := range cacheStatusOrder {
			count := csCounts[name]
			if count == 0 {
				continue
			}
			pct := float64(count) / float64(csTotal) * 100
			pct = math.Round(pct*10) / 10
			csEntries = append(csEntries, models.CacheStatusEntry{
				Name:  name,
				Value: pct,
				Count: count,
				Color: cacheStatusColors[name],
			})
		}
	}

	// ---- build bandwidth result ----
	var hitRate float64
	if totalBytes > 0 {
		hitRate = float64(hitBytes) / float64(totalBytes) * 100
		hitRate = math.Round(hitRate*10) / 10
	}
	bandwidth := models.BandwidthSummary{
		TotalServed:    totalBytes,
		BandwidthSaved: hitBytes,
		HitRateBytes:   hitRate,
		UniqueClients:  len(clients),
	}

	// ---- build services result ----
	svcList := make([]models.ServiceStats, 0, len(svcMap))
	for name, acc := range svcMap {
		var hr float64
		if acc.bytes > 0 {
			hr = float64(acc.bytesHit) / float64(acc.bytes) * 100
			hr = math.Round(hr*10) / 10
		}
		svcList = append(svcList, models.ServiceStats{
			Service:  name,
			Requests: acc.requests,
			Bytes:    acc.bytes,
			BytesHit: acc.bytesHit,
			HitRate:  hr,
		})
	}
	sort.Slice(svcList, func(i, j int) bool {
		return svcList[i].Bytes > svcList[j].Bytes
	})

	return csEntries, bandwidth, svcList
}

// processErrorLog computes error rate buckets, recent errors list, and noslice
// events in a single pass over the error log lines.
func processErrorLog(lines []string, hours int, since time.Time) ([]models.ErrorRateBucket, []models.ErrorLogEntry, []models.NosliceEvent) {
	now := time.Now()
	rateSince := now.Add(-time.Duration(hours) * time.Hour)

	// ---- set up error-rate buckets (same logic as ComputeErrorRate) ----
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

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		match := errorLogRegex.FindStringSubmatch(line)
		if match == nil {
			continue
		}

		// Parse the timestamp once
		t, err := time.ParseInLocation("2006/01/02 15:04:05", match[1], time.Local)
		if err != nil {
			continue
		}

		ts := convertErrorTimestamp(match[1])
		level := match[2]
		msg := match[3]

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
		if !since.IsZero() && t.Before(since) {
			continue
		}

		// ---- recent errors (keep last 50) ----
		if len(recentErrors) < 50 {
			recentErrors = append(recentErrors, models.ErrorLogEntry{
				Time:    ts,
				Level:   level,
				Message: msg,
			})
		} else {
			// We're reading tail lines (newest last), so keep all — they
			// are already the most recent. We just cap at 50.
		}

		// ---- noslice events ----
		lower := strings.ToLower(line)
		if strings.Contains(lower, "unexpected status code") || strings.Contains(lower, "slice") {
			host := extractHostFromMessage(msg)
			nosliceEvents = append(nosliceEvents, models.NosliceEvent{
				Time:  ts,
				Host:  host,
				Error: msg,
			})
		}
	}

	// Build error rate result
	errorRate := make([]models.ErrorRateBucket, 0, len(bucketTimes))
	for _, label := range bucketTimes {
		errorRate = append(errorRate, models.ErrorRateBucket{
			Time:   label,
			Errors: buckets[label],
		})
	}

	if recentErrors == nil {
		recentErrors = []models.ErrorLogEntry{}
	}

	return errorRate, recentErrors, nosliceEvents
}

// ---------- bandwidth stats ----------

func ComputeBandwidthStats(path string, n int, since time.Time) (models.BandwidthSummary, []models.ServiceStats) {
	lines, err := tailFile(path, n)
	if err != nil {
		return models.BandwidthSummary{}, []models.ServiceStats{}
	}

	var totalBytes, hitBytes uint64
	clients := make(map[string]bool)

	type svcAccum struct {
		requests int
		bytes    uint64
		bytesHit uint64
	}
	services := make(map[string]*svcAccum)

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		// Filter by time window
		if !since.IsZero() {
			if m := accessLogTimeRegex.FindStringSubmatch(line); m != nil {
				if t, err := time.Parse("02/Jan/2006:15:04:05 -0700", m[1]); err == nil {
					if t.Before(since) {
						continue
					}
				}
			}
		}

		// Try text format
		if line[0] == '[' {
			match := bandwidthLogRegex.FindStringSubmatch(line)
			if match == nil {
				continue
			}

			cacheID := match[1]
			clientIP := match[2]
			bytesStr := match[3]
			cacheStatus := strings.ToUpper(strings.TrimSpace(match[4]))

			bytes, err := strconv.ParseUint(bytesStr, 10, 64)
			if err != nil {
				continue
			}

			totalBytes += bytes
			if cacheStatus == "HIT" {
				hitBytes += bytes
			}
			clients[clientIP] = true

			svc, ok := services[cacheID]
			if !ok {
				svc = &svcAccum{}
				services[cacheID] = svc
			}
			svc.requests++
			svc.bytes += bytes
			if cacheStatus == "HIT" {
				svc.bytesHit += bytes
			}
			continue
		}

		// Try JSON format
		if line[0] == '{' {
			var entry struct {
				CacheIdentifier string `json:"cache_identifier"`
				RemoteAddr      string `json:"remote_addr"`
				BytesSent       uint64 `json:"bytes_sent"`
				CacheStatus     string `json:"upstream_cache_status"`
			}
			if err := json.Unmarshal([]byte(line), &entry); err != nil {
				continue
			}

			totalBytes += entry.BytesSent
			status := strings.ToUpper(entry.CacheStatus)
			if status == "HIT" {
				hitBytes += entry.BytesSent
			}
			if entry.RemoteAddr != "" {
				clients[entry.RemoteAddr] = true
			}

			cacheID := entry.CacheIdentifier
			if cacheID == "" {
				cacheID = "unknown"
			}
			svc, ok := services[cacheID]
			if !ok {
				svc = &svcAccum{}
				services[cacheID] = svc
			}
			svc.requests++
			svc.bytes += entry.BytesSent
			if status == "HIT" {
				svc.bytesHit += entry.BytesSent
			}
		}
	}

	// Compute hit rate
	var hitRate float64
	if totalBytes > 0 {
		hitRate = float64(hitBytes) / float64(totalBytes) * 100
		hitRate = math.Round(hitRate*10) / 10
	}

	bandwidth := models.BandwidthSummary{
		TotalServed:    totalBytes,
		BandwidthSaved: hitBytes,
		HitRateBytes:   hitRate,
		UniqueClients:  len(clients),
	}

	// Convert services map to sorted slice
	svcList := make([]models.ServiceStats, 0, len(services))
	for name, acc := range services {
		var hr float64
		if acc.bytes > 0 {
			hr = float64(acc.bytesHit) / float64(acc.bytes) * 100
			hr = math.Round(hr*10) / 10
		}
		svcList = append(svcList, models.ServiceStats{
			Service:  name,
			Requests: acc.requests,
			Bytes:    acc.bytes,
			BytesHit: acc.bytesHit,
			HitRate:  hr,
		})
	}

	// Sort by bytes descending
	sort.Slice(svcList, func(i, j int) bool {
		return svcList[i].Bytes > svcList[j].Bytes
	})

	return bandwidth, svcList
}

