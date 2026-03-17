package models

type ErrorLogEntry struct {
	Time    string `json:"time"`
	Level   string `json:"level"`
	Message string `json:"message"`
}

type UpstreamLogEntry struct {
	Time   string `json:"time"`
	Host   string `json:"host"`
	Status string `json:"status"`
}

type CacheStatusEntry struct {
	Name  string  `json:"name"`
	Value float64 `json:"value"`
	Count int     `json:"count"`
	Color string  `json:"color"`
}

type ErrorRateBucket struct {
	Time   string `json:"time"`
	Errors int    `json:"errors"`
}

type NosliceEvent struct {
	Time  string `json:"time"`
	Host  string `json:"host"`
	Error string `json:"error"`
}

type ResponseTimes struct {
	Avg string `json:"avg"`
	P95 string `json:"p95"`
	P99 string `json:"p99"`
}

type UpstreamErrorEntry struct {
	Time      string `json:"time"`
	Level     string `json:"level"`
	ErrorType string `json:"error_type"` // "timeout", "connection_refused", "dns_failure", "other"
	Host      string `json:"host"`
	Message   string `json:"message"`
}

type UpstreamHealthSummary struct {
	TotalErrors int                 `json:"total_errors"`
	Timeouts    int                 `json:"timeouts"`
	ConnRefused int                 `json:"conn_refused"`
	DnsFailures int                 `json:"dns_failures"`
	Other       int                 `json:"other"`
	TopHosts    []UpstreamErrorHost `json:"top_hosts"`
}

type UpstreamErrorHost struct {
	Host  string `json:"host"`
	Count int    `json:"count"`
}

type LogStatsResponse struct {
	CacheStatus    []CacheStatusEntry    `json:"cache_status"`
	ErrorRate      []ErrorRateBucket     `json:"error_rate"`
	RecentErrors   []ErrorLogEntry       `json:"recent_errors"`
	NosliceEvents  []NosliceEvent        `json:"noslice_events"`
	ResponseTimes  ResponseTimes         `json:"response_times"`
	UpstreamHealth UpstreamHealthSummary `json:"upstream_health"`
	FallbackCount  int                   `json:"fallback_count"`
}
