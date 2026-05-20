package handlers

import (
	"net/http"

	"github.com/lancachenet/monolithic/admin/models"
	"github.com/lancachenet/monolithic/admin/services"
)

// NosliceGet returns the current noslice diagnostic snapshot, fetched live
// from the njs internal HTTP endpoint.
func NosliceGet(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, services.BuildNosliceResponse())
}

// NosliceReset clears the in-memory njs noslice state by calling the njs
// reset endpoint.
func NosliceReset(w http.ResponseWriter, r *http.Request) {
	if err := services.ResetNoslice(); err != nil {
		writeError(w, http.StatusInternalServerError, "noslice reset failed: "+err.Error())
		return
	}

	writeJSON(w, models.NosliceResetResponse{
		Status:  "ok",
		Message: "noslice state reset",
	})
}
