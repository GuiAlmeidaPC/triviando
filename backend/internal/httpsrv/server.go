package httpsrv

import (
	"encoding/json"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/GuiAlmeidaPC/triviando/backend/internal/live"
	"github.com/GuiAlmeidaPC/triviando/backend/internal/store"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

// maxRequestBodyBytes caps JSON request bodies for /api endpoints.
const maxRequestBodyBytes = 1 << 20 // 1 MiB

func New(st *store.Store, hub *live.Hub) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(30 * time.Second))
	r.Use(securityHeaders)
	r.Use(bodyLimit(maxRequestBodyBytes))
	r.Use(ownerMiddleware)

	r.Get("/healthz", healthz)

	qh := &quizHandler{store: st}
	r.Route("/api", func(r chi.Router) {
		r.Get("/ping", ping)
		r.Route("/quizzes", func(r chi.Router) {
			r.Get("/", qh.list)
			r.Post("/", qh.create)
			r.Get("/{id}", qh.get)
			r.Put("/{id}", qh.update)
			r.Delete("/{id}", qh.delete)
		})
	})

	// WebSocket handler mounted outside chi's middleware stack — the Logger
	// and Timeout middleware wrap the response writer in ways that break
	// connection hijacking.
	wsh := &live.Handler{
		Hub:            hub,
		AllowedOrigins: allowedOrigins(),
	}
	mux := http.NewServeMux()
	mux.Handle("/ws", securityHeaders(wsh))
	mux.Handle("/", r)
	return mux
}

// allowedOrigins reads TRIVIANDO_ALLOWED_ORIGINS (comma-separated host:port
// patterns). Empty falls back to same-origin (compared against r.Host).
func allowedOrigins() []string {
	v := os.Getenv("TRIVIANDO_ALLOWED_ORIGINS")
	if v == "" {
		return nil
	}
	parts := strings.Split(v, ",")
	out := parts[:0]
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Referrer-Policy", "same-origin")
		h.Set("X-Frame-Options", "DENY")
		if r.TLS != nil {
			h.Set("Strict-Transport-Security", "max-age=63072000; includeSubDomains")
		}
		next.ServeHTTP(w, r)
	})
}

func bodyLimit(n int64) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			r.Body = http.MaxBytesReader(w, r.Body, n)
			next.ServeHTTP(w, r)
		})
	}
}

func healthz(w http.ResponseWriter, _ *http.Request) {
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte("ok"))
}

func ping(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"message": "pong",
		"time":    time.Now().UTC().Format(time.RFC3339),
	})
}
