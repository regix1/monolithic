package services

import (
	"encoding/json"
	"math"
	"os"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/lancachenet/monolithic/admin/models"
	"github.com/lancachenet/monolithic/admin/services/logs"
)

// EpicCacheHosts is the set of substrings used to flag a request as Epic CDN
// traffic. Matched by substring on the access-log host field so subdomains
// are caught.
var EpicCacheHosts = []string{
	"epicgamescdn.com",
	"epicgames-download1.akamaized.net",
	"download.epicgames.com",
	"fastly-download.epicgames.com",
	"download2.epicgames.com",
	"download3.epicgames.com",
	"cloudflare.epicgamescdn.com",
}

// epicHostRegex extracts the cachelog `host` field (group 5 of textAccessLogRegex)
// — re-implemented here to avoid pulling the full bandwidth parser when we only
// need the host string for Epic counting.
var epicHostRegex = regexp.MustCompile(
	`^\[[^\]]*\]\s+.*?"[A-Z]+\s+\S+.*?"\s+\d+\s+\d+\s+"[^"]*"\s+"[^"]*"\s+"([^"]*)"\s+"([^"]*)"`,
)

// EpicAccessLogScanLines is the max number of access-log lines to scan when
// computing the Epic ratio. 25k lines covers roughly 30-60 minutes on a busy
// cache, which is enough granularity for the diagnostic card.
const EpicAccessLogScanLines = 25000

// EpicSNIScanLines is the max number of stream-log lines to scan for the
// HTTPS-leak signal. SNI logs are small; we look back further than for HTTP.
const EpicSNIScanLines = 10000

// BuildEpicDiagnostic produces the full Epic-diagnostic payload by scanning
// the access log for Epic CDN traffic and the SNI log for HTTPS leaks. Both
// scans are best-effort and degrade silently if a file is missing.
func BuildEpicDiagnostic() models.EpicDiagnostic {
	since := SinceHoursAgo(24)

	ratio := computeEpicCacheRatio(AccessLogPath, since)
	leaks := scanEpicHTTPSLeaks(EpicSNILogPath, since)

	return models.EpicDiagnostic{
		Window:        "24h",
		Enabled:       EnvFlag("EPIC_FORCE_NOSLICE", false),
		CacheRatio:    ratio,
		HTTPSLeak:     len(leaks) > 0,
		HTTPSHosts:    leaks,
		EngineIniHint: epicEngineIniHint(len(leaks) > 0, ratio),
		KnownHosts:    append([]string{}, EpicCacheHosts...),
	}
}

// computeEpicCacheRatio counts hit / miss requests for Epic CDN hosts in the
// access log over the time window. Returns a zero ratio when no Epic traffic
// is found.
func computeEpicCacheRatio(path string, since time.Time) models.EpicCacheRatio {
	ratio := models.EpicCacheRatio{}

	lines, err := logs.TailFile(path, EpicAccessLogScanLines)
	if err != nil {
		return ratio
	}

	logs.ForEachLogLine(lines, since, logs.AccessLogTimeParser, func(line string, parsed time.Time) {
		host, status := extractEpicHostStatus(line)
		if host == "" || !isEpicHost(host) {
			return
		}

		ratio.TotalRequests++
		switch status {
		case "HIT":
			ratio.Hits++
		case "MISS", "EXPIRED", "BYPASS", "UPDATING", "STALE":
			ratio.Misses++
		}
	})

	if ratio.TotalRequests > 0 {
		pct := float64(ratio.Hits) / float64(ratio.TotalRequests) * 100
		ratio.HitRate = math.Round(pct*10) / 10
	}
	return ratio
}

