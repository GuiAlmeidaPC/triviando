.PHONY: dev dev-backend dev-frontend build build-backend build-frontend run clean tidy

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

# --- run production-style ----------------------------------------------------
run: build
	./backend/bin/triviando

# --- maintenance -------------------------------------------------------------
tidy:
	cd backend && go mod tidy

clean:
	rm -rf backend/bin frontend/dist frontend/node_modules
