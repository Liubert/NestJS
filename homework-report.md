# Homework 21 — Performance Optimization Report

## Scenario

**Hot endpoint:** `GET /translations/:projectSlug/:namespace/:locale`

This is the public-facing endpoint that serves translation JSON to all frontend clients.
Every page load in every application using this translation service hits this endpoint.
It is deterministic, easy to benchmark, and exposes the full stack:
NestJS → TypeORM QueryBuilder → PostgreSQL (5-table JOIN) → JSON serialization.

**Test dataset:** 2000 keys × 5 locales = 10,000 translation values (project `perf-bench`, namespace `common`).

---

## Baseline

### How baseline was measured

- **Tool:** `autocannon` (10 concurrent connections, 30s duration, no pipelining)
- **Target:** `GET http://localhost:8080/translations/perf-bench/common/en`
- **Environment:** Docker Compose (local), macOS
- **DB logging:** `logging: true` in TypeORM (every query logged to stdout)
- **Caching:** None (every request = full 5-table SQL JOIN)

### Baseline metrics

| Metric | Value |
|--------|-------|
| p50 latency | 43ms |
| p97.5 latency | 182ms |
| p99 latency | 316ms |
| Avg latency | 59ms |
| Throughput | ~168 req/s |
| Memory (api container) | ~125MB |
| Error rate | 0% |
| DB query per request | 1 (5-table JOIN, no caching) |
| Response size | 163,799 bytes (no compression) |

**EXPLAIN ANALYZE** (hot query, before GIN index):
```
Execution Time: 426.309 ms
Planning Time: 2.246 ms
```
Key observations:
- Seq Scan on `translation_projects` (6 rows, filter on slug)
- Seq Scan on `translation_namespaces` (8 rows, filter on slug)
- Seq Scan on `translation_locales` (28 rows, filter on code + aliases)
- Hash Join for locale matching
- 6,257 buffer hits

---

## Bottleneck Analysis

### Bottleneck #1: Zero application-level caching

**Evidence:**
- Grep for `cache|redis|Redis` in `src/` directory returned 0 results
- Every request to `GET /translations/:slug/:ns/:locale` executes a full SQL query with 5 INNER JOINs
- The same project/namespace/locale combination queried 1000 times = 1000 identical SQL queries

**Query executed per request** (`translations.service.ts:449-462`):
```sql
SELECT tk.key AS key, tv.value AS value
FROM translation_values tv
INNER JOIN translation_keys tk ON tk.id = tv.key_id
INNER JOIN translation_namespaces ns ON ns.id = tk.namespace_id
INNER JOIN translation_projects p ON p.id = ns.project_id
INNER JOIN translation_locales l ON l.id = tv.locale_id
WHERE p.slug = $1
  AND ns.slug = $2
  AND (l.code IN ($3) OR l.aliases && ARRAY[$3]::text[])
```

### Bottleneck #2: No GIN index for array overlap operator

**Evidence:**
- `l.aliases && ARRAY[...]::text[]` uses the array overlap operator
- No GIN index existed on `translation_locales.aliases`
- PostgreSQL falls back to Seq Scan for this predicate
- Existing UNIQUE constraints cover B-tree lookups on slug/code columns, but not array operations

**EXPLAIN ANALYZE** (relevant excerpt):
```
Seq Scan on translation_locales l  (cost=0.00..4.34 rows=5) (actual time=0.012..0.075 rows=6)
  Filter: (code = 'en' OR aliases && '{en}')  Rows Removed by Filter: 22
```

Note: On the current small dataset (28 locales) the Seq Scan is fast. The GIN index provides benefit at scale with more locales and heavier alias usage.

### Bottleneck #3: TypeORM `logging: true` in production

**Evidence:**
- `app.config.ts:50` had `logging: true` unconditionally
- Every SQL query logged to stdout via `console.log`
- At sustained load, this adds constant I/O overhead per request

---

## Improvements

### Improvement 1: Performance — LRU cache

**File:** `translation-cache.service.ts`

- LRU cache with max 500 entries, TTL 60 seconds
- Cache key: `${projectSlug}:${namespace}:${locale}`
- On cache hit: skip SQL query entirely, return cached JSON
- Invalidation on: `createEntry`, `updateEntry`, `deleteEntry`, `promote`, `promoteSelective`
- Registered as `@Global()` module for singleton behavior across all services

**Measured effect:**
- Cold request (cache miss, DB query): **496ms**
- Warm request (cache hit): **64-84ms** (~6-8× faster)

### Improvement 2: Performance — GIN index for array overlap

**Migration:** `17765000000001-performance-indexes.ts`

Added one GIN index targeting the `aliases && ARRAY[...]` predicate:

| Index | Purpose |
|-------|---------|
| `IDX_translation_locales_aliases_gin` | GIN index for array overlap `&&` operator |

