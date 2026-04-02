# Requirements: TMS Stabilization

**Defined:** 2026-04-02
**Core Value:** Translations are reliably stored, served, and editable — teams can use the system daily without workarounds or broken workflows.

## v1 Requirements

Requirements for stabilization milestone. Each maps to roadmap phases.

### Deploy Stability

- [x] **DEPLOY-01**: All Docker Compose services have healthchecks (API, Postgres, RabbitMQ)
- [x] **DEPLOY-02**: API exposes `/health` endpoint via @nestjs/terminus checking DB and RabbitMQ connectivity
- [x] **DEPLOY-03**: CI pipeline verifies service health after deploy before reporting success
- [ ] **DEPLOY-04**: Uptime Kuma monitors all services with alerts on downtime (port 3011)

### Test Coverage

- [x] **TEST-01**: Jest downgraded to 29.7.0 with ts-jest 29.4.9 for stable test infrastructure
- [x] **TEST-02**: Integration tests for translations CRUD with real PostgreSQL via Testcontainers

### Bug Fixes

- [x] **BUG-01**: Quality Check "skipped" is a distinct state — score=100, blue indicator, "skipped" status in UI
- [x] **BUG-02**: Quality Check "failed" state persisted in DB — enables retry workflows and DLQ visibility
- [ ] **BUG-03**: Sandbox promote migrates key-level fields (contextNeed, contextReason, context) alongside translation values

### Dead Code Cleanup

- [ ] **CLEAN-01**: Every API endpoint mapped to its consumer (MCP module, Admin UI, or public API)
- [ ] **CLEAN-02**: Confirmed orphaned endpoints removed with commit message explaining why

### UI Polish

- [ ] **UI-01**: Quality state indicators color-coded (green=checked, blue=skipped, red=failed, gray=pending)
- [ ] **UI-02**: Translations page readability improved (layout, spacing, typography)
- [ ] **UI-03**: Translations filterable/sortable by quality score

## v2 Requirements

Deferred to future milestone. Tracked but not in current roadmap.

### Test Coverage

- **TEST-03**: Auth service unit tests
- **TEST-04**: E2E tests on public translation endpoints
- **TEST-05**: Quality worker unit tests

### Deploy Stability

- **DEPLOY-05**: pg_dump backup before migrations in CI
- **DEPLOY-06**: Docker pull retry in CI pipeline

### Bug Fixes

- **BUG-04**: ZIP import safety — upsert instead of delete-then-insert to prevent data loss

### Dead Code Cleanup

- **CLEAN-03**: Automated route coverage tracking

### UI Polish

- **UI-04**: Keyboard shortcuts for common translation actions

## Out of Scope

| Feature | Reason |
|---------|--------|
| New features (new endpoints, new MCP tools) | Stabilization milestone only |
| OAuth / SSO integration | Email/password + MCP tokens sufficient for internal use |
| Full test coverage (100%) | Base coverage for regressions, not exhaustive |
| Prometheus + Grafana monitoring | Too heavy for single-VPS internal tool; Uptime Kuma covers needs |
| Vitest migration | NestJS decorator metadata issues; Jest is working |
| Mobile app | Web-first internal tool |
| Multi-tenancy | 3-4 internal projects, no external customers |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| TEST-01 | Phase 1 | Complete |
| TEST-02 | Phase 1 | Complete |
| DEPLOY-01 | Phase 2 | Complete |
| DEPLOY-02 | Phase 2 | Complete |
| DEPLOY-03 | Phase 2 | Complete |
| DEPLOY-04 | Phase 2 | Pending |
| BUG-01 | Phase 3 | Complete |
| BUG-02 | Phase 3 | Complete |
| BUG-03 | Phase 3 | Pending |
| CLEAN-01 | Phase 4 | Pending |
| CLEAN-02 | Phase 4 | Pending |
| UI-01 | Phase 5 | Pending |
| UI-02 | Phase 5 | Pending |
| UI-03 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 14 total
- Mapped to phases: 14
- Unmapped: 0

---
*Requirements defined: 2026-04-02*
*Last updated: 2026-04-02 after roadmap creation*
