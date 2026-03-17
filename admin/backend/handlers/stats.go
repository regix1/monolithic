package handlers

import (
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
)

type NginxStats struct {
	ActiveConnections int64 `json:"active_connections"`
	Reading           int64 `json:"reading"`
	Writing           int64 `json:"writing"`
	Waiting           int64 `json:"waiting"`
	Accepts           int64 `json:"accepts"`
	Handled           int64 `json:"handled"`
	Requests          int64 `json:"requests"`
}

type DiskStats struct {
	Path       string  `json:"path"`
	Used       string  `json:"used"`
	Total      string  `json:"total"`
	Free       string  `json:"free"`
	UsedBytes  uint64  `json:"used_bytes"`
	TotalBytes uint64  `json:"total_bytes"`
	Percent    float64 `json:"percent"`
}

type StatsResponse struct {
	Nginx NginxStats `json:"nginx"`
	Disk  DiskStats  `json:"disk"`
}

func StatsHandler(w http.ResponseWriter, r *http.Request) {
	nginx, err := fetchNginxStats()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch nginx stats: "+err.Error())
		return
	}

	disk, err := fetchDiskStats("/data/cache")
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch disk stats: "+err.Error())
		return
	}

	resp := StatsResponse{
		Nginx: nginx,
		Disk:  disk,
	}

	writeJSON(w, resp)
}

func fetchNginxStats() (NginxStats, error) {
	var stats NginxStats

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

		// Try to parse the accepts/handled/requests line (3 numbers)
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

// fetchDiskStats uses `df` to get disk usage — works on all platforms.
func fetchDiskStats(path string) (DiskStats, error) {
	// df --block-size=1 gives bytes, -P for POSIX portable output
	output, err := runCommand("df", "--block-size=1", "-P", path)
	if err != nil {
		return DiskStats{}, fmt.Errorf("df failed: %w", err)
	}

	lines := strings.Split(strings.TrimSpace(output), "\n")
	if len(lines) < 2 {
		return DiskStats{}, fmt.Errorf("unexpected df output")
	}

	// POSIX df -P output line 2: Filesystem 1024-blocks Used Available Capacity Mounted
	fields := strings.Fields(lines[1])
	if len(fields) < 6 {
		return DiskStats{}, fmt.Errorf("unexpected df fields: %d", len(fields))
	}

	totalBytes, _ := strconv.ParseUint(fields[1], 10, 64)
	usedBytes, _ := strconv.ParseUint(fields[2], 10, 64)
	freeBytes, _ := strconv.ParseUint(fields[3], 10, 64)

	var percent float64
	if totalBytes > 0 {
		percent = float64(usedBytes) / float64(totalBytes) * 100
		percent = float64(int(percent*10)) / 10
	}

	return DiskStats{
		Path:       path,
		Used:       formatBytes(usedBytes),
		Total:      formatBytes(totalBytes),
		Free:       formatBytes(freeBytes),
		UsedBytes:  usedBytes,
		TotalBytes: totalBytes,
		Percent:    percent,
	}, nil
}
