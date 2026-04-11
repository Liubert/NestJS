# Codebase Concerns

**Analysis Date:** 2026-04-02

## Tech Debt

### Incomplete Password Validation Implementation

**Area:** Authentication

- Issue: Password validator exists but is not applied to forgot-password and change-password flows
- Files: `src/common/validators/password.validator.ts`, `src/modules/auth/auth.service.ts`
- Impact: Users can set weak passwords (e.g., "x1") when resetting or changing passwords; no minimum requirements enforced beyond letter + number
- Fix approach: Apply `@IsPassword()` validator to `resetPassword()` and `changePassword()` DTOs; add password strength validation to password validation file

### Weak Token Estimation Logic

**Area:** AI Usage Tracking

- Issue: Token counts estimated as `Math.ceil(length / 4)` — crude approximation that doesn't match actual Gemini token consumption
- Files: `src/modules/translations/ai-translate.service.ts` (lines 72-73, 308-309)
- Impact: Inaccurate usage reporting and billing; could be off by 50%+ for certain content types
- Fix approach: Implement proper tokenization or request actual token counts from Gemini API response metadata

### Incomplete Feature Flag for Forgot Password

**Area:** Auth

- Issue: Forgot-password endpoint returns raw token in response (PHASE 1); production should send via email
- Files: `src/modules/auth/auth.service.ts` (lines 69-71)
- Impact: Manual token delivery is insecure; admin must copy/paste to user via separate channel; increases security risk
- Fix approach: Implement email integration and switch to email-based token delivery; remove raw token from response

### Missing Rate Limiting on Public Endpoints

**Area:** Performance & DoS Protection

- Issue: Public translation endpoints (`GET /translations/:projectSlug/...`) have no rate limiting or caching headers for production
- Files: `src/modules/translations/translations.controller.ts` (lines 92-129)
- Impact: Vulnerable to DoS attacks; repeated requests for large translation sets consume resources unnecessarily
- Fix approach: Add rate limiting middleware; implement Redis caching for public endpoints; add cache headers on responses

### No File Upload Size Limit

**Area:** Security & Resource Management

- Issue: ZIP file upload endpoint uses `FileInterceptor` without `limits` configuration; no max file size enforced
- Files: `src/modules/translations/translations.controller.ts` (line 133), `src/main.ts`
- Impact: Memory exhaustion from large file uploads; no protection against deliberately crafted ZIP bombs; could crash server
- Fix approach: Add `limits: { fileSize: 50 * 1024 * 1024 }` (50MB) to FileInterceptor; add validation in ZIP parse logic to reject oversized files

## Known Bugs

### ZIP Import Key Deletion Without Preservation

**Area:** Data Import

- Issue: `importFromZip()` deletes all existing keys in a namespace before reimporting (line 1163); if import fails after deletion, keys are lost
- Files: `src/modules/translations/translations.service.ts` (lines 1163-1177)
- Impact: Data loss if ZIP parsing fails partway through; orphaned translation values remain if transaction rolls back
- Trigger: Call `importFromZip()` with malformed ZIP structure mid-import
- Workaround: Always verify ZIP structure offline before import; re-upload original keys if needed
- Fix approach: Defer key deletion until after successful parsing; use upsert instead of delete+insert; add validation for ZIP structure before transaction

### Quality Check Timeout Silently Skips Chunks

**Area:** AI Quality Checking

- Issue: Chunk timeouts in `bulkCheckQuality()` are silently ignored with `continue` statement; no logging or partial result indication
- Files: `src/modules/translations/ai-translate.service.ts` (line 228)
- Impact: Users don't know which keys were skipped; quality state shows incomplete evaluation; misleading "checked" status for untested keys
- Trigger: Gemini API slow response (>90 seconds) on quality check request
- Workaround: Check logs manually; manually retrigger quality check for keys that appear unchecked
- Fix approach: Log chunk failures; mark affected keys as 'failed' instead of leaving them incomplete; implement exponential backoff on timeout

