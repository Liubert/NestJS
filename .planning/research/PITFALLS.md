# Domain Pitfalls: NestJS TMS Stabilization

**Domain:** Internal Translation Management Service (NestJS + Docker Compose + React admin UI)
**Researched:** 2026-04-02
**Scope:** Stabilization milestone — deploy pipeline, test coverage, dead code cleanup, DB migrations, UI refactoring

---

## Critical Pitfalls

Mistakes that cause data loss, deploy failures, or force a rewrite.

---

### Pitfall 1: ZIP Import Data Loss on Failed Reimport

**What goes wrong:** `importFromZip()` deletes all existing keys in a namespace before reimporting (line 1163 of `translations.service.ts`). If the ZIP is malformed or parsing fails mid-import, the namespace is left empty. The transaction wraps both the delete and the insert, but the delete runs first and orphaned translation values can survive if the transaction does not roll back cleanly.

**Why it happens:** The function uses delete-then-insert instead of upsert. The ZIP is parsed inside the transaction, meaning a parse error at key #800 of 1000 has already deleted all 1000 original keys.

**Consequences:** Silent permanent data loss. Teams lose translations with no recovery path except re-uploading a manual export. This is the highest-severity data risk in the codebase.

**Prevention:**
- Move `parseZip()` outside the transaction. Validate and build the full in-memory data structure first.
- Only open the transaction once parsing succeeds.
- Use upsert instead of delete+insert so existing keys survive a partial failure.
- Add ZIP structure validation before the transaction begins.

**Detection:** No error thrown — the endpoint returns success. Monitor row counts before/after import. Add an integration test that feeds a malformed ZIP and verifies the original keys survive.

**Phase:** Address in the bug-fix phase before any test coverage work — this is a data integrity risk that should not be left while adding other tests.

---

### Pitfall 2: TypeORM Migration Run During Deploy Drops Columns Instead of Altering Them

**What goes wrong:** TypeORM's migration generator sometimes emits `DROP COLUMN` + `ADD COLUMN` instead of `ALTER COLUMN` when a column type changes (known issue: typeorm/typeorm#3357). Running that migration in production without review drops the data in those columns.

**Why it happens:** Auto-generated migrations are not manually reviewed before committing. The `migrate` service in `compose.yml` runs `npm run migration:run:prod` automatically on every deploy — a migration that looks correct locally can silently destroy production data on the first deploy.

**Consequences:** Column data permanently deleted in production. Affects any migration that changes a column type (e.g., adding `qualityNeed` enum, expanding `contextNeed` values).

**Prevention:**
- Never commit an auto-generated migration without manual review of every `ALTER`/`DROP` statement.
- Test migrations against a staging DB with real production-like data before merging to `develop`.
- For enum changes, write the migration by hand: add the new value first, backfill, then remove old values.
- Keep `synchronize: false` in all environments (already the case — do not regress this).

**Detection:** Review every migration file in `git diff --cached` before committing. If the file contains `DROP COLUMN` for a column that has data, it must be rewritten.

**Phase:** Migration review discipline must be established before the quality-check persistence phase (which adds columns to `translation_values`).

---

### Pitfall 3: Deploy Pipeline Silently Succeeds Despite Service Crash

**What goes wrong:** The deploy script in `build-and-stage.yml` runs `docker compose up -d` and then polls the healthcheck endpoint for 3 minutes. If the API crashes after the health check passes (e.g., a RabbitMQ reconnect loop kills the process 90 seconds after startup), the deploy job exits 0 and the team believes the deploy succeeded.

**Why it happens:** The health check polls `/health` once per 5 seconds for 3 minutes and exits on first 200. It does not watch container state afterward. `restart: unless-stopped` will restart the container, but GitHub Actions has already exited.

**Consequences:** The team believes the deploy passed. The service is actually crashing and restarting repeatedly. Users see intermittent 502 errors with no alert.

**Prevention:**
- After the health check loop succeeds, add a final check: `docker compose ps` to verify no services are in `Restarting` state.
- Log container exit codes after the health poll completes.
- Keep `restart: unless-stopped` on the API but add a post-deploy verification step that catches restart loops.

**Detection:** Warning sign is a healthcheck that passes on attempt 1 but the service is intermittently unavailable minutes later. Check `docker compose ps` and `docker compose logs --tail=50 api` immediately after deploy.

**Phase:** Deploy pipeline stabilization phase.

---

