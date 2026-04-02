# Project Research Summary

**Project:** TMS Stabilization (NestJS + React Admin UI on single VPS)
**Domain:** Internal Translation Management Service — Stabilization milestone
**Researched:** 2026-04-02
**Confidence:** HIGH

## Executive Summary

This project is an internal Translation Management Service (TMS) built on a fixed stack (NestJS 11, TypeORM, PostgreSQL, RabbitMQ, React + Ant Design) deployed via Docker Compose on a single VPS. The stabilization milestone does not introduce new features or replace technologies — it hardens what already exists. The core approach is: establish a test scaffold first, harden the deploy pipeline second, then fix known product bugs in dependency order, and clean up dead code last. This sequencing prevents fixes from outpacing verification capability.

The recommended additions to the existing stack are minimal: downgrade Jest to 29 (ts-jest incompatibility with Jest 30), add `@testcontainers/postgresql` for real-DB integration tests, wire `@nestjs/terminus` for a `/health` endpoint, and add Uptime Kuma for service monitoring. No framework or database changes. No Prometheus/Grafana (too heavy for a single-VPS internal tool). No Vitest (NestJS decorator metadata breaks unless configured carefully, not worth switching from a working Jest setup).

The key risks are concrete and well-understood from codebase analysis: the `importFromZip()` delete-then-insert pattern can cause silent data loss on reimport failure; the deploy pipeline can report success while services are actually crash-looping; and test coverage written before bug fixes will encode broken behavior as correct, turning tests into a liability. All three risks have clear mitigations that are front-loaded into the phase structure below.

## Key Findings

### Recommended Stack

The stack is fixed per project constraints and must not change. Stabilization adds tooling only. The critical constraint is Jest version: the current repo has Jest 30 but `ts-jest` (latest stable: 29.4.9) officially supports only Jest <30. Running Jest 30 with ts-jest prints warnings and has no support guarantee — downgrading to Jest 29.7.0 eliminates this hidden risk at zero cost. For integration tests, `@testcontainers/postgresql` 11.13.0 provides an ephemeral Postgres container that runs real TypeORM migrations, catching the class of "tests pass, migrations fail on real DB" bugs that mocks cannot detect.

**Core technologies (additions only — existing stack unchanged):**
- `jest@29.7.0` + `ts-jest@29.4.9`: test runner — downgrade fixes ts-jest/Jest 30 incompatibility
- `@testcontainers/postgresql@11.13.0`: integration test DB — real migrations run in ephemeral container
- `@nestjs/terminus@11.1.1`: health endpoint — first-party module, enables Docker + CI health gates
- `Uptime Kuma 2.2.1`: service monitoring — self-hosted Docker Compose, no cost, covers all four services
- `appleboy/ssh-action v1.0.3`: already in repo — extend to health-poll after deploy (no new dependency)

**Critical version note:** Port 3001 is reserved by another project. Uptime Kuma defaults to 3001 — must map to `3011:3001` in compose.yml. Admin UI compose default must also be corrected from `3001` to `3010`.

### Expected Features

The stabilization milestone is explicitly not about new features. The features below are corrections to existing behavior and deploy reliability — not additions.

**Must have (table stakes):**
- `skipped` as a distinct quality review state — confirmed bug: current skip writes score=100 but UI shows wrong indicator; distinct from unchecked/failed
- `failed` state persisted on chunk timeout — currently silent `continue` on timeout leaves keys showing as unchecked with no retry path
- Deployment passes on first attempt — RabbitMQ and Postgres `condition: service_healthy` in `depends_on` prevents startup race
- Base integration test coverage for auth flows — login, JWT, mustChangePassword, password reset token expiry
- Base integration test coverage for translation CRUD — create/read/update/delete, namespace isolation, member access enforcement
- Endpoint audit — map every route to a consumer (Admin UI, MCP tool, or public API); remove or deprecate orphans

**Should have (quality-of-life, not blockers):**
- Quality score filter in Admin UI — find `failed`/low-score keys without scrolling (depends on state correctness first)
- Manual quality check retry via UI or MCP — keys stuck in `failed` currently require direct API calls
- Sandbox promotion preserves context fields — `contextNeed`/`contextReason` currently lost on promotion
- DLQ visibility endpoint or log alert — dead-letter queue is currently invisible
- ZIP import upsert instead of delete+insert — current approach risks data loss on partial failure
- File upload size limit (50MB cap) — no current limit, server can OOM on large uploads
- `@IsPassword()` applied to reset/change flows — validator exists but only applied to registration

