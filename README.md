# nest_js

General startup guide for local run from zero.

## Prerequisites

- Docker + Docker Compose
- Node.js + npm
- GNU Make

## Initial setup

```bash
cp .env.example .env
npm install
```

Required env values in `.env`:

- `APP_IMAGE` (example: `nest-js-app:local`)
- `JWT_SECRET`
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASS`
- `RABBITMQ_USER`, `RABBITMQ_PASS`, `RABBITMQ_HOST`, `RABBITMQ_PORT`, `RABBITMQ_URL`

## Preferred workflow (Makefile)

```bash
make dev-build
make migrate
make seed
```

Useful Make targets:

- `make dev` - start dev stack and wait for API health
- `make dev-ps` - show running containers
- `make dev-logs` - follow logs
- `make dev-down` - stop dev stack

## Alternative workflow (manual commands)

```bash
docker compose -f compose.yml up -d postgres rabbitmq
docker compose -f compose.yml run --rm migrate
docker compose -f compose.yml run --rm seed
docker compose -f compose.yml up -d api worker
```

Useful manual commands:

```bash
docker compose -f compose.yml ps
docker compose -f compose.yml logs -f api
docker compose -f compose.yml down
```

## Local endpoints

- API: `http://localhost:8080`
- API health: `http://localhost:8080/health`
- RabbitMQ AMQP: `localhost:5672`
- RabbitMQ UI: `http://localhost:15672`
- PostgreSQL for app containers: `postgres:5432`

## Homework 14 docs

Homework-specific answers are in `Homework14.md`.
