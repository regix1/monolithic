package services

import (
	"bufio"
	"log"
	"os"
	"strings"

	"github.com/lancachenet/monolithic/admin/models"
)

const AdminOverridesPath = "/data/config/admin-overrides.env"

var EnvVarGroups = []models.ConfigGroup{
	{Name: "Cache Settings", Vars: []models.EnvVar{
		{Key: "CACHE_DISK_SIZE", Default: "1000g", Description: "Maximum cache disk usage", Type: "text"},
		{Key: "CACHE_INDEX_SIZE", Default: "500m", Description: "proxy_cache_path keys_zone memory allocation", Type: "text"},
		{Key: "CACHE_MAX_AGE", Default: "3560d", Description: "Cache entry expiry duration", Type: "text"},
		{Key: "CACHE_SLICE_SIZE", Default: "1m", Description: "Nginx slice size for chunked downloads", Type: "text"},
		{Key: "MIN_FREE_DISK", Default: "10g", Description: "Minimum free disk before caching stops", Type: "text"},
	}},
	{Name: "Network", Vars: []models.EnvVar{
		{Key: "UPSTREAM_DNS", Default: "8.8.8.8 8.8.4.4", Description: "DNS resolvers for nginx resolver directives", Type: "text"},
	}},
	{Name: "Cache Domains", Vars: []models.EnvVar{
		{Key: "CACHE_DOMAINS_REPO", Default: "https://github.com/uklans/cache-domains.git", Description: "Git URL for cache-domains domain list", Type: "text"},
		{Key: "CACHE_DOMAINS_BRANCH", Default: "master", Description: "Branch of cache-domains repo", Type: "text"},
		{Key: "NOFETCH", Default: "false", Description: "Skip git fetch of cache-domains on startup", Type: "bool"},
	}},
	{Name: "Upstream Keepalive", Vars: []models.EnvVar{
		{Key: "ENABLE_UPSTREAM_KEEPALIVE", Default: "false", Description: "Enable HTTP/1.1 connection pooling to CDNs", Type: "bool"},
		{Key: "UPSTREAM_KEEPALIVE_CONNECTIONS", Default: "16", Description: "Idle keepalive connections per upstream pool", Type: "text"},
		{Key: "UPSTREAM_KEEPALIVE_TIMEOUT", Default: "4s", Description: "Idle keepalive connection lifetime", Type: "text"},
		{Key: "UPSTREAM_KEEPALIVE_TIME", Default: "60s", Description: "Maximum total connection lifetime before recycling", Type: "text"},
		{Key: "UPSTREAM_KEEPALIVE_REQUESTS", Default: "10000", Description: "Max requests per keepalive connection", Type: "text"},
		{Key: "UPSTREAM_KEEPALIVE_EXCLUDE", Default: "", Description: "Comma-separated CDN IDs to skip keepalive (e.g. epic,origin)", Type: "text"},
	}},
	{Name: "No-Slice Fallback", Vars: []models.EnvVar{
		{Key: "NOSLICE_FALLBACK", Default: "false", Description: "Auto-detect CDNs that do not support Range requests", Type: "bool"},
		{Key: "NOSLICE_THRESHOLD", Default: "3", Description: "Failure count before blocklisting a host", Type: "text"},
		{Key: "DECAY_INTERVAL", Default: "86400", Description: "Seconds before noslice failure counts decay by 1", Type: "text"},
	}},
	{Name: "Nginx", Vars: []models.EnvVar{
		{Key: "NGINX_WORKER_PROCESSES", Default: "auto", Description: "Number of nginx worker processes", Type: "text"},
		{Key: "NGINX_LOG_FORMAT", Default: "cachelog", Description: "Log format: cachelog (text) or cachelog-json", Type: "select", Options: []string{"cachelog", "cachelog-json"}},
		{Key: "NGINX_LOG_TO_STDOUT", Default: "false", Description: "Mirror access log to container stdout", Type: "bool"},
		{Key: "NGINX_SENDFILE", Default: "on", Description: "Set to off for btrfs, ZFS, NFS, or CIFS cache volumes", Type: "select", Options: []string{"on", "off"}},
	}},
	{Name: "Timeouts", Vars: []models.EnvVar{
		{Key: "NGINX_PROXY_CONNECT_TIMEOUT", Default: "300s", Description: "Global upstream TCP connect timeout", Type: "text"},
		{Key: "NGINX_PROXY_READ_TIMEOUT", Default: "300s", Description: "Global upstream read timeout", Type: "text"},
		{Key: "NGINX_PROXY_SEND_TIMEOUT", Default: "300s", Description: "Global upstream send timeout", Type: "text"},
		{Key: "NGINX_SEND_TIMEOUT", Default: "300s", Description: "Global client send timeout", Type: "text"},
	}},
	{Name: "Permissions", Vars: []models.EnvVar{
		{Key: "PUID", Default: "33", Description: "Host UID mapped to web user", Type: "text"},
		{Key: "PGID", Default: "33", Description: "Host GID mapped to web user", Type: "text"},
		{Key: "SKIP_PERMS_CHECK", Default: "false", Description: "Skip ownership check on startup", Type: "bool"},
		{Key: "FORCE_PERMS_CHECK", Default: "false", Description: "Force recursive chown on startup", Type: "bool"},
	}},
	{Name: "Admin UI", Vars: []models.EnvVar{
		{Key: "ENABLE_ADMIN_UI", Default: "false", Description: "Enable the admin web interface (requires container restart)", Type: "bool"},
		{Key: "ADMIN_PORT", Default: "8181", Description: "Port for the admin web interface", Type: "text"},
	}},
	{Name: "Logging", Vars: []models.EnvVar{
		{Key: "LOGFILE_RETENTION", Default: "3560", Description: "Days to retain rotated log files", Type: "text"},
		{Key: "BEAT_TIME", Default: "1h", Description: "Heartbeat ping interval", Type: "text"},
		{Key: "SUPERVISORD_LOGLEVEL", Default: "error", Description: "Supervisor log verbosity", Type: "select", Options: []string{"debug", "info", "warn", "error", "critical"}},
	}},
}

func LoadOverrides() map[string]string {
	overrides := make(map[string]string)
	f, err := os.Open(AdminOverridesPath)
	if err != nil {
		return overrides
	}
	defer f.Close()
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		idx := strings.IndexByte(line, '=')
		if idx < 0 {
			continue
		}
		overrides[line[:idx]] = line[idx+1:]
	}
	return overrides
}

func LoadAdminOverrides() {
	overrides := LoadOverrides()
	for k, v := range overrides {
		os.Setenv(k, v)
	}
	log.Printf("Loaded %d admin override(s) from %s", len(overrides), AdminOverridesPath)
}
