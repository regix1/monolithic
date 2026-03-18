package handlers

import (
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/lancachenet/monolithic/admin/models"
	"github.com/lancachenet/monolithic/admin/services"
)

func StatsHandler(w http.ResponseWriter, r *http.Request) {
	nginx, err := services.FetchNginxStats()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch nginx stats: "+err.Error())
		return
	}

	disk, err := services.FetchDiskStats("/data/cache")
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch disk stats: "+err.Error())
		return
	}

	configHash := ""
	if data, err := os.ReadFile("/data/cache/CONFIGHASH"); err == nil {
		configHash = strings.TrimSpace(string(data))
	}

	upstream := services.FetchUpstreamStats()

	// Compute health summary
	warnings := []string{}

	// Disk checks
	diskWarning := disk.Percent >= 85
	diskCritical := disk.Percent >= 95
	if diskCritical {
		warnings = append(warnings, fmt.Sprintf("Disk critically full: %.1f%% used", disk.Percent))
	} else if diskWarning {
		warnings = append(warnings, fmt.Sprintf("Disk space low: %.1f%% used", disk.Percent))
	}

	// Error rate check (count recent errors from error.log)
	recentErrors, _ := services.ParseErrorLog(services.ErrorLogPath, 200)
	errorsLastHour := 0
	oneHourAgo := time.Now().Add(-1 * time.Hour)
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

	// Upstream health check
	upstreamHealth := services.ComputeUpstreamHealth(services.UpstreamErrorLogPath, 5000)
	if upstreamHealth.TotalErrors > 100 {
		warnings = append(warnings, fmt.Sprintf("Many upstream errors: %d total", upstreamHealth.TotalErrors))
	} else if upstreamHealth.TotalErrors > 20 {
		warnings = append(warnings, fmt.Sprintf("Upstream errors detected: %d total", upstreamHealth.TotalErrors))
	}

	status := "ok"
	if len(warnings) > 0 {
		status = "warning"
	}
	if diskCritical {
		status = "critical"
	}

	health := models.HealthCheck{
		Status:         status,
		Warnings:       warnings,
		DiskWarning:    diskWarning,
		DiskCritical:   diskCritical,
		ErrorsRecent:   errorsLastHour,
		UpstreamErrors: upstreamHealth.TotalErrors,
	}

	resp := models.StatsResponse{
		Nginx:      nginx,
		Disk:       disk,
		ConfigHash: configHash,
		Upstream:   upstream,
		Health:     health,
	}

	writeJSON(w, resp)
}
