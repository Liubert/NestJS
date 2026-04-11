# Phase 5: UI Polish - Research

**Researched:** 2026-04-02
**Domain:** React 18 + Ant Design v5 + TypeScript — frontend-only refactor of TranslationsPage.tsx
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Quality indicators style**
- D-01: Replace tiny 10px dots with colored dots (12-14px) + visible score text inline. Example: `🟢 85`, `🔵 skip`, `⚪ —`. Score is visible without hover; tooltip still shows full details.
- D-02: Color mapping for states: green = checked, blue = skipped/expected, red = low score (checked), gray = pending/not_checked.
- D-03: "Failed" state (API error, not low score) uses orange/warning color to distinguish from red (low score). This communicates system failure vs quality judgment.
- D-04: Keep existing tooltip content and Popconfirm interactions (mark/unmark expected). Only change the visual presentation.

**Filtering & sorting UX**
- D-05: Expand existing quality dropdown with more filter options: all review states (checked, skipped, failed, pending, expected) plus score ranges (0-50, 50-80, 80-100). Keep in current filter bar location.
- D-06: Sorting by quality score uses the existing Sort dropdown pattern — add 'Quality Score' option alongside existing 'Key' and 'Created At'. No column header click sorting.
- D-07: The `sortBy` state already has a `qualityScore` value defined. The API already supports `qualityLevel` param. Leverage existing wiring.

**Table layout & density**
- D-08: Keep all locale columns visible (no tabs, no expandable rows). Optimize widths: fixed key column (~200px), ellipsis with tooltip for long values, quality badge inline after value text.
- D-09: Use Ant Design Table `size='small'` for compact mode. Reduces row height, fits more entries on screen.
- D-10: No horizontal scrolling at normal screen widths (≥1280px). If locales exceed screen width, allow horizontal scroll as graceful fallback.

**Component structure**
- D-11: Extract QualityBadge, FilterBar, EntryEditModal, and column definitions into separate files. TranslationsPage remains as orchestrator/page component.
- D-12: Extracted components go in `admin-ui/src/pages/translations/components/` subfolder. Files: QualityBadge.tsx, FilterBar.tsx, EntryEditModal.tsx, columns.tsx.
- D-13: Do component extraction FIRST (before visual changes) so subsequent changes are isolated to the right file.

### Claude's Discretion
- Exact pixel values for spacing and font sizes
- How to implement ellipsis + tooltip pattern (CSS vs Ant Design Typography.Text ellipsis)
- Internal state management approach for extracted components (props vs context)
- Order of filter dropdown options
- Whether to extract helper functions (API calls, unmark/mark expected) into a separate hooks file

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| UI-01 | Quality state indicators color-coded (green=checked, blue=skipped, red=failed, gray=pending) | QualityBadge component identified; existing dot-only badges need size + score text upgrade; orange addition for 'failed' state confirmed in D-03 |
| UI-02 | Translations page readability improved (layout, spacing, typography) | Table already has `size='small'`; key column already 240px with Tooltip; locale columns currently 180px with word-break. Column width tuning and ellipsis pattern are the main levers. |
| UI-03 | Translations filterable/sortable by quality score | Backend supports `qualityLevel` param (green/yellow/red/unchecked/needs_context). Sort by `qualityScore` is wired in state and API. Key gap: review-state filters (checked/skipped/failed/pending) require backend DTO change. |
</phase_requirements>

---

## Summary

Phase 5 is a pure frontend change to `admin-ui/src/pages/translations/TranslationsPage.tsx` (2609 lines). The file is a monolith — QualityBadge, EditModal, filter bar, table columns, and all API calls live inline. The work splits into three concerns: (1) visual update to quality badges, (2) filter/sort expansion, and (3) structural refactoring into extracted components.

The biggest technical finding is a **mismatch between what the UI currently tries to send and what the backend accepts**: the frontend filter dropdown already has `{ value: 'expected', label: 'Expected' }` but the backend DTO `@IsIn(['green', 'yellow', 'red', 'unchecked', 'needs_context'])` rejects it with a 400 error. D-05 wants to add `checked`, `skipped`, `failed`, and `pending` review-state filters too — these filter on `quality_review_state`, not `quality_level`, and the backend service and DTO need extending to support them. This is NOT a frontend-only change for that specific D-05 subset.

