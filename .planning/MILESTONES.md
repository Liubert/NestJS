# Milestones

## v1.0 TMS Stabilization (Shipped: 2026-04-02)

**Phases completed:** 5 phases, 11 plans, 20 tasks

**Key accomplishments:**

- Jest 29.7.0 + Testcontainers PostgreSQL with 2 passing integration tests covering translation CRUD and public endpoint serving
- Terminus-based /health endpoint checking PostgreSQL and RabbitMQ with Docker Compose api service healthcheck using wget
- CI deploy now verifies API /health (3 min timeout, 36 retries) and admin-ui HTTP 200, dumping all-service logs and docker compose ps on any failure before exiting 1
- 'skipped' quality state added to entity types, bulkCheckQuality, worker, backfill, and Admin UI with blue dot indicator
- Sandbox context fields (context, contextNeed, contextReason) now staged per sandbox_values row and promoted atomically to translation_keys — production no longer leaks sandbox edits
- Complete audit of 77 backend routes across 10 controllers mapped to Admin UI, MCP, and public API consumers — 4 orphans and 2 flagged partial features identified
- 4 confirmed orphan endpoints deleted and security gap fixed: POST /translations/import now requires JWT auth
- Dead methods (presignUpload, completeUpload) and their DTOs stripped from FilesService; FileVisibility enum relocated to entity; ENDPOINT-INVENTORY.md corrected to document FilesModule as a live UsersService dependency.
- TranslationsPage.tsx (2609 lines) split into 6 focused components in components/ subfolder — pure structural refactor, zero visual or behavioral changes
- Quality badges now show colored dot + inline score/label text (12px) at a glance, and locale columns truncate with tooltip — table fits 1280px for 4 locales
- Review-state filter and quality-score sort added to FilterBar with backend DTO support for reviewState param and 'expected' qualityLevel fix

---
