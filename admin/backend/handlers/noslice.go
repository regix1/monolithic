package handlers

import (
	"encoding/json"
	"net/http"
	"os"
	"regexp"
	"strings"
)

type NosliceResponse struct {
	Enabled      bool                   `json:"enabled"`
	BlockedCount int                    `json:"blocked_count"`
	BlockedHosts []string               `json:"blocked_hosts"`
	State        map[string]interface{} `json:"state"`
}

var nosliceHostRegex = regexp.MustCompile(`^"([^"]+)"\s+1;`)

func NosliceHandler(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		handleNosliceGet(w, r)
	case http.MethodPost:
		// Only /api/noslice/reset should accept POST — routed from main.go
		handleNosliceReset(w, r)
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func handleNosliceGet(w http.ResponseWriter, r *http.Request) {
	enabled := envOrDefault("NOSLICE_FALLBACK", "false") == "true"

	state := readNosliceState()
	blockedHosts := readBlockedHosts()

	resp := NosliceResponse{
		Enabled:      enabled,
		BlockedCount: len(blockedHosts),
		BlockedHosts: blockedHosts,
		State:        state,
	}

	writeJSON(w, resp)
}

func handleNosliceReset(w http.ResponseWriter, r *http.Request) {
	_, err := runCommand("/scripts/reset-noslice.sh")
	if err != nil {
		writeError(w, http.StatusInternalServerError, "noslice reset failed")
		return
	}

	writeJSON(w, map[string]string{"status": "ok", "message": "noslice state reset"})
}

func readNosliceState() map[string]interface{} {
	data, err := os.ReadFile("/data/noslice-state.json")
	if err != nil {
		return map[string]interface{}{}
	}

	var state map[string]interface{}
	if err := json.Unmarshal(data, &state); err != nil {
		return map[string]interface{}{}
	}

	return state
}

func readBlockedHosts() []string {
	data, err := os.ReadFile("/data/noslice-hosts.map")
	if err != nil {
		return []string{}
	}

	hosts := []string{}
	lines := strings.Split(string(data), "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		if match := nosliceHostRegex.FindStringSubmatch(line); len(match) > 1 {
			hosts = append(hosts, match[1])
		}
	}

	return hosts
}