**Defer to next milestone:**
- Quality filter in Admin UI (depends on state correctness being stable first)
- Access control deduplication / shared `ProjectAccessService` (refactor risk without tests)
- DLQ visibility endpoint (useful, not blocking daily use)
- ZIP import upsert refactor (moderate complexity; current workaround is usable)
- Redis caching, rate limiting, blue-green deploys, audit logging, per-project AI quotas

### Architecture Approach

The stabilization work maps onto three parallel architectural concerns that must be addressed in strict dependency order: test infrastructure, CI/CD pipeline hardening, and product bug fixing. The existing application architecture is sound — the stabilization does not restructure modules. Test layer boundaries are explicit: unit tests with repository mocks cover auth service and pure logic; integration tests with real Postgres cover sandbox promotion, import flows, access control, and quality state transitions; E2E tests via Supertest cover authentication flows and role enforcement. The key architectural risk is the duplicate access control implementation (`TranslationsService.assertAccess()` vs `SandboxService` owner/admin check) — any security fix in one location must be mirrored in the other until a shared abstraction is extracted.

**Major components and test ownership:**
1. `AuthModule` (Controller → Service → DB) — unit tests for login, password reset; E2E for full auth flow
2. `TranslationsModule` core (CRUD) — unit tests for access logic; integration tests for actual DB operations
3. `TranslationsModule` AI/quality — unit tests for score calculation; integration tests for state transitions; mock Gemini in all automated tests
4. `TranslationsModule` worker (RabbitMQ consumer) — unit tests for batch orchestration and state transitions; mock RabbitMQ in CI
5. `SandboxService` — integration tests only (multi-table transactions require real DB); also covers context field promotion gap
6. CI/CD pipeline — add health gate after `docker compose up -d`; add `docker compose ps` restart-state check; add pg_dump snapshot before migrations

### Critical Pitfalls

1. **ZIP import data loss** — `importFromZip()` deletes all keys before inserting; a parse failure mid-import leaves the namespace empty. Fix: move `parseZip()` outside the transaction, validate structure first, then upsert in a single fast transaction.

2. **Deploy silently succeeds while services crash-loop** — health poll exits on first 200, does not watch container state afterward. Fix: after health poll, run `docker compose ps` to check for containers in `Restarting` state.

3. **TypeORM auto-generated migrations emitting DROP COLUMN** — type changes can generate drop+add instead of alter, silently destroying column data in production. Fix: manual review of every auto-generated migration before commit; hand-write migrations for enum changes.

4. **Endpoint removal breaking MCP tool consumers** — the MCP module is an NPM package; endpoints that appear unused in the Admin UI may be called by MCP tools in other projects. Fix: cross-reference every endpoint removal candidate against MCP tool source before deleting.

5. **Over-mocking produces fake green tests** — mocking TypeORM repositories verifies mock configuration, not behavior. Fix: use real DB for translation operations, sandbox promotion, and import flows; only mock Gemini and RabbitMQ.

## Implications for Roadmap

Research identifies a strict dependency graph that dictates phase order. Tests must exist before bugs are fixed; deploys must be reliable before fixes can be verified in stage; quality-state bugs must be fixed before quality-state tests are written; endpoint audit must complete before any code deletion begins.

### Phase 1: Test Infrastructure

**Rationale:** All other work depends on having a test scaffold. Without tests, bug fixes are unverifiable and cleanup is dangerous. This phase establishes the pattern before touching complex business logic.
**Delivers:** Jest 29 + ts-jest working configuration; first real unit test (AuthService login path); Testcontainers setup for integration tests; PR checks start catching real regressions.
**Addresses:** Over-mocking pitfall (establish correct mocking boundary from the start); ts-jest/Jest 30 incompatibility (downgrade).
**Avoids:** Pitfall 5 (over-mocking), component boundary violations.
**Stack additions:** `jest@29.7.0`, `ts-jest@29.4.9`, `@nestjs/testing@11.1.17`, `@testcontainers/postgresql@11.13.0`, `supertest@7.2.2`.

