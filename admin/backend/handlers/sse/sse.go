package sse

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/lancachenet/monolithic/admin/handlers/httpx"
	"github.com/lancachenet/monolithic/admin/models"
	"github.com/lancachenet/monolithic/admin/services"
	"github.com/lancachenet/monolithic/admin/services/logs"
)

// SSEHandler streams server-sent events to the client.
// It sends all dashboard data periodically, grouped by topic.
func SSEHandler(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		httpx.WriteError(w, http.StatusInternalServerError, "streaming not supported")
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	// Send initial data immediately
	sendAllData(w, flusher)

	// Then send updates on intervals
	// Fast data (stats, health): every 5 seconds
	// Log stats: every 15 seconds to match the backend worker cadence
	// Slow data (config, filesystem, domains): every 30 seconds
	fastTicker := time.NewTicker(5 * time.Second)
	logStatsTicker := time.NewTicker(15 * time.Second)
	slowTicker := time.NewTicker(30 * time.Second)
	defer fastTicker.Stop()
	defer logStatsTicker.Stop()
	defer slowTicker.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case <-fastTicker.C:
			sendFastData(w, flusher)
		case <-logStatsTicker.C:
			sendLogStatsData(w, flusher)
		case <-slowTicker.C:
			sendConfigData(w, flusher)
			sendSlowData(w, flusher)
		}
	}
}

func sendEvent(w http.ResponseWriter, flusher http.Flusher, topic string, data interface{}) {
	msg := models.SSEMessage{Topic: topic, Data: data}
	jsonBytes, err := json.Marshal(msg)
	if err != nil {
		log.Printf("SSE marshal error for %s: %v", topic, err)
		return
	}
	fmt.Fprintf(w, "data: %s\n\n", jsonBytes)
	flusher.Flush()
}

func sendAllData(w http.ResponseWriter, flusher http.Flusher) {
	sendFastData(w, flusher)
	sendConfigData(w, flusher)
	sendLogStatsData(w, flusher)
	sendSlowData(w, flusher)
}

func sendFastData(w http.ResponseWriter, flusher http.Flusher) {
	sendEvent(w, flusher, "health", services.BuildHealthResponse())

	// Stats — when the nginx-stats fetch fails we log and emit a zero-valued
	// stats event rather than disconnect the stream. The REST endpoint
	// (StatsHandler) maps the same condition to a 500. This is the only
	// intentional behavioural difference between REST and SSE; the wire shape
	// is still identical.
	statsResp, err := services.BuildStatsResponse()
	if err != nil {
		log.Printf("SSE stats: %v", err)
		statsResp = models.StatsResponse{}
	}
	sendEvent(w, flusher, "stats", statsResp)

	// Noslice — fetched live from the internal njs HTTP endpoint.
	sendEvent(w, flusher, "noslice", services.BuildNosliceResponse())

	// Epic diagnostic — Epic cache hit/miss ratio + HTTPS-leak warning.
	sendEvent(w, flusher, "epic", services.BuildEpicDiagnostic())
}

func sendConfigData(w http.ResponseWriter, flusher http.Flusher) {
	sendEvent(w, flusher, "config", services.BuildConfigResponse())
}

func sendSlowData(w http.ResponseWriter, flusher http.Flusher) {
	if fsResp, err := services.DetectFilesystem(services.CacheDir); err == nil {
		sendEvent(w, flusher, "filesystem", fsResp)
	}
	sendEvent(w, flusher, "domains", services.LoadDomains(services.CacheDomainsDir))
}

func sendLogStatsData(w http.ResponseWriter, flusher http.Flusher) {
	// Log stats (default 30 days for SSE) — served from background precomputed cache
	if logStats := logs.GetCachedLogStats(); logStats != nil {
		sendEvent(w, flusher, "logstats", logStats)
		return
	}

	sendEvent(w, flusher, "logstats", map[string]interface{}{
		"status":  "loading",
		"message": "Computing log statistics...",
	})
}
