package models

// RestartPolicy describes whether Docker will bring this container back up
// after PID 1 exits cleanly — which is exactly what ContainerRestart triggers.
type RestartPolicy struct {
	// Name is the Docker restart policy ("no", "always", "unless-stopped",
	// "on-failure") or "unknown" when it could not be determined.
	Name string `json:"name"`
	// Determined is true only when the policy was actually read from Docker.
	Determined bool `json:"determined"`
	// SurvivesCleanExit is true when a clean exit (code 0) is auto-restarted.
	SurvivesCleanExit bool `json:"survives_clean_exit"`
}

// ContainerRestartResponse is the body returned by POST /api/container/restart
// when a restart has been accepted and scheduled.
type ContainerRestartResponse struct {
	// Status is "restarting" once the SIGTERM to PID 1 has been scheduled.
	Status string `json:"status"`
	// RestartPolicy is the detected Docker restart policy ("unless-stopped",
	// "always", "no", "on-failure") or "unknown" if it could not be read.
	RestartPolicy string `json:"restart_policy"`
	// PolicyVerified is true when RestartPolicy was actually read from Docker.
	// When false, the container coming back could not be confirmed in advance.
	PolicyVerified bool `json:"policy_verified"`
}
