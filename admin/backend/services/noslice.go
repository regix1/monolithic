package services

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/lancachenet/monolithic/admin/models"
)

// NosliceInternalURL is the njs-backed HTTP endpoint inside the container that
// exposes the live `js_shared_dict_zone` state. Read-only.
const NosliceInternalURL = "http://127.0.0.1:8080/lancache-internal/noslice"

// NosliceResetURL is the njs-backed endpoint that atomically clears the dict
// and its persisted `state=` file. POST only.
const NosliceResetURL = "http://127.0.0.1:8080/lancache-internal/noslice/reset"

// nosliceHTTPClient is a package-level client with a short timeout. The
// internal endpoint is loopback so a slow response is almost always a bug
// (e.g. nginx still booting) and we prefer surfacing it fast.
var nosliceHTTPClient = &http.Client{Timeout: 2 * time.Second}

// FetchNosliceStatus calls the internal njs endpoint and decodes the §4 JSON
// into a typed struct. The returned bool indicates whether the call succeeded;
// callers should fall back to a disabled-state value when it is false.
func FetchNosliceStatus() (models.NosliceUpstream, bool) {
	var payload models.NosliceUpstream

	resp, err := nosliceHTTPClient.Get(NosliceInternalURL)
	if err != nil {
		return payload, false
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		// Drain so the connection can be reused.
		_, _ = io.Copy(io.Discard, resp.Body)
		return payload, false
	}

	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return payload, false
	}

	if payload.BlockedHosts == nil {
		payload.BlockedHosts = []string{}
	}
	if payload.State == nil {
		payload.State = map[string]models.NosliceHostState{}
	}
	return payload, true
}

// BuildNosliceResponse translates the upstream §4 JSON shape into the
// admin-API response shape consumed by the React frontend.
func BuildNosliceResponse() models.NosliceResponse {
	envEnabled := EnvOrDefault("NOSLICE_FALLBACK", "false") == "true"

	upstream, ok := FetchNosliceStatus()
	if !ok {
		// Internal endpoint unreachable (nginx still booting, NOSLICE_FALLBACK
		// disabled, etc.) — return a quiet "disabled" snapshot so the frontend
		// still renders cleanly.
		return models.NosliceResponse{
			Enabled:      envEnabled,
			Mode:         EnvOrDefault("NOSLICE_DETECT_MODE", "log"),
			BlockedCount: 0,
			BlockedHosts: []string{},
			State:        map[string]models.NosliceHostState{},
		}
	}

	return models.NosliceResponse{
		Enabled:      upstream.Enabled,
		Mode:         upstream.Mode,
		BlockedCount: len(upstream.BlockedHosts),
		BlockedHosts: upstream.BlockedHosts,
		State:        upstream.State,
	}
}

// ResetNoslice POSTs to the internal njs reset endpoint, which clears the
// `js_shared_dict_zone` and its persisted `state=` file in one shot.
func ResetNoslice() error {
	req, err := http.NewRequest(http.MethodPost, NosliceResetURL, nil)
	if err != nil {
		return fmt.Errorf("build reset request: %w", err)
	}

	resp, err := nosliceHTTPClient.Do(req)
	if err != nil {
		return fmt.Errorf("call reset endpoint: %w", err)
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, resp.Body)

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("reset endpoint returned status %d", resp.StatusCode)
	}
	return nil
}
