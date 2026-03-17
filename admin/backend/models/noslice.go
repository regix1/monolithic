package models

type NosliceResponse struct {
	Enabled      bool                   `json:"enabled"`
	BlockedCount int                    `json:"blocked_count"`
	BlockedHosts []string               `json:"blocked_hosts"`
	State        map[string]interface{} `json:"state"`
}
