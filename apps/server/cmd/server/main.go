package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"serverui/server/internal/api"
	"serverui/server/internal/crypto"
	"serverui/server/internal/db"
	"serverui/server/internal/filesystem"
	"serverui/server/internal/metrics"
	"serverui/server/internal/secrets"
	"serverui/server/internal/servers"
	"serverui/server/internal/terminal"
)

func main() {
	addr := api.ListenAddr()
	vault := secrets.EnvVault{}
	rawKey, err := vault.EncryptionKey()
	if err != nil {
		log.Fatal("SERVERUI_CREDENTIAL_ENCRYPTION_KEY must be a 32-byte key (64 hex characters). Generate one with: openssl rand -hex 32")
	}
	box, err := crypto.New(rawKey)
	if err != nil {
		log.Fatal("SERVERUI_CREDENTIAL_ENCRYPTION_KEY must be a 32-byte key (64 hex characters). Generate one with: openssl rand -hex 32")
	}

	sqlDB, err := db.Open()
	if err != nil {
		log.Fatalf("database: %v", err)
	}
	defer sqlDB.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	if err := db.Migrate(ctx, sqlDB); err != nil {
		cancel()
		log.Fatalf("migrate: %v", err)
	}
	cancel()

	svc := servers.NewService(servers.NewSQLStore(sqlDB), box)
	pool := svc.Pool()
	defer pool.DisconnectAll()

	handler := api.New(
		svc,
		metrics.NewCollector(pool),
		filesystem.New(pool),
		terminal.New(pool),
	).Handler()

	httpServer := &http.Server{
		Addr:              addr,
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       30 * time.Second,
	}

	log.Printf("serverui server listening on %s", addr)

	errCh := make(chan error, 1)
	go func() {
		errCh <- httpServer.ListenAndServe()
	}()

	ch := make(chan os.Signal, 1)
	signal.Notify(ch, syscall.SIGINT, syscall.SIGTERM)

	select {
	case sig := <-ch:
		log.Printf("shutting down (%s)", sig)
	case err := <-errCh:
		if err != nil && err != http.ErrServerClosed {
			log.Fatal(err)
		}
	}

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutdownCancel()
	_ = httpServer.Shutdown(shutdownCtx)
}
