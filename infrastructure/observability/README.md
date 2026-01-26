# Observability stack (Prometheus + Grafana)

This is an optional local stack to view API metrics.

Start:

```bash
docker compose -f infrastructure/docker-compose.observability.yml up -d
```

Optional logs (Loki + Promtail):

```bash
docker compose -f infrastructure/docker-compose.observability.yml --profile logs up -d
```

Endpoints:

- Prometheus: `http://localhost:9090`
- Grafana: `http://localhost:3005` (default user/pass: `admin` / `admin`)

Notes:

- Prometheus scrapes the API at `host.docker.internal:3001/metrics` (Docker Desktop). If you run on Linux, update `infrastructure/observability/prometheus.yml`.
- If you set `METRICS_TOKEN`, Prometheus needs an auth header. Easiest for local: leave `METRICS_TOKEN` unset so `/metrics` is public.
