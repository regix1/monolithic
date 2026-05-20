package main

import (
	"log"
	"net/http"
	"os"
	"time"

	"github.com/lancachenet/monolithic/admin/handlers"
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

	mux.HandleFunc("GET /api/health", handlers.HealthHandler)
	mux.HandleFunc("GET /api/stats", handlers.StatsHandler)
	mux.HandleFunc("GET /api/config", handlers.GetConfig)
	mux.HandleFunc("PUT /api/config", handlers.UpdateConfig)
	mux.HandleFunc("GET /api/config/confighash", handlers.GetConfigHash)
	mux.HandleFunc("DELETE /api/config/confighash", handlers.DeleteConfigHash)
	mux.HandleFunc("GET /api/filesystem", handlers.FilesystemHandler)
	mux.HandleFunc("GET /api/nginx/status", handlers.NginxStatus)
	mux.HandleFunc("POST /api/nginx/reload", handlers.NginxReload)
	mux.HandleFunc("POST /api/nginx/apply", handlers.ApplyConfig)
	mux.HandleFunc("POST /api/container/restart", handlers.ContainerRestart)
	mux.HandleFunc("GET /api/supervisor", handlers.HealthHandler)
	mux.HandleFunc("GET /api/logs/upstream", handlers.LogUpstream)
	mux.HandleFunc("GET /api/logs/stats", handlers.LogStats)
	mux.HandleFunc("GET /api/noslice", handlers.NosliceGet)
	mux.HandleFunc("POST /api/noslice/reset", handlers.NosliceReset)
	mux.HandleFunc("GET /api/epic", handlers.EpicHandler)
	mux.HandleFunc("GET /api/domains", handlers.DomainsHandler)
	mux.HandleFunc("GET /api/events", handlers.SSEHandler)

	handler := middleware.CORS(mux)

	log.Printf("Lancache Admin API listening on :%s", port)
	if err := http.ListenAndServe(":"+port, handler); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
