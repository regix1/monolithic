package handlers

import (
	"log"
	"net/http"
	"os"
	"syscall"
	"time"

	"github.com/lancachenet/monolithic/admin/models"
	"github.com/lancachenet/monolithic/admin/services"
)

func NginxStatus(w http.ResponseWriter, r *http.Request) {
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

// ContainerRestart restarts the whole container by sending SIGTERM to PID 1
// (supervisord), which then exits cleanly. Docker's restart policy recreates
// the container, re-running every entrypoint hook from scratch.
//
// Because this only *stops* the container, it is guarded by two checks:
//  1. nginx must currently pass `nginx -t` — otherwise the startup config check
//     would fail and the container would crash-loop instead of coming back.
//  2. if the Docker restart policy can be read and would not auto-restart a
//     clean exit, the restart is refused — stopping would leave the host down.
func ContainerRestart(w http.ResponseWriter, r *http.Request) {
	// Gate 1: never restart into a config nginx will reject.
	if output, err := services.RunCommand("nginx", "-t"); err != nil {
		writeError(w, http.StatusConflict,
			"Restart refused: the current nginx configuration is invalid, so the "+
				"container would fail to start back up. Fix it with Save & Apply first.\n\n"+
				output)
		return
	}

	// Gate 2: refuse if we can prove Docker will not bring the container back.
	policy := services.DetectRestartPolicy()
	if policy.Determined && !policy.SurvivesCleanExit {
		writeError(w, http.StatusConflict,
			"Restart refused: this container's Docker restart policy is '"+policy.Name+
				"', so stopping it would not bring it back. Set 'restart: unless-stopped' "+
				"on the monolithic service in your compose file, then try again.")
		return
	}

	// Return 200 to the client before killing PID 1 so the browser gets a response.
	writeJSON(w, models.ContainerRestartResponse{
		Status:         "restarting",
		RestartPolicy:  policy.Name,
		PolicyVerified: policy.Determined,
	})
	if f, ok := w.(http.Flusher); ok {
		f.Flush()
	}

	// Send SIGTERM to PID 1 (supervisord) after a short delay so the response
	// reaches the browser before the process tree goes down.
	go func() {
		time.Sleep(500 * time.Millisecond)
		proc, err := os.FindProcess(1)
		if err != nil {
			log.Printf("ContainerRestart: cannot find PID 1: %v", err)
			return
		}
		if err := proc.Signal(syscall.SIGTERM); err != nil {
			log.Printf("ContainerRestart: failed to signal PID 1: %v", err)
		}
	}()
}
