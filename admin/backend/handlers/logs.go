package handlers

import (
	"net/http"

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

	if cached := services.GetCachedLogStats(); cached != nil {
		writeJSON(w, cached)
		return
	}

	cacheStatus := services.ComputeCacheStatus(services.AccessLogPath, 10000)
	errorRate := services.ComputeErrorRate(services.ErrorLogPath)
	recentErrors, _ := services.ParseErrorLog(services.ErrorLogPath, 20)
	if recentErrors == nil {
		recentErrors = []models.ErrorLogEntry{}
	}
	nosliceEvents := services.FindNosliceEvents(services.ErrorLogPath)
	responseTimes := services.ComputeResponseTimes(services.AccessLogPath, 1000)

	resp := models.LogStatsResponse{
		CacheStatus:   cacheStatus,
		ErrorRate:     errorRate,
		RecentErrors:  recentErrors,
		NosliceEvents: nosliceEvents,
		ResponseTimes: responseTimes,
	}

	services.CacheLogStats(&resp)
	writeJSON(w, resp)
}
