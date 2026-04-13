# Secrets Management — TMS (Translation Management Service)

## Where secrets live

| Environment | Storage | How secrets reach the app |
|-------------|---------|--------------------------|
| Local dev | `.env` file (gitignored) | Docker Compose `env_file` directive → `process.env` |
| Stage (79.76.35.167) | `.env` on server (`~/nest_js/.env`) | Same mechanism, file deployed manually via SSH |
| CI (GitHub Actions) | GitHub Secrets | Injected as env vars in workflow steps |
| Production (target) | Docker Secrets or encrypted volume mount | Mounted as files, read at startup |

## How secrets reach runtime

```
.env file → Docker Compose env_file → process.env → @nestjs/config ConfigModule → ConfigService.get('app')
```

All config is centralized in `src/config/app.config.ts` which reads from `process.env` and returns a typed `AppConfig` object.

## Secrets inventory

| Secret | Purpose | Where used |
|--------|---------|-----------|
| `JWT_SECRET` | Signs/verifies JWT tokens | `AuthModule` (JwtModule.register) |
| `DB_PASS` | PostgreSQL password | `AppConfig.db` → TypeORM connection |
| `GEMINI_API_KEY` | Google AI API for translations | `AiTranslateService`, `AiConfigService` |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | S3 file storage | Not actively used (legacy) |
| `RABBITMQ_PASS` | RabbitMQ credentials | Embedded in `RABBITMQ_URL` |

## What is NOT logged

- Passwords (hashed with bcrypt, never stored or logged as plaintext)
- Raw JWT tokens (only payload sub/role/email used internally)
- Raw MCP tokens (SHA-256 hashed before storage)
- Raw password reset tokens (SHA-256 hashed before storage)
- API keys (never appear in HTTP responses or logs)

Log sanitization is enforced in `AllExceptionsFilter.sanitize()` — strips `password=`, `secret=`, `Bearer`, and long `token=` values from error messages before logging.

## Rotation strategy

| Secret | How to rotate | Impact |
|--------|--------------|--------|
| `JWT_SECRET` | Change in `.env`, restart app | All existing JWT sessions invalidated (users must re-login) |
| `DB_PASS` | Change in `.env` + PostgreSQL `ALTER USER`, restart Compose | Brief downtime during restart |
| `GEMINI_API_KEY` | Regenerate in Google AI Studio, update `.env`, restart | AI translation unavailable during rotation window |
| `AWS_*` keys | IAM key rotation in AWS Console, update `.env`, restart | File uploads unavailable during rotation |
| `RABBITMQ_PASS` | Update in RabbitMQ admin + `.env` + `RABBITMQ_URL`, restart | Queue connections reset |

## Production target state

Current `.env`-based approach is acceptable for a single-VPS deployment but NOT suitable for multi-node production:

**Target:** Docker Secrets (Swarm mode) or mounted encrypted volumes
- Secrets injected as files at `/run/secrets/<name>`
- App reads from file instead of env var
- No plaintext on disk, no env var exposure in `docker inspect`
- Rotation via secret versioning (zero-downtime with rolling deploys)

**What's NOT changing:** `.env.example` remains in the repo as a template with placeholder values (`change-me`, `your-api-key`). Real values never committed.
