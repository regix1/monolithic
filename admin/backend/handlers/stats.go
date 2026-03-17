package handlers

import (
	"net/http"
	"os"
	"strings"

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

	resp := models.StatsResponse{
		Nginx:      nginx,
		Disk:       disk,
		ConfigHash: configHash,
		Upstream:   upstream,
	}

	writeJSON(w, resp)
}
