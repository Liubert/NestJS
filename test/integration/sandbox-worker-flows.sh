#!/usr/bin/env bash
# Integration tests for sandbox worker flows (auto-translate, initTranslate locale, retranslate).
# Requires: running API at localhost:8080, admin credentials, Gemini API key configured.
# Usage: bash test/integration/sandbox-worker-flows.sh
set -euo pipefail

BASE_URL="${API_URL:-http://localhost:8080}"
EMAIL="${TEST_EMAIL:-admin@test.com}"
PASSWORD="${TEST_PASSWORD:-Admin123!}"
PROJECT="test-pro"
NAMESPACE="common"
POLL_INTERVAL=5
MAX_WAIT=60

# ─── Helpers ──────────────────────────────────────────────────────────────────

fail()  { echo "FAIL: $1" >&2; FAILED=1; }
pass()  { echo "PASS: $1"; }
FAILED=0

login() {
  TOKEN=$(curl -sf -X POST "$BASE_URL/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")
  if [ -z "$TOKEN" ]; then echo "ERROR: Failed to login" >&2; exit 1; fi
}

auth() { echo "Authorization: Bearer $TOKEN"; }

# Wait for auto-translate worker to translate a key (poll sandbox_values via entries endpoint)
wait_for_translation() {
  local project=$1 ns=$2 key=$3 locale=$4 elapsed=0
  while [ $elapsed -lt $MAX_WAIT ]; do
    local val
    val=$(curl -sf "$BASE_URL/translations/$project/$ns/$locale?env=sandbox" \
      | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('$key',''))" 2>/dev/null || echo "")
    if [ -n "$val" ] && [ "$val" != "None" ]; then
      echo "$val"
      return 0
    fi
    sleep $POLL_INTERVAL
    elapsed=$((elapsed + POLL_INTERVAL))
  done
  echo ""
  return 1
}

# ─── Setup ────────────────────────────────────────────────────────────────────

login
echo "Logged in. Running tests against $BASE_URL, project=$PROJECT"
echo ""

# ─── Test 1: auto_translate_enabled — worker picks up missing translations ────

echo "=== Test 1: auto_translate_enabled ==="

# Enable auto-translate
curl -sf -X PATCH "$BASE_URL/translations/projects/$PROJECT/settings" \
  -H "$(auth)" -H 'Content-Type: application/json' \
  -d '{"autoTranslateEnabled": true}' > /dev/null

# Create a new key with only English value
UNIQUE_KEY="test.at.$(date +%s)"
CREATE_RES=$(curl -sf -X POST "$BASE_URL/translations/projects/$PROJECT/sandbox/namespaces/$NAMESPACE/entries" \
  -H "$(auth)" -H 'Content-Type: application/json' \
  -d "{\"key\":\"$UNIQUE_KEY\",\"values\":{\"en\":\"Worker test entry\"}}")
CREATED_KEY=$(echo "$CREATE_RES" | python3 -c "import sys,json; print(json.load(sys.stdin).get('key',''))")

if [ "$CREATED_KEY" = "$UNIQUE_KEY" ]; then
  pass "Created key $UNIQUE_KEY"
else
  fail "Failed to create key $UNIQUE_KEY"
fi

# Wait for worker to translate to uk
echo "  Waiting for auto-translate worker to translate to uk..."
UK_VAL=$(wait_for_translation "$PROJECT" "$NAMESPACE" "$UNIQUE_KEY" "uk")
if [ -n "$UK_VAL" ]; then
  pass "Worker translated to uk: $UK_VAL"
else
  fail "Worker did not translate $UNIQUE_KEY to uk within ${MAX_WAIT}s"
fi

# Cleanup: delete key, disable auto-translate
curl -sf -X POST "$BASE_URL/translations/projects/$PROJECT/sandbox/namespaces/$NAMESPACE/entries/bulk-delete" \
  -H "$(auth)" -H 'Content-Type: application/json' \
  -d "{\"keys\":[\"$UNIQUE_KEY\"]}" > /dev/null
curl -sf -X PATCH "$BASE_URL/translations/projects/$PROJECT/settings" \
  -H "$(auth)" -H 'Content-Type: application/json' \
  -d '{"autoTranslateEnabled": false}' > /dev/null
echo ""

