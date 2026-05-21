package services

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"

	"github.com/lancachenet/monolithic/admin/models"
	"github.com/lancachenet/monolithic/admin/services/logs"
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
// admin-API response shape consumed by the React frontend. It also records
// blocklist transitions (promotions / demotions) into a bounded in-memory
// ring buffer so the Upstream page can show "what recovered when."
func BuildNosliceResponse() models.NosliceResponse {
	envEnabled := EnvOrDefault("NOSLICE_FALLBACK", "false") == "true"

	upstream, ok := FetchNosliceStatus()
	if !ok {
		// Internal endpoint unreachable (nginx still booting, NOSLICE_FALLBACK
		// disabled, etc.) — return a quiet "disabled" snapshot so the frontend
		// still renders cleanly. Carry whatever transitions we already have in
		// memory; the operator can still see history from earlier polls.
		return models.NosliceResponse{
			Enabled:      envEnabled,
			Mode:         EnvOrDefault("NOSLICE_DETECT_MODE", "log"),
			BlockedCount: 0,
			BlockedHosts: []string{},
			State:        map[string]models.NosliceHostState{},
			Transitions:  currentTransitionsSnapshot(),
		}
	}

	recordNosliceTransitions(upstream)

	return models.NosliceResponse{
		Enabled:      upstream.Enabled,
		Mode:         upstream.Mode,
		BlockedCount: len(upstream.BlockedHosts),
		BlockedHosts: upstream.BlockedHosts,
		State:        upstream.State,
		Transitions:  currentTransitionsSnapshot(),
	}
}

// ---------- noslice transition ring buffer ----------

// nosliceTransitionCap caps the in-memory promotions/demotions history. 50
// entries is well above the working set for a cache that's actually stable
// and is plenty to surface "what happened recently" to an operator.
const nosliceTransitionCap = 50

var (
	nosliceTxMu          sync.Mutex
	nosliceTxRing        = make([]models.NosliceTransition, 0, nosliceTransitionCap)
	nosliceLastBlocked   = map[string]bool{}
	nosliceTxInitialized = false
)

// recordNosliceTransitions diffs the current blocked-host set against the
// previous snapshot and appends any flips to the ring buffer. The first call
// just seeds the snapshot — existing blocklist entries don't show up as
// fresh promotions on container start (they were promoted before we were
// running). Subsequent calls record both promotions (false→true) and
// demotions (true→false) so an operator sees the full recovery picture.
func recordNosliceTransitions(current models.NosliceUpstream) {
	nosliceTxMu.Lock()
	defer nosliceTxMu.Unlock()

	curBlocked := make(map[string]bool, len(current.BlockedHosts))
	for _, host := range current.BlockedHosts {
		curBlocked[host] = true
	}

	if !nosliceTxInitialized {
		nosliceLastBlocked = curBlocked
		nosliceTxInitialized = true
		return
	}

	now := time.Now().Unix()

	for host := range curBlocked {
		if !nosliceLastBlocked[host] {
			count := 0
			if state, ok := current.State[host]; ok {
				count = state.Count
			}
			appendTransitionLocked(models.NosliceTransition{
				Host:    host,
				Service: logs.ServiceForHost(host),
				Time:    now,
				Kind:    "promoted",
				Count:   count,
			})
		}
	}

	for host := range nosliceLastBlocked {
		if !curBlocked[host] {
			count := 0
			if state, ok := current.State[host]; ok {
				count = state.Count
			}
			appendTransitionLocked(models.NosliceTransition{
				Host:    host,
				Service: logs.ServiceForHost(host),
				Time:    now,
				Kind:    "demoted",
				Count:   count,
			})
		}
	}

	nosliceLastBlocked = curBlocked
}

// appendTransitionLocked pushes onto the ring buffer. Caller holds nosliceTxMu.
func appendTransitionLocked(t models.NosliceTransition) {
	nosliceTxRing = append(nosliceTxRing, t)
	if len(nosliceTxRing) > nosliceTransitionCap {
		nosliceTxRing = nosliceTxRing[len(nosliceTxRing)-nosliceTransitionCap:]
	}
}

// currentTransitionsSnapshot returns a copy of the ring buffer safe to expose
// to multiple callers without holding the mutex past the call.
func currentTransitionsSnapshot() []models.NosliceTransition {
	nosliceTxMu.Lock()
	defer nosliceTxMu.Unlock()
	out := make([]models.NosliceTransition, len(nosliceTxRing))
	copy(out, nosliceTxRing)
	return out
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
