.PHONY: dev dev-backend dev-frontend build build-backend build-frontend build-prod run clean tidy deploy

DEPLOY_HOST ?= deploy@187.127.26.58
DEPLOY_PATH ?= /srv/triviando

# --- dev ---------------------------------------------------------------------
# Run backend and frontend in two terminals: `make dev-backend` / `make dev-frontend`
dev-backend:
	cd backend && go run ./cmd/triviando

dev-frontend:
	cd frontend && npm run dev

# --- build -------------------------------------------------------------------
build: build-frontend build-backend

build-backend:
	cd backend && go build -o bin/triviando ./cmd/triviando

build-frontend:
	cd frontend && npm ci && npm run build

# Cross-build the backend for the VPS (linux/amd64, static, stripped).
build-prod: build-frontend
	cd backend && GOOS=linux GOARCH=amd64 CGO_ENABLED=0 \
		go build -trimpath -ldflags='-s -w' -o bin/triviando ./cmd/triviando

# --- run production-style ----------------------------------------------------
run: build
	./backend/bin/triviando

# --- deploy ------------------------------------------------------------------
# Build for the VPS, ship artifacts, restart the service.
deploy: build-prod
	rsync -a backend/bin/triviando $(DEPLOY_HOST):$(DEPLOY_PATH)/backend/bin/
	rsync -a --delete frontend/dist/ $(DEPLOY_HOST):$(DEPLOY_PATH)/frontend/dist/
	ssh $(DEPLOY_HOST) 'systemctl --user restart triviando'
	@echo "deployed: https://triviando.gapc10.tech"

# --- maintenance -------------------------------------------------------------
tidy:
	cd backend && go mod tidy

clean:
	rm -rf backend/bin frontend/dist frontend/node_modules