The table already uses `size='small'`. Sort by `qualityScore` is already wired in state and `handleTableChange` (via column header click on the Quality column). D-06 asks for a separate Sort dropdown — that is a UI addition, not wiring work. Column widths are fixed values (Key: 240px, Locale: 180px, Quality: 90px, Actions: 80px) and can be tuned without API involvement.

**Primary recommendation:** Execute in three sequential plans: (1) component extraction, (2) visual badge changes + table layout, (3) filter/sort expansion including backend DTO additions for review-state filters.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| antd | 5.22.2 | UI component library | Already installed; provides Table, Tag, Tooltip, Select, Typography.Text |
| @ant-design/icons | 6.1.0 | Icon set | Already installed; CheckCircleOutlined, SyncOutlined, WarningOutlined in use |
| react | 18.3.1 | Component model | Project standard |
| @tanstack/react-query | 5.62.7 | Server state | Already used for all API calls in TranslationsPage |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| TypeScript | 5.6.2 | Type safety | All frontend files; enforce props interfaces for extracted components |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Ant Design Typography.Text ellipsis | CSS `text-overflow: ellipsis` | AntD Typography.Text provides `ellipsis={{ tooltip: true }}` as a single prop — zero custom CSS, preferred per discretion area |
| Inline styles | CSS modules | Project convention is inline styles via `style={{}}` — do not introduce CSS modules |

**Installation:** No new packages needed. All required libraries are already installed.

---

## Architecture Patterns

### Recommended Project Structure After Extraction

```
admin-ui/src/pages/translations/
├── TranslationsPage.tsx              # Orchestrator — imports all extracted components
└── components/
    ├── QualityBadge.tsx              # Badge component for per-locale quality state
    ├── FilterBar.tsx                 # Namespace, search, quality filter, sort, add-key controls
    ├── EntryEditModal.tsx            # Edit/create modal with AI translate and quality check
    └── columns.tsx                   # Table column definitions (returns ColumnsType<Entry>)
```

### Pattern 1: Extracted Component with Props Interface

**What:** Each extracted component receives its data and callbacks via explicit props. No shared context.
**When to use:** When the component has clear inputs (data + handlers) and no need to reach into sibling state.
**Example:**
```typescript
// admin-ui/src/pages/translations/components/QualityBadge.tsx
interface QualityBadgeProps {
  info: QualityInfo | null | undefined;
  slug?: string;
  namespace?: string;
  entryKey?: string;
  locale?: string;
  isSandbox?: boolean;
  onUpdate?: () => void;
}

const QualityBadge: React.FC<QualityBadgeProps> = (props) => { ... };
export default QualityBadge;
```

### Pattern 2: Column Factory Function

**What:** `columns.tsx` exports a function that accepts runtime dependencies (locales, handlers, flags) and returns `ColumnsType<Entry>`.
**When to use:** Table columns need closure over data (locale list, projectSlug, namespace) that changes per render.
**Example:**
```typescript
// admin-ui/src/pages/translations/components/columns.tsx
export function buildColumns(
  locales: string[],
  projectSlug: string,
  namespace: string,
  isSandbox: boolean,
  onQualityUpdate: () => void,
): ColumnsType<Entry> { ... }
```

### Pattern 3: QualityBadge Visual — Dot + Score Text Inline

**What:** Replace bare `<span>` dot with a flex row: colored dot (12–14px) + score number or short label.
**When to use:** All quality states in the locale columns.
**Example:**
```typescript
// checked state — colored dot + score number
<Tooltip title={`Score: ${info.score}/100 — ${info.comment}`}>
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
    <span style={{ width: 12, height: 12, borderRadius: '50%',
                   backgroundColor: QUALITY_COLOR[info.level ?? ''] ?? '#bbb',
                   flexShrink: 0, display: 'inline-block' }} />
    <span style={{ fontSize: 11, color: QUALITY_COLOR[info.level ?? ''] }}>
      {info.score}
    </span>
  </span>
</Tooltip>

// skipped state — blue dot + 'skip' label
<span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
  <span style={{ width: 12, height: 12, borderRadius: '50%',
                 backgroundColor: '#1677ff', display: 'inline-block' }} />
  <span style={{ fontSize: 11, color: '#1677ff' }}>skip</span>
</span>

// failed state — orange ! + 'fail' label (D-03: orange, not red)
<span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
  <WarningOutlined style={{ color: '#fa8c16', fontSize: 12 }} />
  <span style={{ fontSize: 11, color: '#fa8c16' }}>fail</span>
</span>

// not_checked state — gray dot + dash
<span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
  <span style={{ width: 12, height: 12, borderRadius: '50%',
                 backgroundColor: '#d9d9d9', display: 'inline-block' }} />
  <span style={{ fontSize: 11, color: '#bbb' }}>—</span>
</span>
```