Other B-tree indexes on slug and code columns were considered but not added because existing UNIQUE constraints already create implicit B-tree indexes that cover those lookups.

### Improvement 3: Cost/Runtime — Gzip compression

**File:** `main.ts`

Added `compression()` middleware (Express gzip/deflate).

**Measured effect:**
- Uncompressed: **163,799 bytes**
- With gzip: **11,705 bytes** (93% reduction)

Translation JSON compresses extremely well due to repetitive structure (many similar keys and value patterns).

### Improvement 4: Cost/Runtime — DB logging disabled by default

**File:** `app.config.ts`

Changed from `logging: true` to `logging: process.env.DB_LOGGING === 'true'`.

- Production: disabled by default (no overhead)
- Development: enable via `DB_LOGGING=true` in `.env`

---

## Before / After

### Methodology note

Two measurement methods were used. Rate limiting (`@Throttle`) was **temporarily replaced with `@SkipThrottle()`** on the public endpoint during benchmarking to measure raw application throughput. The committed code has `@Throttle({ default: { ttl: 60s, limit: 3000 } })` which would start returning 429s after ~15s at sustained load. See reproduction steps below.

**1. autocannon** (10 connections, 30s, no pipelining) — measures sustained throughput under parallel load.

Two runs were performed to isolate the cache warm-up effect. The "cache fills during run" scenario started with an empty cache — the first request triggered a DB query and filled the cache, so subsequent requests hit the cache. The "cache pre-warmed" scenario primed the cache with 5 warm-up requests before autocannon started.

| Metric | Cache fills during run | Cache pre-warmed | Comment |
|--------|------------------------|------------------|---------|
| p50 latency | 39ms | 39ms | Serialization + transfer bound |
| p90 latency | 74ms | 73ms | ~p95 proxy (autocannon reports p90/p97.5, not exact p95) |
| p97.5 latency | 103ms | 96ms | Tail latency slightly better when cache is warm |
| p99 latency | 120ms | 115ms | No cold DB queries in tail |
| Avg latency | 48ms | 48ms | Consistent across both scenarios |
| Throughput | ~208 req/s | ~206 req/s | Transfer-bound ceiling (~34 MB/s) |
| Total requests | 6,234 | 6,190 | ~6.2K requests in 30s window |
| Error rate | 0% | 0% | No regression |
| CPU (api) | idle→peak during run | idle→peak during run | Not captured as sustained % (docker stats is snapshot) |
| Memory (api) | 70MB → 103MB | 103MB → 137MB | LRU cache fills ~67MB over sustained load |
| Memory (postgres) | 30MB → 31MB | 31MB → 33MB | Constant — cache absorbs the load |
| Event loop lag | Not measured | Not measured | Bottleneck is DB I/O + JSON transfer, not CPU-bound blocking |
| Replicas | 1 | 1 | Single Docker Compose VPS, no horizontal scaling |
| Resource limits | None | None | Docker Compose without Swarm, no deploy.resources |
| Cost proxy | — | — | Bandwidth: gzip saves 93% (164KB→12KB); single VPS ~$20/mo |

Raw JSON results saved in `hw21-evidence/autocannon-cold.json` and `hw21-evidence/autocannon-warm.json`.

To reproduce both scenarios, the benchmark script supports `SKIP_WARMUP=1` to skip cache priming:
```bash
SKIP_WARMUP=1 ./benchmarks/run-baseline.sh cold    # cache fills during run
./benchmarks/run-baseline.sh warm                    # cache pre-warmed (default)
```

Under sustained load, p50 latency is nearly identical between both runs because the cache fills on the very first request — only 1 out of ~6200 requests actually hits the DB. The bottleneck is **JSON serialization + network transfer** (~208 req/s × 164KB = 34 MB/s over the local Docker bridge). The LRU cache eliminates DB latency, but the response is still 164KB of JSON per request.

This ceiling would be broken by combining cache + gzip (11KB responses instead of 164KB), but autocannon does not send `Accept-Encoding: gzip` by default.

**2. curl** single-request measurements — isolates the cache and compression effects.

| Metric | Before | After | Comment |
|--------|--------|-------|---------|
| Single request (cold, no cache) | ~496ms | ~496ms | Full DB query on cache miss |
| Single request (warm, cache hit) | N/A | 64-84ms | **~6-8× faster** — DB round-trip eliminated |
| Response size (no gzip) | 163,799 bytes | 163,799 bytes | Same payload |
| Response size (gzip) | N/A | 11,705 bytes | **93% reduction** |
| DB logging | Always ON | OFF by default | Removes per-request I/O overhead |

The cache effect is clearly visible in individual requests: 496ms → 64ms. Under sustained load this translates to lower DB pressure and CPU usage rather than lower p50, because the transfer bottleneck dominates.

