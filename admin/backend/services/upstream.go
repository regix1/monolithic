package services

import (
	"bufio"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/lancachenet/monolithic/admin/models"
	"github.com/lancachenet/monolithic/admin/services/logs"
)

// Package-level regexes for upstream-pool config parsing. Lifted out of
// ParseUpstreamPools so each call doesn't pay the compile cost.
var (
	upstreamPoolBlockRegex     = regexp.MustCompile(`^\s*upstream\s+(\S+)\s*\{`)
	upstreamServerRegex        = regexp.MustCompile(`^\s*server\s+(\S+)\s+resolve\s*;`)
	upstreamKeepaliveRegex     = regexp.MustCompile(`^\s*keepalive\s+(\d+)\s*;`)
	upstreamKeepaliveTimeoutRe = regexp.MustCompile(`^\s*keepalive_timeout\s+(\S+)\s*;`)
	upstreamKeepaliveTimeRe    = regexp.MustCompile(`^\s*keepalive_time\s+(\S+)\s*;`)
)

func ParseUpstreamPools(path string) []models.UpstreamPool {
	f, err := os.Open(path)
	if err != nil {
		return []models.UpstreamPool{}
	}
	defer f.Close()

	var pools []models.UpstreamPool
	var current *models.UpstreamPool

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := scanner.Text()

		if m := upstreamPoolBlockRegex.FindStringSubmatch(line); m != nil {
			if current != nil {
				pools = append(pools, *current)
			}
			current = &models.UpstreamPool{
				IPs: []string{},
			}
			continue
		}

		if current == nil {
			continue
		}

		if strings.Contains(line, "}") {
			pools = append(pools, *current)
			current = nil
			continue
		}

		if m := upstreamServerRegex.FindStringSubmatch(line); m != nil {
			current.Domain = m[1]
		} else if m := upstreamKeepaliveRegex.FindStringSubmatch(line); m != nil {
			current.Keepalive, _ = strconv.Atoi(m[1])
		} else if m := upstreamKeepaliveTimeoutRe.FindStringSubmatch(line); m != nil {
			current.Timeout = m[1]
		} else if m := upstreamKeepaliveTimeRe.FindStringSubmatch(line); m != nil {
			current.Time = m[1]
		}
	}

	if current != nil {
		pools = append(pools, *current)
	}

	return pools
}

func FetchUpstreamStats() models.UpstreamStats {
	enabled := EnvFlag("ENABLE_UPSTREAM_KEEPALIVE", false)

	excludeStr := EnvOrDefault("UPSTREAM_KEEPALIVE_EXCLUDE", "")
	excluded := []string{}
	if excludeStr != "" {
		for _, e := range strings.Split(excludeStr, ",") {
			e = strings.TrimSpace(e)
			if e != "" {
				excluded = append(excluded, e)
			}
		}
	}

	pools := []models.UpstreamPool{}
	if enabled {
		pools = ParseUpstreamPools(UpstreamPoolsConfPath)
	}

	fallbackEvents, _ := logs.ParseUpstreamLog(UpstreamFallbackLogPath, 20, time.Time{})
	if fallbackEvents == nil {
		fallbackEvents = []models.UpstreamLogEntry{}
	}

	return models.UpstreamStats{
		KeepaliveEnabled: enabled,
		PoolCount:        len(pools),
		Pools:            pools,
		Excluded:         excluded,
		FallbackEvents:   fallbackEvents,
	}
}
