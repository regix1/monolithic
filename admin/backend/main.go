package main

import (
	"log"
	"net/http"
	"os"

	"github.com/lancachenet/monolithic/admin/handlers"
)

func main() {
	port := os.Getenv("ADMIN_API_PORT")
	if port == "" {
		port = "8082"
	}

	mux := http.NewServeMux()

	// Health & stats
	mux.HandleFunc("/api/health", handlers.HealthHandler)
	mux.HandleFunc("/api/stats", handlers.StatsHandler)

	// Config (GET and PUT distinguished inside handler)
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

	// Filesystem
	mux.HandleFunc("/api/filesystem", handlers.Filesystem)

	// Nginx
	mux.HandleFunc("/api/nginx/status", handlers.NginxStatus)
	mux.HandleFunc("/api/nginx/reload", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		handlers.NginxReload(w, r)
	})

	// Supervisor (reuse health handler's supervisor parsing)
	mux.HandleFunc("/api/supervisor", handlers.HealthHandler)

	// Logs
	mux.HandleFunc("/api/logs/errors", handlers.LogErrors)
	mux.HandleFunc("/api/logs/upstream", handlers.LogUpstream)
	mux.HandleFunc("/api/logs/stats", handlers.LogStats)

	// Noslice
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

	// Domains
	mux.HandleFunc("/api/domains", handlers.DomainsHandler)

	handler := corsMiddleware(mux)

	log.Printf("Lancache Admin API listening on :%s", port)
	if err := http.ListenAndServe(":"+port, handler); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}

// corsMiddleware adds CORS headers for development (allow all origins).
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}
