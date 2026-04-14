# Feature Landscape

**Domain:** Internal Translation Management Service (TMS) — Stabilization milestone
**Researched:** 2026-04-02
**Focus:** Quality states, deploy reliability, test coverage, endpoint lifecycle

---

## Table Stakes

Features the system must have to be considered stable. Missing or broken = daily blockers for teams.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Quality state: `skipped` as distinct state | "Skip" means "intentionally not checked" — distinct from unchecked or failed. Confirmed bug in current codebase. | Low | Score=100, color=blue, persisted in DB. Current state: skip writes score=100 but UI shows wrong indicator. |
| Quality states: `pending` / `checked` / `failed` / `skipped` | Users need to know if a key has been evaluated, is waiting, was checked, or failed AI check. Lokalise and Phrase both expose this granularity. | Low | `pending` = queued/in-progress. `checked` = score received. `failed` = AI timeout or error. `skipped` = intentionally excluded. |
| Deployment that passes on first attempt | Dev team cannot adopt system if every deploy requires manual SSH intervention. Current state: ECONNREFUSED on RabbitMQ startup is the main failure mode. | Medium | Fix: `depends_on: condition: service_healthy` for RabbitMQ and Postgres in docker-compose. |
| RabbitMQ startup healthcheck | Docker Compose `depends_on` only guarantees container start, not service readiness. Without a real healthcheck, API container races against RabbitMQ init. | Low | Use `rabbitmq-diagnostics check_port_connectivity` as healthcheck test; set `start_period: 40s`. |
| Postgres startup healthcheck | Same issue as RabbitMQ — `pg_isready` healthcheck must exist before API container starts. | Low | Already partially present; verify `condition: service_healthy` is used in API's `depends_on`. |
| Base integration test coverage for auth flows | Auth bypass or privilege escalation go undetected without tests. CONCERNS.md flags this as High priority. | Medium | Cover: login, JWT validation, mustChangePassword enforcement, password reset token expiry. |
| Base integration test coverage for translation CRUD | Core business logic has zero tests. Import/export, member access, sandbox promotion are all untested. | High | Cover: create/read/update/delete keys, namespace isolation, member access enforcement. |
| Endpoint audit — verify all routes are connected | Orphaned endpoints waste maintenance effort and create confusion for MCP tool authors and frontend consumers. | Medium | Map each controller route to: frontend call, MCP tool, or documented public API. Remove or mark deprecated what has no consumer. |
| Quality check `failed` state persisted correctly | Chunk timeouts currently use `continue` silently — keys show as unchecked rather than `failed`. Users have no way to know a check was skipped due to timeout. | Low | Log the failure, write `quality_level = 'failed'` to DB so UI can show it and user can retry. |

---

## Differentiators

Improvements that would meaningfully raise the system's daily usability, but are not blockers for core stability.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Quality score filter in Admin UI | Users can quickly find keys that need attention (`failed`, low score) without scrolling through all keys. Already referenced as planned in PROJECT.md. | Medium | Requires adding `quality_level` filter param to list endpoint; UI adds filter control. Depends on: quality states being correct first. |
| Manual quality check retry via UI or MCP | Keys stuck in `failed` state currently require knowing the key ID and calling the API directly. A retry button or MCP tool removes friction. | Low | Single endpoint `POST /quality-check/retry/:keyId` or bulk retry. Depends on: DLQ visibility. |
| Sandbox promotion preserves context fields | Context, contextNeed, contextReason are not cascaded during sandbox→production promotion. Translators lose intent metadata. CONCERNS.md flags this. | Low | Audit what key-level fields move with promotion; add context update to promotion logic. |
| DLQ visibility endpoint or log alert | Messages in dead-letter queue after 3 retries are invisible. A scheduled job or log alert enables proactive detection before users notice failures. | Medium | Options: scheduled job that logs DLQ depth; or simple admin endpoint `GET /quality-check/dlq-stats`. Depends on: RabbitMQ healthcheck being stable. |
| ZIP import safety — upsert instead of delete+insert | Current implementation deletes all keys then re-inserts; partial failure = data loss. Using upsert preserves existing keys when import fails midway. | Medium | Move ZIP parse outside transaction; validate structure first; then upsert in single transaction. Depends on: understanding current transaction boundary. |
| File upload size limit enforced | No limit on ZIP upload size. Server can OOM on large files. Simple `limits: { fileSize: 50MB }` on FileInterceptor is a one-liner fix. | Low | Add to `FileInterceptor` config and `src/main.ts` body-parser limits. No dependencies. |
| `@IsPassword()` applied to reset/change flows | Password validator exists but is only applied to registration. Reset and change flows allow weak passwords. | Low | Apply existing validator to two DTOs: no new code needed. |
| Access control extracted to shared service | `assertAccess()` duplicated between TranslationsService and SandboxService. Divergent rules are a silent regression risk. | Medium | Create `ProjectAccessService`; refactor both callers. Medium complexity due to test absence — must verify behavior first. |

---

## Anti-Features

