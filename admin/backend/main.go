package main

import (
	"log"
	"net/http"
	"os"
	"time"

	"github.com/lancachenet/monolithic/admin/handlers/api"
	loghandlers "github.com/lancachenet/monolithic/admin/handlers/logs"
	"github.com/lancachenet/monolithic/admin/handlers/sse"
	"github.com/lancachenet/monolithic/admin/middleware"
	"github.com/lancachenet/monolithic/admin/services"
	"github.com/lancachenet/monolithic/admin/services/logs"
)

func main() {
	services.LoadAdminOverrides()

	// Precompute log stats synchronously once, then refresh every 15 seconds in the
	// background. This ensures the SSE endpoint serves cached data instantly.
	logs.StartLogStatsWorker(
		15*time.Second,
		services.AccessLogPath,
		services.ErrorLogPath,
		services.UpstreamErrorLogPath,
	)

	// Log-watcher goroutine: polls log-file inodes/size and triggers
	// `nginx -s reopen` after rotation or deletion.
	services.StartLogWatcher(30 * time.Second)

	port := os.Getenv("ADMIN_API_PORT")
	if port == "" {
		port = "8082"
	}

	mux := http.NewServeMux()

	// Frontend-dashboard endpoints (handlers/api).
	mux.HandleFunc("GET /api/health", api.HealthHandler)
	mux.HandleFunc("GET /api/stats", api.StatsHandler)
	mux.HandleFunc("GET /api/config", api.GetConfig)
	mux.HandleFunc("PUT /api/config", api.UpdateConfig)
	mux.HandleFunc("GET /api/config/confighash", api.GetConfigHash)
	mux.HandleFunc("DELETE /api/config/confighash", api.DeleteConfigHash)
	mux.HandleFunc("GET /api/filesystem", api.FilesystemHandler)
	mux.HandleFunc("GET /api/nginx/status", api.NginxStatus)
	mux.HandleFunc("POST /api/nginx/reload", api.NginxReload)
	mux.HandleFunc("POST /api/nginx/apply", api.ApplyConfig)
	mux.HandleFunc("POST /api/container/restart", api.ContainerRestart)
	mux.HandleFunc("GET /api/supervisor", api.HealthHandler)
	mux.HandleFunc("GET /api/noslice", api.NosliceGet)
	mux.HandleFunc("POST /api/noslice/reset", api.NosliceReset)
	mux.HandleFunc("GET /api/epic", api.EpicHandler)
	mux.HandleFunc("GET /api/domains", api.DomainsHandler)

	// Log-management endpoints (handlers/logs).
	mux.HandleFunc("GET /api/logs/upstream", loghandlers.LogUpstream)
	mux.HandleFunc("GET /api/logs/stats", loghandlers.LogStats)

	// Server-sent events stream (handlers/sse) — aggregates topics from both
	// services and services/logs.
	mux.HandleFunc("GET /api/events", sse.SSEHandler)

	handler := middleware.CORS(mux)

	log.Printf("Lancache Admin API listening on :%s", port)
	if err := http.ListenAndServe(":"+port, handler); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
