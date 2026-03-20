package main

import (
	"log"
	"net/http"
	"os"
	"time"

	"github.com/lancachenet/monolithic/admin/handlers"
	"github.com/lancachenet/monolithic/admin/middleware"
	"github.com/lancachenet/monolithic/admin/services"
)

func main() {
	services.LoadAdminOverrides()

	// Precompute log stats synchronously once, then refresh every 15 seconds in the
	// background. This ensures the SSE endpoint serves cached data instantly.
	services.StartLogStatsWorker(15 * time.Second)

	port := os.Getenv("ADMIN_API_PORT")
	if port == "" {
		port = "8082"
	}

	mux := http.NewServeMux()

	mux.HandleFunc("/api/health", handlers.HealthHandler)
	mux.HandleFunc("/api/stats", handlers.StatsHandler)

	mux.HandleFunc("/api/config", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			handlers.GetConfig(w, r)
		case http.MethodPut:
			handlers.UpdateConfig(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})

	mux.HandleFunc("/api/config/confighash", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			handlers.GetConfigHash(w, r)
		case http.MethodDelete:
			handlers.DeleteConfigHash(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})

	mux.HandleFunc("/api/filesystem", handlers.FilesystemHandler)

	mux.HandleFunc("/api/nginx/status", handlers.NginxStatus)
	mux.HandleFunc("/api/nginx/reload", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		handlers.NginxReload(w, r)
	})

	mux.HandleFunc("/api/nginx/apply", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		handlers.ApplyConfig(w, r)
	})

	mux.HandleFunc("/api/container/restart", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		handlers.ContainerRestart(w, r)
	})

	mux.HandleFunc("/api/supervisor", handlers.HealthHandler)


	mux.HandleFunc("/api/logs/upstream", handlers.LogUpstream)
	mux.HandleFunc("/api/logs/stats", handlers.LogStats)

	mux.HandleFunc("/api/noslice", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		handlers.NosliceHandler(w, r)
	})
	mux.HandleFunc("/api/noslice/reset", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		handlers.NosliceHandler(w, r)
	})

	mux.HandleFunc("/api/domains", handlers.DomainsHandler)

	mux.HandleFunc("/api/events", handlers.SSEHandler)

	handler := middleware.CORS(mux)

	log.Printf("Lancache Admin API listening on :%s", port)
	if err := http.ListenAndServe(":"+port, handler); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