// extractEpicHostStatus returns the host + upstream_cache_status from an
// access log line, supporting both the text and JSON cachelog formats.
func extractEpicHostStatus(line string) (host string, status string) {
	if line == "" {
		return "", ""
	}

	if line[0] == '{' {
		var entry struct {
			Host        string `json:"host"`
			CacheStatus string `json:"upstream_cache_status"`
		}
		if err := json.Unmarshal([]byte(line), &entry); err != nil {
			return "", ""
		}
		return strings.ToLower(entry.Host), strings.ToUpper(entry.CacheStatus)
	}

	if line[0] == '[' {
		m := epicHostRegex.FindStringSubmatch(line)
		if len(m) >= 3 {
			return strings.ToLower(strings.TrimSpace(m[2])), strings.ToUpper(strings.TrimSpace(m[1]))
		}
	}
	return "", ""
}

// isEpicHost returns true if host contains any known Epic CDN substring.
func isEpicHost(host string) bool {
	if host == "" {
		return false
	}
	for _, needle := range EpicCacheHosts {
		if strings.Contains(host, needle) {
			return true
		}
	}
	return false
}

// epicSNIHostRegex pulls the SNI/server-name field from sniproxy log lines.
// sniproxy's default format includes the SNI server name as one of the fields;
// we also fall back to a "server_name=foo" key-value form when present.
var epicSNIHostRegex = regexp.MustCompile(`(?:server_name=|SNI=|"sni":\s*")([a-zA-Z0-9][-a-zA-Z0-9.]+)`)

// scanEpicHTTPSLeaks scans the SNI/stream access log for Epic CDN hostnames.
// A non-empty result means the launcher is using HTTPS CDN endpoints — the
// cache cannot intercept those (HTTP-only), so chunks bypass and MISS.
func scanEpicHTTPSLeaks(path string, since time.Time) []models.EpicHTTPSLeak {
	leaks := []models.EpicHTTPSLeak{}

	info, err := os.Stat(path)
	if err != nil || info.IsDir() {
		// SNI proxy logs are optional in some deployments — silently degrade.
		return leaks
	}

	lines, err := logs.TailFile(path, EpicSNIScanLines)
	if err != nil {
		return leaks
	}

	counts := map[string]int{}
	logs.ForEachLogLine(lines, since, logs.AccessLogTimeParser, func(line string, parsed time.Time) {
		host := extractEpicSNIHost(line)
		if host == "" || !isEpicHost(host) {
			return
		}
		counts[host]++
	})

	for host, c := range counts {
		leaks = append(leaks, models.EpicHTTPSLeak{Host: host, Count: c})
	}
	sort.Slice(leaks, func(i, j int) bool { return leaks[i].Count > leaks[j].Count })

	if len(leaks) > 10 {
		leaks = leaks[:10]
	}
	return leaks
}

// extractEpicSNIHost pulls the SNI/server_name string from a sniproxy log
// line. Falls back to scanning whitespace-separated fields for any token
// matching an Epic substring.
func extractEpicSNIHost(line string) string {
	if m := epicSNIHostRegex.FindStringSubmatch(line); len(m) > 1 {
		return strings.ToLower(m[1])
	}
	for _, field := range strings.Fields(line) {
		f := strings.ToLower(strings.Trim(field, `"',`))
		if isEpicHost(f) {
			return f
		}
	}
	return ""
}

// epicEngineIniHint returns a user-facing remediation string. The hint is
// only meaningful when there is an HTTPS leak or the hit rate is very low —
// otherwise we return an empty string so the UI renders the "healthy" state.
func epicEngineIniHint(httpsLeak bool, ratio models.EpicCacheRatio) string {
	switch {
	case httpsLeak:
		return "Epic launcher is using HTTPS CDNs. Set [Launcher] ForceNonSslCdn=false in Engine.ini on each client (see contrib/lancache-epic-fix.ps1)."
	case ratio.TotalRequests >= 50 && ratio.HitRate < 30.0:
		return "Epic hit rate is very low. Run EpicPrefill or enable EPIC_FORCE_NOSLICE in the admin Config page."
	default:
		return ""
	}
}
