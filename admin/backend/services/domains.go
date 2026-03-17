package services

import (
	"encoding/json"
	"log"
	"os"
	"path/filepath"
	"strings"

	"github.com/lancachenet/monolithic/admin/models"
)

func LoadDomains(baseDir string) map[string]models.DomainService {
	configPath := filepath.Join(baseDir, "cache_domains.json")

	data, err := os.ReadFile(configPath)
	if err != nil {
		return scanDomainsDirectory(baseDir)
	}

	result := make(map[string]models.DomainService)

	// Format 1 (upstream default): { "cache_domains": [ { "name": "steam", "domain_files": ["steam.txt"] }, ... ] }
	var format1 struct {
		CacheDomains []struct {
			Name        string   `json:"name"`
			DomainFiles []string `json:"domain_files"`
		} `json:"cache_domains"`
	}
	if err := json.Unmarshal(data, &format1); err == nil && len(format1.CacheDomains) > 0 {
		for _, svc := range format1.CacheDomains {
			files := svc.DomainFiles
			if files == nil {
				files = []string{}
			}
			totalCount := 0
			for _, file := range files {
				totalCount += countDomainsInFile(filepath.Join(baseDir, file))
			}
			result[svc.Name] = models.DomainService{Files: files, DomainCount: totalCount}
		}
		return result
	}

	// Format 2: { "cache_domains": { "service": { "domain_files": [...] } } }  (map variant)
	var format2 struct {
		CacheDomains map[string]struct {
			DomainFiles []string `json:"domain_files"`
		} `json:"cache_domains"`
	}
	if err := json.Unmarshal(data, &format2); err == nil && len(format2.CacheDomains) > 0 {
		for name, svc := range format2.CacheDomains {
			files := svc.DomainFiles
			if files == nil {
				files = []string{}
			}
			totalCount := 0
			for _, file := range files {
				totalCount += countDomainsInFile(filepath.Join(baseDir, file))
			}
			result[name] = models.DomainService{Files: files, DomainCount: totalCount}
		}
		return result
	}

	// Format 3: { "service": { "domain_files": [...] } }  (no wrapper key)
	var format3 map[string]struct {
		DomainFiles []string `json:"domain_files"`
	}
	if err := json.Unmarshal(data, &format3); err == nil && len(format3) > 0 {
		for name, svc := range format3 {
			files := svc.DomainFiles
			if files == nil {
				files = []string{}
			}
			totalCount := 0
			for _, file := range files {
				totalCount += countDomainsInFile(filepath.Join(baseDir, file))
			}
			result[name] = models.DomainService{Files: files, DomainCount: totalCount}
		}
		return result
	}

	// Format 4: { "service": ["file1.txt", "file2.txt"] }
	var format4 map[string][]string
	if err := json.Unmarshal(data, &format4); err == nil && len(format4) > 0 {
		for name, files := range format4 {
			if files == nil {
				files = []string{}
			}
			totalCount := 0
			for _, file := range files {
				totalCount += countDomainsInFile(filepath.Join(baseDir, file))
			}
			result[name] = models.DomainService{Files: files, DomainCount: totalCount}
		}
		return result
	}

	log.Printf("domains: could not parse cache_domains.json, falling back to directory scan")
	return scanDomainsDirectory(baseDir)
}

func scanDomainsDirectory(dir string) map[string]models.DomainService {
	result := make(map[string]models.DomainService)

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
			result[name] = models.DomainService{
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
