package loghandlers

import (
	"net/http"
	"strconv"
	"time"

	"github.com/lancachenet/monolithic/admin/handlers/httpx"
	"github.com/lancachenet/monolithic/admin/services"
	"github.com/lancachenet/monolithic/admin/services/logs"
)

func LogStats(w http.ResponseWriter, r *http.Request) {
	// Parse hours parameter (default 720 = 30 days)
	hours := 720
	if h := r.URL.Query().Get("hours"); h != "" {
		if parsed, err := strconv.Atoi(h); err == nil && parsed > 0 {
			hours = parsed
		}
	}

	// Serve from precomputed cache if available (covers 1h, 24h, 7d, 30d).
	if cached := logs.GetCachedLogStatsByHours(hours); cached != nil {
		httpx.WriteJSON(w, cached)
		return
	}

	// For standard precomputed ranges, return 202 if cache is still building
	// rather than computing on-demand (which would timeout through nginx).
	for _, rng := range []int{1, 24, 168, 720} {
		if hours == rng {
			httpx.WriteJSONStatus(w, http.StatusAccepted, map[string]interface{}{"loading": true, "status": "loading", "message": "stats are being computed, try again shortly"})
			return
		}
	}

	// Fallback: compute on demand for non-standard ranges only.
	since := time.Now().Add(-time.Duration(hours) * time.Hour)
	resp := logs.ComputeAllLogStats(
		services.AccessLogPath,
		services.ErrorLogPath,
		services.UpstreamErrorLogPath,
		hours,
		since,
	)
	httpx.WriteJSON(w, resp)
}
