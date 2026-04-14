# Phase 2: Deploy Hardening - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-02
**Phase:** 02-deploy-hardening
**Areas discussed:** CI post-deploy verification, Uptime Kuma setup

---

## CI post-deploy verification

### What should CI verify after deploy?

| Option | Description | Selected |
|--------|-------------|----------|
| Full readiness check (Recommended) | Switch CI to call /health with DB + RabbitMQ checks. Also verify admin-ui responds on 3010. | ✓ |
| API + admin-ui only | Verify both respond HTTP 200, don't check individual dependencies. | |
| API deep + migration verify | Full readiness + verify migration table version. | |

**User's choice:** Full readiness check
**Notes:** None

### How should CI handle deploy failure?

| Option | Description | Selected |
|--------|-------------|----------|
| Fail with logs (current + improve) | Fail workflow, dump 30 lines of each service log + docker compose ps. | ✓ |
| Auto-rollback to previous image | On failure, roll back to previous image tag. | |
| Fail + Slack/Telegram alert | Fail with logs plus send alert to a channel. | |

**User's choice:** Fail with logs (current + improve)
**Notes:** None

---

## Uptime Kuma setup

### How should Uptime Kuma be deployed?

| Option | Description | Selected |
|--------|-------------|----------|
| Add to compose.yml (Recommended) | Add as Docker service, port 3011, persistent volume. | ✓ |
| Separate compose file | Independent compose.monitoring.yml. | |
| Install directly on host | npm/Docker run outside compose. | |

**User's choice:** Add to compose.yml

### Which services to monitor?

| Option | Description | Selected |
|--------|-------------|----------|
| API + DB + RabbitMQ + Admin UI | All 4 services monitored. | ✓ |
| API /health only | Single monitor on health endpoint. | |
| API + Admin UI only | Two user-facing services. | |

**User's choice:** API + DB + RabbitMQ + Admin UI

### Alert channels?

| Option | Description | Selected |
|--------|-------------|----------|
| Telegram bot | Push notifications via Telegram. | |
| Email only | Email alerts, simple setup. | ✓ |
| No alerts initially | Dashboard only, add alerts later. | |

**User's choice:** Email only

### User override: Remove Uptime Kuma from Phase 2

User requested to remove Uptime Kuma (DEPLOY-04) entirely from Phase 2 scope.
DEPLOY-04 moved to deferred ideas.

---

## Claude's Discretion

- Health endpoint design: merge /health and /ready, check DB + RabbitMQ
- @nestjs/terminus vs manual approach
- Health response JSON structure
- Docker healthcheck tuning for API service
- RabbitMQ health check method

## Deferred Ideas

- DEPLOY-04: Uptime Kuma monitoring — removed from Phase 2 by user
- Auto-rollback on deploy failure
- Slack/Telegram alerts on deploy failure
