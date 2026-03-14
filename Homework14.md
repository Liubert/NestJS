# Homework 14

## How to run two services locally

Start infrastructure:
```bash
docker compose -f compose.yml up -d postgres rabbitmq
docker compose -f compose.yml run --rm migrate
docker compose -f compose.yml run --rm seed
```

Start `payments-service`:
```bash
PAYMENTS_GRPC_BIND_URL=0.0.0.0:50051 npm run start:payments:dev
```

Start `orders-service`:
```bash
docker compose -f compose.yml up -d api
```

## Ports

- `payments-service` (gRPC): `50051`
- `orders-service` (HTTP API): `8080`

## Required environment variables

- `PAYMENTS_GRPC_URL=host.docker.internal:50051` (when Orders runs in Docker and Payments runs locally)
- `PAYMENTS_GRPC_BIND_URL=0.0.0.0:50051`
- `PAYMENTS_GRPC_PROTO_PATH=proto/payments.proto`
- `PAYMENTS_GRPC_PACKAGE=payments`
- `PAYMENTS_GRPC_TIMEOUT_MS=1500`

## How to run the happy path test

1. Login:
```bash
curl -sS -X POST http://localhost:8080/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"buyer@test.com","password":"User123!"}'
```

2. Get one product id:
```bash
curl -sS http://localhost:8080/products
```

3. Call Orders endpoint:
```bash
curl -sS -X POST http://localhost:8080/orders \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Idempotency-Key: <UUID>" \
  -H 'Content-Type: application/json' \
  -d '{"userId":"<USER_ID>","items":[{"productId":"<PRODUCT_ID>","quantity":1}]}'
```

Expected result: response contains `payment.paymentId` and `payment.status` (`AUTHORIZED`).

## Where `.proto` is located

- File path: `proto/payments.proto`

## How `.proto` is used in each service

- `payments-service` loads `proto/payments.proto` in `src/main.payments.ts` (Nest gRPC server).
- `orders-service` uses the same `proto/payments.proto` in `src/modules/orders/orders.module.ts` (Nest gRPC client).