### Pitfall 4: Removing "Dead" Code That Is Actually an MCP Tool Dependency

**What goes wrong:** An endpoint audit removes or renames an endpoint that appears unused by the admin UI and has no direct frontend callers. The endpoint is, however, called by the MCP module (published to NPM). The MCP package is installed in other projects and is now broken silently.

**Why it happens:** The MCP module is an NPM package consumed externally. There is no static import graph that connects the API routes to the MCP client calls. A search for callers inside this repository will find nothing, making the endpoint look orphaned.

**Consequences:** MCP tools fail for all AI agent consumers. The break is invisible until someone triggers a translation workflow via Claude or another agent. The fix requires a new NPM publish.

**Prevention:**
- Before removing any endpoint, cross-reference with the MCP tool definitions in the `mcp/` or relevant module. Map each endpoint to its callers: admin UI routes, MCP tool calls, and direct API usage by consumer projects.
- Build an explicit endpoint inventory (as a markdown table or comment) before deleting anything.
- Any endpoint removal must be accompanied by a search inside the MCP package source for that URL path.

**Detection:** Warning sign is an endpoint with no frontend route and no E2E test coverage. That does not mean it is unused — check MCP tool implementations first.

**Phase:** Endpoint audit phase. Do not begin removals until the inventory is complete.

---

### Pitfall 5: Over-Mocking Makes Tests Pass But Catch Nothing

**What goes wrong:** To get fast unit test coverage quickly, every dependency (TypeORM repository, Gemini service, RabbitMQ publisher) is mocked. The tests pass 100% of the time but only verify that mock functions were called with certain arguments. They do not catch regressions in the actual service logic, SQL query construction, or data transformations.

**Why it happens:** NestJS DI makes it easy to substitute any provider with a `jest.fn()` mock. With zero existing tests, the temptation is to mock everything to bootstrap coverage numbers quickly.

**Consequences:** Tests give a false sense of safety. A real regression in `importFromZip()` or sandbox promotion is not caught because the repository layer is mocked. Coverage numbers look good; the service is still broken.

**Prevention:**
- For auth and access control: unit tests with repository mocks are acceptable — these are pure logic branches.
- For translation operations (import, export, sandbox promotion, quality check): write integration tests against a real test database (PostgreSQL in Docker or SQLite for fast feedback). Mock only the external Gemini API and RabbitMQ.
- Define a testing budget before starting: which 10-15 scenarios are regression risks? Write one test per scenario, not one test per function.
- Do not target coverage percentage. Target scenario coverage (can a broken `importFromZip` still pass the test suite? If yes, the test is not useful).

**Detection:** If a test has more `jest.fn()` calls than assertions, it is likely testing mock configuration rather than behavior.

**Phase:** Test coverage phase. Establish scenario list before writing a single test.

---

## Moderate Pitfalls

---

### Pitfall 6: Admin UI Port Conflict in compose.yml

**What goes wrong:** The `admin-ui` service in `compose.yml` maps to `${ADMIN_UI_PORT:-3001}:80`. The default fallback is port 3001, which is reserved by another project on the same development machine and likely the same VPS. If `ADMIN_UI_PORT` is not set in `.env`, the container binds to 3001 and either fails to start or silently shadows the other project.

**Why it happens:** The default value in compose.yml was not updated after the port reservation was established. The project CLAUDE.md explicitly states port 3010 is the correct port for admin-ui.

**Consequences:** On stage, the admin UI may conflict with the other project. On local development, port 3001 is blocked. The correct port (3010) is used in practice only if `.env` explicitly sets it.

**Prevention:**
- Change the default in `compose.yml` from `3001` to `3010`: `"${ADMIN_UI_PORT:-3010}:80"`.
- Verify `.env` and `.env.example` set `ADMIN_UI_PORT=3010`.

**Detection:** Check `compose.yml` for the `admin-ui` port mapping. Warning sign: a deploy to stage where port 3010 is correctly used but the compose default is 3001 — a missing env var would silently switch to the wrong port.

**Phase:** Deploy pipeline stabilization phase (quick fix, low risk).

---

### Pitfall 7: Quality Check "Skipped" State Confusion in Tests and UI

**What goes wrong:** The existing quality check bug (skip = score 100, blue indicator) is a confirmed UI issue. When writing tests to cover quality check behavior, developers write assertions against the current (broken) behavior instead of the intended behavior. Fixing the bug later breaks those tests.

