# Local development setup

Runs MariaDB in Docker on host port **3307** (to avoid colliding with any
system MariaDB/MySQL), while the backend and frontend run directly on the host
for fast hot reload.

## One-time setup

```bash
npm ci                                                           # install all workspaces
cp environment/environment.dev.dist.yaml environment/environment.yaml
npm run dev:db                                                   # start mariadb, waits for healthcheck
npm run dev:migrate                                              # create schema
```

> The backend config loader always reads `environment/environment.yaml` (which is
> gitignored). The committed `environment.dev.dist.yaml` is a template: copy once,
> edit if your ports/creds differ.

## Daily workflow

Open two terminals from the repo root:

```bash
# terminal 1 — backend with --watch (rebuild + restart on save)
npm run dev:backend

# terminal 2 — frontend with ng serve (HMR + proxy to backend)
npm run dev:frontend
```

- Backend: `http://localhost:8080`
- Frontend dev server: `http://localhost:4200`
- `ng serve` proxies `/api/*` and `/socket.io` to the backend; open the UI at
  `http://localhost:4200`.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev:db` | Start MariaDB container, wait for healthcheck |
| `npm run dev:db:down` | Stop and remove the MariaDB container (keeps the volume) |
| `npm run dev:db:reset` | Drop the DB volume and re-create it — wipes all dev data |
| `npm run dev:migrate` | Run drizzle migrations against the dev DB |
| `npm run dev:backend` | NestJS in `--watch` mode |
| `npm run dev:frontend` | `ng serve` with `proxy.conf.json` |

## Dev DB access

| | |
|---|---|
| Host | `localhost` |
| Port | `3307` |
| DB | `sync_in` |
| User | `sync_in` / `dev` |
| Root | `root` / `dev_root` |

```bash
docker exec -it sync-in-dev-mariadb mariadb -usync_in -pdev sync_in
```

## Troubleshooting

- **Backend can't reach DB** — confirm `npm run dev:db` reported `Healthy`, and
  that `environment/environment.yaml` points at `mysql://…@localhost:3307/…`.
- **Frontend calls 404** — check `frontend/proxy.conf.json` maps `/api` and
  `/socket.io` at your backend port (default 8080).
- **Port 3307 in use** — edit `docker/docker-compose.dev.yaml` and
  `environment/environment.yaml` in lockstep.
- **Schema drift after upstream sync** — `npm run dev:migrate` picks up any
  new migrations; `npm run dev:db:reset` for a clean slate.
