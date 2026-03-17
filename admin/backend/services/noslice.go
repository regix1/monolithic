package services

import (
	"encoding/json"
	"os"
	"regexp"
	"strings"
)

var nosliceHostRegex = regexp.MustCompile(`^"([^"]+)"\s+1;`)

func ReadNosliceState() map[string]interface{} {
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

func ReadBlockedHosts() []string {
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

func ResetNoslice() (string, error) {
	return RunCommand("/scripts/reset-noslice.sh")
}
