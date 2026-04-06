---
phase: quick
plan: 260406-gxq
type: execute
wave: 1
depends_on: ["260406-g0q"]
files_modified: []
autonomous: true
requirements: []
must_haves:
  truths:
    - "Migration runs without errors on local Docker DB"
    - "locale_skill column exists in translation_locales table, guidance column does not"
    - "nb-NO and da-DK rows are normalized to nb and da with old codes in aliases"
    - "GET /translations/supported-locales returns 37 locales without auth"
    - "POST locale with code nb auto-fills localeSkill; POST with nb-NO returns 400"
    - "PATCH locale accepts localeSkill field"
    - "AI translate still works with renamed constants"
    - "Frontend useSupportedLocales hook calls correct API path"
    - "GET project details returns locales with localeSkill field"
  artifacts: []
  key_links: []
---

<objective>
Verify that all Phase 1 locale registry consolidation changes work correctly in the running local environment: migration, API endpoints, frontend hook, and AI services. Fix any issues found inline.

Purpose: Prove the rename (guidance->localeSkill), normalization (nb-NO->nb, da-DK->da), new endpoint, and frontend integration all work end-to-end before deploying to stage.
Output: Curl/DB evidence for each test, hotfix commits if needed.
</objective>

<execution_context>
@/Users/liubomyrfedyshyn/WebstormProjects/nest_js/.claude/get-shit-done/workflows/execute-plan.md
@/Users/liubomyrfedyshyn/WebstormProjects/nest_js/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/quick/260406-g0q-locale-registry-consolidation-create-sin/260406-g0q-SUMMARY.md
@src/modules/translations/locale-registry.ts
@src/modules/translations/entities/locale.entity.ts
@src/modules/translations/public-translations.controller.ts
@src/database/migrations/17756000000001-locale-registry-consolidation.ts
@admin-ui/src/hooks/useSupportedLocales.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Run migration and verify DB schema + data normalization</name>
  <files></files>
  <action>
**1. Run migration**

```bash
docker exec nest_js_api_1 npm run migration:run
```

Capture output. If it fails, read the error and fix the migration file.

**2. Verify DB schema — locale_skill column exists, guidance does not**

```bash
docker exec nest_js_postgres_1 psql -U postgres -d nest_js -c "\d translation_locales"
```

Confirm:
- Column `locale_skill` exists (type text, nullable)
- Column `guidance` does NOT exist
- All other columns unchanged (id, project_id, code, is_default, aliases)

**3. Verify nb-NO/da-DK normalization**

```bash
# Check no nb-NO or da-DK rows remain as primary codes
docker exec nest_js_postgres_1 psql -U postgres -d nest_js -c "SELECT id, project_id, code, aliases, substring(locale_skill, 1, 40) as skill_preview FROM translation_locales WHERE code IN ('nb-NO', 'da-DK');"

# Check nb and da rows exist with aliases containing old codes
docker exec nest_js_postgres_1 psql -U postgres -d nest_js -c "SELECT id, project_id, code, aliases, substring(locale_skill, 1, 40) as skill_preview FROM translation_locales WHERE code IN ('nb', 'da');"
```

Expected:
- First query returns 0 rows (no nb-NO or da-DK as primary codes)
- Second query shows nb rows with 'nb-NO' in aliases array, da rows with 'da-DK' in aliases array

**4. Verify locale_skill backfill**

```bash
docker exec nest_js_postgres_1 psql -U postgres -d nest_js -c "SELECT code, CASE WHEN locale_skill IS NULL THEN 'NULL' ELSE 'FILLED' END as status, count(*) FROM translation_locales GROUP BY code, status ORDER BY code;"
```

Expected: most common locales (en, uk, de, fr, etc.) show FILLED status.

**If any step fails:** diagnose, fix the migration or source code, re-run. Commit hotfix with `fix(locale-registry):` prefix.
  </action>
  <verify>
    <automated>docker exec nest_js_postgres_1 psql -U postgres -d nest_js -c "SELECT column_name FROM information_schema.columns WHERE table_name='translation_locales' AND column_name IN ('locale_skill','guidance');" | grep -c locale_skill</automated>
  </verify>
  <done>
    - Migration ran successfully
    - locale_skill column exists, guidance column gone
    - No nb-NO or da-DK primary codes remain in DB
    - nb and da rows have old codes in aliases
    - locale_skill backfilled for common locales
  </done>
