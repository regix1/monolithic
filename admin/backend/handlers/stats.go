package handlers

import (
	"net/http"

	"github.com/lancachenet/monolithic/admin/services"
)

func StatsHandler(w http.ResponseWriter, r *http.Request) {
	resp, err := services.BuildStatsResponse()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, resp)
}
