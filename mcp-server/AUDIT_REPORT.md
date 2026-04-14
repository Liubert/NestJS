# Localization Health-Check Audit Report

**Date:** 2026-03-28
**Project:** travis
**Namespaces:** backoffice-translations (494 keys), mobile (844 keys)
**Locales:** en, da-DK, nb-NO, sv, uk

---

## Summary

| Severity | Issue | Count | Safe to auto-fix? |
|----------|-------|-------|-------------------|
| 🔴 Critical | Keys with trailing whitespace (lookup failures) | 3 | Yes |
| 🔴 Critical | `uk` locale registered but 0 translations | all keys | No (needs content) |
| 🟠 High | Duplicate-value keys with same meaning | 7 (backoffice) + 39 (mobile) | No (requires intent check) |
| 🟠 High | Case-duplicate key pairs | 3 (backoffice) | Risky (consumer refs unknown) |
| 🟠 High | Country-prefixed dynamic key pattern | 40 keys (mobile) | No (structural) |
| 🟡 Medium | Mixed naming conventions (camel/snake/Pascal) | 10+ (backoffice) + 100+ (mobile) | No (consumer refs unknown) |
| 🟡 Medium | da-DK / nb-NO have keys not in `en` baseline | 42 / 44 (mobile) | Investigate first |
| 🟡 Medium | Sandbox polluted with ghost test entries | 19 keys | Yes (reset sandbox) |
| ℹ️ Info | `searchLocale` without `search` is a no-op | API behavior | Document only |

---

## 🔴 CONFIRMED PROBLEMS

### 1. Trailing whitespace in key names (`mobile`)

These three keys have a trailing space in their name. Any consumer code using the exact key string without the trailing space will get a lookup miss and fall back to the key string itself at runtime.

```
'accountDeleteMessage '  (has trailing space)
'billable '              (has trailing space)
'email '                 (has trailing space)
```

**Impact:** Silent runtime failures — UI shows the raw key name instead of the translated string.

**Fix:** Safe to rename these keys in sandbox (delete old, create new without space). However, this requires verifying that the consumer code references the trimmed version (`accountDeleteMessage`, `billable`, `email`). If consumer code has the space hardcoded, renaming here breaks nothing but also fixes nothing.

**Recommendation:** Fix the keys here AND audit the consumer app for the space variant.

---

### 2. `uk` locale: 0 translations

The `uk` locale is registered in the project but has no content in either namespace. The public endpoint returns 404:
```
GET /translations/travis/backoffice-translations/uk → 404 Not Found
GET /translations/travis/mobile/uk → 404 Not Found
```

**Impact:** Any consumer code that falls through to `uk` locale will fail completely.

**Fix:** Either:
- Add Ukrainian translations (content work — not auto-fixable)
- Remove the `uk` locale from the project until content is ready (Admin UI)

---

## 🟠 HIGH SEVERITY

### 3. Case-duplicate key pairs (`backoffice-translations`)

Three pairs of keys represent the same concept but differ only by casing. **All have identical English values:**

| Pair | Value |
|------|-------|
| `logIn` / `login` | "Log in" |
| `logOut` / `logout` | "Log out" |
| `Mileage` / `mileage` | "Mileage" |

**Impact:** Consumer code is using one or both. If both are referenced, translations must be kept in sync manually — a maintenance burden and a source of inconsistency across locales.

**Fix:** Cannot auto-fix — need to know which key the consumer app references. Audit the consumer codebase, pick the canonical key (camelCase is the convention), deprecate the other. This is a **breaking change** for the consumer if done without coordination.

---

### 4. Semantic duplicate keys (`backoffice-translations` — 5 confirmed pairs)

Different key names, identical English values. These are almost certainly storing the same concept:

| Keys | Shared value |
|------|-------------|
| `equipment_allowance` + `equipmentAllowance` | "Equipment and materials" |
| `expenseType` + `netlonExpenceType` | "Expense type" |
| `governmentAllowance` + `governmentRate` | "Government rate" |
| `dkCustom` + `vismaBusiness` | "Custom" |
| `employeeId` + `employeeNumber` | "Employee number" |

Note: `netlonExpenceType` contains a typo ("Expence").

**Fix:** Cannot auto-fix. Requires consumer audit to confirm which key is actually used. Likely one of each pair is legacy/dead code.

---

### 5. Semantic duplicates (`mobile` — 39 groups, 5 most critical)

| Keys | Shared value | Risk |
|------|-------------|------|
| `approvalApproved` / `approved` / `reportStatusApproved` | "Approved" | Medium — context may differ |
| `approvalDeclined` / `declined` / `reportStatusDeclined` | "Declined" | Medium |
| `approvalPending` / `pending` / `reportStatusPending` | "Pending" | Medium |
| `appOptions` / `settings` | "Settings" | Low — likely different screens |
| `approvalDecline` / `decline` | "Decline" | Medium |

These are likely intentional duplicates for context separation, but they create a translation maintenance burden: updating "Approved" requires updating 3 separate keys. If any locale translator updates only one, the UI becomes inconsistent.

**Recommendation:** Acceptable if intentional. Document them. Consider consolidating `approvalApproved` → `approved` (action vs state).

---

### 6. Country-prefixed dynamic key pattern (`mobile` — 40 keys)

The `mobile` namespace has 40 keys named `{COUNTRY}-type-of-{vehicle|fuel}-{type}`:
- 16 `DK-*` keys
- 12 `NO-*` keys
- 12 `SE-*` keys

The consumer almost certainly builds these keys dynamically:
```javascript
// Consumer likely does something like:
t(`${countryCode}-type-of-vehicle-${vehicleType}`)
```

