# Security Baseline — Translation Management Service (TMS)

## Service overview

NestJS backend for managing JSON localization keys across internal projects. Serves translations to frontend apps via Locize-compatible API. Includes React admin UI and MCP integration for AI agents.

**Stack:** NestJS 11 + TypeORM + PostgreSQL 15 + RabbitMQ + Gemini AI
**Deployment:** Docker Compose on single VPS (stage: 79.76.35.167)
**Auth:** JWT (8h TTL) + bcrypt (10 rounds) + MCP token auth (SHA-256 hashed)

---

## OWASP ASVS mapping

### 1. Authentication / Session / JWT

| What exists | Risk before HW | What was added | Backlog |
|-------------|----------------|----------------|---------|
| JWT auth with 8h TTL | Token not rotated, no refresh token | — | Refresh token rotation |
| Bcrypt 10 rounds for passwords | Adequate | — | — |
| Password reset with SHA-256 hashed token, 1h TTL | `forgotPassword` returns raw token in response (Phase 1 temp) | Documented as compensating-control gap | Send token via email instead |
| `mustChangePassword` flag for admin-created users | — | — | — |
| MCP tokens SHA-256 hashed | — | Audit logging for create/revoke | — |

### 2. Access Control / Roles / Scopes

| What exists | Risk before HW | What was added | Backlog |
|-------------|----------------|----------------|---------|
| `RolesGuard` with ADMIN/USER/GUEST | Basic coverage | — | — |
| Project-level access: owner/member checks | Non-admins can only see their projects | — | — |
| Admin-only endpoints: user CRUD, role management | Properly guarded | Audit logging for user create/delete | — |
| AI config endpoints | No role restriction — any authenticated user can change prompts | **Added `@Roles(ADMIN)` + `RolesGuard` on all AI config endpoints** | — |

### 3. Secrets Management

| What exists | Risk before HW | What was added | Backlog |
|-------------|----------------|----------------|---------|
| `.env` file (gitignored) | Not a final security strategy | Log sanitization in `AllExceptionsFilter` | Docker Secrets for production |
| `.env.example` with placeholders only | — | Added `CORS_ORIGINS` placeholder | — |
| Passwords hashed (bcrypt), tokens hashed (SHA-256) | — | — | — |
| No secrets in code or logs | Verified via grep | `sanitize()` method strips passwords/tokens/secrets from error logs | — |

See: [secret-flow-note.md](security-evidence/secret-flow-note.md)

### 4. Transport Security / TLS

| What exists | Risk before HW | What was added | Backlog |
|-------------|----------------|----------------|---------|
| nginx reverse proxy for admin UI | HTTP only, no TLS | TLS design documented + example config | Deploy TLS with Let's Encrypt |
| API port :8080 exposed directly | No encryption on public API | `trust proxy 1` for correct IP behind nginx | Close :8080, route through nginx |
| DB/RabbitMQ on Docker internal network | Acceptable — not exposed | — | — |
| External calls (Gemini, S3) use HTTPS | — | — | — |

See: [tls-note.md](security-evidence/tls-note.md), [nginx-tls-example.conf](security-evidence/nginx-tls-example.conf)

### 5. Input Surface / Abuse Protection

| What exists | Risk before HW | What was added | Backlog |
|-------------|----------------|----------------|---------|
| `ValidationPipe` (whitelist, forbidNonWhitelisted, transform) | — | — | — |
| class-validator decorators on all DTOs | — | — | — |
| No rate limiting | Brute-force, enumeration, abuse | **Global rate limit: 300 req/60s per IP** | — |
| No per-route throttling | Auth endpoints unprotected | **Strict throttle on auth: login 5/min, forgot-password 3/min, reset/change 5/min** | Captcha for login |
| CORS: `true` (allow all origins) | Any origin can call API | **CORS restricted via `CORS_ORIGINS` env var** | — |
| Public translation routes are chatty | Would hit global limit | **Relaxed throttle 600/min on public routes + `@SkipThrottle()` on health** | — |
| MCP token endpoints | No rate limiting | **10 req/min on token creation** | — |

### 6. Logging / Auditability

| What exists | Risk before HW | What was added | Backlog |
|-------------|----------------|----------------|---------|
| HTTP request logging (LoggerMiddleware) with correlationId | No audit trail for security events | **Structured audit logging (AuditLogService)** | Persistent audit DB table |
| correlationId in request/response headers | — | **correlationId linked to audit events** | — |
| No audit for auth events | Login failures invisible | **8 audit events: login_success, login_failed, password_reset_completed, password_changed, mcp_token.created, mcp_token.revoked, user.admin_created, user.deleted** | — |
| Global exception filter | Not registered, no log sanitization | **Registered globally + sanitize() for secrets** | — |

---

## Surface area risk table

