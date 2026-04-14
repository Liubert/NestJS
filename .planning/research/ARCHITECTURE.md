# Architecture Patterns — Stabilization Research

**Project:** TMS Stabilization
**Researched:** 2026-04-02
**Dimension:** Architecture — test layers, CI/CD, endpoint audit, cleanup patterns

---

## Recommended Architecture for Stabilization Work

Stabilization maps onto three parallel architectural concerns:

1. **Test architecture** — what layer to test at, what to mock, execution order
2. **CI/CD pipeline** — where deploy failures originate and how to harden the pipeline
3. **Cleanup boundaries** — which components are safe to touch and in what order

---

## Component Boundaries

### Backend Component Map

| Component | Responsibility | Layer | Communicates With |
|-----------|---------------|-------|-------------------|
| `AuthModule` | JWT issuance, MCP tokens, password reset | Controller → Service → DB | UsersModule |
| `TranslationsModule` (core) | Project/namespace/key/locale CRUD | Controller → Service → DB | AuthModule (guards), WebhooksModule |
| `TranslationsModule` (sandbox) | Staging area, promote, revert | SandboxService → DB | TranslationsService |
| `TranslationsModule` (AI) | Translate, quality check, usage log | AiTranslateService → Gemini | QualityQueueService |
| `TranslationsModule` (worker) | Async quality batch processing | QualityWorkerService → RabbitMQ → DB | AiTranslateService |
| `FilesModule` | S3 presign, file record tracking | Controller → Service → S3 | UsersModule (avatars) |
| `WebhooksModule` | Event delivery, batch + retry | WebhooksService → external URLs | TranslationsModule (events) |
| `McpPromptsModule` | Prompt template management | Controller → Service → DB | — |
| `AppController` | Health check (`GET /health`) | Controller only | — |
| Admin UI | React SPA — translation browsing/editing | Axios → API | All API endpoints |

### What to Test at What Level

**Unit tests (mock dependencies):**
- `AuthService` — login, forgotPassword, resetPassword, JWT generation. These are pure logic paths with clear inputs/outputs. Mock: `userRepo`, `resetTokenRepo`, `jwtService`.
- `TranslationsService` — access control logic (`assertAccess`), key upsert logic, member management. Mock: all repositories.
- `AiTranslateService` — quality level calculation, token estimation, prompt interpolation. Mock: Gemini SDK client.
- `QualityWorkerService` — batch orchestration, state transitions (processing → checked → failed). Mock: `valueRepo`, `sandboxValueRepo`, `AiTranslateService`.
- `quality-constants.ts` — score-to-level mapping logic. No mocks needed.

**Integration tests (real DB, mock external APIs):**
- `SandboxService` — promote, revert, diff calculation. Requires real DB due to multi-table transactions. Mock: Gemini.
- `importFromZip` flow — ZIP parse → key delete → insert inside transaction. Requires real DB to verify rollback on failure.
- Access control paths — member vs owner vs admin across `TranslationsService` and `SandboxService`. Both implement access check independently; integration tests will surface divergence.
- Quality review state transitions — `not_checked → queued → processing → checked/failed/expected`. Requires real DB row states.

**E2E tests (full app bootstrap + Supertest):**
- Authentication flows — login, forgot-password (raw token response), reset with token, `mustChangePassword` enforcement.
- Public Locize-compatible endpoints — `GET /:projectSlug/:namespace/:locale` without JWT.
- Critical regression workflows: create project → add namespace → add entries → check quality → promote sandbox. One end-to-end path catches the most integration surface area.
- Role enforcement — ADMIN bypasses project checks; USER without membership gets 403.

### Boundary Rule: Where Bugs Hide by Data Flow Stage

The current architecture has three stages where bugs accumulate:

**Stage 1 — Input validation (HTTP boundary):**
Global `ValidationPipe` + class-validator DTOs catch malformed requests. Bugs here: missing validators (password strength), unchecked `@IsIn()` on enums, missing `@IsOptional()`. These are the cheapest to fix and test.

**Stage 2 — Business logic (service layer):**
State machines (quality review states), access control (`assertAccess` vs `isAdmin`), sandbox promotion logic. Bugs here are the hardest to reproduce without real DB state. This is where the "skipped = score 100, blue indicator" bug lives — the `qualityReviewState` flow exists in code but the UI cannot represent it as a distinct state.

