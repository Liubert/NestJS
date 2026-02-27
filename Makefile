# ---------- Development ----------

dev:
	docker compose -f compose.yml -f compose.dev.yml up --build


# ---------- Production-like ----------

prod:
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
	docker compose up -d postgres
	sleep 3
	docker compose run --rm migrate
	docker compose run --rm seed
	docker compose -f compose.yml -f compose.dev.yml up

clean-cache:
	docker builder prune -af
	@echo "Docker build cache cleaned"

# ---------- DANGER ZONE ----------
# WARNING: This command removes containers AND database volumes.
# All local database data will be permanently deleted.

reset:
	docker compose down -v
	docker compose -f compose.yml -f compose.dev.yml up --build -d postgres
	sleep 3
	docker compose run --rm migrate
	docker compose run --rm seed
	@echo "Database reset completed"