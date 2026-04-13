#!/usr/bin/env bash
# ─── Benchmark: GET /translations/perf-bench/common/en ────────────────────
#
# Prerequisites:
#   1. Docker containers running (docker compose up -d)
#   2. Benchmark seed data populated (npx ts-node src/database/seed/benchmark-seed.ts)
#   3. autocannon installed (npx autocannon --help)
#   4. Rate limiting disabled on the public endpoint:
#      In src/modules/translations/public-translations.controller.ts,
#      temporarily replace @Throttle(...) with @SkipThrottle().
#      The default 3000/min limit will throttle sustained load after ~15s.
#
# Usage:
#   ./benchmarks/run-baseline.sh [before|after]
#   SKIP_WARMUP=1 ./benchmarks/run-baseline.sh cold   # no cache priming
#
# Saves results to benchmarks/results/<label>-<timestamp>.json
# ──────────────────────────────────────────────────────────────────────────

set -euo pipefail

LABEL="${1:-baseline}"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BASE_URL="${BASE_URL:-http://localhost:8080}"
ENDPOINT="/translations/perf-bench/common/en"
DURATION=30        # seconds
CONNECTIONS=10     # concurrent connections
PIPELINING=1       # requests per connection before waiting
SKIP_WARMUP="${SKIP_WARMUP:-0}"

RESULTS_DIR="$(dirname "$0")/results"
mkdir -p "$RESULTS_DIR"
OUTFILE="$RESULTS_DIR/${LABEL}-${TIMESTAMP}.json"

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  Benchmark: GET ${ENDPOINT}"
echo "║  Label: ${LABEL}"
echo "║  Duration: ${DURATION}s  Connections: ${CONNECTIONS}  Pipelining: ${PIPELINING}"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Warm-up: 5 requests to prime cache (skip with SKIP_WARMUP=1 for cold-start measurement)
if [ "$SKIP_WARMUP" = "1" ]; then
  echo "→ Warm-up SKIPPED (SKIP_WARMUP=1)"
else
  echo "→ Warm-up (5 requests)..."
  for i in $(seq 1 5); do
    curl -s -o /dev/null -w "  #${i} status=%{http_code} time=%{time_total}s\n" "${BASE_URL}${ENDPOINT}"
  done
fi
echo ""

# Capture Docker stats snapshot (before)
echo "→ Docker stats (snapshot):"
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}" 2>/dev/null || echo "  (docker stats unavailable)"
echo ""

# Run autocannon benchmark
echo "→ Running autocannon (${DURATION}s)..."
npx autocannon \
  -c "$CONNECTIONS" \
  -d "$DURATION" \
  -p "$PIPELINING" \
  -j \
  "${BASE_URL}${ENDPOINT}" \
  | tee "$OUTFILE"

echo ""
echo "→ Docker stats (after benchmark):"
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}" 2>/dev/null || echo "  (docker stats unavailable)"

echo ""
echo "✓ Results saved to: ${OUTFILE}"

# Pretty-print key metrics
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  Summary"
echo "╠══════════════════════════════════════════════════════════════╣"
node -e "
const r = require('./${OUTFILE}');
const fmt = (ms) => ms < 1000 ? ms + 'ms' : (ms/1000).toFixed(2) + 's';
console.log('  p50 latency:  ' + fmt(r.latency.p50));
console.log('  p95 latency:  ' + fmt(r.latency.p95));
console.log('  p99 latency:  ' + fmt(r.latency.p99));
console.log('  avg latency:  ' + fmt(r.latency.average));
console.log('  throughput:   ' + r.requests.average + ' req/s');
console.log('  total reqs:   ' + r.requests.total);
console.log('  errors:       ' + (r.errors || 0));
console.log('  non-2xx:      ' + (r.non2xx || 0));
" 2>/dev/null || echo "  (install node to see summary)"
echo "╚══════════════════════════════════════════════════════════════╝"
