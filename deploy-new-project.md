# Deploying a New Project on the Same VPS

These instructions assume the VPS is at `187.127.26.58` and the domain is `gapc10.tech`.
Replace `myapp` and `my-project` with your actual subdomain and project name.

---

## 1. DNS — Add a subdomain record

In your DNS provider, add an **A record**:
- Name: `myapp`
- Value: `187.127.26.58`

Wait for propagation (usually a few minutes).

---

## Option A — Direct deploy (no Docker)

### 2A. Upload the project

```bash
ssh deploy@187.127.26.58
git clone https://github.com/GuiAlmeidaPC/my-project /srv/my-project
```

### 3A. Add an nginx server block

Create `/etc/nginx/sites-available/my-project`:

```nginx
server {
    server_name myapp.gapc10.tech;

    location /assets/ {
        alias /srv/my-project/frontend/dist/assets/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location / {
        alias /srv/my-project/frontend/dist/;
        try_files $uri $uri/ /index.html;
        location = /index.html {
            add_header Cache-Control "no-cache";
        }
    }

    # Backend — use a new port per project: 8001, 8002, ...
    location /api/ {
        proxy_pass http://127.0.0.1:8001/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    listen 80;
}
```

```bash
sudo ln -s /etc/nginx/sites-available/my-project /etc/nginx/sites-enabled/
sudo nginx -t && sudo nginx -s reload
```

### 4A. Issue an SSL certificate

```bash
sudo certbot --nginx -d myapp.gapc10.tech
```

### 5A. Install the backend as a systemd user service

Create `~/.config/systemd/user/my-project.service`:

```ini
[Unit]
Description=My Project – FastAPI/uvicorn backend
After=network.target

[Service]
WorkingDirectory=/srv/my-project/backend
Environment="PATH=%h/.local/bin:/usr/bin:/bin"
ExecStart=%h/.local/bin/uv run uvicorn app.main:app --host 127.0.0.1 --port 8001 --workers 2
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
```

```bash
mkdir -p ~/.config/systemd/user
# (copy the file above)
systemctl --user daemon-reload
systemctl --user enable --now my-project
loginctl enable-linger deploy   # makes user services survive logout/reboot
```

To restart the backend on deploy:

```bash
systemctl --user restart my-project
```

---

## Option B — Docker deploy

### 2B. Install Docker on the VPS (if not already installed)

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker deploy   # allow deploy user to run docker
# reconnect SSH for the group change to take effect
```

### 3B. Add a `docker-compose.yml` to your project

```yaml
services:
  backend:
    build: ./backend
    restart: unless-stopped
    ports:
      - "127.0.0.1:8001:8000"   # only bind to localhost; nginx proxies externally

  frontend:
    build: ./frontend
    restart: unless-stopped
    ports:
      - "127.0.0.1:3001:80"     # nginx inside the container serves the built app
```

### 4B. Add Dockerfiles

**`backend/Dockerfile`:**
```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY . .
RUN pip install uv && uv sync
CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
```

**`frontend/Dockerfile`:**
```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
```

**`frontend/nginx.conf`** (inside the container — handles SPA routing):
```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

### 5B. Clone and start the containers

```bash
git clone https://github.com/GuiAlmeidaPC/my-project /srv/my-project
cd /srv/my-project
docker compose up -d --build
```

### 6B. Add an nginx server block

Create `/etc/nginx/sites-available/my-project`:

```nginx
server {
    server_name myapp.gapc10.tech;

    location /api/ {
        proxy_pass http://127.0.0.1:8001/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass http://127.0.0.1:3001/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    listen 80;
}
```

```bash
sudo ln -s /etc/nginx/sites-available/my-project /etc/nginx/sites-enabled/
sudo nginx -t && sudo nginx -s reload
```

### 7B. Issue an SSL certificate

```bash
sudo certbot --nginx -d myapp.gapc10.tech
```

### 8B. Redeploy after code changes

```bash
cd /srv/my-project
git pull
docker compose up -d --build
```

---

## Port reference (avoid conflicts)

| Project            | Backend port | Frontend port          |
|--------------------|--------------|------------------------|
| query-builder      | `8000`       | served by host nginx   |
| next project       | `8001`       | `3001` (if Docker)     |
| project after that | `8002`       | `3002` (if Docker)     |
