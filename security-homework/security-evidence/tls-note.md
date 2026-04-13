# Transport Security / TLS Posture — TMS

## Current architecture

```
Internet
  │
  ├─ Admin UI (browser) ──→ :3001/3010 ──→ nginx ──→ :80 (static React build)
  │                                          │
  │                                          └──→ proxy_pass /api → NestJS :3000
  │
  ├─ Frontend apps (i18n) ──→ :8080 ──→ NestJS :3000 (public translations)
  │
  └─ MCP agents ──→ :8080 ──→ NestJS :3000 (MCP token auth)

Docker internal network (not exposed):
  NestJS ──→ PostgreSQL :5432
  NestJS ──→ RabbitMQ :5672

External HTTPS calls (outbound from NestJS):
  NestJS ──→ Gemini API (googleapis.com, HTTPS)
  NestJS ──→ AWS S3 (HTTPS, SDK built-in TLS)
```

## TLS status

| Segment | Current | Target |
|---------|---------|--------|
| Client → nginx | **HTTP** (no TLS yet) | HTTPS with Let's Encrypt or Cloudflare |
| Client → API :8080 | **HTTP** (direct) | Close port, route through nginx with TLS |
| nginx → NestJS | HTTP (Docker internal) | HTTP — acceptable, same host |
| NestJS → PostgreSQL | TCP (Docker internal) | TCP — acceptable, internal network only |
| NestJS → RabbitMQ | AMQP (Docker internal) | AMQP — acceptable, internal network only |
| NestJS → Gemini/S3 | **HTTPS** (SDK built-in) | Already secure |

## Traffic classification

| Traffic type | Network | Protection |
|-------------|---------|-----------|
| **Public** — browser users, frontend i18n, MCP agents | Internet → nginx/API | TLS termination at nginx (target) |
| **Internal** — app ↔ database, app ↔ queue | Docker bridge network | Network isolation, credentials required |
| **External outbound** — AI API, S3 | NestJS → Internet | HTTPS enforced by SDKs |

## What needs to change for production

1. **Add TLS to nginx** — see `nginx-tls-example.conf`
2. **Close direct :8080 port** — route all traffic through nginx
3. **HTTP → HTTPS redirect** at nginx level
4. **HSTS header** — already handled by `helmet()` in production mode
5. **Certificate management** — Let's Encrypt with certbot auto-renewal, or Cloudflare proxy

## Why internal traffic stays HTTP

Docker internal bridge network provides network-level isolation. Only containers in the same compose network can reach PostgreSQL/RabbitMQ. No port mapping to host for DB/queue. Adding TLS for internal traffic adds complexity without meaningful security benefit in a single-host deployment.
