package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/lancachenet/monolithic/admin/models"
	"github.com/lancachenet/monolithic/admin/services"
)

// SSEMessage wraps a topic and its data payload.
type SSEMessage struct {
	Topic string      `json:"topic"`
	Data  interface{} `json:"data"`
}

// SSEHandler streams server-sent events to the client.
// It sends all dashboard data periodically, grouped by topic.
func SSEHandler(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming not supported", http.StatusInternalServerError)
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
	// Slow data (config, filesystem, logs): every 30 seconds
	fastTicker := time.NewTicker(5 * time.Second)
	slowTicker := time.NewTicker(30 * time.Second)
	defer fastTicker.Stop()
	defer slowTicker.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case <-fastTicker.C:
			sendFastData(w, flusher)
		case <-slowTicker.C:
			sendSlowData(w, flusher)
		}
	}
}

func sendEvent(w http.ResponseWriter, flusher http.Flusher, topic string, data interface{}) {
	msg := SSEMessage{Topic: topic, Data: data}
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
	sendSlowData(w, flusher)
}

func sendFastData(w http.ResponseWriter, flusher http.Flusher) {
	// Health
	processes, maxUptime := services.ParseSupervisorStatus()
	version := services.EnvOrDefault("GENERICCACHE_VERSION", "3.1.0-fork")
	containerUptime := services.FormatUptime(maxUptime)
	if maxUptime == 0 {
		containerUptime = services.GetContainerUptime()
	}
	sendEvent(w, flusher, "health", models.HealthResponse{
		Uptime:    containerUptime,
		Version:   version,
		Processes: processes,
	})

	// Stats (nginx + disk + config hash + upstream + health check)
	nginx, err := services.FetchNginxStats()
	if err != nil {
		nginx = models.NginxStats{}
	}
	disk, err := services.FetchDiskStats("/data/cache")
	if err != nil {
		disk = models.DiskStats{}
	}
	configHash := ""
	if data, err := os.ReadFile("/data/cache/CONFIGHASH"); err == nil {
		configHash = strings.TrimSpace(string(data))
	}
	upstream := services.FetchUpstreamStats()

	// Health checks
	oneHourAgo := time.Now().Add(-1 * time.Hour)
	warnings := []string{}
	diskWarning := disk.Percent >= 85
	diskCritical := disk.Percent >= 95
	if diskCritical {
		warnings = append(warnings, fmt.Sprintf("Disk critically full: %.1f%% used", disk.Percent))
	} else if diskWarning {
		warnings = append(warnings, fmt.Sprintf("Disk space low: %.1f%% used", disk.Percent))
	}
	recentErrors, _ := services.ParseErrorLog(services.ErrorLogPath, 200, time.Time{})
	errorsLastHour := 0
	for _, e := range recentErrors {
		if t, err := time.ParseInLocation("2006-01-02 15:04:05", e.Time, time.Local); err == nil {
			if t.After(oneHourAgo) {
				errorsLastHour++
			}
		}
	}
	if errorsLastHour > 50 {
		warnings = append(warnings, fmt.Sprintf("High error rate: %d errors in last hour", errorsLastHour))
	} else if errorsLastHour > 10 {
		warnings = append(warnings, fmt.Sprintf("Elevated errors: %d in last hour", errorsLastHour))
	}
	upstreamHealth := services.ComputeUpstreamHealth(services.UpstreamErrorLogPath, 5000, oneHourAgo)
	if upstreamHealth.TotalErrors > 50 {
		warnings = append(warnings, fmt.Sprintf("High upstream errors: %d in last hour", upstreamHealth.TotalErrors))
	} else if upstreamHealth.TotalErrors > 10 {
		warnings = append(warnings, fmt.Sprintf("Upstream errors: %d in last hour", upstreamHealth.TotalErrors))
	}
	status := "ok"
	if len(warnings) > 0 {
		status = "warning"
	}
	if diskCritical {
		status = "critical"
	}

	sendEvent(w, flusher, "stats", models.StatsResponse{
		Nginx:      nginx,
		Disk:       disk,
		ConfigHash: configHash,
		Upstream:   upstream,
		Health: models.HealthCheck{
			Status:         status,
			Warnings:       warnings,
			DiskWarning:    diskWarning,
			DiskCritical:   diskCritical,
			ErrorsRecent:   errorsLastHour,
			UpstreamErrors: upstreamHealth.TotalErrors,
		},
	})

	// Noslice
	enabled := services.EnvOrDefault("NOSLICE_FALLBACK", "false") == "true"
	blockedHosts := services.ReadBlockedHosts()
	sendEvent(w, flusher, "noslice", models.NosliceResponse{
		Enabled:      enabled,
		BlockedCount: len(blockedHosts),
		BlockedHosts: blockedHosts,
		State:        services.ReadNosliceState(),
	})
}

func sendSlowData(w http.ResponseWriter, flusher http.Flusher) {
	// Config
	overrides := services.LoadOverrides()
	groups := make([]models.ConfigGroup, len(services.EnvVarGroups))
	for i, group := range services.EnvVarGroups {
		vars := make([]models.EnvVar, len(group.Vars))
		for j, v := range group.Vars {
			value := overrides[v.Key]
			if value == "" {
				value = os.Getenv(v.Key)
			}
			if value == "" {
				value = v.Default
			}
			vars[j] = models.EnvVar{
				Key: v.Key, Value: value, Default: v.Default,
				Description: v.Description, Type: v.Type, Options: v.Options,
			}
		}
		groups[i] = models.ConfigGroup{Name: group.Name, Vars: vars}
	}
	sendEvent(w, flusher, "config", models.ConfigResponse{Groups: groups})

	// Filesystem
	fsResp, err := services.DetectFilesystem("/data/cache")
	if err == nil {
		sendEvent(w, flusher, "filesystem", fsResp)
	}

	// Log stats (default 30 days for SSE)
	sseSince := time.Now().Add(-720 * time.Hour)
	cacheStatus := services.ComputeCacheStatus(services.AccessLogPath, 20000, sseSince)
	errorRate := services.ComputeErrorRate(services.ErrorLogPath, 720)
	recentErrors, _ := services.ParseErrorLog(services.ErrorLogPath, 50, sseSince)
	if recentErrors == nil {
		recentErrors = []models.ErrorLogEntry{}
	}
	nosliceEvents := services.FindNosliceEvents(services.ErrorLogPath, sseSince)
	upstreamHealth := services.ComputeUpstreamHealth(services.UpstreamErrorLogPath, 5000, sseSince)
	bandwidth, svcStats := services.ComputeBandwidthStats(services.AccessLogPath, 20000, sseSince)

	sendEvent(w, flusher, "logstats", models.LogStatsResponse{
		CacheStatus:    cacheStatus,
		ErrorRate:      errorRate,
		RecentErrors:   recentErrors,
		NosliceEvents:  nosliceEvents,
		ResponseTimes:  models.ResponseTimes{Avg: "-", P95: "-", P99: "-"},
		UpstreamHealth: upstreamHealth,
		Bandwidth:      bandwidth,
		Services:       svcStats,
	})

	// Domains
	domains := services.LoadDomains("/data/cachedomains")
	sendEvent(w, flusher, "domains", domains)
}
