package services

import (
	"context"
	"encoding/json"
	"net"
	"net/http"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/lancachenet/monolithic/admin/models"
)

// dockerSocketPath is the conventional location of the Docker Engine API socket.
// It is only present inside the container when the operator explicitly mounts it.
const dockerSocketPath = "/var/run/docker.sock"

var dockerContainerIDRegex = regexp.MustCompile(`[0-9a-f]{64}`)

// detectContainerID resolves this container's 64-character ID from /proc. It
// works even under network_mode: host, where $HOSTNAME is the host's name
// rather than the container ID.
func detectContainerID() string {
	// Docker bind-mounts /etc/hostname, /etc/hosts and /etc/resolv.conf from
	// /var/lib/docker/containers/<id>/, so the ID is referenced in mountinfo.
	if data, err := os.ReadFile("/proc/self/mountinfo"); err == nil {
		for _, line := range strings.Split(string(data), "\n") {
			if strings.Contains(line, "/containers/") {
				if id := dockerContainerIDRegex.FindString(line); id != "" {
					return id
				}
			}
		}
	}
	// cgroup v1 fallback: the cgroup path ends with .../docker/<id>.
	if data, err := os.ReadFile("/proc/self/cgroup"); err == nil {
		if id := dockerContainerIDRegex.FindString(string(data)); id != "" {
			return id
		}
	}
	return ""
}

// DetectRestartPolicy reports this container's Docker restart policy. It is
// best-effort: when the Docker socket is not mounted or the container cannot be
// identified, it returns Determined=false and callers must not block on it.
func DetectRestartPolicy() models.RestartPolicy {
	unknown := models.RestartPolicy{Name: "unknown"}

	if _, err := os.Stat(dockerSocketPath); err != nil {
		return unknown
	}
	id := detectContainerID()
	if id == "" {
		return unknown
	}

	client := &http.Client{
		Timeout: 3 * time.Second,
		Transport: &http.Transport{
			DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
				return (&net.Dialer{}).DialContext(ctx, "unix", dockerSocketPath)
			},
		},
	}
	resp, err := client.Get("http://docker/containers/" + id + "/json")
	if err != nil {
		return unknown
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return unknown
	}

	var inspect struct {
		HostConfig struct {
			RestartPolicy struct {
				Name string `json:"Name"`
			} `json:"RestartPolicy"`
		} `json:"HostConfig"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&inspect); err != nil {
		return unknown
	}

	name := inspect.HostConfig.RestartPolicy.Name
	if name == "" {
		name = "no" // Docker reports an unset restart policy as an empty string.
	}
	return models.RestartPolicy{
		Name:              name,
		Determined:        true,
		SurvivesCleanExit: name == "always" || name == "unless-stopped",
	}
}
