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
)

func HealthHandler(w http.ResponseWriter, r *http.Request) {
	output, err := runCommand("supervisorctl", "status")
	if err != nil && output == "" {
		writeError(w, http.StatusInternalServerError, "failed to query supervisorctl: "+err.Error())
		return
	}

	processes := []ProcessInfo{}
	var maxUptimeSeconds int64

	lines := strings.Split(output, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
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

	version := envOrDefault("GENERICCACHE_VERSION", "3.1.0-fork")

	containerUptime := formatUptime(maxUptimeSeconds)

	resp := HealthResponse{
		Uptime:    containerUptime,
		Version:   version,
		Processes: processes,
	}

	writeJSON(w, resp)
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
	// seconds ignored for display

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
