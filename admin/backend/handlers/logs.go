package handlers

import (
	"net/http"
	"strconv"
	"time"

	"github.com/lancachenet/monolithic/admin/models"
	"github.com/lancachenet/monolithic/admin/services"
)

func LogErrors(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	entries, err := services.ParseErrorLog(services.ErrorLogPath, 50)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to read error log: "+err.Error())
		return
	}

	writeJSON(w, entries)
}

func LogUpstream(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	entries, err := services.ParseUpstreamLog(services.UpstreamFallbackLogPath, 50)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to read upstream log: "+err.Error())
		return
	}

	writeJSON(w, entries)
}

func LogStats(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	// Parse hours parameter (default 720 = 30 days)
	hours := 720
	if h := r.URL.Query().Get("hours"); h != "" {
		if parsed, err := strconv.Atoi(h); err == nil && parsed > 0 {
			hours = parsed
		}
	}

	// Skip cache if custom time range
	if hours == 720 {
		if cached := services.GetCachedLogStats(); cached != nil {
			writeJSON(w, cached)
			return
		}
	}

	cacheStatus := services.ComputeCacheStatus(services.AccessLogPath, 10000)
	errorRate := services.ComputeErrorRate(services.ErrorLogPath, hours)
	recentErrors, _ := services.ParseErrorLog(services.ErrorLogPath, 20)
	if recentErrors == nil {
		recentErrors = []models.ErrorLogEntry{}
	}
	nosliceEvents := services.FindNosliceEvents(services.ErrorLogPath)
	upstreamHealth := services.ComputeUpstreamHealth(services.UpstreamErrorLogPath, 5000, time.Time{})
	bandwidth, svcStats := services.ComputeBandwidthStats(services.AccessLogPath, 10000)

	resp := models.LogStatsResponse{
		CacheStatus:    cacheStatus,
		ErrorRate:      errorRate,
		RecentErrors:   recentErrors,
		NosliceEvents:  nosliceEvents,
		ResponseTimes:  models.ResponseTimes{Avg: "-", P95: "-", P99: "-"},
		UpstreamHealth: upstreamHealth,
		Bandwidth:      bandwidth,
		Services:       svcStats,
	}

	services.CacheLogStats(&resp)
	writeJSON(w, resp)
}
