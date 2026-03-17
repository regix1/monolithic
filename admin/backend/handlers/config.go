package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/lancachenet/monolithic/admin/models"
	"github.com/lancachenet/monolithic/admin/services"
)

func GetConfig(w http.ResponseWriter, r *http.Request) {
	overrides := services.LoadOverrides()
	groups := make([]models.ConfigGroup, len(services.EnvVarGroups))

	for i, group := range services.EnvVarGroups {
		vars := make([]models.EnvVar, len(group.Vars))
		for j, v := range group.Vars {
			value := overrides[v.Key]
			if value == "" {
				value = os.Getenv(v.Key)
			}
			if value == "" {
				value = v.Default
			}
			vars[j] = models.EnvVar{
				Key:         v.Key,
				Value:       value,
				Default:     v.Default,
				Description: v.Description,
				Type:        v.Type,
				Options:     v.Options,
			}
		}
		groups[i] = models.ConfigGroup{
			Name: group.Name,
			Vars: vars,
		}
	}

	writeJSON(w, models.ConfigResponse{Groups: groups})
}

func UpdateConfig(w http.ResponseWriter, r *http.Request) {
	var body map[string]string
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	knownKeys := make(map[string]bool)
	for _, g := range services.EnvVarGroups {
		for _, v := range g.Vars {
			knownKeys[v.Key] = true
		}
	}

	keys := make([]string, 0, len(body))
	for k, v := range body {
		if !knownKeys[k] {
			writeError(w, http.StatusBadRequest, "unknown config key: "+k)
			return
		}
		if strings.ContainsAny(v, "\n\r") {
			writeError(w, http.StatusBadRequest, "invalid value for "+k+": contains newlines")
			return
		}
		keys = append(keys, k)
	}
	sort.Strings(keys)

	var lines []string
	for _, k := range keys {
		lines = append(lines, fmt.Sprintf("%s=%s", k, body[k]))
	}

	content := strings.Join(lines, "\n") + "\n"

	if err := os.MkdirAll(filepath.Dir(services.AdminOverridesPath), 0755); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create config directory: "+err.Error())
		return
	}

	if err := os.WriteFile(services.AdminOverridesPath, []byte(content), 0644); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to write config: "+err.Error())
		return
	}

	for k, v := range body {
		os.Setenv(k, v)
	}

	writeJSON(w, models.UpdateConfigResponse{
		OK:      true,
		Message: "Configuration saved. Restart required to apply.",
	})
}
