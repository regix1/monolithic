package api

import (
	"net/http"

	"github.com/lancachenet/monolithic/admin/handlers/httpx"
	"github.com/lancachenet/monolithic/admin/services"
)

// EpicHandler serves the Epic-diagnostic payload computed from the access
// logs + SNI logs. See models.EpicDiagnostic.
func EpicHandler(w http.ResponseWriter, r *http.Request) {
	httpx.WriteJSON(w, services.BuildEpicDiagnostic())
}
