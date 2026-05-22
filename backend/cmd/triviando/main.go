package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/GuiAlmeidaPC/triviando/backend/internal/httpsrv"
	"github.com/GuiAlmeidaPC/triviando/backend/internal/live"
	"github.com/GuiAlmeidaPC/triviando/backend/internal/store"
)

func main() {
	addr := envOr("TRIVIANDO_ADDR", "127.0.0.1:8001")
	dbPath := envOr("TRIVIANDO_DB", "data/triviando.db")

	if err := os.MkdirAll(filepath.Dir(dbPath), 0o755); err != nil {
		log.Fatalf("mkdir data dir: %v", err)
	}
	st, err := store.Open(dbPath)
	if err != nil {
		log.Fatalf("open store: %v", err)
	}
	defer st.Close()

	hub := live.NewHub(st)
	stopReaper := hub.StartReaper(5 * time.Minute)
	defer stopReaper()

	srv := &http.Server{
		Addr:              addr,
		Handler:           httpsrv.New(st, hub),
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		log.Printf("triviando listening on %s (db=%s)", addr, dbPath)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("server error: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Printf("shutdown error: %v", err)
	}
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