</task>

<task type="auto">
  <name>Task 2: Test API endpoints — supported-locales, create/update locale, AI translate, project details</name>
  <files></files>
  <action>
**1. Get JWT token for authenticated requests**

```bash
TOKEN=$(curl -s -X POST http://localhost:8080/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@test.com","password":"Admin123!"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")
```

**2. Test GET /translations/supported-locales (public, no auth)**

```bash
curl -s http://localhost:8080/translations/supported-locales | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(f'Total locales: {len(data)}')
# Check structure of first entry
first = data[0]
print(f'Fields: {list(first.keys())}')
assert set(first.keys()) == {'code','name','aliases','localeSkill','flag'}, f'Wrong fields: {first.keys()}'
# Check nb entry exists with aliases
nb = next((l for l in data if l['code'] == 'nb'), None)
print(f'nb entry: code={nb[\"code\"]}, aliases={nb[\"aliases\"]}, has_skill={bool(nb[\"localeSkill\"])}')
assert 'nb-NO' in nb['aliases'], f'nb missing nb-NO alias: {nb[\"aliases\"]}'
# Check da entry
da = next((l for l in data if l['code'] == 'da'), None)
print(f'da entry: code={da[\"code\"]}, aliases={da[\"aliases\"]}')
assert 'da-DK' in da['aliases'], f'da missing da-DK alias: {da[\"aliases\"]}'
# Check no nb-NO or da-DK as primary codes
codes = [l['code'] for l in data]
assert 'nb-NO' not in codes, 'nb-NO should not be a primary code'
assert 'da-DK' not in codes, 'da-DK should not be a primary code'
print('ALL CHECKS PASSED')
"
```

Expected: 37 locales, correct fields, nb has nb-NO alias, da has da-DK alias.

**3. Test locale creation — auto-fill localeSkill**

Pick a test project slug (get first one):

```bash
SLUG=$(curl -s http://localhost:8080/translations/projects \
  -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json; data=json.load(sys.stdin); print(data['items'][0]['slug'] if 'items' in data else data[0]['slug'])")
echo "Test project: $SLUG"
```

Test POST with valid 2-char code (may already exist — expect either 201 or 409):

```bash
curl -s -w "\nHTTP_CODE:%{http_code}" -X POST "http://localhost:8080/translations/projects/$SLUG/locales/is" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"code":"is","aliases":[]}'
```

Test POST with BCP 47 code (should get 400 from DTO validation):

```bash
curl -s -w "\nHTTP_CODE:%{http_code}" -X POST "http://localhost:8080/translations/projects/$SLUG/locales/nb-NO" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"code":"nb-NO","aliases":[]}'
```

Expected: 400 with validation message about 2-3 char ISO 639 code.

**4. Test locale update — PATCH accepts localeSkill**

```bash
curl -s -w "\nHTTP_CODE:%{http_code}" -X PATCH "http://localhost:8080/translations/projects/$SLUG/locales/en" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"localeSkill":"Test skill update"}'
```

Expected: 200, locale updated. Then revert:

```bash
curl -s -X PATCH "http://localhost:8080/translations/projects/$SLUG/locales/en" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"localeSkill":""}' > /dev/null
```

**5. Test GET project details — locales returned correctly**

```bash
curl -s "http://localhost:8080/translations/projects/$SLUG" \
  -H "Authorization: Bearer $TOKEN" | python3 -c "
import sys, json
data = json.load(sys.stdin)
locales = data.get('locales', [])
print(f'Project {data[\"slug\"]}: {len(locales)} locales')
for l in locales[:3]:
    print(f'  {l[\"code\"]}: isDefault={l.get(\"isDefault\")}, localeSkill={bool(l.get(\"localeSkill\"))}, aliases={l.get(\"aliases\",[])}')
# Verify no 'guidance' field leaked
for l in locales:
    assert 'guidance' not in l, f'Legacy guidance field found in locale {l[\"code\"]}'
print('No legacy guidance fields found — PASSED')
"
```

