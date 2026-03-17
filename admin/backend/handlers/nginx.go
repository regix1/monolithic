package handlers

import (
	"net/http"
)

// NginxStatus handles GET /api/nginx/status.
// It fetches and parses the nginx stub_status page.
func NginxStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	stats, err := fetchNginxStats()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch nginx status: "+err.Error())
		return
	}

	writeJSON(w, stats)
}

// NginxReload handles POST /api/nginx/reload.
// It sends a reload signal to the running nginx process.
func NginxReload(w http.ResponseWriter, r *http.Request) {
	output, err := runCommand("nginx", "-s", "reload")
	if err != nil {
		writeError(w, http.StatusInternalServerError, "nginx reload failed: "+output)
		return
	}

	writeJSON(w, map[string]interface{}{
		"ok":      true,
		"message": "nginx reloaded",
	})
}
