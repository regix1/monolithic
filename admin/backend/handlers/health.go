package handlers

import (
	"net/http"

	"github.com/lancachenet/monolithic/admin/models"
	"github.com/lancachenet/monolithic/admin/services"
)

func HealthHandler(w http.ResponseWriter, r *http.Request) {
	processes, maxUptimeSeconds := services.ParseSupervisorStatus()

	version := services.EnvOrDefault("GENERICCACHE_VERSION", "3.1.0-fork")
	containerUptime := services.FormatUptime(maxUptimeSeconds)

	if maxUptimeSeconds == 0 {
		containerUptime = services.GetContainerUptime()
	}

	resp := models.HealthResponse{
		Uptime:    containerUptime,
		Version:   version,
		Processes: processes,
	}

	writeJSON(w, resp)
}