# ─── Test 2: createLocale with initTranslate ──────────────────────────────────

echo "=== Test 2: createLocale with initTranslate ==="

# Create a new locale with initTranslate=true
CREATE_LOCALE_RES=$(curl -sf -X POST "$BASE_URL/translations/projects/$PROJECT/locales" \
  -H "$(auth)" -H 'Content-Type: application/json' \
  -d '{"code": "sv", "initTranslate": true}')
LOCALE_CODE=$(echo "$CREATE_LOCALE_RES" | python3 -c "import sys,json; print(json.load(sys.stdin).get('code',''))")

if [ "$LOCALE_CODE" = "sv" ]; then
  pass "Created locale sv with initTranslate"
else
  # Maybe already exists — try to proceed anyway
  echo "  Note: locale creation returned: $(echo "$CREATE_LOCALE_RES" | head -c 100)"
fi

# Find an existing key to check
EXISTING_KEY=$(curl -sf "$BASE_URL/translations/$PROJECT/$NAMESPACE/en?env=sandbox" \
  | python3 -c "import sys,json; keys=list(json.load(sys.stdin).keys()); print(keys[0] if keys else '')")

if [ -n "$EXISTING_KEY" ]; then
  echo "  Waiting for worker to translate '$EXISTING_KEY' to sv..."
  SV_VAL=$(wait_for_translation "$PROJECT" "$NAMESPACE" "$EXISTING_KEY" "sv")
  if [ -n "$SV_VAL" ]; then
    pass "Worker translated '$EXISTING_KEY' to sv: $SV_VAL"
  else
    fail "Worker did not translate '$EXISTING_KEY' to sv within ${MAX_WAIT}s"
  fi
else
  fail "No existing keys found in $PROJECT/$NAMESPACE to test initTranslate"
fi

# Cleanup: delete locale
curl -sf -X DELETE "$BASE_URL/translations/projects/$PROJECT/locales/sv" \
  -H "$(auth)" > /dev/null 2>&1 || true
echo ""

# ─── Test 3: retranslate ─────────────────────────────────────────────────────

echo "=== Test 3: retranslate ==="

# Find a key with translations in multiple locales
RETRANSLATE_KEY=$(curl -sf "$BASE_URL/translations/$PROJECT/$NAMESPACE/uk?env=sandbox" \
  | python3 -c "import sys,json; keys=list(json.load(sys.stdin).keys()); print(keys[0] if keys else '')")

if [ -z "$RETRANSLATE_KEY" ]; then
  fail "No key with uk translation found for retranslate test"
else
  # Get current uk value
  OLD_UK=$(curl -sf "$BASE_URL/translations/$PROJECT/$NAMESPACE/uk?env=sandbox" \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('$RETRANSLATE_KEY',''))")
  echo "  Key: $RETRANSLATE_KEY, current uk value: $OLD_UK"

  # Call retranslate
  RETRANSLATE_RES=$(curl -sf -X POST "$BASE_URL/translations/projects/$PROJECT/sandbox/namespaces/$NAMESPACE/retranslate" \
    -H "$(auth)" -H 'Content-Type: application/json' \
    -d "{\"key\":\"$RETRANSLATE_KEY\"}")
  DELETED=$(echo "$RETRANSLATE_RES" | python3 -c "import sys,json; print(json.load(sys.stdin).get('deleted',0))")

  if [ "$DELETED" -gt 0 ]; then
    pass "Retranslate deleted $DELETED non-default translations"
  else
    fail "Retranslate deleted 0 translations (expected > 0)"
  fi

  # Wait for worker to re-translate
  echo "  Waiting for worker to re-translate '$RETRANSLATE_KEY' to uk..."
  NEW_UK=$(wait_for_translation "$PROJECT" "$NAMESPACE" "$RETRANSLATE_KEY" "uk")
  if [ -n "$NEW_UK" ]; then
    pass "Worker re-translated to uk: $NEW_UK"
  else
    fail "Worker did not re-translate '$RETRANSLATE_KEY' to uk within ${MAX_WAIT}s"
  fi
fi

# ─── Summary ──────────────────────────────────────────────────────────────────

echo ""
if [ $FAILED -eq 0 ]; then
  echo "All tests passed."
  exit 0
else
  echo "Some tests FAILED."
  exit 1
fi
