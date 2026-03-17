package handlers

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

type DomainService struct {
	Files       []string `json:"files"`
	DomainCount int      `json:"domain_count"`
}

type CacheDomainsConfig struct {
	CacheDomains map[string]struct {
		DomainFiles []string `json:"domain_files"`
	} `json:"cache_domains"`
}

func DomainsHandler(w http.ResponseWriter, r *http.Request) {
	const baseDir = "/data/cachedomains"
	configPath := filepath.Join(baseDir, "cache_domains.json")

	data, err := os.ReadFile(configPath)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to read cache_domains.json: "+err.Error())
		return
	}

	var config CacheDomainsConfig
	if err := json.Unmarshal(data, &config); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to parse cache_domains.json: "+err.Error())
		return
	}

	result := make(map[string]DomainService)

	for serviceName, service := range config.CacheDomains {
		totalCount := 0
		for _, file := range service.DomainFiles {
			filePath := filepath.Join(baseDir, file)
			count := countDomainsInFile(filePath)
			totalCount += count
		}

		result[serviceName] = DomainService{
			Files:       service.DomainFiles,
			DomainCount: totalCount,
		}
	}

	writeJSON(w, result)
}

func countDomainsInFile(path string) int {
	data, err := os.ReadFile(path)
	if err != nil {
		return 0
	}

	count := 0
	lines := strings.Split(string(data), "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		count++
	}

	return count
}
