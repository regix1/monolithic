package services

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"

	"github.com/lancachenet/monolithic/admin/models"
)

var (
	pidRegex    = regexp.MustCompile(`pid\s+(\d+)`)
	uptimeRegex = regexp.MustCompile(`uptime\s+(\d+:\d+:\d+)`)
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

func ParseSupervisorStatus() ([]models.ProcessInfo, int64) {
	output, err := RunCommand("supervisorctl", "status")
	if err != nil && output == "" {
		output, err = RunCommand("supervisorctl", "-s", "unix:///var/run/supervisor.sock", "status")
	}
	if err != nil && output == "" {
		output, _ = RunCommand("sh", "-c", "ps aux | grep -E '(nginx|heartbeat|log-watcher|noslice|lancache)' | grep -v grep")
	}

	processes := []models.ProcessInfo{}
	var maxUptimeSeconds int64

	lines := strings.Split(output, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		if strings.HasPrefix(line, "unix:") || strings.HasPrefix(line, "http:") ||
			strings.Contains(line, "refused") || strings.Contains(line, "no such file") ||
			strings.Contains(line, "ERROR") || strings.Contains(line, "sock") {
			continue
		}

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

	if len(processes) == 0 {
		processes = FallbackProcessList()
	}

	return processes, maxUptimeSeconds
}

func FallbackProcessList() []models.ProcessInfo {
	expected := []string{"nginx", "heartbeat", "log-watcher", "noslice-detector", "lancache-admin"}
	processes := []models.ProcessInfo{}

	psOutput, _ := RunCommand("sh", "-c", "ps -eo comm")
	running := strings.ToLower(psOutput)

	for _, name := range expected {
		status := "STOPPED"
		if strings.Contains(running, strings.ToLower(name)) {
			status = "RUNNING"
		}
		if name == "lancache-admin" {
			continue
		}
		processes = append(processes, models.ProcessInfo{
			Name:   name,
			Status: status,
		})
	}

	return processes
}

func GetContainerUptime() string {
	output, err := RunCommand("cat", "/proc/uptime")
	if err == nil {
		fields := strings.Fields(output)
		if len(fields) > 0 {
			if secs, err := strconv.ParseFloat(fields[0], 64); err == nil {
				return FormatUptime(int64(secs))
			}
		}
	}
	return "unknown"
}

func parseSupervisorLine(line string) models.ProcessInfo {
	fields := strings.Fields(line)
	if len(fields) < 2 {
		return models.ProcessInfo{Name: line, Status: "UNKNOWN"}
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

	return models.ProcessInfo{
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
	return FormatUptime(totalSeconds)
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

func FormatUptime(seconds int64) string {
	days := seconds / 86400
	hours := (seconds % 86400) / 3600
	minutes := (seconds % 3600) / 60

	parts := []string{}
	if days > 0 {
		parts = append(parts, fmt.Sprintf("%dd", days))
	}
	if hours > 0 || days > 0 {
		parts = append(parts, fmt.Sprintf("%dh", hours))
	}
	parts = append(parts, fmt.Sprintf("%dm", minutes))

	return strings.Join(parts, " ")
}
