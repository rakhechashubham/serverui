.DEFAULT_GOAL := help

WEB_DIR := apps/web
SERVER_DIR := apps/server
DOCKER_DIR := deploy/docker
BIN_DIR := bin

ENV_FILE := $(firstword $(wildcard .env $(DOCKER_DIR)/.env .env.example $(DOCKER_DIR)/.env.example))
ifeq ($(strip $(ENV_FILE)),)
ENV_FILE := .env.example
endif

COMPOSE_PROD := docker compose -f $(DOCKER_DIR)/docker-compose.yml --env-file $(ENV_FILE)
COMPOSE_DEV := docker compose -f $(DOCKER_DIR)/docker-compose.yml -f $(DOCKER_DIR)/docker-compose.dev.yml --env-file $(ENV_FILE)

.PHONY: help setup-env hooks start dev test lint format format-check build \
	docker-up docker-down docker-build docker-logs docker-ps docker-tui \
	ensure-docker ensure-env ensure-web-deps ensure-lazydocker

help:
	@echo "ServerUI Development Commands"
	@echo
	@echo "  make dev             Start temporary development environment + LazyDocker"
	@echo "  make start           Build and start production environment in background"
	@echo "  make test            Run tests"
	@echo "  make lint            Run linting and static checks"
	@echo "  make format          Format source code"
	@echo "  make format-check    Verify source formatting"
	@echo "  make build           Build all components"
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

test: ensure-web-deps
	cd $(WEB_DIR) && npm test
	go -C $(SERVER_DIR) test ./...

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

build: ensure-web-deps $(BIN_DIR)
	cd $(WEB_DIR) && npm run build
	go -C $(SERVER_DIR) build -o $(CURDIR)/$(BIN_DIR)/serverui-server ./cmd/server

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
