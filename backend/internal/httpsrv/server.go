package httpsrv

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/GuiAlmeidaPC/triviando/backend/internal/store"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

func New(st *store.Store) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(30 * time.Second))
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
	return r
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
