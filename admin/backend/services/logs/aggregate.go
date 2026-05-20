package logs

import (
	"math"
	"sync"
	"time"

	"github.com/lancachenet/monolithic/admin/models"
)

// ---------- precomputed log-stats cache ----------

// precomputedRanges are the time ranges (in hours) that the background worker
// precomputes so the REST and SSE endpoints can serve them instantly.
var precomputedRanges = []int{1, 24, 168, 720}

var (
	logStatsCache map[int]*models.LogStatsResponse // keyed by hours
	logStatsMu    sync.RWMutex
)

func init() {
	logStatsCache = make(map[int]*models.LogStatsResponse)
}

// GetCachedLogStats returns the precomputed 30d log stats for SSE, or nil if
// not yet ready.
func GetCachedLogStats() *models.LogStatsResponse {
	return GetCachedLogStatsByHours(720)
}

// GetCachedLogStatsByHours returns precomputed stats for the given hour range,
// or nil.
func GetCachedLogStatsByHours(hours int) *models.LogStatsResponse {
	logStatsMu.RLock()
	defer logStatsMu.RUnlock()
	return logStatsCache[hours]
}

// recomputeAllLogStats reads each log file ONCE, then computes stats for every
// precomputed range by filtering the in-memory slices. Ranges are processed
// shortest-first (1h → 24h → 7d → 30d) so the cache is populated with fast
// results before slower ones finish.
func recomputeAllLogStats(accessLogPath, errorLogPath, upstreamErrorLogPath string) {
	// Read each file once — use the largest line budget (30d / 720h).
	allAccessLines, _ := TailFile(accessLogPath, 150000)
	allErrorLines, _ := TailFile(errorLogPath, 75000)
	allUpstreamLines, _ := TailFile(upstreamErrorLogPath, 5000)

	// Process ranges shortest-first for fast initial cache population.
	for _, hours := range precomputedRanges {
		h := hours
		since := time.Now().Add(-time.Duration(h) * time.Hour)

		// Filter in-memory slices to the time window for this range.
		accessLines := filterAccessLinesSince(allAccessLines, since)
		errorLines := filterErrorLinesSince(allErrorLines, since)
		upstreamLines := filterErrorLinesSince(allUpstreamLines, since)

		stats := ComputeAllLogStatsFromLines(accessLines, errorLines, upstreamLines, h, since)

		logStatsMu.Lock()
		logStatsCache[h] = &stats
		logStatsMu.Unlock()
	}
}

// StartLogStatsWorker starts a background goroutine that precomputes log stats
// for all standard time ranges (1h, 24h, 7d, 30d) periodically. The HTTP server
// starts immediately; SSE/REST serve nil until the first computation completes.
func StartLogStatsWorker(interval time.Duration, accessLogPath, errorLogPath, upstreamErrorLogPath string) {
	go func() {
		recomputeAllLogStats(accessLogPath, errorLogPath, upstreamErrorLogPath)

		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for range ticker.C {
			recomputeAllLogStats(accessLogPath, errorLogPath, upstreamErrorLogPath)
		}
	}()
}

// ---------- combined single-pass log stats ----------

// ComputeAllLogStats reads access.log, error.log, and upstream-error.log once
// each, then computes all log statistics in a single pass per file.
// This is the on-demand path (used for non-standard hour ranges from the REST
// handler). The precomputed-cache path uses ComputeAllLogStatsFromLines directly.
func ComputeAllLogStats(accessLogPath, errorLogPath, upstreamErrorLogPath string, hours int, since time.Time) models.LogStatsResponse {
	// Scale line count by time range
	var n, nErr int
	if since.IsZero() {
		n = 50000
		nErr = 25000
	} else {
		h := time.Since(since).Hours()
		n = int(math.Min(h*1500, 150000))
		nErr = int(math.Min(h*750, 75000))
		if n < 1000 {
			n = 1000
		}
		if nErr < 500 {
			nErr = 500
		}
	}
	accessLines, _ := TailFile(accessLogPath, n)
	errorLines, _ := TailFile(errorLogPath, nErr)
	upstreamLines, _ := TailFile(upstreamErrorLogPath, 5000)

	return ComputeAllLogStatsFromLines(accessLines, errorLines, upstreamLines, hours, since)
}

// ComputeAllLogStatsFromLines computes all log statistics from pre-loaded line
// slices. The slices are read-only; goroutines may safely pass sub-slices.
func ComputeAllLogStatsFromLines(accessLines, errorLines, upstreamLines []string, hours int, since time.Time) models.LogStatsResponse {
	// Single pass over access.log
	cacheStatus, bandwidth, svcStats := processAccessLog(accessLines, since)

	// Single pass over error.log
	errorRate, recentErrors, nosliceEvents := processErrorLog(errorLines, hours, since)

	// Upstream errors — deduplicated by (second, clientIP)
	upstreamHealth := computeUpstreamHealthFromLines(upstreamLines, since)

	return models.LogStatsResponse{
		CacheStatus:    cacheStatus,
		ErrorRate:      errorRate,
		RecentErrors:   recentErrors,
		NosliceEvents:  nosliceEvents,
		UpstreamHealth: upstreamHealth,
		Bandwidth:      bandwidth,
		Services:       svcStats,
	}
}
