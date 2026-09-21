.DEFAULT_GOAL := help

WEB_DIR := apps/web
SERVER_DIR := apps/server
DESKTOP_DIR := apps/desktop
DOCKER_DIR := deploy/docker
BIN_DIR := bin

ENV_FILE := $(firstword $(wildcard .env $(DOCKER_DIR)/.env .env.example $(DOCKER_DIR)/.env.example))
ifeq ($(strip $(ENV_FILE)),)
ENV_FILE := .env.example
endif

COMPOSE_PROD := docker compose -f $(DOCKER_DIR)/docker-compose.yml --env-file $(ENV_FILE)
COMPOSE_DEV := docker compose -f $(DOCKER_DIR)/docker-compose.yml -f $(DOCKER_DIR)/docker-compose.dev.yml --env-file $(ENV_FILE)
COMPOSE_DESKTOP_DB := docker compose -f $(DOCKER_DIR)/docker-compose.yml -f $(DOCKER_DIR)/docker-compose.desktop.yml --env-file $(ENV_FILE)

.PHONY: help setup-env hooks start dev test lint format format-check build \
	build-server desktop-db desktop-dev desktop-build desktop-build-all \
	desktop-build-macos desktop-build-macos-arm64 desktop-build-macos-x64 \
	desktop-build-windows-x64 desktop-build-linux-x64 \
	desktop-e2e desktop-version desktop-release-helpers-test \
	docker-up docker-down docker-build docker-logs docker-ps docker-tui \
	ensure-docker ensure-env ensure-web-deps ensure-desktop-deps ensure-lazydocker ensure-rust

help:
	@echo "ServerUI Development Commands"
	@echo
	@echo "  make dev             Start temporary development environment + LazyDocker"
	@echo "  make start           Build and start production environment in background"
	@echo "  make desktop-dev     Start Tauri desktop + Next.js + local Go backend"
	@echo "  make desktop-db      Start Postgres with host port published for desktop"
	@echo "  make desktop-build   Build the Tauri desktop application bundle (host arch)"
	@echo "  make desktop-build-macos-arm64  macOS Apple Silicon → dist/macos/"
	@echo "  make desktop-build-macos-x64    macOS Intel → dist/macos/"
	@echo "  make desktop-build-macos        macOS arm64 + x64 → dist/macos/"
	@echo "  make desktop-build-windows-x64  Windows x64 (native Windows host) → dist/windows/"
	@echo "  make desktop-build-linux-x64    Linux x64 (native Linux host) → dist/linux/"
	@echo "  make desktop-build-all          Explain full matrix (CI); does not cross-build"
	@echo "  make desktop-e2e     Run desktop local-auth / lifecycle integration checks"
	@echo "  make desktop-version Sync/bump desktop SemVer (VERSION=x.y.z optional)"
	@echo "  make test            Run tests"
	@echo "  make lint            Run linting and static checks"
	@echo "  make format          Format source code"
	@echo "  make format-check    Verify source formatting"
	@echo "  make build           Build web + Go server"
	@echo "  make build-server    Build Go server binary only"
	@echo "  make setup-env       Create .env and generate an encryption key if needed"
	@echo "  make hooks           Configure local Git hooks (core.hooksPath=.githooks)"
	@echo
	@echo "Docker Commands"
	@echo
	@echo "  make docker-up       Start Docker services in background"
	@echo "  make docker-down     Stop and remove Docker services"
	@echo "  make docker-build    Rebuild Docker images"
	@echo "  make docker-logs     Show Docker service logs"
	@echo "  make docker-ps       Show running Docker services"
	@echo "  make docker-tui      Open LazyDocker"
	@echo
	@echo "  make help            Show this help message"

ensure-docker:
	@command -v docker >/dev/null 2>&1 || { \
		echo "Docker is not installed."; \
		echo "Install Docker Desktop, then try again."; \
		exit 1; \
	}
	@docker info >/dev/null 2>&1 || { \
		echo "Docker is not running."; \
		echo "Start Docker Desktop, then try again."; \
		exit 1; \
	}

