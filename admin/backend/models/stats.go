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

type StatsResponse struct {
	Nginx      NginxStats    `json:"nginx"`
	Disk       DiskStats     `json:"disk"`
	ConfigHash string        `json:"config_hash"`
	Upstream   UpstreamStats `json:"upstream"`
}
