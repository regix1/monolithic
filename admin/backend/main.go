package main

import (
	"log"
	"net/http"
	"os"

	"github.com/lancachenet/monolithic/admin/handlers"
	"github.com/lancachenet/monolithic/admin/middleware"
	"github.com/lancachenet/monolithic/admin/services"
)

func main() {
	services.LoadAdminOverrides()

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

	mux.HandleFunc("/api/filesystem", handlers.FilesystemHandler)

	mux.HandleFunc("/api/nginx/status", handlers.NginxStatus)
	mux.HandleFunc("/api/nginx/reload", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		handlers.NginxReload(w, r)
	})

	mux.HandleFunc("/api/supervisor", handlers.HealthHandler)

	mux.HandleFunc("/api/logs/errors", handlers.LogErrors)
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
