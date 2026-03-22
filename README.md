# Homework 12: RabbitMQ Orders Flow

### Як запустити?
I use Make targets for all local runs.

If you run project first time:
```bash
make init
```
This command builds images, starts Postgres/RabbitMQ, runs migrations + seed, and starts the app.

For daily work:
```bash
make dev
```

Useful commands:
```bash
make dev-logs
make dev-ps
make dev-health
make dev-down
```

Production-like mode:
```bash
make prod
```

---

### Яка топологія?
I kept topology simple and predictable:

- Exchange: `orders.exchange` (`direct`)
- Queues:
  - `orders.process`
  - `orders.retry`
  - `orders.dlq`
- Routing keys:
  - `process` -> `orders.process`
  - `retry` -> `orders.retry`
  - `dlq` -> `orders.dlq`

Retry queue has TTL (`RABBITMQ_RETRY_DELAY_MS`) and dead-letters back to `process`, so message comes back for next attempt automatically.

RabbitMQ UI:
- `http://localhost:15672`
- `guest / guest`

---

### Який retry-механізм обрано?
I considered two common options:

1. `republish + ack original`
2. `DLX/TTL + nack`

I chose **republish + ack original** because it gives explicit control in worker code.
For this project, it is easier to reason about, easier to log, and easier to debug.

Flow is:
- processing failed -> check `attempt`
- if attempts left -> republish with `attempt + 1` to retry queue and ACK original
- if limit reached -> publish to DLQ and ACK original

So retries are finite and controlled.

---

### Як відтворити 4 сценарії?

#### 1) Happy path
1. Login and get token:
```bash
curl -sS -X POST http://localhost:8080/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"buyer@test.com","password":"User123!"}'
```
2. Create order:
```bash
curl -sS -X POST http://localhost:8080/orders \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Idempotency-Key: <UUID>" \
  -H 'Content-Type: application/json' \
  -d '{"items":[{"productId":"<PRODUCT_ID>","quantity":1}]}'
```
`userId` is taken from JWT (`Authorization` header), so it is not sent in request body.
3. First response is `pending`, then worker moves order to `processed`.

#### 2) Retry
Trigger fail message:
```bash
curl -sS -X POST http://localhost:8080/orders/test/rabbit/fail
```
Check worker logs:
```bash
docker logs --since 60s nest_js_worker_1 | grep 'result=retry'
```

#### 3) DLQ
After retries are exhausted, verify DLQ log:
```bash
docker logs --since 60s nest_js_worker_1 | grep 'result=dlq'
```
And queue counters:
```bash
docker exec nest_js_rabbitmq_1 rabbitmqctl list_queues name messages_ready messages_unacknowledged | grep orders.dlq
```

#### 4) Idempotency
Republish message with the same `messageId`.
Expected result: worker detects duplicate and skips business side effects.
(You can verify by logs and by checking `processed_messages` row count for that `messageId`.)

---

### Як реалізована idempotency?
I reused the DB approach from the previous homework and extended it for RabbitMQ flow.

The base idea stayed the same, but now it is wired directly into async message processing.

I use `processed_messages` table with unique `message_id`.
In worker transaction I do:
- insert message id (`ON CONFLICT DO NOTHING`)
- if duplicate -> stop processing safely
- if new -> run business logic and commit

This gives us safe behavior for RabbitMQ at-least-once delivery and protects from duplicate side effects.

---

## CI/CD Pipeline (Homework CI/CD)

### Workflows

- `.github/workflows/pr-checks.yml`
  - Trigger: pull requests to `develop` and `main`
  - Steps: `npm ci` -> `lint:check` -> `unit tests` -> Docker build validation (`--target prod`)

- `.github/workflows/build-and-stage.yml`
  - Trigger: push to `develop` (and manual `workflow_dispatch`)
  - Builds and pushes immutable image to GHCR with tag `sha-<commit_sha>`
  - Creates `release-manifest.json` artifact (commit + image + digest)
  - Deploys the same image to `stage` environment with smoke check

- `.github/workflows/deploy-prod.yml`
  - Trigger: manual `workflow_dispatch` with `commit_sha`
  - Verifies immutable image exists in GHCR
  - Deploys to `production` environment without image rebuild
  - Uses `concurrency` lock for production deploys

### GitHub Environments

Create two environments in repository settings:
- `stage`
- `production` (configure required reviewers for manual approval)

### Required Secrets

Stage:
- `STAGE_SSH_HOST`
- `STAGE_SSH_PORT` (optional, default `22`)
- `STAGE_SSH_USER`
- `STAGE_SSH_PRIVATE_KEY`
- `STAGE_DEPLOY_PATH`
- `STAGE_COMPOSE_FILE` (optional, default `compose.yml`)
- `STAGE_SERVICES` (optional, default `api worker`)
- `STAGE_HEALTHCHECK_URL` (optional, default `http://localhost:8080/health`)

Production:
- `PROD_SSH_HOST`
- `PROD_SSH_PORT` (optional, default `22`)
- `PROD_SSH_USER`
- `PROD_SSH_PRIVATE_KEY`
- `PROD_DEPLOY_PATH`
- `PROD_COMPOSE_FILE` (optional, default `compose.yml`)
- `PROD_SERVICES` (optional, default `api worker`)
- `PROD_HEALTHCHECK_URL` (optional, default `http://localhost:8080/health`)

### Branch Protection

Set `PR Checks` workflow as required status check for `develop` and `main`, so PR merge is blocked on failed checks.
