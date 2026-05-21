package logs

import (
	"bufio"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

// CacheDomainsDir is the directory containing cache_domains.json + per-service
// domain text files. Defaults to /data/cachedomains; main.go (or tests) may
// override.
var CacheDomainsDir = "/data/cachedomains"

// hostIdxTTL is how long the in-memory host→service index is reused before a
// fresh disk read. Cache domain lists change rarely (only when the uklans
// repo is re-pulled), so 5 minutes is generous.
const hostIdxTTL = 5 * time.Minute

// servicePattern is a single hostname-suffix → service mapping derived from
// one line in a cache_domains text file. A leading `*.` is stripped so the
// suffix is the literal apex domain.
type servicePattern struct {
	suffix  string
	service string
}

var (
	hostIdxMu       sync.RWMutex
	hostIdxPatterns []servicePattern
	hostIdxBuilt    time.Time
)

// ServiceForHost returns the cache service (e.g. "steam", "epic",
// "blizzard") that owns the given hostname. Matching is case-insensitive
// and supports both exact-host and subdomain-suffix patterns. Returns "" if
// no pattern matches (for example, when a host belongs to an upstream that
// is not enumerated in cache_domains.json, or when the cache_domains files
// are not yet present on disk).
//
// When several patterns match, the longest suffix wins so e.g. a host
// `foo.bar.example.com` prefers `bar.example.com` over `example.com`.
func ServiceForHost(host string) string {
	if host == "" {
		return ""
	}
	host = strings.ToLower(strings.TrimSpace(host))
	if i := strings.LastIndex(host, ":"); i > 0 && !strings.ContainsRune(host[i+1:], '.') {
		host = host[:i]
	}

	patterns := loadHostPatterns()
	bestSuffixLen := 0
	bestService := ""
	for _, p := range patterns {
		if host == p.suffix {
			return p.service
		}
		if strings.HasSuffix(host, "."+p.suffix) {
			if len(p.suffix) > bestSuffixLen {
				bestSuffixLen = len(p.suffix)
				bestService = p.service
			}
		}
	}
	return bestService
}

// loadHostPatterns returns the cached host→service patterns, refreshing
// from disk when the cache is older than hostIdxTTL.
func loadHostPatterns() []servicePattern {
	hostIdxMu.RLock()
	if hostIdxPatterns != nil && time.Since(hostIdxBuilt) < hostIdxTTL {
		p := hostIdxPatterns
		hostIdxMu.RUnlock()
		return p
	}
	hostIdxMu.RUnlock()

	hostIdxMu.Lock()
	defer hostIdxMu.Unlock()
	if hostIdxPatterns != nil && time.Since(hostIdxBuilt) < hostIdxTTL {
		return hostIdxPatterns
	}

	patterns := buildHostPatterns(CacheDomainsDir)
	hostIdxPatterns = patterns
	hostIdxBuilt = time.Now()
	return patterns
}

// buildHostPatterns reads each *.txt file in the cache-domains directory
// and treats the file basename (sans extension) as the service name. This
// avoids a hard dependency on cache_domains.json's variable schema and
// matches how nginx maps generation reads the same directory.
func buildHostPatterns(baseDir string) []servicePattern {
	entries, err := os.ReadDir(baseDir)
	if err != nil {
		return nil
	}
	patterns := make([]servicePattern, 0, 256)
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		name := entry.Name()
		if !strings.HasSuffix(name, ".txt") {
			continue
		}
		service := strings.TrimSuffix(name, ".txt")
		// uklans convention: "windowsupdates.txt" → "wsus", "wargaming.net.txt" → "wargaming".
		service = canonicalServiceName(service)
		patterns = append(patterns, readDomainFile(filepath.Join(baseDir, name), service)...)
	}
	// Longest suffix first so callers can stop on first match if desired.
	sort.Slice(patterns, func(i, j int) bool {
		return len(patterns[i].suffix) > len(patterns[j].suffix)
	})
	return patterns
}

// canonicalServiceName normalises a few filenames to the friendlier names
// the rest of the codebase uses.
func canonicalServiceName(name string) string {
	switch name {
	case "windowsupdates":
		return "wsus"
	case "wargaming.net":
		return "wargaming"
	default:
		return name
	}
}

// readDomainFile parses one cache-domains text file into pattern records.
// Blank lines and `#` comments are skipped; a leading `*.` wildcard is
// stripped to produce a plain suffix.
func readDomainFile(path, service string) []servicePattern {
	f, err := os.Open(path)
	if err != nil {
		return nil
	}
	defer f.Close()

	patterns := make([]servicePattern, 0, 16)
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		suffix := strings.ToLower(strings.TrimPrefix(line, "*."))
		if suffix == "" {
			continue
		}
		patterns = append(patterns, servicePattern{suffix: suffix, service: service})
	}
	return patterns
}
