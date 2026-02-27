### Requirements

- Docker 24+
- Docker Compose v2+
- Make (installed by default on macOS/Linux)

## 🛠 First time setup
```bash
   make init
```
##  Regular dev run
```bash
   make dev
```

# Other Commands

## Start production-like stack
```bash
  make prod
```
# Run database migrations (one-off)
```bash
  make migrate
```
# Run seed (one-off)
```bash
  make seed
```


# Reset database (removes volumes!)
```bash
  make reset
```

## 6.3 Non-root verification

### Prod image

The runtime container is configured to run as a non-root user (`USER node`).

```bash
docker compose run --rm api id 
```
Expected output:

~~~
uid=1000(node) gid=1000(node)
~~~