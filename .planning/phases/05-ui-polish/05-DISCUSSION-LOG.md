# Phase 5: UI Polish - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-02
**Phase:** 05-ui-polish
**Areas discussed:** Quality indicators style, Filtering & sorting UX, Table layout & density, Component structure

---

## Quality Indicators Style

| Option | Description | Selected |
|--------|-------------|----------|
| Colored dots + score text | Keep dots (12-14px) + add visible score number inline | ✓ |
| Ant Design Tags | Replace dots with `<Tag>` badges. More prominent, more horizontal space | |
| Keep current dots | No visual change, focus effort elsewhere | |

**User's choice:** Colored dots + score text
**Notes:** Score visible without hover. Dots + inline score/label (e.g., 🟢 85, 🔵 skip)

### Failed State Sub-question

| Option | Description | Selected |
|--------|-------------|----------|
| Red exclamation + 'error' label | Distinct from low-score red dot | |
| Same red dot + 'fail' label | Consistent with other states | |
| Orange/warning color | Distinguish system error from quality judgment | ✓ |

**User's choice:** Orange/warning color
**Notes:** Explicitly distinguishes API errors from low quality scores

---

## Filtering & Sorting UX

| Option | Description | Selected |
|--------|-------------|----------|
| Expand existing dropdown | Add all review states + score ranges to current dropdown | ✓ |
| Filter tags bar | Clickable tags replacing dropdown, multiple active at once | |
| Column header filters | Ant Design table built-in column filter dropdowns | |

**User's choice:** Expand existing dropdown
**Notes:** Keep in current filter bar location. Add states: checked, skipped, failed, pending, expected. Add score ranges: 0-50, 50-80, 80-100.

### Sorting Sub-question

| Option | Description | Selected |
|--------|-------------|----------|
| Sort dropdown only | Add 'Quality Score' to existing Sort dropdown | ✓ |
| Column header click | Clickable column headers for sorting | |
| Both | Sort dropdown + column header click | |

**User's choice:** Sort dropdown only
**Notes:** Consistent with current pattern. sortBy state already has qualityScore value.

---

## Table Layout & Density

| Option | Description | Selected |
|--------|-------------|----------|
| Keep columns, improve widths | All locales visible, optimize column widths + ellipsis | ✓ |
| Expandable rows | Collapsed by default, click to see all locales | |
| Tabs per locale | One locale at a time with tab switcher | |

**User's choice:** Keep columns, improve widths
**Notes:** Fixed key column (~200px), ellipsis with tooltip for long values, quality badge inline after value.

### Density Sub-question

| Option | Description | Selected |
|--------|-------------|----------|
| Small/compact mode | Ant Design Table size='small' | ✓ |
| Keep default size | Current default padding | |
| Configurable | Density toggle in toolbar | |

**User's choice:** Small/compact mode
**Notes:** Reduces row height, fits more entries on screen.

---

## Component Structure

| Option | Description | Selected |
|--------|-------------|----------|
| Extract key components | QualityBadge, FilterBar, EntryEditModal, columns.tsx | ✓ |
| Minimal extraction only | Only QualityBadge (since it's being changed) | |
| No splitting | All changes inline in existing file | |

**User's choice:** Extract key components
**Notes:** TranslationsPage stays as orchestrator. Extract before visual changes.

### File Location Sub-question

| Option | Description | Selected |
|--------|-------------|----------|
| translations/components/ subfolder | admin-ui/src/pages/translations/components/ | ✓ |
| Shared components/ folder | admin-ui/src/components/ | |
| Same folder, separate files | Flat sibling files | |

**User's choice:** translations/components/ subfolder

---

## Claude's Discretion

- Exact pixel values for spacing and font sizes
- Ellipsis implementation approach (CSS vs Ant Design Typography)
- Internal state management for extracted components
- Order of filter dropdown options
- Whether to extract helper functions into hooks file

## Deferred Ideas

None — discussion stayed within phase scope
