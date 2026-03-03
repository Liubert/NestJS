## RabbitMQ Homework: Async Orders Processing

### Requirements
- Docker 24+
- Docker Compose v2+
- Make

### Project Run

Architecture:
- `api` runs as HTTP producer.
- `worker` runs as a separate container/process and consumes `orders.process`.

First-time setup:
```bash
make init
```

Regular dev run:
```bash
make dev
```

Production-like stack:
```bash
make prod
```

One-off commands:
```bash
make migrate
make seed
```

Health endpoints:
- `GET /health` - liveness probe.
- `GET /ready` - readiness probe (checks DB + RabbitMQ).

Correlation ID:
- Send optional header `X-Correlation-Id` in API requests.
- API logs include `correlationId=<value>`.
- Worker logs include `correlationId=<value>` for the same message flow.

## 5-Minute Checklist

Run stack:
```bash
make prod
```

Prepare token and test data:
```bash
BASE=http://localhost:8080
CORR="check-$(date +%s)"

LOGIN=$(curl -sS -X POST "$BASE/auth/login" \
  -H 'Content-Type: application/json' \
  -H "X-Correlation-Id: $CORR" \
  -d '{"email":"buyer@test.com","password":"User123!"}')

TOKEN=$(echo "$LOGIN" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);process.stdout.write(j.token||j.accessToken||'')})")
USER_ID=$(echo "$LOGIN" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);process.stdout.write(j.user?.id||j.userId||'')})")
PRODUCT_ID=$(curl -sS "$BASE/products" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const a=JSON.parse(d);process.stdout.write((a[0]&&a[0].id)||'')})")
```

1. Happy path (`pending -> processed`)
```bash
KEY=$(uuidgen)
ORDER=$(curl -sS -X POST "$BASE/orders" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Idempotency-Key: $KEY" \
  -H "X-Correlation-Id: $CORR" \
  -H 'Content-Type: application/json' \
  -d "{\"userId\":\"$USER_ID\",\"items\":[{\"productId\":\"$PRODUCT_ID\",\"quantity\":1}]}")

ORDER_ID=$(echo "$ORDER" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);process.stdout.write(j.id||'')})")
sleep 3
curl -sS "$BASE/orders/$ORDER_ID"
```
Expected:
- First response has `status: "pending"`.
- After short delay, order has `status: "processed"` and `processedAt`.

2. Retry scenario
```bash
curl -sS -X POST "$BASE/orders/test/rabbit/fail" -H "X-Correlation-Id: $CORR"
sleep 4
docker logs --since 30s nest_js_worker_1 | grep 'result=retry'
```
Expected:
- Worker logs contain retries with `attempt=0` and `attempt=1`.

3. DLQ scenario
```bash
sleep 4
docker logs --since 40s nest_js_worker_1 | grep 'result=dlq'
docker exec nest_js_rabbitmq_1 rabbitmqctl list_queues name messages_ready messages_unacknowledged | grep orders.dlq
```
Expected:
- Worker logs contain `result=dlq ... attempt=2` (for `maxAttempts=3`).
- `orders.dlq` `messages_ready` increases.

4. Idempotency by `messageId`
```bash
MSG_ID=$(docker exec nest_js_postgres_1 psql -U postgres -d ecom -t -A -c "select message_id from processed_messages order by processed_at desc limit 1")
ORDER_ID=$(docker exec nest_js_postgres_1 psql -U postgres -d ecom -t -A -c "select order_id from processed_messages where message_id='${MSG_ID}'")
BEFORE=$(docker exec nest_js_postgres_1 psql -U postgres -d ecom -t -A -c "select count(*) from processed_messages where message_id='${MSG_ID}'")

BODY=$(node -e "const m=process.argv[1],o=process.argv[2];const payload={messageId:m,orderId:o,createdAt:new Date().toISOString(),attempt:0,producer:'manual-test',eventName:'orders.process',correlationId:'$CORR'};process.stdout.write(JSON.stringify({properties:{},routing_key:'process',payload:JSON.stringify(payload),payload_encoding:'string'}));" "$MSG_ID" "$ORDER_ID")
curl -sS -u guest:guest -H 'content-type: application/json' -X POST 'http://localhost:15672/api/exchanges/%2F/orders.exchange/publish' -d "$BODY"

sleep 2
AFTER=$(docker exec nest_js_postgres_1 psql -U postgres -d ecom -t -A -c "select count(*) from processed_messages where message_id='${MSG_ID}'")
echo "before=$BEFORE after=$AFTER"
docker logs --since 20s nest_js_worker_1 | grep "messageId=${MSG_ID}" | grep mode=duplicate
```
Expected:
- Counter stays the same (`before == after`).
- Worker log contains `mode=duplicate`.

