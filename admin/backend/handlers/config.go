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

const configHashPath = "/data/cache/CONFIGHASH"
const configHashDescription = "Config hash guards against cache invalidation from config changes. Delete and restart container to regenerate."

func parseConfigHashComponents(raw string) models.ConfigHashComponents {
	components := models.ConfigHashComponents{}
	for _, part := range strings.Split(raw, ";") {
		kv := strings.SplitN(part, "=", 2)
		if len(kv) != 2 {
			continue
		}
		key := strings.TrimSpace(strings.ToLower(kv[0]))
		val := strings.TrimSpace(kv[1])
		switch key {
		case "genericcache_version":
			components.GenericCacheVersion = val
		case "cache_mode":
			components.CacheMode = val
		case "cache_slice_size":
			components.CacheSliceSize = val
		case "cache_key":
			components.CacheKey = val
		}
	}
	return components
}

func GetConfigHash(w http.ResponseWriter, r *http.Request) {
	data, err := os.ReadFile(configHashPath)
	if err != nil {
		if os.IsNotExist(err) {
			writeJSON(w, models.ConfigHashResponse{
				Exists:      false,
				Raw:         "",
				Components:  models.ConfigHashComponents{},
				Description: configHashDescription,
			})
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to read CONFIGHASH: "+err.Error())
		return
	}

	raw := strings.TrimSpace(string(data))
	writeJSON(w, models.ConfigHashResponse{
		Exists:      true,
		Raw:         raw,
		Components:  parseConfigHashComponents(raw),
		Description: configHashDescription,
	})
}

func DeleteConfigHash(w http.ResponseWriter, r *http.Request) {
	if err := os.Remove(configHashPath); err != nil {
		if os.IsNotExist(err) {
			writeError(w, http.StatusNotFound, "CONFIGHASH file does not exist")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to delete CONFIGHASH: "+err.Error())
		return
	}

	fmt.Printf("[ADMIN] CONFIGHASH deleted via API\n")
	writeJSON(w, models.DeleteConfigHashResponse{
		OK:      true,
		Message: "CONFIGHASH deleted. Restart the container to regenerate it.",
	})
}
