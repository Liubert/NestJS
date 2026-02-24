# Повний порядок запуску з нуля

```make init```

or

```	
docker compose build 
docker compose up -d postgres
docker compose run --rm migrate
docker compose run --rm seed
docker compose -f compose.yml -f compose.dev.yml up
```


---


# Частина 6 — Перевірки

## Команди запуску

Dev:

docker compose -f compose.yml -f compose.dev.yml up --build

Prod-like:

docker compose -f compose.yml up --build

Міграції:

docker compose run --rm migrate

Seed:

docker compose run --rm seed

### 6.1 Run Commands

For convenience, a `Makefile` was added with predefined commands to simplify common Docker workflows (development, production-like run, migrations, seed, reset, etc.).

Instead of running long `docker compose` commands manually, you can use:
See the full list of commands in the [Makefile](./Makefile).
```
make init
make dev
make prod
make migrate
make seed
make reset
```


### 6.2
---

## Докази оптимізації

```docker image ls | grep nest_js```

```
prod-distroless   301MB
prod              316MB
dev               418MB
migrate/seed      429MB
```

## Conclusion

dev image is larger because it includes development dependencies and tooling (TypeScript, ts-node, etc.).

prod image contains only compiled dist/ output and production dependencies.

prod-distroless is the smallest and most secure runtime image because:

It uses a minimal distroless base image.

It does not include a shell or package manager.

It runs as a non-root user by default.

It contains only compiled application code and runtime dependencies.

This reduces the attack surface and improves container security.


---

## 6.3 Non-root Verification

### Prod image

The `prod` stage runs as a non-root user (`USER node`).

Verification:

```bash
docker compose run --rm api id
```

### Expected output

```
uid=1000(node) gid=1000(node)
```

---