**Stage 3 — Persistence (TypeORM → PostgreSQL):**
N+1 patterns, missing indexes, ZIP import transaction scope, quality worker per-row updates. These bugs manifest at scale, not at low load. For this stabilization milestone the system is low-load (~3-4 projects, ~3-4K keys), so persistence bugs are monitoring targets, not immediate fixes.

**Stage 4 — Async (RabbitMQ → worker):**
Chunk timeout silent skips, DLQ silent failures, retry queue expiry. These bugs are invisible without logs. The silent-skip pattern in `bulkCheckQuality()` (`continue` on timeout, no logging) is the single highest-risk silent failure in the codebase.

---

## Data Flow

### Authentication Flow (tested path)

```
POST /auth/login
  → ValidationPipe (LoginDto)
  → AuthService.login()
  → userRepo.findOne({ email })
  → bcrypt.compare(password, passwordHash)
  → jwtService.sign(payload)
  → response: { accessToken, user }
```

Bug surface: `select: false` on `passwordHash` means `findOne()` must use `findByIdWithSensitiveData()` on the login path — if the wrong `findOne` is called, bcrypt compare gets `undefined`. Any refactor of user queries risks this.

### Quality Check State Machine (bug lives here)

```
translation_values.quality_review_state transitions:
  null           → not yet touched
  'not_checked'  → default after key creation
  'queued'       → queued to RabbitMQ
  'processing'   → worker picked up the batch
  'checked'      → Gemini returned result
  'failed'       → worker error after 3 attempts
  'expected'     → user manually marked as accepted
```

**The skip bug:** There is no `'skipped'` state. When a user wants to skip quality checking (e.g. brand names, proper nouns), the current workaround is to mark as `'expected'`, which collapses "skipped" and "manually accepted" into a single state. The fix is a distinct state with `score=100` and a blue UI indicator — the UI cannot distinguish this from a real quality pass.

### Sandbox/Production Duality (data flow)

```
SandboxValueEntity (user edits)
  → diff against ProductionSnapshotEntity
  → delta applied to TranslationValueEntity (production)
  → ProductionSnapshotEntity updated
  → SandboxValueEntity cleared
```

Known gap: `translation_keys.context`, `contextNeed`, `contextReason` are NOT migrated during promotion. Sandbox edits to these key-level fields are lost. Any test of sandbox promotion must verify these fields explicitly.

### CI/CD Pipeline (where deploys fail)

```
push to develop
  → GitHub Actions: build job
      → docker build --target prod (API image, ~500MB)
      → docker build --target admin-ui (nginx + React SPA)
      → push both to GHCR with sha tag
  → GitHub Actions: deploy-stage job
      → scp compose.yml to VPS
      → SSH: docker compose pull (API + admin-ui + migrate)
      → SSH: docker compose run --rm migrate
      → SSH: docker compose up -d --no-build api admin-ui
      → health poll: GET /health, 36 attempts × 5s = 3 min max
      → if 200: pass; else: print api logs, exit 1
```

**Known failure modes and their pipeline stage:**

| Failure | Stage | Root Cause | Detection Point |
|---------|-------|------------|-----------------|
| Postgres healthcheck timeout | migrate step | Postgres container slow start | `docker compose run --rm migrate` exits non-zero |
| RabbitMQ ECONNREFUSED | `up -d` | RabbitMQ not ready when API starts | API logs: AMQP connection error; health poll fails |
| SSH timeout during docker pull | pull step | Large images (~500MB) over slow VPS network | Action times out at 30m limit |
| Server OOM | `up -d` | Multiple services competing on 1-2 GB VPS | API container exits; health poll returns 000 |
| Migration error on new column | migrate step | TypeORM migration throws | Exit code non-zero from migrate run |

**Current pipeline strengths:**
- Immutable image tags (`sha-<commit>`) prevent "which version am I running" ambiguity
- Release manifest artifact (`release-manifest.json`) captures image refs + digests per deploy
- Migrations run as a separate `docker compose run --rm migrate` step before `up -d` — migrations never run inside the API container at startup
- Health poll with log dump on failure gives actionable output when deploy fails
- PR checks workflow validates lint + unit tests + Docker build before merge

**Current pipeline weaknesses:**
- No retry on `docker compose pull` — one slow pull fails the whole deploy
- Health poll only hits `GET /health` — doesn't verify database connectivity or RabbitMQ is alive
- `script_stop: true` means first failed SSH command kills the entire deploy step without partial cleanup
- No rollback step — if deploy fails after `up -d`, old containers are gone, new containers are broken
- Admin UI image is rebuilt from scratch on every commit (no layer cache optimization in GHCR context)

---

## Patterns to Follow