### Phase 2: Deploy Pipeline Hardening

**Rationale:** Deploy failures are the most frequent blocker. Until deploys are reliable, every bug fix is hard to verify on stage. This phase must come before product bug fixes so that fixes can be confirmed end-to-end.
**Delivers:** `@nestjs/terminus` health endpoint wired (DB + RabbitMQ indicators); Docker Compose `condition: service_healthy` for RabbitMQ and Postgres; CI health gate after `docker compose up -d`; `docker compose ps` restart-state check post-deploy; pg_dump snapshot step before migrations; admin-ui port default corrected from 3001 to 3010; Uptime Kuma added for ongoing monitoring.
**Addresses:** FEATURES.md "Deployment passes on first attempt"; RabbitMQ startup race; deploy silent success on crash-loop.
**Avoids:** Pitfall 3 (silent crash after health check), Pitfall 6 (port conflict), Pitfall 9 (RabbitMQ startup race).

### Phase 3: Product Bug Fixes

**Rationale:** Infrastructure is now stable and tests exist. Fix bugs in dependency order — quality-state DB migrations must precede UI changes; sandbox promotion fix must have integration test before touching.
**Delivers:** `skipped` state as distinct `quality_review_state` (entity, migration, service, controller, Admin UI); `failed` state persisted on chunk timeout in `bulkCheckQuality()`; sandbox promotion includes `contextNeed`/`contextReason`; file upload 50MB limit; `@IsPassword()` applied to reset/change DTOs.
**Addresses:** FEATURES.md table stakes: quality state correctness, sandbox promotion context gap, input validation gaps.
**Avoids:** Pitfall 7 (tests encoding broken behavior — bug fix precedes test writing for quality check); Pitfall 8 (sandbox context drop); Pitfall 2 (migration review discipline enforced here for `translation_values` column additions).
**Note:** ZIP import upsert refactor (Pitfall 1) is the highest-severity data risk — treat as P0 within this phase, done first.

### Phase 4: Endpoint Audit and Dead Code Removal

**Rationale:** Clean up after bugs are fixed to avoid accumulating more dead code. Running in parallel with Phase 3 creates rebase conflicts. Audit must complete before any deletion begins.
**Delivers:** Complete endpoint inventory (every route mapped to Admin UI, MCP tool, or public API consumer); duplicate `mark-expected` endpoint resolved; `quality_review_states` table presence verified/dropped if orphaned; partially-reverted features fully removed or finished.
**Addresses:** FEATURES.md "Endpoint audit" table stakes item.
**Avoids:** Pitfall 4 (removing MCP-consumed endpoints); Pitfall 12 (incomplete partial-revert cleanup); Anti-Pattern 3 from ARCHITECTURE.md.

### Phase 5: UI Polish

**Rationale:** UI-only changes with no service or DB impact. Safe to do last; quality `skipped` state fix must already be in production before the blue indicator can be rendered.
**Delivers:** Quality score filter in Admin UI; correct visual indicators for all quality states (`skipped` = blue, `failed` = red, `checked` = green, `pending` = gray); any translation page layout improvements.
**Addresses:** FEATURES.md differentiator: quality score filter.
**Avoids:** Pitfall 13 (breaking keyboard/inline-edit workflow — refactor one concern per PR).
**Depends on:** Phase 3 complete (quality state correctness in production).

### Phase Ordering Rationale

- Phase 1 before all others: tests are the prerequisite for safe changes everywhere else. Writing tests after bug fixes misses the regression-protection window.
- Phase 2 before Phase 3: cannot verify stage deploys are working until the pipeline is reliable. Deploy failures masking bug-fix regressions is a false economy.
- Phase 3 before Phase 4: removing "dead" code while bugs are being fixed in the same area creates rebase conflicts and makes rollbacks harder. The endpoint audit is a read-only investigation — it can start during Phase 3 but deletions must wait.
- Phase 3 internal order: ZIP import fix first (P0 data risk), then quality states (required by Phase 5), then sandbox promotion, then minor validators.
- Phase 5 last: no backend changes, purely cosmetic relative to earlier phases; depends on Phase 3 quality state fixes being deployed.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 3 (ZIP import fix):** The current transaction boundary, exact line range of `parseZip()`, and foreign key constraints on delete need careful tracing before writing the upsert migration. Read `translations.service.ts` lines 1100-1200 and the relevant migration files before planning this task.
- **Phase 4 (MCP tool cross-reference):** The MCP npm package source is external to this repo. Planning must locate the package source and map endpoint URLs before any deletion tasks can be scoped.