ensure-env:
	@if [ ! -f .env ] && [ ! -f $(DOCKER_DIR)/.env ]; then \
		echo "No .env file found."; \
		echo "Run: make setup-env"; \
		echo "Or:  cp .env.example .env"; \
		exit 1; \
	fi

ensure-lazydocker:
	@command -v lazydocker >/dev/null 2>&1 || { \
		echo "lazydocker is not installed."; \
		echo "Install it from https://github.com/jesseduffield/lazydocker"; \
		echo "make dev requires lazydocker. Use make start for a detached environment."; \
		exit 1; \
	}

ensure-rust:
	@command -v cargo >/dev/null 2>&1 || { \
		echo "Rust/cargo is not installed."; \
		echo "Install from https://rustup.rs then try again."; \
		exit 1; \
	}

setup-env:
	@if [ ! -f .env ]; then \
		cp .env.example .env; \
		echo "Created .env from .env.example"; \
	fi
	@if grep -Eq '^SERVERUI_CREDENTIAL_ENCRYPTION_KEY=[[:space:]]*$$' .env; then \
		command -v openssl >/dev/null 2>&1 || { echo "openssl is required to generate SERVERUI_CREDENTIAL_ENCRYPTION_KEY"; exit 1; }; \
		key=$$(openssl rand -hex 32); \
		tmp=$$(mktemp); \
		sed "s/^SERVERUI_CREDENTIAL_ENCRYPTION_KEY=.*/SERVERUI_CREDENTIAL_ENCRYPTION_KEY=$$key/" .env > $$tmp && mv $$tmp .env; \
		echo "Generated SERVERUI_CREDENTIAL_ENCRYPTION_KEY in .env"; \
	else \
		echo ".env already has SERVERUI_CREDENTIAL_ENCRYPTION_KEY"; \
	fi

hooks:
	@git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { echo "Not a git repository."; exit 1; }
	@git config core.hooksPath .githooks
	@echo "Git hooks path set to .githooks"
	@echo "Local commits will run format-check, lint, and tests."

start: ensure-docker setup-env ensure-env
	@echo "Building ServerUI..."
	$(COMPOSE_PROD) up -d --build --remove-orphans
	@echo "Starting services..."
	@echo
	@echo "ServerUI is running."
	@echo
	@echo "  Web:    http://localhost:$${WEB_PORT:-3000}"
	@echo "  API:    http://localhost:$${HTTP_PORT:-8080}"
	@echo
	@echo "Docker services are running in the background."

dev: ensure-docker setup-env ensure-env ensure-lazydocker
	@echo "Starting ServerUI development environment..."
	@echo
	@echo "Starting Docker services..."
	@trap 'echo; echo "Stopping development environment..."; $(COMPOSE_DEV) down; echo "Development containers removed. Database volume preserved."' EXIT INT TERM HUP; \
	$(COMPOSE_DEV) up -d --build --remove-orphans; \
	echo; \
	echo "  Web:    http://localhost:$${WEB_PORT:-3000}"; \
	echo "  API:    http://localhost:$${HTTP_PORT:-8080}"; \
	echo; \
	echo "Opening LazyDocker..."; \
	if [ ! -t 1 ]; then \
		echo "lazydocker needs an interactive terminal."; \
		echo "Run make dev from your own shell."; \
		exit 1; \
	fi; \
	( cd $(DOCKER_DIR) && COMPOSE_FILE=docker-compose.yml:docker-compose.dev.yml lazydocker )

ensure-web-deps:
	@test -d $(WEB_DIR)/node_modules || (cd $(WEB_DIR) && npm ci)

ensure-desktop-deps:
	@test -d $(DESKTOP_DIR)/node_modules || (cd $(DESKTOP_DIR) && npm ci)

