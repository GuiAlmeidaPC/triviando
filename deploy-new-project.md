# Deploying a New Project on the Same VPS

These instructions assume the VPS is at `187.127.26.58` and the domain is `gapc10.tech`.
Replace `myapp` and `my-project` with your actual subdomain and project name.

> [!IMPORTANT]
> **Special Case: Main Page (`gapc10.tech`) Exception**
> The root domain `gapc10.tech` and `www.gapc10.tech` serve the main portfolio/landing page of the VPS.
> - **Directory**: `/var/www/main-page` (owned by `deploy:deploy`).
> - **Nginx Configuration**: Unlike other subdomains which get their own isolated configuration blocks, the main page configuration is integrated directly inside the `/etc/nginx/sites-available/query-builder` config block.
> - **Why?**: The main page shares the root domains `gapc10.tech` / `www.gapc10.tech` with the Query Builder application. The root path `/` serves the static landing page from `/var/www/main-page`, while `/querybuilder/` serves the Query Builder frontend.
> - **Caution**: Do **NOT** delete or disable the `query-builder` Nginx site block, as doing so will also take down the main site at `gapc10.tech`. When updating Nginx config, preserve the `location /` and `location /assets/` blocks pointing to `/var/www/main-page` inside `query-builder`.

---

## Prerequisites: Directory Creation in /srv

Because `/srv` is owned by `root:root` with standard restrictive permissions, the `deploy` user cannot write to it directly. Before cloning or uploading any code as the `deploy` user, you **must** create the target directory and grant ownership:

```bash
# Connect to the VPS and run:
sudo mkdir -p /srv/my-project
sudo chown -R deploy:deploy /srv/my-project
```

---

## 1. DNS — Add a subdomain record

In your DNS provider, add an **A record**:
- Name: `myapp` (e.g., `sit` or `triviando`)
- Value: `187.127.26.58`

Wait for propagation (usually a few minutes).

---

## Option A — Direct deploy (no Docker)

### 2A. Upload the project

Once target directory ownership is prepared, clone the repository on the VPS:

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
        alias /srv/my-project/frontend/dist/assets/; # Adjust if pure static (e.g. /srv/my-project/dist/assets/)
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location / {
        alias /srv/my-project/frontend/dist/; # Adjust if pure static (e.g. /srv/my-project/dist/)
        try_files $uri $uri/ /index.html;
        location = /index.html {
            add_header Cache-Control "no-cache";
        }
    }

    # Backend — use a new port per project: 8001, 8002, ... (Omit if pure static)
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
sudo ln -sf /etc/nginx/sites-available/my-project /etc/nginx/sites-enabled/
sudo nginx -t && sudo nginx -s reload
```

### 4A. Issue an SSL certificate

```bash
sudo certbot --nginx -d myapp.gapc10.tech
```

### 5A. Install the backend as a systemd user service (Omit for Pure Static apps)

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

Once target directory ownership is prepared, clone and spin up the containers:

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
sudo ln -sf /etc/nginx/sites-available/my-project /etc/nginx/sites-enabled/
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

## Option C — Pure Static App Deploy (Vite, React, Vanilla HTML/JS)

For pure client-side applications (without a Python/Node backend service), deployment is streamlined. You only need a static build directory and Nginx routing.

### 2C. Build and Sync
1. Compile the build locally:
   ```bash
   npm run build
   ```
2. Upload the `dist/` and assets to the VPS directory:
   ```bash
   rsync -avz --delete dist/ deploy@187.127.26.58:/srv/my-project/dist/
   rsync -avz --delete public/ deploy@187.127.26.58:/srv/my-project/public/
   ```

### 3C. Nginx block (Static SPA optimized)
Create `/etc/nginx/sites-available/my-project` mapping directly to the static folders on disk, handling client-side router fallbacks gracefully:

```nginx
server {
    server_name myapp.gapc10.tech;

    location /assets/ {
        alias /srv/my-project/dist/assets/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location / {
        alias /srv/my-project/dist/;
        try_files $uri $uri/ /index.html;
        location = /index.html {
            add_header Cache-Control "no-cache";
        }
    }

    listen 80;
}
```

---

## Sudo Password Automation Tip
If you are deploying from local automated scripts (or using agentic coding helpers), running remote `sudo` commands directly will fail non-interactively. Use `ssh -t` (pseudo-terminal allocation) to securely prompt you for your remote password inside the active shell session:

```bash
ssh -t deploy@187.127.26.58 "sudo nginx -s reload"
```

---

## Port reference (avoid conflicts)

| Project            | Backend port | Frontend port          | Status     | Notes                                                     |
|--------------------|--------------|------------------------|------------|-----------------------------------------------------------|
| main-page (root)   | None (Static)| `/var/www/main-page`   | Active     | Configured inside `query-builder` Nginx block              |
| query-builder      | `8000`       | served by host nginx   | Active     | Shares domain with main-page (`/querybuilder/` prefix)    |
| corinthians        | None         | `3001` (proxied)       | Active     | Served at `corinthians.gapc10.tech`                       |
| triviando          | `8001`       | served by host nginx   | Active     | Served at `triviando.gapc10.tech`                         |
| sit-webapp         | None (Static)| served by host nginx   | Active     | Served at `sit.gapc10.tech` (PWA enabled)                 |
| next project       | `8002`       | `3002` (if Docker)     | Available  |                                                           |
| project after that | `8003`       | `3003` (if Docker)     | Available  |                                                           |

