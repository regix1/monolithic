package handlers

import (
	"net/http"

	"github.com/lancachenet/monolithic/admin/services"
)

func DomainsHandler(w http.ResponseWriter, r *http.Request) {
	result := services.LoadDomains("/data/cachedomains")
	writeJSON(w, result)
}
