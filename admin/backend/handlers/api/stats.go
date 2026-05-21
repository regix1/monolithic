package api

import (
	"net/http"

	"github.com/lancachenet/monolithic/admin/handlers/httpx"
	"github.com/lancachenet/monolithic/admin/services"
)

func StatsHandler(w http.ResponseWriter, r *http.Request) {
	resp, err := services.BuildStatsResponse()
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	httpx.WriteJSON(w, resp)
}