**Cost impact of gzip:** On cloud providers with egress pricing (AWS: $0.09/GB, GCP: $0.12/GB), the 93% reduction in response size directly reduces bandwidth costs. At 1000 req/min of a 164KB namespace, gzip saves ~145MB/min = ~8.5GB/hour = ~$0.77/hour on AWS egress alone.

---

## Trade-offs

1. **LRU cache introduces stale data risk.** With a 60-second server-side TTL, the server may serve stale data for up to 1 minute after a mutation. Additionally, public responses set `Cache-Control: public, max-age=300` (5 minutes), so the worst-case staleness from a client perspective is 60s (server) + 300s (browser) = **6 minutes** after an update. This is acceptable for a translation service where changes are infrequent and not latency-critical. Invalidation on mutations keeps the server-side window small.

2. **Cache invalidation adds complexity.** Every mutating operation (create, update, delete, promote) must invalidate the cache. Missing an invalidation point means serving stale data. The trade-off is managed by invalidating at the namespace level (coarse but safe) rather than per-key (precise but fragile).

3. **In-process cache doesn't share across instances.** If the API were scaled horizontally, each instance would have its own cache — briefly inconsistent responses after a mutation. For a single-VPS deployment this is fine; for multi-instance, Redis would be needed.

4. **Gzip compression trades CPU for bandwidth.** Each response is compressed before sending, adding CPU time. For large JSON payloads (164KB for 2000-key namespaces), the 93% bandwidth savings far outweigh the CPU cost.

5. **Disabling DB logging loses query visibility.** Without `logging: true`, slow queries won't appear in stdout. This is mitigated by PostgreSQL's `pg_stat_statements` extension, which tracks slow queries at the database level with much lower overhead.

---

## Files Changed

| File | Change | Why |
|------|--------|-----|
| `src/modules/translations/translation-cache.service.ts` | New: LRU cache service + global module | In-memory caching for public translations |
| `src/modules/translations/translations.service.ts` | Cache integration + invalidation | Cache reads, invalidate on mutations |
| `src/modules/production/promotion.service.ts` | Cache invalidation on promote/revert | Ensure fresh data after production changes |
| `src/database/migrations/17765000000001-performance-indexes.ts` | New migration: GIN index on locale aliases | Support array overlap operator |
| `src/main.ts` | Add compression middleware | Gzip responses |
| `src/config/app.config.ts` | DB logging via env var | Disable by default, enable in dev |
| `src/modules/translations/public-translations.controller.ts` | Raise rate limit for public routes | 3000/min instead of 600/min for i18n reads |
| `src/database/seed/benchmark-seed.ts` | New: benchmark data seed | 2000 keys × 5 locales test dataset |
| `src/modules/translations/translation-cache.service.spec.ts` | New: 8 unit tests | Covers get/set/invalidate/clear/stats |
| `benchmarks/run-baseline.sh` | New: autocannon benchmark script | Reproducible before/after measurement |

---

## How to Reproduce

```bash
# 1. Start containers (rebuild to include compression)
docker compose up -d --build api

# 2. Run migrations (includes GIN index)
docker exec nest_js_api_1 npm run migration:run:prod

# 3. Seed benchmark data (see src/database/seed/benchmark-seed.ts for full script)
# Quick version via psql: create project, locales, namespace, 2000 keys, 10000 values

# 4. Verify endpoint works
curl -s http://localhost:8080/translations/perf-bench/common/en | wc -c
# Expected: ~163799 bytes

# 5. Check gzip compression
curl -s --compressed -o /dev/null -w "size=%{size_download}\n" \
  http://localhost:8080/translations/perf-bench/common/en
# Expected: ~11705 bytes (93% reduction)

# 6. Disable rate limiting for benchmarking
# In src/modules/translations/public-translations.controller.ts,
# temporarily replace:
#   @Throttle({ default: { ttl: seconds(60), limit: 3000 } })
# with:
#   @SkipThrottle()
# The 3000/min limit will start returning 429s after ~15s at sustained load.
# Wait for the dev server to reload after saving.

# 7. Run benchmark (warm cache — default)
./benchmarks/run-baseline.sh warm

# 8. Run benchmark (cold cache — no warm-up)
SKIP_WARMUP=1 ./benchmarks/run-baseline.sh cold

# 9. Restore throttling after benchmarking (revert the change from step 6)
```

---

## Evidence

Raw data files saved in `hw21-evidence/`:

| File | Contents |
|------|----------|
| `autocannon-cold.json` | autocannon JSON output — cold cache run (6,234 requests, 0 errors) |
| `autocannon-warm.json` | autocannon JSON output — warm cache run (6,190 requests, 0 errors) |
| `explain-analyze.txt` | EXPLAIN (ANALYZE, BUFFERS) output for the hot 5-table JOIN query |
| `docker-stats-idle.txt` | docker stats snapshot at rest (before benchmark) |
| `docker-stats-during-benchmark.txt` | docker stats snapshots: idle → after cold → after warm |
