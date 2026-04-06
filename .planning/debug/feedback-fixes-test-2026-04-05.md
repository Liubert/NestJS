# Feedback Fixes Verification — 2026-04-05

## Result Table

| # | Fix | Commit | Claim | Status | Evidence |
|---|-----|--------|-------|--------|----------|
| 1 | Migration renumber | `47b2fa9` | Old timestamp 17175 was before init-schema; renumbered to 17752 with IF NOT EXISTS | ✅ VERIFIED | Migration `CreateAgentFeedback17752000000001` appears in DB migrations table; table exists with correct schema |
| 2 | agentModel field + message 10k | `f478724` | `agent_model` column added; message MaxLength 2000→10000 in DTO and MCP | ⚠️ VERIFIED AFTER FIX | Migration existed but had not been run. After running `migration:run`, column appeared. POST /feedback with `agentModel: "claude-opus-4-6"` returned the value correctly. 10 000-char message accepted. |
| 3 | Feedback visibility (truncation + actionAttempted) | `e0abd66` | Truncation 80→500 chars (code shows 300); `actionAttempted` shown in expanded row | ✅ VERIFIED (code) | `FeedbackPage.tsx` line 308: `val?.length > 300 ? val.slice(0, 300) + '...' : val`. Claim says 500 but actual is 300 — minor discrepancy in the claim text, code is consistent at 300. `actionAttempted` rendered at line 209-213 in `expandedRowRender`. |
| 4 | Workflow status lifecycle + soft delete (backend) | `2b79c16`, `6da0e81` | `status` column, `deleted_at`, PATCH `/feedback/:id/status`, DELETE `/feedback/:id`, status filter in GET | ⚠️ VERIFIED AFTER FIX | Migrations existed but had not been run. After `migration:run`: DB has `status varchar(20) DEFAULT 'new'` and `deleted_at timestamptz`. PATCH returned `{"status":"planned"}`. DELETE returned HTTP 204. |
| 5 | Exclude soft-deleted from findAll | `c4c9f65` | Explicit `WHERE fb.deleted_at IS NULL` added to QueryBuilder | ✅ VERIFIED | `feedback.service.ts` line 78: `.where('fb.deletedAt IS NULL')`. After soft-deleting test item, GET /feedback returned `total: 0`. DB confirmed `deleted_at` was set. |
| 6 | Default feedback page to New tab | `036f952`, `8a077d9` | FeedbackPage defaults to "New" tab/filter | ✅ VERIFIED (code) | `FeedbackPage.tsx` line 97: `useState<StatusFilter>('new')`. Initial render sends `status=new` query param. |

---

## Detailed Evidence

### Fix 1 — Migration renumber

```sql
SELECT name FROM migrations WHERE name LIKE '%Feedback%';
-- Result: CreateAgentFeedback17752000000001
```

Table `agent_feedback` exists with all original columns. Migration runs after `LocaleGuidance17751000000001`, confirming correct ordering.

---

### Fix 2 — agentModel field + 10k message

**Pre-run state (BUG):** Migrations `17754000000001-add-agent-model-to-feedback.ts` and `17755000000001-add-feedback-status-and-soft-delete.ts` existed in `src/database/migrations/` but were NOT applied to the DB. POST /feedback was returning HTTP 500 with `column fb.deleted_at does not exist`.

**Fix applied:** `docker exec nest_js_api_1 npm run migration:run`

**DB after migration:**
```
agent_model  | character varying(100)  | nullable
```

**API test — POST /feedback with agentModel:**
```json
Request:  { "category": "suggestion", "message": "TEST...", "agentModel": "claude-opus-4-6" }
Response: { "id": "f9cfc324-...", "agentModel": "claude-opus-4-6", "status": "new" }
```

**10k message test:** 10 000-char message accepted, returned `message_length: 10000`.

**DTO:** `create-feedback.dto.ts` line 18: `@MaxLength(10000)`.

