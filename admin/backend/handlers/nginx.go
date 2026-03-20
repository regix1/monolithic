package handlers

import (
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