test: ensure-web-deps
	cd $(WEB_DIR) && npm test
	go -C $(SERVER_DIR) test ./...
	@$(MAKE) desktop-release-helpers-test
	@if command -v cargo >/dev/null 2>&1; then \
		$(MAKE) build-server; \
		chmod +x $(DESKTOP_DIR)/scripts/prepare-sidecar.sh; \
		$(DESKTOP_DIR)/scripts/prepare-sidecar.sh; \
		cargo test --manifest-path $(DESKTOP_DIR)/src-tauri/Cargo.toml; \
	else \
		echo "cargo not found; skipping desktop tests"; \
	fi

lint: ensure-web-deps
	cd $(WEB_DIR) && npm run lint
	go -C $(SERVER_DIR) vet ./...

format: ensure-web-deps
	gofmt -w $(SERVER_DIR)
	cd $(WEB_DIR) && npm run format

format-check: ensure-web-deps
	@unformatted=$$(gofmt -l $(SERVER_DIR)); \
	if [ -n "$$unformatted" ]; then \
		echo "Go files need formatting:"; \
		echo "$$unformatted"; \
		exit 1; \
	fi
	cd $(WEB_DIR) && npm run format:check

$(BIN_DIR):
	mkdir -p $(BIN_DIR)

build-server: $(BIN_DIR)
	go -C $(SERVER_DIR) build -o $(CURDIR)/$(BIN_DIR)/serverui-server ./cmd/server

build: ensure-web-deps $(BIN_DIR) build-server
	cd $(WEB_DIR) && npm run build

desktop-db: ensure-docker setup-env ensure-env
	@echo "Starting Postgres for desktop development (published on localhost:5432)..."
	$(COMPOSE_DESKTOP_DB) up -d postgres
	@echo "Postgres is available at 127.0.0.1:$${POSTGRES_PUBLISH_PORT:-5432}"

desktop-dev: setup-env ensure-env ensure-web-deps ensure-desktop-deps ensure-rust build-server
	@chmod +x $(DESKTOP_DIR)/scripts/prepare-sidecar.sh
	@$(DESKTOP_DIR)/scripts/prepare-sidecar.sh
	@echo "Starting ServerUI desktop development..."
	@echo
	@echo "  UI:      http://localhost:$${WEB_PORT:-3000} (Next.js, loaded by Tauri)"
	@echo "  Backend: started by Tauri on 127.0.0.1:<dynamic-port> (SQLite in app data)"
	@echo
	@echo "Packaged/default desktop uses local SQLite (no PostgreSQL required)."
	@echo "Optional Postgres testing: SERVERUI_STORAGE=postgres make desktop-db && make desktop-dev"
	@echo
	@trap 'echo; echo "Stopping Next.js..."; kill $$NEXT_PID 2>/dev/null || true' EXIT INT TERM HUP; \
	(cd $(WEB_DIR) && npm run dev -- --port $${WEB_PORT:-3000}) & NEXT_PID=$$!; \
	for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30; do \
		if curl -sf "http://127.0.0.1:$${WEB_PORT:-3000}" >/dev/null 2>&1; then break; fi; \
		sleep 1; \
	done; \
	cd $(DESKTOP_DIR) && npm run dev

desktop-version: ensure-desktop-deps
	@if [ -n "$(VERSION)" ]; then \
		node $(DESKTOP_DIR)/scripts/sync-version.mjs "$(VERSION)"; \
	else \
		node $(DESKTOP_DIR)/scripts/sync-version.mjs; \
	fi

desktop-build: setup-env ensure-env ensure-web-deps ensure-desktop-deps ensure-rust build-server
	@chmod +x $(DESKTOP_DIR)/scripts/prepare-sidecar.sh
	$(DESKTOP_DIR)/scripts/prepare-sidecar.sh
	@node $(DESKTOP_DIR)/scripts/sync-version.mjs
	@if [ -n "$$TAURI_SIGNING_PRIVATE_KEY" ]; then \
		echo "TAURI_SIGNING_PRIVATE_KEY set; building with updater artifacts"; \
		cd $(DESKTOP_DIR) && npm run build; \
	else \
		echo "Building unsigned desktop bundle (no updater signatures)"; \
		cd $(DESKTOP_DIR) && npm run build:unsigned; \
	fi

