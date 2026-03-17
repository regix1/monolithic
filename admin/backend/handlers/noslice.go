package handlers

import (
	"net/http"

	"github.com/lancachenet/monolithic/admin/models"
	"github.com/lancachenet/monolithic/admin/services"
)

func NosliceHandler(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		handleNosliceGet(w)
	case http.MethodPost:
		handleNosliceReset(w)
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func handleNosliceGet(w http.ResponseWriter) {
	enabled := services.EnvOrDefault("NOSLICE_FALLBACK", "false") == "true"

	state := services.ReadNosliceState()
	blockedHosts := services.ReadBlockedHosts()

	resp := models.NosliceResponse{
		Enabled:      enabled,
		BlockedCount: len(blockedHosts),
		BlockedHosts: blockedHosts,
		State:        state,
	}

	writeJSON(w, resp)
}

func handleNosliceReset(w http.ResponseWriter) {
	_, err := services.ResetNoslice()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "noslice reset failed")
		return
	}

	writeJSON(w, map[string]string{"status": "ok", "message": "noslice state reset"})
}
