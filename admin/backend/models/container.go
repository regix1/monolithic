package models

// ContainerRestartResponse is the body returned by POST /api/container/restart
// when a restart has been accepted and scheduled.
type ContainerRestartResponse struct {
	// Status is "restarting" once the SIGTERM to PID 1 has been scheduled.
	Status string `json:"status"`
	// RestartPolicy is the detected Docker restart policy ("unless-stopped",
	// "always", "no", "on-failure") or "unknown" if it could not be read.
	RestartPolicy string `json:"restartPolicy"`
	// PolicyVerified is true when RestartPolicy was actually read from Docker.
	// When false, the container coming back could not be confirmed in advance.
	PolicyVerified bool `json:"policyVerified"`
}
