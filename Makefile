# ---------- Development ----------

dev:
	docker compose -f compose.yml -f compose.dev.yml up -d
	$(MAKE) dev-wait

dev-build:
	docker compose -f compose.yml -f compose.dev.yml up --build -d
	$(MAKE) dev-wait

dev-wait:
	@echo "Waiting for API health on http://localhost:8080/health ..."
	@i=0; \
	until curl -fsS http://localhost:8080/health >/dev/null 2>&1; do \
		i=$$((i + 1)); \
		if [ $$i -ge 60 ]; then \
			echo "API is not healthy after 60s"; \
			docker compose -f compose.yml -f compose.dev.yml ps; \
			exit 1; \
		fi; \
		sleep 1; \
	done; \
	echo "API is healthy"

dev-health:
	curl -fsS http://localhost:8080/health

dev-logs:
	docker compose -f compose.yml -f compose.dev.yml logs -f

# ---------- Production-like ----------

prod:
	docker compose -f compose.yml up

prod-build:
	docker compose -f compose.yml up --build

prod-bg:
	docker compose -f compose.yml up --build -d


# ---------- Database jobs (one-off) ----------

migrate:
	docker compose run --rm migrate

seed:
	docker compose run --rm seed


# ---------- Project initialization ----------

init:
	docker compose build
	docker compose up -d postgres rabbitmq
	sleep 5
	docker compose run --rm migrate
	docker compose run --rm seed
	docker compose -f compose.yml -f compose.dev.yml up

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
	docker compose down -v
	docker compose up --build -d postgres rabbitmq
	sleep 5
	docker compose run --rm migrate
	docker compose run --rm seed
	@echo "Database reset completed"
