package handlers

import (
	"net/http"

	"github.com/lancachenet/monolithic/admin/services"
)

// EpicHandler serves the Epic-diagnostic payload computed from the access
// logs + SNI logs. See models.EpicDiagnostic.
func EpicHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	writeJSON(w, services.BuildEpicDiagnostic())
}
