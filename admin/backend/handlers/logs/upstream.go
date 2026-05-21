package loghandlers

import (
	"net/http"
	"strconv"
	"time"

	"github.com/lancachenet/monolithic/admin/handlers/httpx"
	"github.com/lancachenet/monolithic/admin/services"
	"github.com/lancachenet/monolithic/admin/services/logs"
)

func LogUpstream(w http.ResponseWriter, r *http.Request) {
	// Parse hours parameter — if provided, filter by time window; otherwise return last 50 entries
	var since time.Time
	n := 50
	if h := r.URL.Query().Get("hours"); h != "" {
		if parsed, err := strconv.Atoi(h); err == nil && parsed > 0 {
			since = time.Now().Add(-time.Duration(parsed) * time.Hour)
			n = 5000
		}
	}

	entries, err := logs.ParseUpstreamLog(services.UpstreamFallbackLogPath, n, since)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "failed to read upstream log: "+err.Error())
		return
	}

	httpx.WriteJSON(w, entries)
}