## Security Considerations

### SQL Injection Risk in Dynamic Query Building

**Area:** Query Construction

- Issue: Query WHERE clauses are dynamically built using string concatenation in `listSandboxEntries()`; though inputs are validated with `@IsIn()`, the pattern is fragile
- Files: `src/modules/translations/sandbox.service.ts` (lines 814-899), specifically lines 899, 938
- Impact: Low risk due to input validation, but future refactors could introduce vulnerability; maintenance hazard
- Current mitigation: `@IsIn()` validators on `sortBy`, `qualityLevel` ensure only safe values; string concatenation only for validated enums
- Recommendations: Refactor to use TypeORM query builder instead of raw SQL concatenation; add code comments documenting which parameters are pre-validated

### Admin User Creation Doesn't Force Password Change

**Area:** Admin User Management

- Issue: `adminCreate()` sets `mustChangePassword: true` (line 108) but allows login before password reset; no endpoint enforces change on first login
- Files: `src/modules/users/users.service.ts` (line 108), `src/modules/auth/auth.service.ts`
- Impact: Admin can create user with temporary password, but users can persist with it indefinitely; security control not enforced
- Current mitigation: `mustChangePassword` flag is returned in auth response; UI should enforce, but backend doesn't block
- Recommendations: Add middleware to block non-password-change endpoints when `mustChangePassword === true`; add test for this enforcement

### Context Data Not Validated

**Area:** Translation Context

- Issue: Translation key context field accepts arbitrary strings with no validation; stored directly from user input
- Files: `src/modules/translations/entities/translation-key.entity.ts` (context field)
- Impact: XSS possible if context rendered in frontend without sanitization; no length limit (could cause DB bloat)
- Current mitigation: Frontend likely escapes, but not verified
- Recommendations: Add `@MaxLength(500)` to context DTOs; add HTML escaping in admin-ui when rendering context; test XSS payloads

## Performance Bottlenecks

### N+1 Query Pattern in upsertValues

**Area:** Translation Value Updates

- Issue: `upsertValues()` fetches all project locales first, then iterates keys — creates separate query per key upsert
- Files: `src/modules/translations/translations.service.ts` (lines 1208-1244)
- Impact: Linear scaling with key count; for 1000 keys, ~1000 update queries instead of batched operation
- Cause: Uses `valueRepo.upsert()` one locale at a time instead of batching across all keys/locales
- Improvement path: Batch upsert across all (key, locale) combinations in single query; pre-load all locales once

### Quality Worker Updates One Key at a Time

**Area:** Quality Check Persistence

- Issue: `handleBatch()` updates translation_values individually per key×locale (lines 233, 252, 269)
- Files: `src/modules/translations/quality-worker.service.ts` (lines 223-277)
- Impact: For batch of 100 keys × 5 locales = 500+ separate UPDATE queries
- Cause: Loop-based single-row updates instead of batching
- Improvement path: Collect all updates into a single batch query or use bulk update mechanism

### Missing Database Indexes

**Area:** Query Performance

- Issue: No indexes on commonly queried fields like `translation_keys.namespace_id`, `translation_values.key_id`; only composite unique indexes exist
- Files: Entity definitions in `src/modules/translations/entities/`
- Impact: Sequential scans on large tables (100k+ keys); quality queries on line 907-941 in sandbox.service slower than needed
- Current indexes: Only composite unique indexes and `IDX_ai_usage_logs_project_created`
- Improvement path: Add indexes: `translation_keys(namespace_id)`, `translation_values(key_id, locale_id)`, `sandbox_values(project_id)`, `ai_usage_log(project_id)`

### Repeated Locale Lookups in Quality Worker

**Area:** Quality Check Data Loading

- Issue: `handleBatch()` iterates keyIds three times: mark as processing (line 44-52), load values (68-80), persist results (225-277) — each with separate queries
- Files: `src/modules/translations/quality-worker.service.ts`
- Impact: 3-4 database round trips per batch; could be 1-2 with better data loading strategy
- Improvement path: Combine all data loading into single transaction; cache locale→id map

