package api

import (
	"net/http"

	"github.com/lancachenet/monolithic/admin/handlers/httpx"
	"github.com/lancachenet/monolithic/admin/services"
)

func FilesystemHandler(w http.ResponseWriter, r *http.Request) {
	resp, err := services.DetectFilesystem(services.CacheDir)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "failed to query filesystem: "+err.Error())
		return
	}

	httpx.WriteJSON(w, resp)
}
