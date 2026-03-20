package handlers

import (
	"net/http"

	"github.com/lancachenet/monolithic/admin/services"
)

func NginxStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	stats, err := services.FetchNginxStats()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch nginx status: "+err.Error())
		return
	}

	writeJSON(w, stats)
}

func NginxReload(w http.ResponseWriter, r *http.Request) {
	output, err := services.RunCommand("nginx", "-s", "reload")
	if err != nil {
		writeError(w, http.StatusInternalServerError, "nginx reload failed: "+output)
		return
	}

	writeJSON(w, map[string]interface{}{
		"ok":      true,
		"message": "nginx reloaded",
	})
}

func NginxRestart(w http.ResponseWriter, r *http.Request) {
	// Return 200 to the client immediately before running the hooks,
	// so the browser gets a response before nginx is reloaded.
	writeJSON(w, map[string]interface{}{
		"ok":      true,
		"message": "restart initiated",
	})

	// Flush the response to the client now, then run hooks in the background.
	if f, ok := w.(http.Flusher); ok {
		f.Flush()
	}

	go func() {
		hooksDir := "/hooks/entrypoint-pre.d"
		hooks := []string{
			hooksDir + "/10_setup.sh",
			hooksDir + "/15_generate_maps.sh",
			hooksDir + "/16_generate_upstream_keepalive.sh",
		}

		for _, hook := range hooks {
			if _, err := services.RunCommand("bash", hook); err != nil {
				return
			}
		}

		services.RunCommand("nginx", "-s", "reload")
	}()
}