| Surface area | Risk | Control before HW | What was added | Evidence | Residual risk |
|-------------|------|-------------------|----------------|----------|---------------|
| `POST /auth/login` | Brute force / credential stuffing | JWT auth | Rate limit 5/min + audit login failures | [rate-limit-auth.txt](security-evidence/rate-limit-auth.txt) | No captcha / anomaly detection |
| `POST /auth/forgot-password` | Email enumeration / spam | None | Rate limit 3/min | [rate-limit-auth.txt](security-evidence/rate-limit-auth.txt) | Raw token in response (Phase 1) |
| `POST /auth/reset-password` | Token brute-force | Hashed token + 1h TTL | Rate limit 5/min + audit password_reset_completed | — | — |
| `POST /auth/change-password` | Account takeover | JWT required | Rate limit 5/min + audit password_changed | — | — |
| `POST /mcp-tokens` | Token abuse | JWT required | Rate limit 10/min + audit create/revoke | [audit-log-example.txt](security-evidence/audit-log-example.txt) | — |
| `POST /users` | Unauthorized user creation | ADMIN role required | Audit user.admin_created | [audit-log-example.txt](security-evidence/audit-log-example.txt) | — |
| `DELETE /users/:id` | Unauthorized deletion | ADMIN role required | Audit user.deleted | [audit-log-example.txt](security-evidence/audit-log-example.txt) | — |
| `GET /translations/:slug/:ns/:locale` | Data scraping | None (public) | Relaxed throttle 600/min (still protected, but higher limit) | — | No auth on public routes (by design) |
| All endpoints | Missing security headers | None | **helmet()** — X-Content-Type-Options, X-Frame-Options, etc. | [headers.txt](security-evidence/headers.txt) | CSP disabled in non-prod for Swagger |
| All endpoints | DoS / abuse | None | **Global 300 req/min per IP** | [rate-limit.txt](security-evidence/rate-limit.txt) | No WAF / IP blocking |

---

## Summary of changes

### Code changes
1. **`src/main.ts`** — Added helmet, CORS from env var, trust proxy, registered global exception filter
2. **`src/app.module.ts`** — Added ThrottlerModule (300/60s global) + ThrottlerGuard as APP_GUARD
3. **`src/modules/auth/auth.controller.ts`** — Strict throttle on all 4 auth endpoints + audit for login success/failure
4. **`src/modules/auth/mcp-tokens.controller.ts`** — Throttle on token creation + audit for create/revoke
5. **`src/modules/users/users.controller.ts`** — Audit for user creation/deletion
6. **`src/app.controller.ts`** — SkipThrottle on health check
7. **`src/modules/translations/public-translations.controller.ts`** — Relaxed throttle 600/min on public routes
8. **`src/common/audit/`** — New AuditLogModule (global), AuditLogService, AuditEvent type
9. **`src/common/filters/global-exception.filter.ts`** — Added sanitize() method, registered globally

### Documentation
10. **`security-evidence/secret-flow-note.md`** — Secrets inventory, flow, rotation strategy
11. **`security-evidence/tls-note.md`** — Transport security architecture
12. **`security-evidence/nginx-tls-example.conf`** — Target TLS nginx config

### New packages
- `helmet` — Security headers
- `@nestjs/throttler` — Rate limiting

---

## Backlog (conscious decisions to defer)

| Item | Priority | Reason to defer |
|------|----------|----------------|
| Send password reset token via email (not HTTP response) | High | Requires email service integration |
| Refresh token rotation | Medium | Current 8h JWT is acceptable for internal tool |
| Persistent audit log table | Low | stdout logging + `docker logs` grep is sufficient for now |
| TLS deployment with Let's Encrypt | High | Requires domain setup and DNS configuration |
| Close direct :8080 port | High | Requires nginx routing for all API traffic |
| Captcha on login | Low | Rate limiting provides baseline protection |
| WAF / IP blocking at edge | Low | Single-VPS deployment, edge proxy not in place |

---

## Evidence

| Evidence | File | How to reproduce |
|----------|------|-----------------|
| Security headers (helmet) | [headers.txt](security-evidence/headers.txt) | `curl -I http://localhost:8080/health` |
| Global rate limit (429) | [rate-limit.txt](security-evidence/rate-limit.txt) | 301+ requests in 60s to any endpoint |
| Auth rate limit (429) | [rate-limit-auth.txt](security-evidence/rate-limit-auth.txt) | 6+ POST to `/auth/login` in 60s |
| Audit log — login failure | [audit-log-example.txt](security-evidence/audit-log-example.txt) | POST `/auth/login` with wrong password, check `docker logs` for `AUDIT` |
| Secrets flow | [secret-flow-note.md](security-evidence/secret-flow-note.md) | Documentation |
| TLS posture | [tls-note.md](security-evidence/tls-note.md) | Documentation |
| nginx TLS config | [nginx-tls-example.conf](security-evidence/nginx-tls-example.conf) | Target configuration |