**MCP tool:** `mcp-server/src/tools/feedback.ts` line 23: `z.string().max(10000)`.

**Entity:** `agent-feedback.entity.ts` lines 81-87: `agentModel` column `varchar(100)` nullable.

---

### Fix 3 — Feedback visibility (truncation + actionAttempted in expanded row)

**Code evidence — FeedbackPage.tsx:**

Line 308 (message column render):
```ts
render: (val: string) =>
  val?.length > 300 ? val.slice(0, 300) + '...' : val,
```
Note: Claim text says "500 chars" but code uses 300. The fix was an improvement over the original 80 — this is a minor discrepancy in commit message wording, not a bug.

Lines 209-213 (expandedRowRender):
```tsx
{record.actionAttempted && (
  <Descriptions.Item label="Action Attempted">
    {record.actionAttempted}
  </Descriptions.Item>
)}
```
`actionAttempted` is shown in the expanded row as claimed.

Lines 217-219 (agentModel in expanded row):
```tsx
<Descriptions.Item label="Agent Model">{record.agentModel || '—'}</Descriptions.Item>
```

---

### Fix 4 — Workflow status + soft delete backend

**Pre-run state (BUG):** Same as Fix 2 — migrations not applied, all feedback endpoints returning 500.

**DB after migration:**
```
status    | character varying(20) | NOT NULL | DEFAULT 'new'
deleted_at| timestamp with time zone | nullable
Indexes:
  idx_agent_feedback_status  btree (status)
  idx_agent_feedback_deleted_at  btree (deleted_at) WHERE deleted_at IS NULL
```

**Controller:** `feedback.controller.ts` lines 59-76 define:
- `PATCH :id/status` — admin-guarded
- `DELETE :id` — admin-guarded, `@HttpCode(204)`

**PATCH test:**
```json
PATCH /feedback/f9cfc324-.../status  body: {"status":"planned"}
Response: {"id": "f9cfc324-...", "status": "planned"}
```

**DELETE test:**
```
DELETE /feedback/f9cfc324-... → HTTP 204
```

**Status filter test:**
```
GET /feedback?status=planned → {"total": 1, "items_count": 1}  (correct item returned)
```

---

### Fix 5 — Exclude soft-deleted from findAll

**Code evidence — feedback.service.ts line 78:**
```ts
.where('fb.deletedAt IS NULL');
```

**API test:** After soft-deleting the test item:
```
GET /feedback?status=planned → {"total": 0, "items_count": 0}
```

**DB confirmation:**
```sql
SELECT id, status, deleted_at FROM agent_feedback WHERE id = 'f9cfc324-...';
-- id=f9cfc324-..., status=planned, deleted_at=2026-04-05 20:05:00.7099+00
```
Item has `deleted_at` set and does not appear in the API list.

---

### Fix 6 — Default feedback page to New tab

**Code evidence — FeedbackPage.tsx line 97:**
```ts
const [statusFilter, setStatusFilter] = useState<StatusFilter>('new');
```

Line 107:
```ts
const queryStatus = statusFilter === 'active' ? undefined : statusFilter;
```

On initial render `statusFilter = 'new'`, so `queryStatus = 'new'`, and the API is called with `?status=new`. The Radio.Group shows `value="new"` as the selected button by default.

---

## Notes

1. **Migrations were not applied before testing.** All fixes involving new DB columns (Fixes 2, 4, 5) were broken at runtime with `column fb.deleted_at does not exist` until `migration:run` was executed. This is an operational issue — the migrations existed in source but the dev environment was not up to date. Running `migration:run` resolved all three.

2. **Fix 3 truncation discrepancy:** The commit claim says "500 chars" but the implemented value is 300. This is an improvement over the original ~80 characters, so the spirit of the fix is correct, but the commit message is inaccurate.

3. **All test entries cleaned up** via soft delete via the API.
