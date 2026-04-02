# Phase 5: UI Polish - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Improve the translations page readability and make quality state visually clear. Primarily frontend work. Minimal backend changes are allowed where needed to support new filter parameters (review state filter, expected filter bugfix). Covers quality indicators, filtering/sorting by quality, table layout optimization, and component extraction from the monolithic TranslationsPage.

</domain>

<decisions>
## Implementation Decisions

### Quality indicators style
- **D-01:** Replace tiny 10px dots with colored dots (12-14px) + visible score text inline. Example: `🟢 85`, `🔵 skip`, `⚪ —`. Score is visible without hover; tooltip still shows full details.
- **D-02:** Color mapping for states: green = checked, blue = skipped/expected, red = low score (checked), gray = pending/not_checked.
- **D-03:** "Failed" state (API error, not low score) uses orange/warning color to distinguish from red (low score). This communicates system failure vs quality judgment.
- **D-04:** Keep existing tooltip content and Popconfirm interactions (mark/unmark expected). Only change the visual presentation.

### Filtering & sorting UX
- **D-05:** Expand existing quality dropdown with more filter options: all review states (checked, skipped, failed, pending, expected) plus score ranges (0-50, 50-80, 80-100). Keep in current filter bar location.
- **D-06:** Sorting by quality score uses the existing Sort dropdown pattern — add 'Quality Score' option alongside existing 'Key' and 'Created At'. No column header click sorting.
- **D-07:** The `sortBy` state already has a `qualityScore` value defined. The API already supports `qualityLevel` param. Leverage existing wiring.

### Table layout & density
- **D-08:** Keep all locale columns visible (no tabs, no expandable rows). Optimize widths: fixed key column (~200px), ellipsis with tooltip for long values, quality badge inline after value text.
- **D-09:** Use Ant Design Table `size='small'` for compact mode. Reduces row height, fits more entries on screen.
- **D-10:** No horizontal scrolling at normal screen widths (≥1280px). If locales exceed screen width, allow horizontal scroll as graceful fallback.

### Component structure
- **D-11:** Extract QualityBadge, FilterBar, EntryEditModal, and column definitions into separate files. TranslationsPage remains as orchestrator/page component.
- **D-12:** Extracted components go in `admin-ui/src/pages/translations/components/` subfolder. Files: QualityBadge.tsx, FilterBar.tsx, EntryEditModal.tsx, columns.tsx.
- **D-13:** Do component extraction FIRST (before visual changes) so subsequent changes are isolated to the right file.

### Backend scope
- **D-14:** Minimal backend changes are allowed for: (1) adding `reviewState` query param to `ListEntriesQueryDto` and wiring it in `translations.service.ts` and `sandbox.service.ts`, (2) fixing the broken `expected` value in the `qualityLevel` `@IsIn` validator. No other backend changes.

### Claude's Discretion
- Exact pixel values for spacing and font sizes
- How to implement ellipsis + tooltip pattern (CSS vs Ant Design Typography.Text ellipsis)
- Internal state management approach for extracted components (props vs context)
- Order of filter dropdown options
- Whether to extract helper functions (API calls, unmark/mark expected) into a separate hooks file

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### UI source files (modification targets)
- `admin-ui/src/pages/translations/TranslationsPage.tsx` — Main file to refactor (~2400 lines). Contains QualityBadge, filter bar, entry edit modal, table columns, all API calls.
- `admin-ui/src/api/client.ts` — Axios client with interceptors, base URL config
- `admin-ui/src/constants/supported-languages.ts` — Flag emoji mapping used in locale columns

### Backend API (minimal changes per D-14)
- `src/modules/translations/controllers/translations.controller.ts` — Endpoints for entries, quality check. Supports `qualityLevel` and `sortBy` query params.
- `src/modules/translations/controllers/sandbox.controller.ts` — Sandbox entry endpoints, same query params.
- `src/modules/translations/dto/list-entries-query.dto.ts` — DTO for entry list query; adding `reviewState` param and fixing `expected` in `qualityLevel` validator.
- `src/modules/translations/translations.service.ts` — Adding `reviewState` filter to `listEntries` method.
- `src/modules/translations/sandbox.service.ts` — Adding `reviewState` filter to `listSandboxEntries` method.

### Requirements
- `.planning/REQUIREMENTS.md` UI-01, UI-02, UI-03 — Quality indicators, readability, filtering requirements

### Quality state reference
- `src/modules/translations/entities/translation-value.entity.ts` — Defines qualityReviewState enum values and quality fields (score, level, comment, checkedAt)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `QualityBadge` component (inline in TranslationsPage.tsx:423-570): Already handles all review states. Needs visual update, not logic rewrite.
- `QUALITY_COLOR` map (line 398): Maps level to hex color. Needs orange addition for 'failed'.
- `REVIEW_STATE_TAG` map (line 386): Maps reviewState to Ant Design tag color + label. Used in sandbox diff view.
- `getFlagForCode()` utility: Returns flag emoji for locale code. Already imported.
- Ant Design `Select`, `Tag`, `Tooltip`, `Popconfirm`: Already imported and used throughout.

### Established Patterns
- Filter state via `useState` hooks: `qualityLevel`, `sortBy`, `searchTerm` all follow same pattern
- API calls use `apiClient.get/post` with query params object
- React Query `useQuery` for data fetching with `queryKey` arrays
- Inline styles via `style={{}}` objects (no CSS modules or Tailwind)

### Integration Points
- `fetchEntries()` function (line 160+): Accepts `qualityLevel` param, passes to API. Filter expansion connects here.
- `fetchSandboxEntries()` function (line 270+): Same pattern for sandbox mode.
- Table `columns` definition (line ~800+): Where layout changes (widths, ellipsis) apply.
- `sortBy` state (line 1191): Already includes `qualityScore` option but may not be wired to sort dropdown UI.

</code_context>

<specifics>
## Specific Ideas

- Quality score should be visible at a glance without hovering — the dots-only approach was insufficient for daily use
- Orange for "failed" state explicitly distinguishes system errors from quality judgments — never mix these
- Compact table mode (size='small') is important — the translations list can have hundreds of entries

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 05-ui-polish*
*Context gathered: 2026-04-02*