**Why it happens:** Tests written before the bug is fixed encode the broken behavior as expected. This is a common stabilization trap: "test what the code does, not what it should do."

**Consequences:** Fixing the actual skip-state bug requires rewriting the tests. The tests become a blocker instead of a safety net.

**Prevention:**
- Fix the quality check skip bug first, before writing quality-check-related tests.
- Document the intended behavior explicitly in test descriptions (not just `expect(score).toBe(100)` but `// skipped keys should have score=100 and status="skipped", not status="passed"`).

**Detection:** Warning sign: a test description that matches broken behavior (e.g., `it('should return score 100 for skipped items')`). Always ask: is this the intended behavior or the current (possibly broken) behavior?

**Phase:** Bug fix phase must precede test coverage phase for quality-check-related scenarios.

---

### Pitfall 8: Sandbox Promotion Silently Drops Context Changes

**What goes wrong:** `sandbox.service.ts` promotion logic moves `translation_values` from sandbox to production but does not update `translation_keys.context`, `contextNeed`, or `contextReason`. If a translator updated context in sandbox, promotion appears to succeed but the context change is lost.

**Why it happens:** The promotion was designed to move values only. Key-level fields were added later (the three-state `contextNeed` feature) without updating the promotion logic.

**Consequences:** Translators editing context in sandbox waste effort because their changes are silently dropped. There is no error, warning, or diff indicating what was lost.

**Prevention:**
- Add context field promotion to the sandbox promotion logic as part of the cleanup phase.
- Write a test that changes context in sandbox, promotes, and verifies context updated in production.

**Detection:** Warning sign: a PR that adds new key-level fields without updating `sandbox.service.ts` promotion logic. Code review checklist: "Does this new field need to be promoted from sandbox?"

**Phase:** Bug fix / cleanup phase.

---

### Pitfall 9: RabbitMQ Startup Race During Deploy

**What goes wrong:** After `docker compose up -d`, RabbitMQ can take 20-40 seconds to fully initialize (exchange declarations, queue binds). The healthcheck (`rabbitmq-diagnostics ping && check_port_connectivity`) passes before the management plugin and exchanges are ready. The API starts, connects to AMQP, but the quality queue exchange is not yet declared — the first quality check after a fresh deploy fails silently.

**Why it happens:** Port connectivity passes before RabbitMQ's internal exchange/queue topology is ready. The `compose.yml` healthcheck is adequate for basic TCP but may not wait for application-level readiness.

**Consequences:** First quality check job after deploy goes missing (no DLQ, no error log in the worker, silent drop). Users see their quality check never complete after a fresh deploy.

**Prevention:**
- Add 30-second startup buffer for RabbitMQ in the deploy script, or verify exchange declaration in the healthcheck.
- The quality worker should log on startup when the queue subscription is established successfully.
- The DLQ needs monitoring so lost messages are visible, not silent.

**Detection:** Warning sign: quality check triggered within 60 seconds of deploy completes immediately with no result logged in the worker.

**Phase:** Deploy pipeline stabilization phase.

---

### Pitfall 10: Refactoring Access Control in One Place, Not Both

**What goes wrong:** Access control logic is duplicated between `TranslationsService.assertAccess()` and `SandboxService.isAdmin()` + owner check. A stabilization PR that fixes a bug in `assertAccess()` (e.g., correctly handling the admin bypass) does not update `SandboxService`, leaving a divergent security check.

**Why it happens:** Two files implement the same rule. Without a shared abstraction, a developer fixes the one they see and does not know to check the other.

**Consequences:** After the "fix," sandbox operations still use the old (broken) access logic. The regression is invisible because there are no integration tests for sandbox access control.

**Prevention:**
- Extract access control to a shared `ProjectAccessService` or guard before doing any security-related fixes.
- If that refactor is out of scope, add a comment to both locations: `// ALSO SEE: [other location] — keep in sync`.
- Add an access control integration test that covers both translation and sandbox endpoints.

**Detection:** Search for access control logic: `grep -r "assertAccess\|isAdmin\|owner" src/modules/translations/`. More than two files = duplication risk.

**Phase:** Cleanup / endpoint audit phase.

---

## Minor Pitfalls

---

### Pitfall 11: E2E Tests That Bootstrap Full AppModule Are Slow and Fragile

