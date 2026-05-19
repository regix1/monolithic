package handlers

import (
	"net/http"

	"github.com/lancachenet/monolithic/admin/models"
	"github.com/lancachenet/monolithic/admin/services"
)

// NosliceHandler dispatches based on method:
//   - GET  /api/noslice        → handleNosliceGet (reads from njs internal HTTP endpoint)
//   - POST /api/noslice/reset  → handleNosliceReset (calls the njs reset endpoint)
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
	resp := services.BuildNosliceResponse()
	writeJSON(w, resp)
}

func handleNosliceReset(w http.ResponseWriter) {
	if err := services.ResetNoslice(); err != nil {
		writeError(w, http.StatusInternalServerError, "noslice reset failed: "+err.Error())
		return
	}

	writeJSON(w, models.NosliceResetResponse{
		Status:  "ok",
		Message: "noslice state reset",
	})
}