### Pattern 4: Ellipsis with Tooltip for Locale Values

**What:** Ant Design `Typography.Text` with `ellipsis={{ tooltip: true }}` prop. Truncates to one line; shows full value on hover.
**When to use:** Locale value cells in the table — prevents column from expanding to fit long strings.
**Example:**
```typescript
import { Typography } from 'antd';
const { Text } = Typography;

// In locale column render:
<Text
  style={{ maxWidth: 140, display: 'block', fontSize: 12 }}
  ellipsis={{ tooltip: val }}
>
  {val}
</Text>
```

### Pattern 5: Sort Dropdown (New UI Element)

**What:** A `<Select>` dropdown in the filter bar offering 'Key', 'Created At', 'Quality Score' options. Drives existing `sortBy`/`sortOrder` state.
**When to use:** Per D-06 — alongside the quality filter dropdown.
**Example:**
```typescript
<Select
  value={sortBy}
  onChange={(val) => { setSortBy(val); setPage(1); }}
  style={{ width: 160 }}
  options={[
    { value: 'key', label: 'Sort: Key' },
    { value: 'createdAt', label: 'Sort: Created' },
    { value: 'qualityScore', label: 'Sort: Quality' },
  ]}
/>
```

### Anti-Patterns to Avoid

- **Re-exporting types from TranslationsPage into sub-components:** Move shared interfaces (Entry, QualityInfo, QualityBadgeProps, etc.) to a `types.ts` file in the `components/` folder or keep in TranslationsPage and import from there. Do not duplicate.
- **Breaking column header click sorting:** `handleTableChange` currently handles sort changes from column headers (Key column has `sorter: true`). The Sort dropdown (D-06) should SET the same `sortBy`/`sortOrder` state — not replace the `handleTableChange` wiring. Both mechanisms can coexist.
- **Passing `'expected'` as a qualityLevel filter to the current API:** The backend DTO `@IsIn` guard rejects it. Either remove it or extend the DTO first.
- **Using CSS modules:** Project convention is inline `style={{}}` objects. Do not introduce CSS modules or Tailwind.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Text ellipsis with tooltip | Custom JS truncation + Tooltip | `Typography.Text ellipsis={{ tooltip }}` | AntD handles resize observer, screen reader, direction automatically |
| Colored status labels | Custom CSS badges | AntD `Tag` with `color` prop | Consistent with existing `REVIEW_STATE_TAG` usage in sandbox diff view |
| Table compact mode | Custom row height CSS | `Table size='small'` (already set) | Already applied at line 1578; no work needed |

**Key insight:** All visual primitives needed (colored dots, ellipsis text, compact table, tooltips, popovers) are already imported from Ant Design and used in TranslationsPage. The work is composition changes, not new library integration.

---

## Common Pitfalls

### Pitfall 1: Backend DTO Rejects New Review-State Filter Values

**What goes wrong:** Adding filter options like `checked`, `skipped`, `failed`, `pending` to the frontend dropdown and sending them as `qualityLevel` query params returns HTTP 400 (`@IsIn` validation failure in `ListEntriesQueryDto`).
**Why it happens:** The backend `qualityLevel` param is designed for quality LEVEL (green/yellow/red) not review STATE (checked/skipped/failed). They are different columns: `quality_level` vs `quality_review_state`.
**How to avoid:** For review-state filters, either:
  - Add a separate `reviewState` query param to `ListEntriesQueryDto` and handle it in `translations.service.ts`
  - OR scope D-05 to only the values the current backend already handles (green/yellow/red/unchecked/needs_context) and defer review-state filters
**Warning signs:** UI dropdown has `{ value: 'expected', label: 'Expected' }` already — this is currently broken (400 from API).

### Pitfall 2: Type Imports Break After Extraction

