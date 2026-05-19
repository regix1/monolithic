package models

// NosliceHostState mirrors the per-host record in the njs `nosliceStatus`
// payload exposed at `/lancache-internal/noslice`.
type NosliceHostState struct {
	Count     int   `json:"count"`
	LastError int64 `json:"lastError"`
	Blocked   bool  `json:"blocked"`
}

// NosliceUpstream is the raw JSON shape returned by the internal njs endpoint.
// We decode the upstream payload into this struct, then translate it into the
// admin-facing NosliceResponse below (which retains the older field names so
// the frontend keeps working unchanged).
type NosliceUpstream struct {
	Enabled      bool                        `json:"enabled"`
	Mode         string                      `json:"mode"`
	BlockedHosts []string                    `json:"blockedHosts"`
	State        map[string]NosliceHostState `json:"state"`
}

// NosliceResponse is what the admin API returns to the React frontend at
// `GET /api/noslice`. Fields use snake_case to match the existing contract.
type NosliceResponse struct {
	Enabled      bool                        `json:"enabled"`
	Mode         string                      `json:"mode"`
	BlockedCount int                         `json:"blocked_count"`
	BlockedHosts []string                    `json:"blocked_hosts"`
	State        map[string]NosliceHostState `json:"state"`
}

// NosliceResetResponse is the API response shape for `POST /api/noslice/reset`.
type NosliceResetResponse struct {
	Status  string `json:"status"`
	Message string `json:"message"`
}