Things to deliberately NOT build during this stabilization milestone.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| New end-user features (new endpoints, new UI pages) | Milestone is explicitly stability-only. Adding features while bugs exist increases surface area and delays stability goal. | Capture in PROJECT.md "Pending / Planned Features" for next milestone. |
| Full 100% test coverage target | Cost-benefit is wrong for a small internal tool. NestJS module files don't need tests. Some service internals are better validated by integration tests, not unit mocks. | Target regression-critical paths: auth, CRUD, access control, import. Aim for coverage of behavior, not line counts. |
| Redis caching or rate limiting on public endpoints | Real mitigation for DoS / performance is valid, but this is a scaling concern, not a stability concern. The system serves 3-4 internal projects at low load. | Document in CONCERNS.md as a future scaling item. Do not build now. |
| Email-based password reset | Requires SMTP integration, secrets management, and delivery testing — all out of scope for stabilization. | Return raw token from API (existing PHASE 1 behavior) and document this as a known dev-mode shortcut. |
| Blue-green or zero-downtime deployments | Single VPS with Docker Compose does not need zero-downtime for an internal tool. Adds operational complexity with no team benefit at this scale. | Use `docker compose up -d --no-deps [service]` for targeted restarts. Document in deploy runbook. |
| Per-project AI quota enforcement | Valid concern for the future, but the system serves 3-4 trusted internal projects. No abuse risk that justifies the implementation cost now. | Add a soft monitoring log for AI call counts per project. Build enforcement in a future milestone. |
| Streaming ZIP parser | Current memory approach handles 500MB safely. The system imports small translation files, not large media archives. | Keep `AdmZip(buffer)` approach. Add the 50MB upload limit to prevent pathological inputs. |
| Audit logging (who changed what) | Valuable but requires a new entity, new writes on every mutation, and UI to surface it. No compliance requirement driving this for internal use. | Note in CONCERNS.md. Not this milestone. |

---

## Feature Dependencies

The following ordering constraints exist between table stakes items:

```
RabbitMQ healthcheck
  → Deployment passes on first attempt

Postgres healthcheck
  → Deployment passes on first attempt

quality state: skipped as distinct state
  → quality score filter in Admin UI (UI filter only makes sense if states are correct)
  → quality check failed state persisted correctly (both are DB-level state fixes)

quality check failed state persisted correctly
  → Manual quality check retry (retry only useful if failed state is visible)
  → DLQ visibility (confirms DLQ is being populated, not silently dropped)

Endpoint audit
  → (no dependencies; can run independently as a review task)

Integration tests: auth
  → (no external dependencies; can start with SQLite/pg-mem or a test Postgres container)

Integration tests: translation CRUD
  → Integration tests: auth (auth tokens needed to make authenticated requests)

ZIP import safety (upsert)
  → ZIP import safety is independent of test coverage but should be tested once done
```

---

## MVP Recommendation for Stabilization

Prioritize in this order:

1. **Deploy reliability** — RabbitMQ and Postgres healthchecks, `condition: service_healthy` in docker-compose. Zero code changes to app logic, high impact. Eliminates the most common deploy failure mode.

2. **Quality state correctness** — Fix `skipped` state indicator (confirmed bug), persist `failed` state on chunk timeout. Both are DB + logic changes with contained blast radius.

3. **Endpoint audit** — Read-only investigation first. Map all routes. Remove or deprecate orphans. No new code until audit is complete.

4. **Base test coverage** — Auth integration tests first (high risk, contained scope), then translation CRUD. Do not aim for unit test coverage of service internals — integration tests against a real DB provide more regression value.

5. **Targeted quality-of-life fixes** — File upload limit, password validator application, sandbox promotion context cascade. All are low-complexity, contained changes.

Defer to next milestone:
- Quality filter in Admin UI (depends on state correctness being stable first)
- Access control deduplication (refactor risk without tests; wait until test coverage exists)
- DLQ visibility endpoint (useful but not blocking daily use)
- ZIP import upsert refactor (moderate complexity; current workaround is usable)

---

## Sources

- [Lokalise Translation Statuses Documentation](https://docs.lokalise.com/en/articles/3684557-translation-statuses-translated-verified-reviewed-and-completed) — MEDIUM confidence (official docs)
- [Lokalise Quality Scoring Documentation](https://docs.lokalise.com/en/articles/11631905-scoring-translation-quality) — MEDIUM confidence (official docs)
- [Docker Compose Healthchecks — Last9 Guide](https://last9.io/blog/docker-compose-health-checks/) — HIGH confidence (verified against Docker official docs)
- [Docker Compose Startup Order — Official Docs](https://docs.docker.com/compose/how-tos/startup-order/) — HIGH confidence (official)
- [RabbitMQ Docker healthcheck issue thread](https://github.com/docker-library/rabbitmq/issues/326) — MEDIUM confidence (community-verified pattern)
- [NestJS Testing Best Practices — Amplication](https://amplication.com/blog/best-practices-and-common-pitfalls-when-testing-my-nestjs-app) — MEDIUM confidence (community)
- [Integration Testing NestJS APIs with Test Database — Dept Agency](https://engineering.deptagency.com/integration-testing-nestjs-apis-with-a-test-database) — MEDIUM confidence (practitioner writeup)
- [NestJS Integration + E2E Tests with TypeORM and PostgreSQL — firxworx](https://firxworx.com/blog/code/nestjs-integration-and-e2e-tests-with-typeorm-postgres-and-jwt/) — MEDIUM confidence (practitioner writeup)
- `.planning/PROJECT.md` and `.planning/codebase/CONCERNS.md` — HIGH confidence (primary source, codebase audit)
