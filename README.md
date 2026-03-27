# NestJS App

## How to run locally

### With Make (recommended)

First time setup — builds images, runs migrations and seed, starts the app:
```bash
make init
```

Daily development:
```bash
make dev
```

Other useful commands:
```bash
make dev-logs    # follow logs
make dev-ps      # show container status
make dev-health  # check health endpoint
make dev-down    # stop everything
```

Production-like mode:
```bash
make prod
```

---

### Without Make

First time:
```bash
docker compose -f compose.yml -f compose.dev.yml up -d
docker compose -f compose.yml run --rm migrate
docker compose -f compose.yml run --rm seed
```

Daily development:
```bash
docker compose -f compose.yml -f compose.dev.yml up -d
docker compose -f compose.yml -f compose.dev.yml logs -f
docker compose -f compose.yml -f compose.dev.yml down
```

Production-like:
```bash
docker compose -f compose.yml up --build
```

---

## Environment

Copy `.env.example` to `.env` and fill in the values before starting.

App runs on `http://localhost:8080`.
RabbitMQ UI: `http://localhost:15672` (guest / guest).