## Fragile Areas

### ZIP Import Transaction Spans File Parsing

**Area:** Data Import

- Issue: Large ZIP parsing happens inside transaction in `importFromZip()` (line 1104); if parsing is slow, transaction locks tables
- Files: `src/modules/translations/translations.service.ts` (lines 1090-1204)
- Impact: Long-held row locks during ZIP parse; concurrent writes blocked; potential deadlock if parse is slow
- Why fragile: ZIP parsing order is: parse → get entries → build data structures → save (all in one transaction)
- Safe modification: Move `parseZip()` call outside transaction; validate/parse ZIP first, then execute single transaction to write data
- Test coverage: No test for transaction isolation; unknown if concurrent imports are possible

### Quality Queue Dead Letter Queue Silent Failures

**Area:** Async Quality Check Processing

- Issue: Messages in DLQ after 3 retries are never re-queued or alerted; no external monitoring of DLQ
- Files: `src/modules/translations/quality-queue.service.ts` (lines 197-214), `src/modules/translations/quality-worker.service.ts` (lines 185-186)
- Impact: Quality checks silently fail; keys stuck in "failed" state with no way to retry; no alerting mechanism
- Why fragile: DLQ publishing is one-way; no scheduled job to replay or notify
- Safe modification: Implement a scheduled job to check DLQ size; add alerting on DLQ entries; allow manual retry endpoint
- Test coverage: DLQ behavior not tested; unknown if messages actually reach DLQ

### Access Control Duplication

**Area:** Authorization

- Issue: Project access check logic is duplicated between `TranslationsService.assertAccess()` and `SandboxService.isAdmin()` + owner check
- Files: `src/modules/translations/translations.service.ts` (lines 145-173), `src/modules/translations/sandbox.service.ts` (lines 83-90, 343-345)
- Impact: Risk of divergent access control; changes to one not reflected in other; maintenance hazard
- Why fragile: Same pattern repeated; easy to forget to update both when rules change
- Safe modification: Extract access control logic to shared service; use consistent abstraction
- Test coverage: Access control tests likely incomplete; no end-to-end test of member access enforcement

### Sandbox Promotion Doesn't Cascade Context Updates

**Area:** Sandbox to Production Promotion

- Issue: When promoting sandbox values to production, translation_keys context/contextNeed/contextReason NOT updated; only translation_values move
- Files: `src/modules/translations/sandbox.service.ts` (lines 331-459)
- Impact: Promoted keys keep old context from production; if context was changed in sandbox, promotion loses the change
- Why fragile: Incomplete data migration; conceptual mismatch between what's being promoted
- Safe modification: Audit what key-level fields should move with promotion; add logic to update key context if changed in sandbox
- Test coverage: No test for context preservation during promotion

## Scaling Limits

### RabbitMQ Single Queue Bottleneck

**Area:** Async Quality Processing

- Issue: All quality checks for all projects share single RabbitMQ exchange/queue; prefetch=2 means only 2 batches processed concurrently
- Files: `src/modules/translations/quality-queue.service.ts` (line 27, PREFETCH = 2)
- Current capacity: ~2 batches in flight; if batch takes 30s, max throughput ~4 batches/min
- Limit: Where it breaks: With 1000+ projects doing quality checks, queue backs up; users wait hours for checks to complete
- Scaling path: Partition queue per project; increase prefetch based on available workers; implement batch prioritization; add more consumer instances

### Gemini API Rate Limits Not Handled

**Area:** AI Translation

- Issue: No rate limiting or exponential backoff when hitting Gemini API quotas; requests fail immediately
- Files: `src/modules/translations/ai-translate.service.ts` (lines 49-55, 120-125, 218-230)
- Current capacity: Depends on Gemini quota; unknown if quota is per-second or per-day
- Limit: Hits quota, `BadGatewayException` returned; no queue/retry
- Scaling path: Implement request queue with exponential backoff; track API usage per project; implement quota pooling across projects

