package services

// Container-internal filesystem paths. All hard-coded `/data/*` and nginx
// configuration paths live here so future moves only need a single edit.
const (
	// CacheDir is the on-disk cache root that nginx writes proxy_cache entries
	// into. Also the path `df` is invoked against for disk-usage stats.
	CacheDir = "/data/cache"

	// ConfigHashPath holds the CONFIGHASH marker written by the entrypoint to
	// detect cache-invalidating env changes between container starts.
	ConfigHashPath = "/data/cache/CONFIGHASH"

	// CacheDomainsDir is the per-service domain-list directory populated from
	// the uklans/cache-domains repository.
	CacheDomainsDir = "/data/cachedomains"

	// ConfigDir is the persistent config directory that holds
	// admin-overrides.env and any other admin-edited state.
	ConfigDir = "/data/config"

	// LogsDir is the directory nginx writes access/error/upstream logs into.
	LogsDir = "/data/logs"

	// UpstreamPoolsConfPath is the generated nginx include that defines the
	// per-CDN keepalive upstream pools.
	UpstreamPoolsConfPath = "/etc/nginx/conf.d/40_upstream_pools.conf"

	// ErrorLogPath is nginx's main error log.
	ErrorLogPath = "/data/logs/error.log"

	// UpstreamFallbackLogPath records the synthetic combined-format entries
	// emitted when a request falls back to @noslice.
	UpstreamFallbackLogPath = "/data/logs/upstream-fallback.log"

	// AccessLogPath is nginx's main access log (cachelog or cachelog-json
	// format depending on NGINX_LOG_FORMAT).
	AccessLogPath = "/data/logs/access.log"

	// UpstreamErrorLogPath is nginx's upstream-specific error log used for the
	// upstream-health summary.
	UpstreamErrorLogPath = "/data/logs/upstream-error.log"

	// AdminOverridesPath is the admin-UI-managed env overrides file. Loaded at
	// startup and re-written by PUT /api/config.
	AdminOverridesPath = "/data/config/admin-overrides.env"

	// EpicSNILogPath is the stream/sniproxy access log used to detect Epic
	// launcher HTTPS leaks.
	EpicSNILogPath = "/data/logs/sniproxy/access.log"

	// LogWatchGlob is the filesystem glob used by StartLogWatcher to discover
	// log files for rotation detection.
	LogWatchGlob = "/data/logs/*.log"
)
