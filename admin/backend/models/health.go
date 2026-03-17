package models

type ProcessInfo struct {
	Name   string `json:"name"`
	Status string `json:"status"`
	PID    int    `json:"pid"`
	Uptime string `json:"uptime"`
}

type HealthResponse struct {
	Uptime    string        `json:"uptime"`
	Version   string        `json:"version"`
	Processes []ProcessInfo `json:"processes"`
}
