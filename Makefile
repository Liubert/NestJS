SHELL := /bin/bash

COMPOSE := docker compose -f compose.yml
COMPOSE_DEV := docker compose -f compose.yml -f compose.dev.yml

HEALTH_URL ?= http://localhost:8080/health
HEALTH_TIMEOUT ?= 60

.PHONY: help \
	dev dev-up dev-build dev-down dev-restart dev-logs dev-ps dev-health dev-wait \
	prod prod-build prod-bg \
	migrate seed init \
	clean-cache clean-cache-all \
	reset

help:
	@echo "Available targets:"
	@echo "  make dev          - Start dev stack in background and wait for API health"
	@echo "  make dev-build    - Rebuild and start dev stack, then wait for health"
	@echo "  make dev-down     - Stop dev stack"
	@echo "  make dev-logs     - Follow dev logs"
	@echo "  make dev-ps       - Show dev containers status"
	@echo "  make prod         - Start production-like stack in foreground"
	@echo "  make prod-build   - Rebuild and start production-like stack in foreground"
	@echo "  make prod-bg      - Rebuild and start production-like stack in background"
	@echo "  make migrate      - Run migrations one-off container"
	@echo "  make seed         - Run seed one-off container"
	@echo "  make init         - Full local init (build + db deps + migrate + seed + dev up)"
	@echo "  make reset        - Reset DB volumes and re-run migrate + seed"

# ---------- Development ----------

dev: dev-up dev-wait

dev-up:
	$(COMPOSE_DEV) up -d

dev-build:
	$(COMPOSE_DEV) up --build -d
	$(MAKE) dev-wait

dev-down:
	$(COMPOSE_DEV) down

dev-restart:
	$(COMPOSE_DEV) restart
	$(MAKE) dev-wait

dev-logs:
	$(COMPOSE_DEV) logs -f

dev-ps:
	$(COMPOSE_DEV) ps

dev-health:
	curl -fsS $(HEALTH_URL)

dev-wait:
	@echo "Waiting for API health on $(HEALTH_URL) ..."
	@i=0; \
	until curl -fsS $(HEALTH_URL) >/dev/null 2>&1; do \
		i=$$((i + 1)); \
		if [ $$i -ge $(HEALTH_TIMEOUT) ]; then \
			echo "API is not healthy after $(HEALTH_TIMEOUT)s"; \
			$(COMPOSE_DEV) ps; \
			exit 1; \
		fi; \
		sleep 1; \
	done; \
	echo "API is healthy"

# ---------- Production-like ----------

prod:
	$(COMPOSE) up

prod-build:
	$(COMPOSE) up --build

prod-bg:
	$(COMPOSE) up --build -d

# ---------- Database jobs (one-off) ----------

migrate:
	$(COMPOSE) run --rm migrate

seed:
	$(COMPOSE) run --rm seed

# ---------- Project initialization ----------

init:
	$(COMPOSE) build
	$(COMPOSE) up -d postgres rabbitmq
	sleep 5
	$(COMPOSE) run --rm migrate
	$(COMPOSE) run --rm seed
	$(COMPOSE_DEV) up

clean-cache:
	docker builder prune -af
	docker image prune -f
	@echo "Docker build cache + dangling images cleaned"

clean-cache-all:
	docker builder prune -af
	docker container prune -f
	docker image prune -af
	docker volume prune -f
	@echo "Docker build cache + stopped containers + all unused images + unused volumes cleaned"

# ---------- DANGER ZONE ----------
# WARNING: This command removes containers AND database volumes.
# All local database data will be permanently deleted.

reset:
	$(COMPOSE) down -v
	$(COMPOSE) up --build -d postgres rabbitmq
	sleep 5
	$(COMPOSE) run --rm migrate
	$(COMPOSE) run --rm seed
	@echo "Database reset completed"
