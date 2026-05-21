package api

import (
	"net/http"

	"github.com/lancachenet/monolithic/admin/handlers/httpx"
	"github.com/lancachenet/monolithic/admin/services"
)

func HealthHandler(w http.ResponseWriter, r *http.Request) {
	httpx.WriteJSON(w, services.BuildHealthResponse())
}
