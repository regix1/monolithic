package models

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

type UpstreamPool struct {
	Domain    string   `json:"domain"`
	IPs       []string `json:"ips"`
	Keepalive int      `json:"keepalive"`
	Timeout   string   `json:"timeout"`
	Time      string   `json:"time"`
}

type UpstreamStats struct {
	KeepaliveEnabled bool               `json:"keepalive_enabled"`
	PoolCount        int                `json:"pool_count"`
	Pools            []UpstreamPool     `json:"pools"`
	Excluded         []string           `json:"excluded"`
	FallbackEvents   []UpstreamLogEntry `json:"fallback_events"`
}

// ServiceErrorCount attributes a count of errors to a single service name.
// Used inside HealthWarning.Services to break down a generic warning total
// across the services that contributed to it.
type ServiceErrorCount struct {
	Service string `json:"service"`
	Count   int    `json:"count"`
}

// HealthWarning is the structured form of a HealthCheck warning entry.
// Frontend prefers WarningsDetailed when present so it can render service
// breakdown chips + per-service deep links into Logs. Warnings []string is
// kept for backward compatibility and equals WarningsDetailed[*].Message.
type HealthWarning struct {
	Code     string              `json:"code"`               // e.g. "disk_warning", "high_error_rate", "upstream_errors"
	Message  string              `json:"message"`            // human-readable, includes service breakdown when applicable
	Severity string              `json:"severity"`           // "warning" or "critical"
	Services []ServiceErrorCount `json:"services,omitempty"` // top contributing services when applicable
}

type HealthCheck struct {
	Status           string          `json:"status"`            // "ok", "warning", "critical"
	Warnings         []string        `json:"warnings"`          // legacy: each message verbatim
	WarningsDetailed []HealthWarning `json:"warnings_detailed"` // structured form with codes + service breakdown
	DiskWarning      bool            `json:"disk_warning"`      // true if disk > 85%
	DiskCritical     bool            `json:"disk_critical"`     // true if disk > 95%
}

type StatsResponse struct {
	Nginx      NginxStats    `json:"nginx"`
	Disk       DiskStats     `json:"disk"`
	ConfigHash string        `json:"config_hash"`
	Upstream   UpstreamStats `json:"upstream"`
	Health     HealthCheck   `json:"health"`
}