Reset database (deletes volumes):
```bash
make reset
```

## RabbitMQ Topology

Exchange:
- `orders.exchange` (type: `direct`, durable)

Queues:
- `orders.process` (durable)
- `orders.retry` (durable, TTL queue)
- `orders.dlq` (durable)

Routing keys:
- `process` -> `orders.process`
- `retry` -> `orders.retry`
- `dlq` -> `orders.dlq`

Retry queue settings:
- `x-message-ttl = RABBITMQ_RETRY_DELAY_MS`
- `x-dead-letter-exchange = orders.exchange`
- `x-dead-letter-routing-key = process`

Flow:
1. API creates order in DB with `status=pending`.
2. API publishes message to `orders.exchange` with routing key `process`.
3. Worker consumes from `orders.process` (manual ack).
4. On error and attempts left: worker publishes to `retry` and ACKs original.
5. After TTL, message returns from `orders.retry` back to `orders.process`.
6. On max attempts: worker publishes to `dlq` and ACKs original.

## Chosen Retry Strategy

Implemented strategy: `publish-to-retry + ACK original` with bounded attempts.

- Max attempts are controlled by `RABBITMQ_MAX_ATTEMPTS` (default `3`).
- Delay between attempts is controlled by `RABBITMQ_RETRY_DELAY_MS` (default `3000` ms).
- After max attempts message goes to `orders.dlq`.

## Idempotency

Idempotency is implemented by `messageId` in DB table `processed_messages`.

Table fields:
- `message_id` (unique)
- `order_id`
- `handler`
- `processed_at`

Worker algorithm:
1. Start DB transaction.
2. `INSERT INTO processed_messages(message_id, ...) ON CONFLICT DO NOTHING`.
3. If duplicate (`0 rows inserted`) -> commit and exit (no business re-processing).
4. If inserted -> process order, commit, ACK.

This ensures safe behavior with at-least-once delivery and parallel workers.

## How to Check in RabbitMQ UI

RabbitMQ Management UI:
- URL: `http://localhost:15672`
- Login: `guest / guest`

Check:
1. Exchange `orders.exchange` exists.
2. Queues `orders.process`, `orders.retry`, `orders.dlq` exist.
3. Bindings for routing keys `process`, `retry`, `dlq` exist.
4. During failure flow `orders.dlq` `Ready` counter increases.

## Demo Scenarios

### 1) Happy Path
1. Login:
   - `POST /auth/login` with `buyer@test.com / User123!`
2. Create order:
   - `POST /orders`
   - headers: `Authorization: Bearer <token>`, `Idempotency-Key: <uuid>`
3. Expected:
   - response returns quickly with `status=pending` and `processedAt=null`.
4. Fetch order:
   - `GET /orders/{id}` after 1-3 sec
5. Expected:
   - `status=processed`
   - `processedAt` is set
   - items/total are calculated

### 2) Retry
1. Call:
   - `POST /orders/test/rabbit/fail`
2. Expected in logs:
   - `result=retry ... attempt=0`
   - `result=retry ... attempt=1`

### 3) DLQ
1. Continue from retry scenario.
2. Expected in logs:
   - `result=dlq ... attempt=2` (when max attempts = 3)
3. Expected in Rabbit UI:
   - queue `orders.dlq` gets +1 message (`Ready` increases)

### 4) Idempotency by messageId
1. Take `messageId` of processed order from logs or `processed_messages`.
2. Re-publish the same payload with same `messageId` to routing key `process`.
3. Expected:
   - no duplicate side effects
   - worker log includes `mode=duplicate`
   - `processed_messages` remains one row for that message

## Useful Defaults from Seed

Users:
- `buyer@test.com / User123!`
- `admin@test.com / Admin123!`

## Non-root Runtime Check (Prod image)

```bash
docker compose run --rm api id
```

Expected:
```text
uid=1000(node) gid=1000(node)
```
