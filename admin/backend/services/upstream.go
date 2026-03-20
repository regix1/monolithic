package services

import (
	"bufio"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/lancachenet/monolithic/admin/models"
)

func ParseUpstreamPools(path string) []models.UpstreamPool {
	f, err := os.Open(path)
	if err != nil {
		return []models.UpstreamPool{}
	}
	defer f.Close()

	var pools []models.UpstreamPool
	var current *models.UpstreamPool

	upstreamRe := regexp.MustCompile(`^\s*upstream\s+(\S+)\s*\{`)
	serverRe := regexp.MustCompile(`^\s*server\s+(\S+)\s+resolve\s*;`)
	keepaliveRe := regexp.MustCompile(`^\s*keepalive\s+(\d+)\s*;`)
	timeoutRe := regexp.MustCompile(`^\s*keepalive_timeout\s+(\S+)\s*;`)
	timeRe := regexp.MustCompile(`^\s*keepalive_time\s+(\S+)\s*;`)

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := scanner.Text()

		if m := upstreamRe.FindStringSubmatch(line); m != nil {
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

		if m := serverRe.FindStringSubmatch(line); m != nil {
			current.Domain = m[1]
		} else if m := keepaliveRe.FindStringSubmatch(line); m != nil {
			current.Keepalive, _ = strconv.Atoi(m[1])
		} else if m := timeoutRe.FindStringSubmatch(line); m != nil {
			current.Timeout = m[1]
		} else if m := timeRe.FindStringSubmatch(line); m != nil {
			current.Time = m[1]
		}
	}

	if current != nil {
		pools = append(pools, *current)
	}

	return pools
}

func FetchUpstreamStats() models.UpstreamStats {
	enabled := EnvOrDefault("ENABLE_UPSTREAM_KEEPALIVE", "false") == "true"

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
		pools = ParseUpstreamPools("/etc/nginx/conf.d/40_upstream_pools.conf")
	}

	fallbackEvents, _ := ParseUpstreamLog(UpstreamFallbackLogPath, 20, time.Time{})
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
