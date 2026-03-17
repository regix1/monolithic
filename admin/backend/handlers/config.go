package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

type EnvVar struct {
	Key         string   `json:"key"`
	Value       string   `json:"value,omitempty"`
	Default     string   `json:"default"`
	Description string   `json:"description"`
	Type        string   `json:"type"`
	Options     []string `json:"options,omitempty"`
}

type ConfigGroup struct {
	Name string   `json:"name"`
	Vars []EnvVar `json:"vars"`
}

type ConfigResponse struct {
	Groups []ConfigGroup `json:"groups"`
}

type UpdateConfigResponse struct {
	OK      bool   `json:"ok"`
	Message string `json:"message"`
}

const adminOverridesPath = "/data/admin-overrides.env"

var envVarGroups = []ConfigGroup{
	{Name: "Cache Settings", Vars: []EnvVar{
		{Key: "CACHE_DISK_SIZE", Default: "1000g", Description: "Maximum cache disk usage", Type: "text"},
		{Key: "CACHE_INDEX_SIZE", Default: "500m", Description: "proxy_cache_path keys_zone memory allocation", Type: "text"},
		{Key: "CACHE_MAX_AGE", Default: "3560d", Description: "Cache entry expiry duration", Type: "text"},
		{Key: "CACHE_SLICE_SIZE", Default: "1m", Description: "Nginx slice size for chunked downloads", Type: "text"},
		{Key: "MIN_FREE_DISK", Default: "10g", Description: "Minimum free disk before caching stops", Type: "text"},
	}},
	{Name: "Network", Vars: []EnvVar{
		{Key: "UPSTREAM_DNS", Default: "8.8.8.8 8.8.4.4", Description: "DNS resolvers for nginx resolver directives", Type: "text"},
	}},
	{Name: "Cache Domains", Vars: []EnvVar{
		{Key: "CACHE_DOMAINS_REPO", Default: "https://github.com/uklans/cache-domains.git", Description: "Git URL for cache-domains domain list", Type: "text"},
		{Key: "CACHE_DOMAINS_BRANCH", Default: "master", Description: "Branch of cache-domains repo", Type: "text"},
		{Key: "NOFETCH", Default: "false", Description: "Skip git fetch of cache-domains on startup", Type: "bool"},
	}},
	{Name: "Upstream Keepalive", Vars: []EnvVar{
		{Key: "ENABLE_UPSTREAM_KEEPALIVE", Default: "false", Description: "Enable HTTP/1.1 connection pooling to CDNs", Type: "bool"},
		{Key: "UPSTREAM_KEEPALIVE_CONNECTIONS", Default: "16", Description: "Idle keepalive connections per upstream pool", Type: "text"},
		{Key: "UPSTREAM_KEEPALIVE_TIMEOUT", Default: "4s", Description: "Idle keepalive connection lifetime", Type: "text"},
		{Key: "UPSTREAM_KEEPALIVE_TIME", Default: "60s", Description: "Maximum total connection lifetime before recycling", Type: "text"},
		{Key: "UPSTREAM_KEEPALIVE_REQUESTS", Default: "10000", Description: "Max requests per keepalive connection", Type: "text"},
		{Key: "UPSTREAM_KEEPALIVE_EXCLUDE", Default: "", Description: "Comma-separated CDN IDs to skip keepalive (e.g. epic,origin)", Type: "text"},
	}},
	{Name: "No-Slice Fallback", Vars: []EnvVar{
		{Key: "NOSLICE_FALLBACK", Default: "false", Description: "Auto-detect CDNs that do not support Range requests", Type: "bool"},
		{Key: "NOSLICE_THRESHOLD", Default: "3", Description: "Failure count before blocklisting a host", Type: "text"},
		{Key: "DECAY_INTERVAL", Default: "86400", Description: "Seconds before noslice failure counts decay by 1", Type: "text"},
	}},
	{Name: "Nginx", Vars: []EnvVar{
		{Key: "NGINX_WORKER_PROCESSES", Default: "auto", Description: "Number of nginx worker processes", Type: "text"},
		{Key: "NGINX_LOG_FORMAT", Default: "cachelog", Description: "Log format: cachelog (text) or cachelog-json", Type: "select", Options: []string{"cachelog", "cachelog-json"}},
		{Key: "NGINX_LOG_TO_STDOUT", Default: "false", Description: "Mirror access log to container stdout", Type: "bool"},
		{Key: "NGINX_SENDFILE", Default: "on", Description: "Set to off for btrfs, ZFS, NFS, or CIFS cache volumes", Type: "select", Options: []string{"on", "off"}},
	}},
	{Name: "Timeouts", Vars: []EnvVar{
		{Key: "NGINX_PROXY_CONNECT_TIMEOUT", Default: "300s", Description: "Global upstream TCP connect timeout", Type: "text"},
		{Key: "NGINX_PROXY_READ_TIMEOUT", Default: "300s", Description: "Global upstream read timeout", Type: "text"},
		{Key: "NGINX_PROXY_SEND_TIMEOUT", Default: "300s", Description: "Global upstream send timeout", Type: "text"},
		{Key: "NGINX_SEND_TIMEOUT", Default: "300s", Description: "Global client send timeout", Type: "text"},
	}},
	{Name: "Permissions", Vars: []EnvVar{
		{Key: "PUID", Default: "33", Description: "Host UID mapped to web user", Type: "text"},
		{Key: "PGID", Default: "33", Description: "Host GID mapped to web user", Type: "text"},
		{Key: "SKIP_PERMS_CHECK", Default: "false", Description: "Skip ownership check on startup", Type: "bool"},
		{Key: "FORCE_PERMS_CHECK", Default: "false", Description: "Force recursive chown on startup", Type: "bool"},
	}},
	{Name: "Logging", Vars: []EnvVar{
		{Key: "LOGFILE_RETENTION", Default: "3560", Description: "Days to retain rotated log files", Type: "text"},
		{Key: "BEAT_TIME", Default: "1h", Description: "Heartbeat ping interval", Type: "text"},
		{Key: "SUPERVISORD_LOGLEVEL", Default: "error", Description: "Supervisor log verbosity", Type: "select", Options: []string{"debug", "info", "warn", "error", "critical"}},
	}},
}