### Pattern 1: Test Isolation by Layer

Test services in isolation using the `@nestjs/testing` `Test.createTestingModule()` pattern. Mock TypeORM repositories with plain Jest objects — never use the real DataSource in unit tests.

```typescript
// src/modules/auth/auth.service.spec.ts
const mockUserRepo = {
  findOne: jest.fn(),
  save: jest.fn(),
};

const module = await Test.createTestingModule({
  providers: [
    AuthService,
    { provide: getRepositoryToken(UserEntity), useValue: mockUserRepo },
    { provide: JwtService, useValue: { sign: jest.fn().mockReturnValue('token') } },
  ],
}).compile();
```

For integration tests, use a real test PostgreSQL database (separate DB from dev, same schema, cleared between test runs with `beforeEach` truncation or transactions).

### Pattern 2: Endpoint Audit via Controller Scan

The audit methodology for finding orphaned endpoints:

1. Extract all routes from controllers (`translations.controller.ts`, `sandbox.controller.ts`, `auth.controller.ts`, `users.controller.ts`, `files.controller.ts`, `webhooks.controller.ts`, `mcp-prompts.controller.ts`, `ai-config.controller.ts`, `mcp-tokens.controller.ts`).
2. For each route, check three consumers: Admin UI (`admin-ui/src/api/client.ts`, page components), MCP tools (npm package), external callers (public Locize-compatible endpoints).
3. Routes with no consumer in any of the three are orphan candidates.
4. Orphan candidates require judgment: unfinished features (remove or finish), partially-reverted features (finish revert or complete implementation), intentional but unused (document why they exist).

The duplicate `mark-expected` endpoint is a known example: it appears in both `translations.controller.ts` (lines 526, 551) and `sandbox.controller.ts` (lines 285, 306). One of these is the orphan.

### Pattern 3: Safe Cleanup Sequence

For partially-reverted features, the safe sequence is:

1. Identify the incomplete boundary: what was reverted vs what remains.
2. Find all DB schema elements (columns, tables, constraints) related to the feature.
3. Find all TypeScript types, entities, DTOs, and service methods.
4. Find all UI components that reference the feature.
5. Remove in order: UI first, then controller routes, then service methods, then DTO types, then entity columns, then migrations (add a drop migration if column still in DB).
6. Verify with `npm run lint:check` + `npm test` after each layer removed.

Never remove a DB column without a migration. Never remove a service method before removing its controller route.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Testing Against Production DB

Using the same PostgreSQL instance for tests as for dev will corrupt dev data and produce flaky tests that depend on seeded state. Always use a separate test database, separate Docker service, or in-memory SQLite for unit-level persistence tests.

### Anti-Pattern 2: Testing Controllers Directly for Business Logic

The controller layer in this codebase is thin (route definitions, guard application, DTO binding). Testing controllers directly tests NestJS's own DI, not your logic. Test services. Only E2E tests should exercise controllers.

### Anti-Pattern 3: Removing Code Without Verifying All Consumers

The Admin UI and the MCP npm package are separate consumers of the API. Deleting an endpoint that appears unused in the Admin UI may break the MCP module if it calls the same route. Always check both before declaring an endpoint dead.

### Anti-Pattern 4: Fixing Bugs Inside Transactions

`importFromZip()` currently runs ZIP parsing inside a transaction, which holds row locks during slow I/O. Adding more logic inside that transaction (e.g., quality check triggers on import) makes this worse. The fix pattern is to extract parsing outside the transaction boundary, then commit data in a single fast transaction.

### Anti-Pattern 5: Adding E2E Tests That Require External APIs

Quality check E2E tests that call the real Gemini API are fragile (rate limits, cost, latency). Use Jest's module mock to replace `AiTranslateService` at the service level in E2E tests. The real Gemini integration is tested manually or via a dedicated integration test that's excluded from normal CI.

---

## Stabilization Build Order

The dependency graph for stabilization work dictates this sequence. Each phase unblocks the next.

### Phase 1: Test Infrastructure (prerequisite for everything else)

Set up the test scaffold before fixing anything. Reason: fixes without tests just move bugs around.

**What belongs here:**
- Jest configuration for unit tests (already in `package.json`, just needs first `.spec.ts` files)
- Test database setup (separate Postgres, or mock repositories)
- First smoke test: auth service login path (verifies test infrastructure works end to end)
- PR checks already run `npm test --passWithNoTests` — adding first real tests immediately provides regression protection

