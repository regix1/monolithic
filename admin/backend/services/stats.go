package services

import (
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/lancachenet/monolithic/admin/models"
	"github.com/lancachenet/monolithic/admin/services/logs"
)

// topServicesForBreakdown caps how many service chips a single warning carries.
// Beyond this we fold remaining counts into an "other" bucket so the message
// stays readable on the Dashboard banner.
const topServicesForBreakdown = 3

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

	oneHourAgo := SinceHoursAgo(1)
	errorServices := errorsByServiceLastHour(oneHourAgo)
	upstreamHealth := logs.ComputeUpstreamHealth(UpstreamErrorLogPath, 5000, oneHourAgo)
	upstreamServices := upstreamErrorsByService(upstreamHealth)

	errorsLastHour := sumCounts(errorServices)

	health := BuildHealthCheck(disk, errorsLastHour, errorServices, upstreamHealth.TotalErrors, upstreamServices)

	return models.StatsResponse{
		Nginx:      nginx,
		Disk:       disk,
		ConfigHash: configHash,
		Upstream:   upstream,
		Health:     health,
	}, nil
}

// BuildHealthCheck folds the disk percentage and per-service error counts
// into a HealthCheck snapshot. The Warnings []string slice carries the
// human-readable messages exactly as the frontend used to receive them, so
// older clients keep working; WarningsDetailed carries the structured form
// (code + per-service breakdown) the redesigned Dashboard banner uses to
// link each warning to the Logs page filtered by service.
//
// Both the REST stats handler and the SSE stats event call this, so the
// shape never drifts.
func BuildHealthCheck(
	disk models.DiskStats,
	errorsLastHour int,
	errorServices []models.ServiceErrorCount,
	upstreamErrors int,
	upstreamServices []models.ServiceErrorCount,
) models.HealthCheck {
	detailed := make([]models.HealthWarning, 0, 4)

	diskWarning := disk.Percent >= 85
	diskCritical := disk.Percent >= 95
	switch {
	case diskCritical:
		detailed = append(detailed, models.HealthWarning{
			Code:     "disk_critical",
			Severity: "critical",
			Message:  fmt.Sprintf("Disk critically full: %.1f%% used", disk.Percent),
		})
	case diskWarning:
		detailed = append(detailed, models.HealthWarning{
			Code:     "disk_warning",
			Severity: "warning",
			Message:  fmt.Sprintf("Disk space low: %.1f%% used", disk.Percent),
		})
	}

	if errorsLastHour > 50 {
		detailed = append(detailed, makeErrorWarning("high_error_rate", "High error rate", errorsLastHour, errorServices))
	} else if errorsLastHour > 10 {
		detailed = append(detailed, makeErrorWarning("elevated_errors", "Elevated errors", errorsLastHour, errorServices))
	}

	if upstreamErrors > 50 {
		detailed = append(detailed, makeErrorWarning("high_upstream_errors", "High upstream errors", upstreamErrors, upstreamServices))
	} else if upstreamErrors > 10 {
		detailed = append(detailed, makeErrorWarning("upstream_errors", "Upstream errors", upstreamErrors, upstreamServices))
	}

	warnings := make([]string, 0, len(detailed))
	for _, w := range detailed {
		warnings = append(warnings, w.Message)
	}

	status := "ok"
	if len(detailed) > 0 {
		status = "warning"
	}
	if diskCritical {
		status = "critical"
	}

	return models.HealthCheck{
		Status:           status,
		Warnings:         warnings,
		WarningsDetailed: detailed,
		DiskWarning:      diskWarning,
		DiskCritical:     diskCritical,
	}
}

// makeErrorWarning assembles a HealthWarning whose message embeds the top
// contributing services as a parenthetical list. Service counts beyond
// topServicesForBreakdown are folded into "other" so the banner stays
// readable. The structured Services slice keeps the full ordered list (up
// to topServicesForBreakdown) so the frontend can render chip links.
func makeErrorWarning(code, label string, total int, services []models.ServiceErrorCount) models.HealthWarning {
	msg := fmt.Sprintf("%s — %d in last hour", label, total)
	severity := "warning"
	if code == "high_error_rate" || code == "high_upstream_errors" {
		severity = "warning" // keep all warning-class for now; disk_critical is the only critical
	}

	if len(services) > 0 {
		top := services
		if len(top) > topServicesForBreakdown {
			top = top[:topServicesForBreakdown]
		}
		parts := make([]string, 0, len(top))
		for _, s := range top {
			name := s.Service
			if name == "" {
				name = "unknown"
			}
			parts = append(parts, fmt.Sprintf("%d %s", s.Count, name))
		}
		others := 0
		if len(services) > topServicesForBreakdown {
			for _, s := range services[topServicesForBreakdown:] {
				others += s.Count
			}
		}
		if others > 0 {
			parts = append(parts, fmt.Sprintf("%d other", others))
		}
		msg = fmt.Sprintf("%s — %d in last hour (%s)", label, total, strings.Join(parts, " · "))
	}

	return models.HealthWarning{
		Code:     code,
		Severity: severity,
		Message:  msg,
		Services: services,
	}
}

// errorsByServiceLastHour reads error.log, attributes each timestamped entry
// in the last hour to a cache service via its host, and returns the
// per-service counts ordered by count desc. Lines whose host cannot be
// mapped fall into the "unknown" bucket so coverage stays honest.
func errorsByServiceLastHour(oneHourAgo time.Time) []models.ServiceErrorCount {
	recent, _ := logs.ParseErrorLog(ErrorLogPath, 1000, time.Time{})
	tallies := make(map[string]int)
	for _, e := range recent {
		t, perr := time.ParseInLocation("2006-01-02 15:04:05", e.Time, time.Local)
		if perr != nil || !t.After(oneHourAgo) {
			continue
		}
		key := e.Service
		if key == "" {
			key = "unknown"
		}
		tallies[key]++
	}
	return sortedCounts(tallies)
}

// upstreamErrorsByService converts an UpstreamHealthSummary's TopHosts slice
// (host → count) into ServiceErrorCount entries (service → count) suitable
// for HealthWarning.Services. Hosts that don't map to a known service fall
// into "unknown".
func upstreamErrorsByService(uh models.UpstreamHealthSummary) []models.ServiceErrorCount {
	tallies := make(map[string]int)
	for _, host := range uh.TopHosts {
		key := host.Service
		if key == "" {
			key = "unknown"
		}
		tallies[key] += host.Count
	}
	return sortedCounts(tallies)
}

// sortedCounts converts a count map to a slice ordered by count desc, then
// name asc for stable output when counts tie.
func sortedCounts(tallies map[string]int) []models.ServiceErrorCount {
	out := make([]models.ServiceErrorCount, 0, len(tallies))
	for svc, count := range tallies {
		out = append(out, models.ServiceErrorCount{Service: svc, Count: count})
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Count != out[j].Count {
			return out[i].Count > out[j].Count
		}
		return out[i].Service < out[j].Service
	})
	return out
}

// sumCounts returns the total of all per-service counts in a ServiceErrorCount slice.
func sumCounts(counts []models.ServiceErrorCount) int {
	total := 0
	for _, c := range counts {
		total += c.Count
	}
	return total
}
