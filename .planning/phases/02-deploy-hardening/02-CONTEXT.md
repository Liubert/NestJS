# Phase 2: Deploy Hardening - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Harden the deploy pipeline so deploys pass on the first attempt and the pipeline catches unhealthy services before reporting success. Add proper healthchecks to Docker Compose, upgrade the API health endpoint to check real dependencies, and improve CI post-deploy verification. Uptime Kuma (DEPLOY-04) is deferred from this phase.

</domain>

<decisions>
## Implementation Decisions

### CI post-deploy verification
- **D-01:** Switch CI smoke check from static `/health` to a readiness endpoint that checks DB + RabbitMQ connectivity. Deploy fails if any dependency is down.
- **D-02:** Also verify admin-ui responds with HTTP 200 on its port during post-deploy check.
- **D-03:** On deploy failure (health check doesn't pass in 3 min): fail workflow, dump last 30 lines of each service log + `docker compose ps` to show which services are unhealthy. No auto-rollback, no external alerts.

### Health endpoint design
- **D-04:** Merge current `/health` (static OK) and `/ready` (DB only) into a single `/health` endpoint that checks both DB and RabbitMQ connectivity and returns status indicators per dependency.

### Docker Compose healthchecks
- **D-05:** Add healthcheck to the API service in compose.yml using the new `/health` endpoint. API should not be considered healthy until DB and RabbitMQ are confirmed up.

### Claude's Discretion
- Whether to use `@nestjs/terminus` or keep the manual health check approach (current `/ready` pattern works, terminus adds structured health indicators)
- Exact health response JSON structure (fields, status codes for degraded vs down)
- RabbitMQ health check method (AMQP ping, management API, or connection state)
- Docker healthcheck interval/timeout/retries tuning for API service
- CI script exact curl/retry logic adjustments

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Health endpoint
- `src/app.controller.ts` — Current `/health` (liveness) and `/ready` (readiness) endpoints
- `src/app.module.ts` — App module imports, dependency injection context
- `package.json` — Check if `@nestjs/terminus` is already installed

### Docker Compose
- `compose.yml` — Current service definitions, existing healthchecks for postgres and rabbitmq, API has no healthcheck
- `compose.dev.yml` — Dev override (if healthcheck handling differs)

### CI Pipeline
- `.github/workflows/build-and-stage.yml` — Current deploy script with smoke check (lines 152-188), curls `/health` 36 times

### Requirements
- `.planning/REQUIREMENTS.md` §DEPLOY-01, §DEPLOY-02, §DEPLOY-03 — Healthchecks, health endpoint, CI verification requirements

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `DataSource` already injected in `AppController` — used by `/ready` for `SELECT 1` check
- RabbitMQ connection via `amqplib` (v0.10.9) — connection state can be checked
- Postgres and RabbitMQ already have Docker healthchecks in compose.yml — API can depend on them

### Established Patterns
- Health endpoints are in `AppController` (not a separate module) — simple, no guards
- CI uses `appleboy/ssh-action` for remote deploy — script runs on VPS via SSH
- `restart: unless-stopped` on API service — self-heals on crash

### Integration Points
- CI script references `STAGE_HEALTHCHECK_URL` secret (currently `http://localhost:8080/health`) — needs to point to the upgraded endpoint
- `compose.yml` API service needs `healthcheck:` block added
- Admin-ui health can be checked via HTTP on its mapped port

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

- **DEPLOY-04: Uptime Kuma monitoring** — Removed from Phase 2 scope by user decision. Can be added as a separate phase or backlog item later.
- Auto-rollback on deploy failure — considered but rejected in favor of simpler fail-with-logs approach
- Slack/Telegram alerts on deploy failure — deferred, email alerts via Uptime Kuma can cover this when DEPLOY-04 is implemented

</deferred>

---

*Phase: 02-deploy-hardening*
*Context gathered: 2026-04-02*
