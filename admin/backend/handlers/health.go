package handlers

import (
	"net/http"

	"github.com/lancachenet/monolithic/admin/services"
)

func HealthHandler(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, services.BuildHealthResponse())
}
