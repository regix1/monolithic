package api

import (
	"log"
	"net/http"

	"github.com/lancachenet/monolithic/admin/handlers/httpx"
	"github.com/lancachenet/monolithic/admin/services"
)

func NginxStatus(w http.ResponseWriter, r *http.Request) {
	stats, err := services.FetchNginxStats()
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "failed to fetch nginx status: "+err.Error())
		return
	}

	httpx.WriteJSON(w, stats)
}

func NginxReload(w http.ResponseWriter, r *http.Request) {
	output, err := services.RunCommand("nginx", "-s", "reload")
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "nginx reload failed: "+output)
		return
	}

	httpx.WriteJSON(w, map[string]interface{}{
		"ok":      true,
		"message": "nginx reloaded",
	})
}

func ApplyConfig(w http.ResponseWriter, r *http.Request) {
	// Return 200 immediately so the browser doesn't time out.
	httpx.WriteJSON(w, map[string]any{"status": "applying"})
	if f, ok := w.(http.Flusher); ok {
		f.Flush()
	}

	go func() {
		hooks := []string{
			"/hooks/entrypoint-pre.d/10_setup.sh",
			"/hooks/entrypoint-pre.d/15_generate_maps.sh",
			"/hooks/entrypoint-pre.d/16_generate_upstream_keepalive.sh",
		}
		for _, hook := range hooks {
			if output, err := services.RunCommand("bash", hook); err != nil {
				log.Printf("ApplyConfig: hook %s failed: %v — %s", hook, err, output)
			}
		}
		if output, err := services.RunCommand("nginx", "-s", "reload"); err != nil {
			log.Printf("ApplyConfig: nginx reload failed: %v — %s", err, output)
		}
	}()
}
