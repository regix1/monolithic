package handlers

import (
	"net/http"
	"regexp"
	"strconv"
	"strings"
)

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

var (
	pidRegex    = regexp.MustCompile(`pid\s+(\d+)`)
	uptimeRegex = regexp.MustCompile(`uptime\s+(\d+:\d+:\d+)`)
	// Valid supervisor statuses
	validStatuses = map[string]bool{
		"RUNNING":  true,
		"STOPPED":  true,
		"STARTING": true,
		"BACKOFF":  true,
		"STOPPING": true,
		"EXITED":   true,
		"FATAL":    true,
		"UNKNOWN":  true,
	}
)

func HealthHandler(w http.ResponseWriter, r *http.Request) {
	// Try supervisorctl with explicit config path as fallback
	output, err := runCommand("supervisorctl", "status")
	if err != nil && output == "" {
		// Try with explicit socket
		output, err = runCommand("supervisorctl", "-s", "unix:///var/run/supervisor.sock", "status")
	}
	if err != nil && output == "" {
		// Try reading /proc for process info as last resort
		output, _ = runCommand("sh", "-c", "ps aux | grep -E '(nginx|heartbeat|log-watcher|noslice|lancache)' | grep -v grep")
	}

	processes := []ProcessInfo{}
	var maxUptimeSeconds int64

	lines := strings.Split(output, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		// Skip non-process lines (errors, socket paths, headers)
		if strings.HasPrefix(line, "unix:") || strings.HasPrefix(line, "http:") ||
			strings.Contains(line, "refused") || strings.Contains(line, "no such file") ||
			strings.Contains(line, "ERROR") || strings.Contains(line, "sock") {
			continue
		}

		// Only parse lines that look like supervisor status output
		// Format: name  STATUS  pid PID, uptime H:M:S
		fields := strings.Fields(line)
		if len(fields) < 2 || !validStatuses[fields[1]] {
			continue
		}

		proc := parseSupervisorLine(line)
		processes = append(processes, proc)

		if proc.Status == "RUNNING" {
			secs := parseUptimeToSeconds(line)
			if secs > maxUptimeSeconds {
				maxUptimeSeconds = secs
			}
		}
	}

	// If supervisorctl failed entirely, try to build process list from ps
	if len(processes) == 0 {
		processes = fallbackProcessList()
	}

	version := envOrDefault("GENERICCACHE_VERSION", "3.1.0-fork")
	containerUptime := formatUptime(maxUptimeSeconds)

	// If we couldn't get uptime from supervisor, try /proc/1
	if maxUptimeSeconds == 0 {
		containerUptime = getContainerUptime()
	}

	resp := HealthResponse{
		Uptime:    containerUptime,
		Version:   version,
		Processes: processes,
	}

	writeJSON(w, resp)
}

// fallbackProcessList builds a process list from `ps` when supervisorctl fails.
func fallbackProcessList() []ProcessInfo {
	expected := []string{"nginx", "heartbeat", "log-watcher", "noslice-detector", "lancache-admin"}
	processes := []ProcessInfo{}

	psOutput, _ := runCommand("sh", "-c", "ps -eo comm")
	running := strings.ToLower(psOutput)

	for _, name := range expected {
		status := "STOPPED"
		if strings.Contains(running, strings.ToLower(name)) {
			status = "RUNNING"
		}
		// Don't list ourselves
		if name == "lancache-admin" {
			continue
		}
		processes = append(processes, ProcessInfo{
			Name:   name,
			Status: status,
		})
	}

	return processes
}

// getContainerUptime reads container uptime from /proc/1/stat or falls back to `uptime`.
func getContainerUptime() string {
	// Try reading system uptime
	output, err := runCommand("cat", "/proc/uptime")
	if err == nil {
		fields := strings.Fields(output)
		if len(fields) > 0 {
			if secs, err := strconv.ParseFloat(fields[0], 64); err == nil {
				return formatUptime(int64(secs))
			}
		}
	}
	return "unknown"
}

func parseSupervisorLine(line string) ProcessInfo {
	fields := strings.Fields(line)
	if len(fields) < 2 {
		return ProcessInfo{Name: line, Status: "UNKNOWN"}
	}

	name := fields[0]
	status := fields[1]

	pid := 0
	if match := pidRegex.FindStringSubmatch(line); len(match) > 1 {
		pid, _ = strconv.Atoi(match[1])
	}

	uptime := ""
	if match := uptimeRegex.FindStringSubmatch(line); len(match) > 1 {
		uptime = convertHMSToHuman(match[1])
	}

	return ProcessInfo{
		Name:   name,
		Status: status,
		PID:    pid,
		Uptime: uptime,
	}
}

func convertHMSToHuman(hms string) string {
	parts := strings.Split(hms, ":")
	if len(parts) != 3 {
		return hms
	}

	hours, _ := strconv.ParseInt(parts[0], 10, 64)
	minutes, _ := strconv.ParseInt(parts[1], 10, 64)

	totalSeconds := hours*3600 + minutes*60
	return formatUptime(totalSeconds)
}

func parseUptimeToSeconds(line string) int64 {
	match := uptimeRegex.FindStringSubmatch(line)
	if len(match) < 2 {
		return 0
	}

	parts := strings.Split(match[1], ":")
	if len(parts) != 3 {
		return 0
	}

	hours, _ := strconv.ParseInt(parts[0], 10, 64)
	minutes, _ := strconv.ParseInt(parts[1], 10, 64)
	seconds, _ := strconv.ParseInt(parts[2], 10, 64)

	return hours*3600 + minutes*60 + seconds
}