desktop-build-macos-arm64: setup-env ensure-env ensure-web-deps ensure-desktop-deps ensure-rust
	@chmod +x $(DESKTOP_DIR)/scripts/prepare-sidecar.sh $(DESKTOP_DIR)/scripts/build-macos-release.sh
	$(DESKTOP_DIR)/scripts/build-macos-release.sh arm64

desktop-build-macos-x64: setup-env ensure-env ensure-web-deps ensure-desktop-deps ensure-rust
	@chmod +x $(DESKTOP_DIR)/scripts/prepare-sidecar.sh $(DESKTOP_DIR)/scripts/build-macos-release.sh
	$(DESKTOP_DIR)/scripts/build-macos-release.sh x64

desktop-build-macos: setup-env ensure-env ensure-web-deps ensure-desktop-deps ensure-rust
	@chmod +x $(DESKTOP_DIR)/scripts/prepare-sidecar.sh $(DESKTOP_DIR)/scripts/build-macos-release.sh
	$(DESKTOP_DIR)/scripts/build-macos-release.sh all

desktop-build-windows-x64: setup-env ensure-env ensure-web-deps ensure-desktop-deps ensure-rust
	@chmod +x $(DESKTOP_DIR)/scripts/prepare-sidecar.sh $(DESKTOP_DIR)/scripts/build-native-release.sh
	$(DESKTOP_DIR)/scripts/build-native-release.sh windows-x64

desktop-build-linux-x64: setup-env ensure-env ensure-web-deps ensure-desktop-deps ensure-rust
	@chmod +x $(DESKTOP_DIR)/scripts/prepare-sidecar.sh $(DESKTOP_DIR)/scripts/build-native-release.sh
	$(DESKTOP_DIR)/scripts/build-native-release.sh linux-x64

desktop-build-all:
	@echo "ServerUI desktop production matrix is built on native GitHub-hosted runners."
	@echo
	@echo "  Local (this machine, current OS/arch only):"
	@echo "    make desktop-build"
	@echo "    make desktop-build-macos-arm64   # macOS host"
	@echo "    make desktop-build-macos-x64     # macOS host (cross compile OK)"
	@echo "    make desktop-build-windows-x64   # Windows host only"
	@echo "    make desktop-build-linux-x64     # Linux host only"
	@echo
	@echo "  Full release (macOS arm64+x64, Windows x64, Linux x64):"
	@echo "    1. node apps/desktop/scripts/sync-version.mjs X.Y.Z && commit"
	@echo "    2. git tag vX.Y.Z && git push origin vX.Y.Z"
	@echo "    3. GitHub Actions: Desktop Release (.github/workflows/desktop-release.yml)"
	@echo
	@echo "This target does not attempt fragile local cross-builds for Windows/Linux."
	@echo "See docs/releases.md."

desktop-e2e: setup-env ensure-env build-server
	@chmod +x scripts/desktop-e2e.sh
	./scripts/desktop-e2e.sh

desktop-release-helpers-test:
	@chmod +x scripts/test-desktop-release-helpers.sh scripts/collect-desktop-artifacts.sh
	./scripts/test-desktop-release-helpers.sh

docker-up: ensure-docker ensure-env
	$(COMPOSE_DEV) up -d --build --remove-orphans

docker-down: ensure-docker
	$(COMPOSE_DEV) down

docker-tui: ensure-docker ensure-lazydocker
	@if [ ! -t 1 ]; then \
		echo "lazydocker needs an interactive terminal."; \
		echo "Run make docker-tui from your own shell."; \
		exit 1; \
	fi
	cd $(DOCKER_DIR) && COMPOSE_FILE=docker-compose.yml:docker-compose.dev.yml lazydocker

docker-build: ensure-docker
	$(COMPOSE_PROD) build

docker-logs: ensure-docker
	$(COMPOSE_DEV) logs --tail=200

docker-ps: ensure-docker
	$(COMPOSE_DEV) ps