**What goes wrong:** Extracted `QualityBadge.tsx` references interfaces (`QualityInfo`, `Entry`) that were defined inline in `TranslationsPage.tsx`. TypeScript import error after move.
**Why it happens:** Interface definitions live at the top of TranslationsPage — no separate types file exists.
**How to avoid:** As part of extraction (D-13, do this first), move shared interfaces to a `types.ts` file or export them from `TranslationsPage.tsx` and import in extracted files. Decide one pattern and apply it consistently.

### Pitfall 3: `columns` Array Recreation on Every Render

**What goes wrong:** Building `ColumnsType<Entry>` inline inside the component body causes Ant Design Table to re-render all rows on every keystroke/state change.
**Why it happens:** The `columns` array is currently defined inside `EntriesTable` body at line 1328 — a new reference each render.
**How to avoid:** Wrap the columns definition in `useMemo` with all closure dependencies listed. Or use the factory function pattern from `columns.tsx` called inside `useMemo`.
```typescript
const columns = useMemo(
  () => buildColumns(locales, projectSlug, namespace, isSandbox, invalidate),
  [locales, projectSlug, namespace, isSandbox, invalidate]
);
```

### Pitfall 4: Locale Columns Exceed Screen Width

**What goes wrong:** With 4+ locales, table exceeds 1280px viewport and forces horizontal scroll even on desktop.
**Why it happens:** 4 locale columns × 180px + Key 240px + Quality 90px + Actions 80px = 770px+ which fits, but 6+ locales pushes past 1280px.
**How to avoid:** Reduce locale column width to 140–150px, use `Typography.Text ellipsis` (truncate with tooltip). Accept graceful horizontal scroll fallback for >5 locales per D-10.

### Pitfall 5: `EditModal` Extraction Breaks AI Translate and Quality Check Handlers

**What goes wrong:** The `EditModal` component at line 603 uses `aiTranslate`, `checkQuality`, `markExpected`, `unmarkExpected`, `markSandboxExpected`, `unmarkSandboxExpected` — all defined as free functions above it. When extracted to a separate file, these imports must follow.
**Why it happens:** The free API functions at lines 149–385 are not exported — they are module-level constants in the single file.
**How to avoid:** Either co-locate API calls in the extracted component file, or create an `api.ts` module in `components/` that exports all API functions used by the modal.

---

## Code Examples

### Updated QUALITY_COLOR with Orange for Failed (D-03)

```typescript
// Source: TranslationsPage.tsx line 398 — extend this map
const QUALITY_COLOR: Record<string, string> = {
  green: '#52c41a',
  yellow: '#faad14',
  red: '#ff4d4f',
  expected: '#1677ff',
  failed: '#fa8c16',   // orange — system error, not quality judgment
};
```

### Backend DTO Extension for Review-State Filter (D-05)

```typescript
// Source: src/modules/translations/dto/list-entries-query.dto.ts
// Add reviewState alongside existing qualityLevel:
@ApiPropertyOptional({
  description: 'Filter by review state',
  enum: ['checked', 'not_checked', 'skipped', 'failed', 'expected', 'queued', 'processing'],
})
@IsOptional()
@IsIn(['checked', 'not_checked', 'skipped', 'failed', 'expected', 'queued', 'processing'])
reviewState?: string;
```

```typescript
// Source: src/modules/translations/translations.service.ts — add after qualityLevel block
if (reviewState) {
  qb.andWhere(
    `EXISTS (
      SELECT 1 FROM translation_values tv4
      WHERE tv4.key_id = tk.id AND tv4.quality_review_state = :reviewState
    )`,
    { reviewState },
  );
}
```

### Score Range Filters via Frontend Client-Side (Alternative to D-05 partial)

If the planner chooses to avoid backend changes for score ranges (0-50, 50-80, 80-100), these could be client-side filters added to the `clientFilter` prop of `EntriesTable`. However, this only works on the current page of results — server-side is more correct for paginated data.

### Typography.Text Ellipsis (Ant Design 5.x)

```typescript
// Source: Ant Design v5 Typography docs (official)
import { Typography } from 'antd';
const { Text } = Typography;

<Text
  ellipsis={{ tooltip: fullValue }}
  style={{ maxWidth: 140, fontSize: 12 }}
>
  {fullValue}
</Text>
```

---

## Runtime State Inventory

