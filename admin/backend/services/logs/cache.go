package logs

import (
	"encoding/json"
	"math"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/lancachenet/monolithic/admin/models"
)

// ---------- cache status display constants ----------

// cacheStatusColors maps the cache-status name to the swatch the frontend
// renders for it. Unknown statuses default to a neutral grey.
var cacheStatusColors = map[string]string{
	"HIT":      "#4ade80",
	"MISS":     "#60a5fa",
	"EXPIRED":  "#fbbf24",
	"STALE":    "#a0a0a0",
	"BYPASS":   "#a78bfa",
	"UPDATING": "#c084fc",
}

// cacheStatusOrder defines the display order.
var cacheStatusOrder = []string{"HIT", "MISS", "EXPIRED", "STALE", "BYPASS", "UPDATING"}

// ---------- access-log single-pass aggregator ----------

// processAccessLog computes cache status distribution, bandwidth summary, and
// per-service stats in a single pass over the access log lines.
func processAccessLog(lines []string, since time.Time) ([]models.CacheStatusEntry, models.BandwidthSummary, []models.ServiceStats) {
	// ---- cache status accumulators ----
	csCounts := make(map[string]int)
	csTotal := 0

	// ---- bandwidth accumulators ----
	var totalBytes, hitBytes uint64
	clients := make(map[string]bool)

	type svcAccum struct {
		requests int
		bytes    uint64
		bytesHit uint64
	}
	svcMap := make(map[string]*svcAccum)

	ForEachLogLine(lines, since, AccessLogTimeParser, func(line string, parsed time.Time) {
		// ---- cache status extraction ----
		cacheStatus := extractCacheStatus(line)
		if cacheStatus != "" {
			csCounts[cacheStatus]++
			csTotal++
		}

		// ---- bandwidth / service extraction ----
		if line[0] == '[' {
			match := bandwidthLogRegex.FindStringSubmatch(line)
			if match != nil {
				cacheID := match[1]
				clientIP := match[2]
				bytesStr := match[3]
				bwCacheStatus := strings.ToUpper(strings.TrimSpace(match[4]))

				bytes, err := strconv.ParseUint(bytesStr, 10, 64)
				if err == nil {
					totalBytes += bytes
					if bwCacheStatus == "HIT" {
						hitBytes += bytes
					}
					clients[clientIP] = true

					svc, ok := svcMap[cacheID]
					if !ok {
						svc = &svcAccum{}
						svcMap[cacheID] = svc
					}
					svc.requests++
					svc.bytes += bytes
					if bwCacheStatus == "HIT" {
						svc.bytesHit += bytes
					}
				}
			}
		} else if line[0] == '{' {
			var entry struct {
				CacheIdentifier string `json:"cache_identifier"`
				RemoteAddr      string `json:"remote_addr"`
				BytesSent       uint64 `json:"bytes_sent"`
				CacheStatus     string `json:"upstream_cache_status"`
			}
			if err := json.Unmarshal([]byte(line), &entry); err == nil {
				totalBytes += entry.BytesSent
				status := strings.ToUpper(entry.CacheStatus)
				if status == "HIT" {
					hitBytes += entry.BytesSent
				}
				if entry.RemoteAddr != "" {
					clients[entry.RemoteAddr] = true
				}

				cacheID := entry.CacheIdentifier
				if cacheID == "" {
					cacheID = "unknown"
				}
				svc, ok := svcMap[cacheID]
				if !ok {
					svc = &svcAccum{}
					svcMap[cacheID] = svc
				}
				svc.requests++
				svc.bytes += entry.BytesSent
				if status == "HIT" {
					svc.bytesHit += entry.BytesSent
				}
			}
		}
	})

	// ---- build cache status result ----
	csEntries := make([]models.CacheStatusEntry, 0, len(cacheStatusOrder))
	if csTotal > 0 {
		for _, name := range cacheStatusOrder {
			count := csCounts[name]
			if count == 0 {
				continue
			}
			pct := float64(count) / float64(csTotal) * 100
			pct = math.Round(pct*10) / 10
			csColor := cacheStatusColors[name]
			if csColor == "" {
				csColor = "#888888"
			}
			csEntries = append(csEntries, models.CacheStatusEntry{
				Name:  name,
				Value: pct,
				Count: count,
				Color: csColor,
			})
		}
	}

	// ---- build bandwidth result ----
	var hitRate float64
	if totalBytes > 0 {
		hitRate = float64(hitBytes) / float64(totalBytes) * 100
		hitRate = math.Round(hitRate*10) / 10
	}
	bandwidth := models.BandwidthSummary{
		TotalServed:    totalBytes,
		BandwidthSaved: hitBytes,
		HitRateBytes:   hitRate,
		UniqueClients:  len(clients),
	}

	// ---- build services result ----
	svcList := make([]models.ServiceStats, 0, len(svcMap))
	for name, acc := range svcMap {
		var hr float64
		if acc.bytes > 0 {
			hr = float64(acc.bytesHit) / float64(acc.bytes) * 100
			hr = math.Round(hr*10) / 10
		}
		svcList = append(svcList, models.ServiceStats{
			Service:  name,
			Requests: acc.requests,
			Bytes:    acc.bytes,
			BytesHit: acc.bytesHit,
			HitRate:  hr,
		})
	}
	sort.Slice(svcList, func(i, j int) bool {
		return svcList[i].Bytes > svcList[j].Bytes
	})

	return csEntries, bandwidth, svcList
}
