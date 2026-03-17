package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

type DomainService struct {
	Files       []string `json:"files"`
	DomainCount int      `json:"domain_count"`
}

func DomainsHandler(w http.ResponseWriter, r *http.Request) {
	const baseDir = "/data/cachedomains"
	configPath := filepath.Join(baseDir, "cache_domains.json")

	data, err := os.ReadFile(configPath)
	if err != nil {
		// Fallback: scan directory for .txt files grouped by name
		result := scanDomainsDirectory(baseDir)
		writeJSON(w, result)
		return
	}

	// Try parsing as the standard cache-domains format.
	// The format can vary — try multiple structures.
	result := make(map[string]DomainService)

	// Format 1: { "cache_domains": { "service": { "domain_files": [...] } } }
	var format1 struct {
		CacheDomains map[string]struct {
			DomainFiles []string `json:"domain_files"`
		} `json:"cache_domains"`
	}
	if err := json.Unmarshal(data, &format1); err == nil && len(format1.CacheDomains) > 0 {
		for name, svc := range format1.CacheDomains {
			totalCount := 0
			files := svc.DomainFiles
			if files == nil {
				files = []string{}
			}
			for _, file := range files {
				totalCount += countDomainsInFile(filepath.Join(baseDir, file))
			}
			result[name] = DomainService{Files: files, DomainCount: totalCount}
		}
		writeJSON(w, result)
		return
	}

	// Format 2: { "service": { "domain_files": [...] } } (no wrapper)
	var format2 map[string]struct {
		DomainFiles []string `json:"domain_files"`
	}
	if err := json.Unmarshal(data, &format2); err == nil && len(format2) > 0 {
		for name, svc := range format2 {
			totalCount := 0
			files := svc.DomainFiles
			if files == nil {
				files = []string{}
			}
			for _, file := range files {
				totalCount += countDomainsInFile(filepath.Join(baseDir, file))
			}
			result[name] = DomainService{Files: files, DomainCount: totalCount}
		}
		writeJSON(w, result)
		return
	}

	// Format 3: { "service": ["file1.txt", "file2.txt"] }
	var format3 map[string][]string
	if err := json.Unmarshal(data, &format3); err == nil && len(format3) > 0 {
		for name, files := range format3 {
			if files == nil {
				files = []string{}
			}
			totalCount := 0
			for _, file := range files {
				totalCount += countDomainsInFile(filepath.Join(baseDir, file))
			}
			result[name] = DomainService{Files: files, DomainCount: totalCount}
		}
		writeJSON(w, result)
		return
	}

	log.Printf("domains: could not parse cache_domains.json, falling back to directory scan")
	result = scanDomainsDirectory(baseDir)
	writeJSON(w, result)
}

// scanDomainsDirectory groups .txt files in the directory by filename prefix as service names.
func scanDomainsDirectory(dir string) map[string]DomainService {
	result := make(map[string]DomainService)

	entries, err := os.ReadDir(dir)
	if err != nil {
		return result
	}

	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".txt") {
			continue
		}

		name := strings.TrimSuffix(entry.Name(), ".txt")
		filePath := filepath.Join(dir, entry.Name())
		count := countDomainsInFile(filePath)

		if svc, ok := result[name]; ok {
			svc.Files = append(svc.Files, entry.Name())
			svc.DomainCount += count
			result[name] = svc
		} else {
			result[name] = DomainService{
				Files:       []string{entry.Name()},
				DomainCount: count,
			}
		}
	}

	return result
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
