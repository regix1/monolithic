package api

import (
	"net/http"

	"github.com/lancachenet/monolithic/admin/handlers/httpx"
	"github.com/lancachenet/monolithic/admin/services"
)

func DomainsHandler(w http.ResponseWriter, r *http.Request) {
	result := services.LoadDomains(services.CacheDomainsDir)
	httpx.WriteJSON(w, result)
}
