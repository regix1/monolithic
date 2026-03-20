package handlers

import (
	"net/http"
	"strconv"
	"time"

	"github.com/lancachenet/monolithic/admin/services"
)

func LogUpstream(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	// Parse hours parameter — if provided, filter by time window; otherwise return last 50 entries
	var since time.Time
	n := 50
	if h := r.URL.Query().Get("hours"); h != "" {
		if parsed, err := strconv.Atoi(h); err == nil && parsed > 0 {
			since = time.Now().Add(-time.Duration(parsed) * time.Hour)
			n = 5000
		}
	}

	entries, err := services.ParseUpstreamLog(services.UpstreamFallbackLogPath, n, since)
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

	// Serve from precomputed cache if available (covers 1h, 24h, 7d, 30d).
	if cached := services.GetCachedLogStatsByHours(hours); cached != nil {
		writeJSON(w, cached)
		return
	}

	// For standard precomputed ranges, return 202 if cache is still building
	// rather than computing on-demand (which would timeout through nginx).
	for _, r := range []int{1, 24, 168, 720} {
		if hours == r {
			w.WriteHeader(http.StatusAccepted)
			writeJSON(w, map[string]interface{}{"loading": true, "status": "loading", "message": "stats are being computed, try again shortly"})
			return
		}
	}

	// Fallback: compute on demand for non-standard ranges only.
	since := time.Now().Add(-time.Duration(hours) * time.Hour)
	resp := services.ComputeAllLogStats(
		services.AccessLogPath,
		services.ErrorLogPath,
		services.UpstreamErrorLogPath,
		hours,
		since,
	)
	writeJSON(w, resp)
}