### Memory Usage on Large ZIP Import

**Area:** File Upload & Processing

- Issue: Entire ZIP file loaded into memory via `AdmZip(buffer)`; ZIP uncompressed in memory before saving to DB
- Files: `src/modules/translations/translations.service.ts` (line 1519)
- Current capacity: ~500MB ZIP safely; depends on available heap
- Limit: Server OOM with multi-GB ZIP; no progress streaming
- Scaling path: Implement streaming ZIP parser; save entries to temp file; process in chunks

## Dependencies at Risk

### Vulnerable or Outdated Packages

**Area:** Dependencies

- Issue: Check if any dependencies have known vulnerabilities; many packages are near 1.x versions which may have stability issues
- Files: `package.json`
- Risk: `adm-zip@0.5.16` — last update 2 years ago; consider alternatives like `unzipper`
- Impact: Security fixes may not be backported; community support waning
- Migration plan: Review GitHub security advisories; test migration to alternative packages; prioritize `adm-zip` upgrade or replacement

### @google/generative-ai 0.24.1 Outdated

**Area:** AI Dependencies

- Files: `package.json`
- Risk: Version 0.24.1 is outdated (latest likely 0.30+); missing bug fixes and new features
- Impact: Potential API compatibility issues; missing optimization
- Migration plan: Test upgrade to latest; review changelog for breaking changes; update prompts if API response format changed

## Missing Critical Features

### No Usage Quota / Rate Limiting Per Project

**Area:** Multi-tenancy

- Issue: Any project can make unlimited AI calls; no enforcement of quotas or per-project rate limits
- Blocks: Fair usage; preventing runaway costs; protecting against abuse
- Impact: One project could exhaust Gemini budget for entire system

### No Webhook Retry or Dead Letter Handling

**Area:** Webhooks

- Issue: Webhook delivery failures are not retried; no DLQ for failed webhooks
- Blocks: Reliable event delivery; debugging missed events
- Impact: External systems may not receive important events

### No Audit Logging

**Area:** Admin Operations

- Issue: Create/update/delete operations not audited; no log of who changed what and when
- Blocks: Compliance; debugging issues; accountability
- Impact: Can't trace who modified translation values or deleted projects

## Test Coverage Gaps

### No Unit Tests for Auth

**Area:** Authentication

- What's not tested: Password reset flow, token expiration, JWT validation, `mustChangePassword` enforcement
- Files: `src/modules/auth/auth.service.ts`, `src/modules/users/users.service.ts`
- Risk: Auth bypass or privilege escalation undetected
- Priority: **High**

### No Integration Tests for Translations

**Area:** Core Business Logic

- What's not tested: Import/export, sandbox promotion, quality checking, member access control
- Files: `src/modules/translations/`, only `test/app.e2e-spec.ts` exists and is minimal
- Risk: Data loss, access control bypass, incorrect behavior undetected
- Priority: **High**

### No E2E Tests for Critical Workflows

**Area:** Full System

- What's not tested: Multi-step workflows like (create project → import ZIP → add member → promote sandbox), access control across roles
- Files: Only placeholder `test/app.e2e-spec.ts`
- Risk: Integration bugs, race conditions, edge cases in production
- Priority: **High**

### No Quality Worker Tests

**Area:** Async Processing

- What's not tested: Batch processing logic, timeout handling, result persistence, context penalty application
- Files: `src/modules/translations/quality-worker.service.ts`
- Risk: Silent failures in quality checks, data corruption, race conditions
- Priority: **Medium**

### No Sandbox Service Tests

**Area:** Sandbox Operations

- What's not tested: Init/diff/promote operations, file visibility rules, context preservation, concurrent access
- Files: `src/modules/translations/sandbox.service.ts`
- Risk: Data loss during promotion, incorrect visibility, concurrent corruption
- Priority: **Medium**

---

*Concerns audit: 2026-04-02*
