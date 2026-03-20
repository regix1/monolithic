package handlers

import (
	"log"
	"net/http"
	"os"
	"syscall"
	"time"

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

func ApplyConfig(w http.ResponseWriter, r *http.Request) {
	// Return 200 immediately so the browser doesn't time out.
	writeJSON(w, map[string]any{"status": "applying"})
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

func ContainerRestart(w http.ResponseWriter, r *http.Request) {
	// Return 200 to the client before killing PID 1 so the browser gets a response.
	writeJSON(w, map[string]any{"status": "restarting"})
	if f, ok := w.(http.Flusher); ok {
		f.Flush()
	}
	// Send SIGTERM to PID 1 in a goroutine after a short delay.
	go func() {
		time.Sleep(500 * time.Millisecond)
		proc, err := os.FindProcess(1)
		if err == nil {
			proc.Signal(syscall.SIGTERM)
		}
	}()
}
