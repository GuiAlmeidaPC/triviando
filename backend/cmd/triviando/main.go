package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/GuiAlmeidaPC/triviando/backend/internal/httpsrv"
)

func main() {
	addr := os.Getenv("TRIVIANDO_ADDR")
	if addr == "" {
		addr = "127.0.0.1:8001"
	}

	srv := &http.Server{
		Addr:              addr,
		Handler:           httpsrv.New(),
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		log.Printf("triviando listening on %s", addr)
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