**6. Test AI translate (smoke test — verify service starts without errors)**

```bash
curl -s -w "\nHTTP_CODE:%{http_code}" -X POST "http://localhost:8080/translations/ai-translate" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"sourceLocale":"en","targetLocales":["uk"],"entries":{"test.hello":"Hello"},"projectSlug":"'$SLUG'"}'
```

Expected: 200 with translations (or 502 if Gemini key not set locally — both are acceptable; 502 means the service code ran correctly but external API failed. 500 with "LOCALE_NAMES is not defined" or similar would indicate a regression).

**7. Verify frontend hook by code reading**

The frontend cannot be tested via curl (it's a React SPA). Verify by reading the hook source:
- `useSupportedLocales` calls `GET /translations/supported-locales` (already confirmed in file read)
- `apiClient` base URL is configured to the API server
- The hook is imported in ProjectSettingsPage, TranslationsPage, EntryEditModal

Run a quick grep to confirm no remaining references to deleted files:

```bash
cd /Users/liubomyrfedyshyn/WebstormProjects/nest_js
grep -rn "supported-languages\|locale-guidelines" admin-ui/src/pages/ admin-ui/src/hooks/ admin-ui/src/components/ 2>/dev/null || echo "No references to deleted files — CLEAN"
grep -rn "\.guidance" admin-ui/src/pages/ admin-ui/src/hooks/ 2>/dev/null || echo "No .guidance references — CLEAN"
```

**If any test fails:** diagnose the root cause, fix the code, commit with `fix(locale-registry):` prefix.
  </action>
  <verify>
    <automated>curl -s http://localhost:8080/translations/supported-locales | python3 -c "import sys,json; d=json.load(sys.stdin); assert len(d)>=30, f'Only {len(d)} locales'; assert all(k in d[0] for k in ['code','name','aliases','localeSkill','flag']), 'Missing fields'; print(f'PASS: {len(d)} locales with correct schema')"</automated>
  </verify>
  <done>
    - GET /translations/supported-locales returns 37 locales with correct schema (no auth)
    - POST locale with BCP 47 code (nb-NO) returns 400
    - PATCH locale accepts localeSkill field
    - GET project details returns locales without legacy guidance field
    - AI translate endpoint runs without LOCALE_NAMES regression
    - Frontend has no references to deleted constants files or legacy guidance field
  </done>
</task>

</tasks>

<verification>
1. Migration ran without errors: `docker exec nest_js_postgres_1 psql -U postgres -d nest_js -c "SELECT column_name FROM information_schema.columns WHERE table_name='translation_locales' AND column_name='locale_skill';"` returns 1 row
2. No guidance column: `docker exec nest_js_postgres_1 psql -U postgres -d nest_js -c "SELECT column_name FROM information_schema.columns WHERE table_name='translation_locales' AND column_name='guidance';"` returns 0 rows
3. Public endpoint works: `curl -s http://localhost:8080/translations/supported-locales | python3 -c "import sys,json; print(len(json.load(sys.stdin)))"` prints 37
4. No legacy references in frontend: `grep -rn "guidance\|supported-languages\|locale-guidelines" admin-ui/src/pages/ admin-ui/src/hooks/ | grep -v localeSkill | grep -v node_modules` returns nothing
</verification>

<success_criteria>
- Migration executed, DB schema verified (locale_skill exists, guidance gone)
- nb-NO/da-DK normalized to nb/da in DB
- All 7 API/frontend tests pass or have documented acceptable failures (e.g., Gemini 502)
- Zero hotfixes needed (ideal) or all hotfixes committed with fix: prefix
- Evidence captured for each test (curl output, DB query results)
</success_criteria>

<output>
After completion, create `.planning/quick/260406-gxq-phase-2-manual-testing-and-hotfixes-for-/260406-gxq-SUMMARY.md`
</output>
