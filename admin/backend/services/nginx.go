package services

import (
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/lancachenet/monolithic/admin/models"
)

func FetchNginxStats() (models.NginxStats, error) {
	var stats models.NginxStats

	resp, err := http.Get("http://127.0.0.1:8080/nginx_status")
	if err != nil {
		return stats, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return stats, fmt.Errorf("read failed: %w", err)
	}

	lines := strings.Split(strings.TrimSpace(string(body)), "\n")

	for _, line := range lines {
		line = strings.TrimSpace(line)

		if strings.HasPrefix(line, "Active connections:") {
			val := strings.TrimPrefix(line, "Active connections:")
			stats.ActiveConnections, _ = strconv.ParseInt(strings.TrimSpace(val), 10, 64)
			continue
		}

		if strings.HasPrefix(line, "Reading:") {
			parts := strings.Fields(line)
			for i, p := range parts {
				switch p {
				case "Reading:":
					if i+1 < len(parts) {
						stats.Reading, _ = strconv.ParseInt(parts[i+1], 10, 64)
					}
				case "Writing:":
					if i+1 < len(parts) {
						stats.Writing, _ = strconv.ParseInt(parts[i+1], 10, 64)
					}
				case "Waiting:":
					if i+1 < len(parts) {
						stats.Waiting, _ = strconv.ParseInt(parts[i+1], 10, 64)
					}
				}
			}
			continue
		}

		fields := strings.Fields(line)
		if len(fields) == 3 {
			a, errA := strconv.ParseInt(fields[0], 10, 64)
			h, errH := strconv.ParseInt(fields[1], 10, 64)
			r, errR := strconv.ParseInt(fields[2], 10, 64)
			if errA == nil && errH == nil && errR == nil {
				stats.Accepts = a
				stats.Handled = h
				stats.Requests = r
			}
		}
	}

	return stats, nil
}

func FetchDiskStats(path string) (models.DiskStats, error) {
	output, err := RunCommand("df", "--block-size=1", "-P", path)
	if err != nil {
		return models.DiskStats{}, fmt.Errorf("df failed: %w", err)
	}

	lines := strings.Split(strings.TrimSpace(output), "\n")
	if len(lines) < 2 {
		return models.DiskStats{}, fmt.Errorf("unexpected df output")
	}

	fields := strings.Fields(lines[1])
	if len(fields) < 6 {
		return models.DiskStats{}, fmt.Errorf("unexpected df fields: %d", len(fields))
	}

	totalBytes, _ := strconv.ParseUint(fields[1], 10, 64)
	usedBytes, _ := strconv.ParseUint(fields[2], 10, 64)
	freeBytes, _ := strconv.ParseUint(fields[3], 10, 64)

	var percent float64
	if totalBytes > 0 {
		percent = float64(usedBytes) / float64(totalBytes) * 100
		percent = float64(int(percent*10)) / 10
	}

	return models.DiskStats{
		Path:       path,
		Used:       FormatBytes(usedBytes),
		Total:      FormatBytes(totalBytes),
		Free:       FormatBytes(freeBytes),
		UsedBytes:  usedBytes,
		TotalBytes: totalBytes,
		Percent:    percent,
	}, nil
}

func FormatBytes(bytes uint64) string {
	const (
		KB = 1024
		MB = KB * 1024
		GB = MB * 1024
		TB = GB * 1024
	)

	switch {
	case bytes >= TB:
		return fmt.Sprintf("%.1f TB", float64(bytes)/float64(TB))
	case bytes >= GB:
		return fmt.Sprintf("%.1f GB", float64(bytes)/float64(GB))
	case bytes >= MB:
		return fmt.Sprintf("%.1f MB", float64(bytes)/float64(MB))
	case bytes >= KB:
		return fmt.Sprintf("%.1f KB", float64(bytes)/float64(KB))
	default:
		return fmt.Sprintf("%d B", bytes)
	}
}
