package handlers

import (
	"net/http"

	"github.com/lancachenet/monolithic/admin/services"
)

func FilesystemHandler(w http.ResponseWriter, r *http.Request) {
	resp, err := services.DetectFilesystem("/data/cache")
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to query filesystem: "+err.Error())
		return
	}

	writeJSON(w, resp)
}
