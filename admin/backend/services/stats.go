package services

import (
	"fmt"
	"time"

	"github.com/lancachenet/monolithic/admin/models"
	"github.com/lancachenet/monolithic/admin/services/logs"
)

// BuildStatsResponse assembles the /api/stats payload (nginx counters, disk
// usage, CONFIGHASH marker, upstream pool state, and the derived health
// summary). The same builder is called by the REST handler and the SSE
// `stats` event, so both endpoints emit byte-for-byte identical JSON.
//
// Error policy: a non-nil error is returned only when the nginx-stats fetch
// fails. Disk-stats / CONFIGHASH / upstream errors are non-fatal and zero
// their respective fields. The REST handler maps the nginx error to a 500;
// the SSE caller logs and emits a zero-valued event so the stream keeps
// flowing instead of disconnecting.
func BuildStatsResponse() (models.StatsResponse, error) {
	nginx, err := FetchNginxStats()
	if err != nil {
		return models.StatsResponse{}, fmt.Errorf("fetch nginx stats: %w", err)
	}

	disk, derr := FetchDiskStats(CacheDir)
	if derr != nil {
		disk = models.DiskStats{}
	}

	configHash, _ := ReadConfigHash()

	upstream := FetchUpstreamStats()

	errorsLastHour := countErrorsLastHour()
	upstreamHealth := logs.ComputeUpstreamHealth(UpstreamErrorLogPath, 5000, SinceHoursAgo(1))

	health := BuildHealthCheck(disk, errorsLastHour, upstreamHealth.TotalErrors)

	return models.StatsResponse{
		Nginx:      nginx,
		Disk:       disk,
		ConfigHash: configHash,
		Upstream:   upstream,
		Health:     health,
	}, nil
}

// BuildHealthCheck folds the disk percentage, recent-error count, and
// upstream-error count into a single HealthCheck snapshot using the verbatim
// threshold strings the project has shipped since the original implementation.
// Both the REST stats handler and the SSE stats event call this so the
// warning strings never drift.
func BuildHealthCheck(disk models.DiskStats, errorsLastHour int, upstreamErrors int) models.HealthCheck {
	warnings := []string{}

	diskWarning := disk.Percent >= 85
	diskCritical := disk.Percent >= 95
	if diskCritical {
		warnings = append(warnings, fmt.Sprintf("Disk critically full: %.1f%% used", disk.Percent))
	} else if diskWarning {
		warnings = append(warnings, fmt.Sprintf("Disk space low: %.1f%% used", disk.Percent))
	}

	if errorsLastHour > 50 {
		warnings = append(warnings, fmt.Sprintf("High error rate: %d errors in last hour", errorsLastHour))
	} else if errorsLastHour > 10 {
		warnings = append(warnings, fmt.Sprintf("Elevated errors: %d in last hour", errorsLastHour))
	}

	if upstreamErrors > 50 {
		warnings = append(warnings, fmt.Sprintf("High upstream errors: %d in last hour", upstreamErrors))
	} else if upstreamErrors > 10 {
		warnings = append(warnings, fmt.Sprintf("Upstream errors: %d in last hour", upstreamErrors))
	}

	status := "ok"
	if len(warnings) > 0 {
		status = "warning"
	}
	if diskCritical {
		status = "critical"
	}

	return models.HealthCheck{
		Status:       status,
		Warnings:     warnings,
		DiskWarning:  diskWarning,
		DiskCritical: diskCritical,
	}
}

// countErrorsLastHour returns the number of error.log lines whose parsed
// timestamp falls within the last hour. Errors that fail to parse a timestamp
// are skipped silently — matching the pre-refactor behaviour.
func countErrorsLastHour() int {
	recentErrors, _ := logs.ParseErrorLog(ErrorLogPath, 200, time.Time{})
	oneHourAgo := SinceHoursAgo(1)
	count := 0
	for _, e := range recentErrors {
		if t, perr := time.ParseInLocation("2006-01-02 15:04:05", e.Time, time.Local); perr == nil {
			if t.After(oneHourAgo) {
				count++
			}
		}
	}
	return count
}