func GetConfig(w http.ResponseWriter, r *http.Request) {
	groups := make([]ConfigGroup, len(envVarGroups))

	for i, group := range envVarGroups {
		vars := make([]EnvVar, len(group.Vars))
		for j, v := range group.Vars {
			value := os.Getenv(v.Key)
			if value == "" {
				value = v.Default
			}
			vars[j] = EnvVar{
				Key:         v.Key,
				Value:       value,
				Default:     v.Default,
				Description: v.Description,
				Type:        v.Type,
				Options:     v.Options,
			}
		}
		groups[i] = ConfigGroup{
			Name: group.Name,
			Vars: vars,
		}
	}

	writeJSON(w, ConfigResponse{Groups: groups})
}

func UpdateConfig(w http.ResponseWriter, r *http.Request) {
	var body map[string]string
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	// Build set of known keys for validation
	knownKeys := make(map[string]bool)
	for _, g := range envVarGroups {
		for _, v := range g.Vars {
			knownKeys[v.Key] = true
		}
	}

	// Validate keys and values
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

	// Ensure parent directory exists
	if err := os.MkdirAll(filepath.Dir(adminOverridesPath), 0755); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create config directory: "+err.Error())
		return
	}

	if err := os.WriteFile(adminOverridesPath, []byte(content), 0644); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to write config: "+err.Error())
		return
	}

	writeJSON(w, UpdateConfigResponse{
		OK:      true,
		Message: "Configuration saved. Restart required to apply.",
	})
}