Phases with standard patterns (research-phase can be skipped):
- **Phase 1 (Test infrastructure):** Jest 29 + `@nestjs/testing` + Testcontainers is a well-documented, confirmed pattern. Sufficient detail in STACK.md to implement directly.
- **Phase 2 (Deploy hardening):** Docker Compose `condition: service_healthy`, `@nestjs/terminus`, and SSH health gate are all well-documented. No external research needed.
- **Phase 5 (UI polish):** Ant Design component behavior is established. No research needed; scope from Phase 3 outputs.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All tool versions confirmed via npm registry; ts-jest/Jest 30 incompatibility confirmed via official ts-jest discussion; @nestjs/terminus official docs |
| Features | HIGH | Feature list derived from direct codebase audit (CONCERNS.md, PROJECT.md); confirmed bugs are reproducible from code inspection, not speculation |
| Architecture | HIGH | Based entirely on direct codebase analysis (controllers, services, compose.yml, GitHub Actions workflow); no external sources required |
| Pitfalls | HIGH | Critical pitfalls sourced from direct code inspection (specific file + line references); moderate/minor pitfalls from combination of code audit and official framework documentation |

**Overall confidence:** HIGH

### Gaps to Address

- **pg_dump availability on VPS:** The migration safety plan calls for a `pg_dump` snapshot step in CI before running migrations on stage. This requires `postgres-client` to be installed on the VPS. Confirm during Phase 2 planning; if unavailable, fallback is a manual snapshot procedure documented in the deploy runbook.
- **MCP package source location:** Phase 4 endpoint audit requires cross-referencing routes against the MCP npm package source. The package is external to this repo. Identify the package name and source repository before scoping Phase 4 tasks.
- **RabbitMQ healthcheck adequacy:** The current `rabbitmq-diagnostics check_port_connectivity` healthcheck passes before exchange declarations are ready (Pitfall 9). The exact healthcheck command that waits for application-level readiness (not just TCP) needs validation against the current RabbitMQ 3-management version.

## Sources

### Primary (HIGH confidence)
- `.planning/codebase/CONCERNS.md` — known bugs, fragile areas, confirmed issues
- `.planning/codebase/ARCHITECTURE.md` — layer definitions, data flows
- `.planning/codebase/INTEGRATIONS.md` — CI/CD pipeline steps, RabbitMQ topology
- `.planning/PROJECT.md` — milestone requirements, active bugs, constraints
- `.github/workflows/build-and-stage.yml` — actual pipeline implementation (direct read)
- `compose.yml` — Docker Compose configuration (direct read)
- TypeORM official docs (synchronize: false, migrations) — https://typeorm.io/docs/migrations/setup/
- NestJS terminus official docs — https://docs.nestjs.com/recipes/terminus
- Docker Compose startup order official docs — https://docs.docker.com/compose/how-tos/startup-order/

### Secondary (MEDIUM confidence)
- ts-jest / Jest 30 compatibility thread — https://github.com/kulshekhar/ts-jest/discussions/4625
- NestJS Testcontainers integration guide (blockydevs) — https://www.blockydevs.com/blog/nestjs-integration-testing-with-testcontainers
- TypeORM DROP COLUMN issue — https://github.com/typeorm/typeorm/issues/3357
- RabbitMQ Docker healthcheck thread — https://github.com/docker-library/rabbitmq/issues/326
- NestJS over-mocking anti-pattern — https://trilon.io/blog/advanced-testing-strategies-with-mocks-in-nestjs
- Zero-downtime Docker Compose VPS deploy — https://dev.to/thayto/zero-downtime-deployment-with-docker-compose-in-an-oci-vps-using-github-actions-1fbd

### Tertiary (LOW confidence)
- Community CI health gate patterns (not from official GitHub Actions docs) — SSH health poll post-deploy

---
*Research completed: 2026-04-02*
*Ready for roadmap: yes*
