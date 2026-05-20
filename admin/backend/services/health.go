package services

import "github.com/lancachenet/monolithic/admin/models"

// BuildHealthResponse assembles the /api/health payload (container uptime,
// build version, and the per-process supervisor table). The same builder is
// called by the REST `HealthHandler` and the SSE `health` event so both
// endpoints emit byte-for-byte identical JSON.
func BuildHealthResponse() models.HealthResponse {
	processes, maxUptimeSeconds := ParseSupervisorStatus()
	version := EnvOrDefault("GENERICCACHE_VERSION", "3.1.0-fork")

	containerUptime := FormatUptime(maxUptimeSeconds)
	if maxUptimeSeconds == 0 {
		containerUptime = GetContainerUptime()
	}

	return models.HealthResponse{
		Uptime:    containerUptime,
		Version:   version,
		Processes: processes,
	}
}