**Why this is risky:**

1. **Country code format mismatch.** The system uses locale codes `da-DK`, `nb-NO`, `sv` — but these keys use abbreviated country codes `DK`, `NO`, `SE`. If the consumer uses the wrong format, all lookups fail silently.

2. **Unsupported dynamic key detection.** No tooling can statically detect missing keys for dynamic patterns. If a new vehicle type is added, there's no guarantee all country variants are added.

3. **Cross-country duplication.** `DK-type-of-fuel-electric`, `NO-type-of-fuel-electric`, and `SE-type-of-fuel-electric` all equal "Electric" in English. Three keys, one concept.

4. **Some DK keys contain `/`** (`DK-type-of-vehicle-bicycle/non-motorized`) which is an invalid character in this system's key naming rules. These likely fail silently or cause routing issues.

**Investigation needed:**
- Confirm how the consumer constructs these key names (`DK` vs `da-DK`)
- This is the root cause of the "problem with adding some countries" mentioned in the project

**Fix:** Not auto-fixable. Options:
- Keep pattern but fix the `/` in key names (safe, small)
- Normalize to locale codes (`da-DK-type-of-vehicle-car`) — breaking change
- Restructure as nested: `type-of-vehicle.car.DK` — major restructure

---

## 🟡 MEDIUM SEVERITY

### 7. Mixed naming conventions

**`backoffice-translations`:** Predominantly camelCase with exceptions:
- 4 PascalCase: `Continue`, `Mileage`, `RemoveCompanyConfirmationText`, `SoftRemoveConfirmation`
- 5 snake_case: `car_over_20_000km`, `company_admin`, `equipment_allowance`, `first_approver`, `second_approver`
- 1 dash: `re-inviteAll`

**`mobile`:** No dominant convention — approximately equal split between:
- camelCase (~713 keys)
- snake_case (~66 keys)
- DK/NO/SE prefixed keys (40 keys)
- `/problems/*` error codes (22 keys)
- Mixed other patterns (~103 keys)

**Impact:** Makes automated tooling and agent work unreliable — cannot predict key name format.

**Fix:** Convention enforcement going forward. Existing keys: do not rename without consumer audit.

---

### 8. da-DK and nb-NO have keys not in `en` baseline (`mobile`)

```
da-DK: 886 keys vs en: 844 keys → 42 extra keys in da-DK
nb-NO: 888 keys vs en: 844 keys → 44 extra keys in nb-NO
```

The extra keys include content like `aboutPurchaseTitle`, `alreadySubscribed`, `freeTrialUsedUpScrrenTitle` (note typo: "Sccren"). These look like **iOS in-app purchase / subscription strings** that may have been loaded for DK and NO markets but never added to the English baseline.

**Impact:** These keys exist only in certain locales. Consumers relying on English as fallback may not find them, or may find them only in specific locales.

**Recommendation:** Investigate if these are intentional market-specific strings or legacy content. If legacy, clean up. If intentional, add English baseline versions.

---

### 9. Sandbox polluted with ghost test entries

The sandbox currently has 19 keys pending deletion, all with `productionValue: null` — test artifacts from MCP validation sessions. These keys were created in sandbox and then deleted, but they remain in the diff as pending deletions.

```
backoffice-translations/mcp.e2e.test (5 locales)
backoffice-translations/mcp.final.test (5 locales)
backoffice-translations/test.key (2 locales)
... and 16 more
```

Also 3 potentially real keys pending deletion:
```
backoffice-translations/expense.amount
backoffice-translations/expense.delete
backoffice-translations/expense.save
```

These last 3 were apparently added then deleted in sandbox. Verify if they were intentional.

**Fix:** If `expense.*` keys were intentional but accidentally deleted, recreate them. Then reset sandbox to clear the ghost entries. If not intentional, just reset sandbox.

---

## ℹ️ INFORMATIONAL

### `searchLocale` without `search` is a no-op

Calling `list_translations` with `searchLocale=uk` but no `search` parameter returns all entries, not just those with `uk` values. This is a backend behavior quirk. Documented in AGENT_GUIDE.md.

### Error keys: two conflicting patterns in `mobile`

There are two different slash-based error key formats in the same namespace:

```
/problems/access_token_invalid    ← 22 keys with LEADING slash
problems/bad_request              ← 4 keys WITHOUT leading slash
```

These cannot be the same lookup pattern. The consumer must be doing two different things to hit both. One pattern is likely wrong or legacy.

Additionally, two keys contain embedded slashes that are not error codes:
```
DK-type-of-vehicle-bicycle/non-motorized
DK-type-of-vehicle-short-bicycle/non-motorized
```
These are accessible via URL-encoding (`%2F`) but violate the standard key naming rules (`/^[a-zA-Z0-9._-]+$/`). They exist because they were imported via ZIP before the validation rule was in place.

---

## Recommended fix order

1. **Fix trailing whitespace keys** (3 keys in `mobile`) — safe, small, confirmed impact
2. **Clarify `uk` locale** — remove or fill
3. **Clean sandbox ghost entries** — reset sandbox after confirming `expense.*` keys
4. **Investigate `/` in `DK-type-of-vehicle-bicycle/non-motorized`** keys — may cause routing failures
5. **Investigate da-DK/nb-NO extra keys** — likely legacy, needs product decision
6. **Audit consumer app for duplicate key usage** — needed before consolidating duplicates

**Do not auto-fix:** naming convention normalization, duplicate key consolidation, country-prefix pattern restructure. All require consumer codebase audit first.
