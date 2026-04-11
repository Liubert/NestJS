# Phase 1: Test Infrastructure - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Set up a working test scaffold that catches real regressions before they reach stage. Downgrade Jest to 29.7.0 + ts-jest 29.4.9 for version compatibility. Add Testcontainers for real PostgreSQL in integration tests. Write minimal integration tests for translations CRUD to prove the scaffold works.

</domain>

<decisions>
## Implementation Decisions

### Test scope
- **D-01:** Minimal scaffold — 1-2 integration tests (create translation entry + get entries) to prove the infrastructure works
- **D-02:** Focus is on getting Testcontainers + Jest 29 + TypeORM migrations running, not broad coverage

### Test level
- **D-03:** HTTP/E2E level via supertest — tests go through the full NestJS stack (guards, pipes, validation, DB)
- **D-04:** No service-level tests in this phase

### Fixture/seeding strategy
- **D-05:** Inline in test — `beforeAll` creates project, namespace, locale, and test user via HTTP endpoints
- **D-06:** Auth via real `POST /auth/login` to obtain JWT token — no guard mocking

### CI integration
- **D-07:** Tests run locally only in this phase — CI integration deferred to Phase 2 (Deploy Hardening)

### Cleanup
- **D-08:** Delete existing `test/app.e2e-spec.ts` boilerplate — it tests nonexistent "Hello World" endpoint

### Jest version
- **D-09:** Downgrade Jest 30.0.0 → 29.7.0 and ts-jest 29.2.5 → 29.4.9 per requirement TEST-01
- **D-10:** Update `@types/jest` to match Jest 29

### Claude's Discretion
- Test file organization (co-located in src/ vs separate test/ directory)
- Testcontainers configuration details (PostgreSQL version, container lifecycle)
- RabbitMQ handling in tests (mock, skip, or use Testcontainers)
- TypeORM migration strategy in test setup
- Exact test assertions and error scenarios

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Test configuration
- `package.json` §jest (lines 91-107) — Current Jest config, transform settings, test patterns
- `test/jest-e2e.json` — E2E test configuration (to be updated or replaced)
- `test/app.e2e-spec.ts` — Existing boilerplate test (to be deleted)

### Testing analysis
- `.planning/codebase/TESTING.md` — Full analysis of current test state, patterns, dependencies

### Database & ORM
- `src/config/app.config.ts` — TypeORM DataSource config, migration paths, naming strategy
- `src/modules/translations/translations.controller.ts` — Endpoints to test (CRUD routes)
- `src/modules/translations/translations.service.ts` — Business logic behind translation CRUD
- `src/modules/auth/auth.controller.ts` — Login endpoint used for test auth

### Requirements
- `.planning/REQUIREMENTS.md` §TEST-01, §TEST-02 — Jest downgrade and Testcontainers requirements

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `@nestjs/testing` (v11.0.1): Test.createTestingModule() for bootstrapping test app
- `supertest` (v7.0.0): HTTP assertions already installed
- TypeORM migrations in `src/migrations/`: Can run against Testcontainers PostgreSQL

### Established Patterns
- NestJS module system: AppModule imports all feature modules — can be used as-is for integration tests
- JWT auth: `POST /auth/login` returns access_token — reusable for authenticated test requests
- ValidationPipe globally applied in `src/main.ts` — needs to be replicated in test bootstrap

### Integration Points
- Testcontainers PostgreSQL replaces the dev Docker PostgreSQL for test isolation
- RabbitMQ dependency in AppModule may need handling (mock or conditional import)
- TypeORM `synchronize` or migrations needed to set up schema in test container

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-test-infrastructure*
*Context gathered: 2026-04-02*
