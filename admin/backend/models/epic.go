package models

// EpicCacheRatio holds the access-log-derived cache hit/miss tally for Epic
// CDN traffic over the configured window.
type EpicCacheRatio struct {
	TotalRequests int     `json:"total_requests"`
	Hits          int     `json:"hits"`
	Misses        int     `json:"misses"`
	HitRate       float64 `json:"hit_rate"` // percent, 0-100, 1-decimal rounded
}

// EpicHTTPSLeak is the per-host record of an Epic CDN domain seen in the
// SNI/stream logs. When this is non-empty the Epic launcher is using HTTPS
// CDN endpoints and the cache cannot intercept them.
type EpicHTTPSLeak struct {
	Host  string `json:"host"`
	Count int    `json:"count"`
}

// EpicDiagnostic is the typed payload returned by GET /api/epic and pushed
// over SSE on the "epic" topic. Mirrors the Dashboard Epic-health card.
type EpicDiagnostic struct {
	Window        string          `json:"window"`          // human-readable e.g. "24h"
	Enabled       bool            `json:"enabled"`         // EPIC_FORCE_NOSLICE flag
	CacheRatio    EpicCacheRatio  `json:"cache_ratio"`     // counts/hit-rate over the window
	HTTPSLeak     bool            `json:"https_leak"`      // Epic seen over HTTPS in SNI logs
	HTTPSHosts    []EpicHTTPSLeak `json:"https_hosts"`     // top Epic SNI hosts (may be empty)
	EngineIniHint string          `json:"engine_ini_hint"` // user-facing remediation hint
	KnownHosts    []string        `json:"known_hosts"`     // Epic CDN hosts the cache recognises
}