**Component boundary:** Only `src/common/` utilities and `AuthService` in Phase 1. These have the fewest dependencies and prove out the test pattern before touching the complex `TranslationsService`.

### Phase 2: CI/CD Pipeline Hardening (unblocks reliable deploys)

Deploys fail frequently. Until deploys are reliable, every bug fix is hard to verify in stage. Fix the pipeline before fixing product bugs.

**What belongs here:**
- Docker pull retry or timeout tuning for large images
- Health check endpoint that verifies DB and RabbitMQ connectivity (not just HTTP 200)
- Rollback step or at minimum a "previous image ref" artifact for fast manual rollback
- Smoke test expansion: verify `/translations/:slug/:ns/:locale` returns 200 after deploy (catches migration failures that don't surface as startup errors)

**Depends on:** Phase 1 (health check test should be covered by E2E test)

### Phase 3: Bug Fixes (the actual product bugs)

Once tests exist and deploys are reliable, fix known bugs in priority order.

**Dependency order within Phase 3:**

1. Quality Check skip bug — `'skipped'` state in `quality_review_state`. Touches: entity, migration, service methods, controller, Admin UI. The DB migration must be deployed before the UI change. Sequence: migration → service → controller → UI.
2. Silent timeout in `bulkCheckQuality()` — add logging + mark affected keys as `'failed'`. Self-contained in `ai-translate.service.ts`.
3. `importFromZip()` transaction scope — move ZIP parsing outside transaction. High risk area (CONCERNS.md: "ZIP Import Transaction Spans File Parsing"). Needs integration test before touching.
4. Sandbox promotion context gap — `contextNeed`/`contextReason` not promoted with values. Touches `sandbox.service.ts` and requires a focused integration test.

### Phase 4: Endpoint Audit and Dead Code Removal

Clean up after fixing bugs to avoid accumulating more dead code.

**What belongs here:**
- Systematic controller scan (described in Pattern 2 above)
- Identify duplicate `mark-expected` endpoint, remove the orphan
- Check `quality_review_states` table: it appears in INTEGRATIONS.md as a table but is not in the entity list — verify if it's a separate table or if the column lives on `translation_values`. If it's a leftover table from an earlier design, add a migration to drop it.
- Verify `FilesModule` consumer coverage: `GET /files/presign` and `POST /files/complete` are S3 upload endpoints — check if Admin UI actually uses S3 upload or if this is unused for user avatars.

**Must not** run in parallel with Phase 3. Removing dead code while bugs are being fixed in the same area creates rebase conflicts and makes rollbacks harder.

### Phase 5: UI Polish (final, no backend changes)

UI-only changes with no service or DB impact. Safe to do last because they don't affect backend stability.

**Depends on:** Phase 3 (quality check skip fix must be in production before UI renders the `'skipped'` state with blue indicator)

---

## Scalability Considerations (Low Priority for This Milestone)

At current scale (3-4 projects × 3-4K keys, internal use), none of these are blocking. Documented for awareness.

| Concern | At current scale | At 100 projects | Mitigation path |
|---------|-----------------|-----------------|-----------------|
| N+1 in `upsertValues()` | Acceptable (100-1000 queries, fast) | Slow on bulk import | Batch upsert |
| QualityWorker per-row updates | Acceptable (500 queries for 100 keys) | Slow | Bulk UPDATE |
| RabbitMQ single queue, prefetch=2 | Fine for 1-2 concurrent checks | Backlog at 20+ projects | Increase prefetch, partition per project |
| Missing DB indexes on `namespace_id`, `key_id` | Fast at 3-4K keys | Slow at 100K keys | Add indexes in migration |

---

## Sources

- `.planning/codebase/ARCHITECTURE.md` — Layer definitions, data flows, error handling patterns
- `.planning/codebase/CONCERNS.md` — Known bugs, tech debt, fragile areas
- `.planning/codebase/TESTING.md` — Existing test infrastructure, framework versions, coverage gaps
- `.planning/codebase/INTEGRATIONS.md` — CI/CD pipeline details, RabbitMQ topology, external services
- `.planning/codebase/STRUCTURE.md` — Directory layout, file locations, naming conventions
- `.planning/PROJECT.md` — Milestone requirements, active bugs, constraints
- `.github/workflows/build-and-stage.yml` — Actual pipeline steps (direct read)
- `.github/workflows/pr-checks.yml` — PR quality gate (direct read)
- `CLAUDE.md` — Known deployment failure modes, dev workflow rules

---

*Architecture research: 2026-04-02*
*Confidence: HIGH — based on direct codebase analysis, no external sources required*