**What goes wrong:** The existing `app.e2e-spec.ts` bootstraps the full `AppModule` (including TypeORM, RabbitMQ, Gemini). Adding more E2E tests to this pattern creates a test suite that requires a live database and live RabbitMQ to run, takes 30+ seconds to start, and fails in CI if any external service is unavailable.

**Prevention:** Use `Test.createTestingModule()` with only the modules under test. Mock external providers at the module level. Keep full `AppModule` E2E tests to 2-3 critical smoke tests only.

**Phase:** Test coverage phase.

---

### Pitfall 12: Cleaning Up Partially-Reverted Features Without Tracing All Touch Points

**What goes wrong:** A feature was partially implemented and partially reverted. Code in services, DTOs, entities, and database migrations may all be in different states of revert. Removing the service-level code without also removing the migration, the entity column, and the DTO field leaves the DB schema and the code out of sync.

**Prevention:**
- For each partially-reverted feature: list all files touched (entity, DTO, service, controller, migration, test, UI component) before removing anything.
- Use `grep -r "[featureName]"` to find all references before deleting.
- If a migration added a column that is now unused, write a new migration to drop it rather than editing the old migration.

**Phase:** Cleanup / dead code phase.

---

### Pitfall 13: UI Polish That Breaks Keyboard/Workflow State

**What goes wrong:** Refactoring the translations page (table columns, filter layout, tag rendering) inadvertently removes focus management, resets page state on filter change, or changes the tab order in inline edit forms. Power users who rely on keyboard shortcuts or sequential editing lose their workflow.

**Prevention:**
- Before any UI refactor, document current interactions: which fields are editable inline, what triggers a save, what keyboard shortcuts exist.
- Refactor in small PRs. Each PR should touch one concern (column layout, filter state, tag rendering) — not all three at once.
- Do a manual smoke test of the full edit workflow after each PR.

**Phase:** UI polish phase.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Deploy pipeline | Silent crash after health check passes | Add `docker compose ps` restart-state check post-deploy |
| Deploy pipeline | admin-ui port defaults to 3001 | Fix compose.yml default to 3010 |
| Bug fix: skip state | Tests written before fix encode broken behavior | Fix bug first, then write tests |
| Bug fix: sandbox promotion | Context fields not promoted | Audit all key-level fields against promotion logic |
| Endpoint audit | Removing MCP-consumed endpoints | Cross-reference every candidate removal against MCP tool source |
| Endpoint audit | Cleaning partially-reverted features | Trace all touch points (entity, migration, DTO, UI) before deleting |
| Test coverage | Over-mocking produces fake green | Mock only external APIs; use real DB for core business logic tests |
| Test coverage | E2E tests too heavy | Limit full AppModule bootstraps; use module-scoped tests |
| Test coverage | Testing broken skip behavior | Fix quality check skip bug before writing quality check tests |
| DB migration | Auto-generated DROP COLUMN | Manual review of every migration before commit |
| Access control refactor | Fixing assertAccess but not SandboxService | Extract shared abstraction or add "keep in sync" comment |
| UI polish | Breaking keyboard/inline-edit workflow | Document current interactions; refactor in one-concern-per-PR |

---

## Sources

- TypeORM migration DROP COLUMN issue: [typeorm/typeorm#3357](https://github.com/typeorm/typeorm/issues/3357)
- TypeORM migration rollback guidance: [TypeORM Migrations Explained](https://peturgeorgievv.com/blog/typeorm-migrations-explained-example-with-nestjs-and-postgresql)
- Docker Compose startup order and healthcheck conditions: [Docker Compose Startup Order](https://docs.docker.com/compose/how-tos/startup-order/)
- NestJS RabbitMQ connection lifecycle issues: [NestJS RabbitMQ docs](https://docs.nestjs.com/microservices/rabbitmq), [issue #10687](https://github.com/nestjs/nest/issues/10687)
- NestJS over-mocking anti-pattern: [Trilon: Advanced Testing Strategies](https://trilon.io/blog/advanced-testing-strategies-with-mocks-in-nestjs)
- Dead code removal risks: [Finding dead code in Node.js](https://medium.com/@perbu/finding-dead-code-in-nodejs-projects-cd9ce927653)
- Codebase-specific issues: `.planning/codebase/CONCERNS.md` (2026-04-02 audit)
- Deploy pipeline: `.github/workflows/build-and-stage.yml` (inspected directly)
- Compose configuration: `compose.yml` (inspected directly)

---

*Pitfalls research: 2026-04-02*