Step 2.5 SKIPPED — this is a frontend visual/refactor phase, not a rename/migration phase. No stored data, live service config, OS registrations, secrets, or build artifacts are affected by these changes.

---

## Environment Availability

Step 2.6: SKIPPED (no external dependencies for frontend-only changes — admin-ui already runs via Vite dev server; no new tools required).

---

## Validation Architecture

`nyquist_validation` is explicitly set to `false` in `.planning/config.json`. This section is omitted per spec.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Dot-only quality indicators (10px, tooltip-only) | Dot (12–14px) + inline score text | Phase 5 | Score visible at a glance without hover |
| All logic inline in TranslationsPage.tsx | Extracted sub-components in `components/` | Phase 5 | Each file has single concern; easier to change badge independently |

**Deprecated/outdated:**
- `{ value: 'expected', label: 'Expected' }` in quality dropdown: passes `'expected'` as `qualityLevel` but backend rejects it — dead option in current code, must be fixed.

---

## Open Questions

1. **D-05: Review-state filter values require backend changes — is this acceptable scope for Phase 5?**
   - What we know: Backend DTO only accepts `['green', 'yellow', 'red', 'unchecked', 'needs_context']`. Adding `checked`, `skipped`, `failed`, `pending` requires extending `ListEntriesQueryDto` and `translations.service.ts`.
   - What's unclear: Whether the planner should include a backend plan for this or scope D-05 to values the current DTO already supports (only adjust labels + add the missing `'expected'` fix).
   - Recommendation: Include a small backend task in the filter-expansion plan. The change is ~10 lines (DTO + one service block). The phase explicitly says "no backend/API changes" — but the current `expected` filter option is already broken, so fixing the API contract is necessary to satisfy UI-03.

2. **D-06 says "existing Sort dropdown pattern" — there is no Sort dropdown currently**
   - What we know: Sort is currently driven by column header clicks via `handleTableChange`. The Sort dropdown described in D-06 does not exist in the current code.
   - What's unclear: The CONTEXT.md says "add 'Quality Score' option alongside existing 'Key' and 'Created At'" implying a dropdown exists. It does not.
   - Recommendation: Treat D-06 as "add a new Sort Select dropdown to the filter bar" — same UX pattern as other filter dropdowns, not an existing element. The state wiring (`sortBy`, `sortOrder`) already exists; only the UI control is missing.

3. **Shared interface location after component extraction**
   - What we know: Interfaces `Entry`, `QualityInfo`, `QualityBadgeProps`, `EditModalProps`, etc. are all defined at the top of TranslationsPage.tsx with no export.
   - What's unclear: Whether to put shared types in `components/types.ts`, export from `TranslationsPage.tsx`, or repeat in each extracted file.
   - Recommendation: Create `admin-ui/src/pages/translations/components/types.ts` to hold all shared interfaces. TranslationsPage imports from there. Each extracted component also imports from there. Single source of truth.

---

## Sources

### Primary (HIGH confidence)
- Direct code inspection: `admin-ui/src/pages/translations/TranslationsPage.tsx` (2609 lines) — all component locations, state structure, column widths, filter options verified by reading
- Direct code inspection: `src/modules/translations/dto/list-entries-query.dto.ts` — confirmed `@IsIn` validator and accepted values
- Direct code inspection: `src/modules/translations/translations.service.ts` lines 590–638 — confirmed filter handling logic and `qualityScore` sort implementation
- Direct code inspection: `src/modules/translations/entities/translation-value.entity.ts` — confirmed `qualityLevel` vs `qualityReviewState` column distinction
- Direct code inspection: `.planning/config.json` — confirmed `nyquist_validation: false`

### Secondary (MEDIUM confidence)
- Ant Design v5 `Typography.Text` `ellipsis={{ tooltip }}` prop — known from training, verified as current API pattern for AntD 5.x; no breaking changes in this feature in recent releases

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries verified by reading package.json and existing imports
- Architecture: HIGH — component structure directly derived from reading the 2609-line source file
- Pitfalls: HIGH — backend DTO constraint confirmed by reading the DTO file; type import issue is standard TypeScript extraction concern
- Open questions: HIGH confidence in the questions themselves; resolution requires planner judgment

**Research date:** 2026-04-02
**Valid until:** 2026-05-02 (stable — no fast-moving dependencies, all findings based on project source)
