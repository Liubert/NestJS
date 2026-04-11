---
phase: quick
plan: 260406-wje
subsystem: translations
tags: [quality, namespace, backend, frontend]
dependency_graph:
  requires: []
  provides: [avgScore in ProjectDetails namespace entries]
  affects: [GET /translations/projects/:slug, ProjectSettingsPage]
tech_stack:
  added: []
  patterns: [TypeORM QueryBuilder with LEFT JOIN and AVG aggregate]
key_files:
  created: []
  modified:
    - src/modules/translations/translations.service.ts
    - admin-ui/src/pages/projects/ProjectSettingsPage.tsx
decisions:
  - LEFT JOIN with quality_score IS NOT NULL condition ensures only quality-checked values contribute to AVG; namespaces with zero checked values get null (not 0)
  - ROUND(AVG(...))::int cast returns integer score for clean display
  - Color thresholds: green >= 80, yellow >= 60, red < 60
metrics:
  duration: 15m
  completed: "2026-04-06"
---

# Quick Task 260406-wje: Add Average Quality Score Per Namespace Summary

**One-liner:** Backend `getProjectDetails` now computes `AVG(quality_score)` per namespace via QueryBuilder JOIN; frontend ProjectSettingsPage renders a colored `XX/100` badge next to each namespace name.

## What Was Done

### Task 1: Backend — NamespaceInfo interface + avgScore query

Added `NamespaceInfo` interface to `translations.service.ts`:
```typescript
export interface NamespaceInfo {
  slug: string;
  avgScore: number | null;
}
```

Updated `ProjectDetails.namespaces` from `string[]` to `NamespaceInfo[]`.

Replaced `namespaceRepo.findBy` in `getProjectDetails` with a QueryBuilder that joins through `ns.keys → tk.values` and computes `ROUND(AVG(tv.quality_score))::int`. The LEFT JOIN condition `tv.quality_score IS NOT NULL` ensures only checked values are included in the average. Namespaces with no quality-checked translations return `null`.

### Task 2: Frontend — NamespaceInfo type + badge rendering

Updated `ProjectDetails` interface in `ProjectSettingsPage.tsx` to use `namespaces: NamespaceInfo[]`.

Changed `p.namespaces.map((ns) => ...)` to `p.namespaces.map(({ slug: ns, avgScore }) => ...)` so the `ns` variable still holds the string slug (preserving all existing Popconfirm/mutation usages unchanged).

Added conditional badge after namespace slug text:
```tsx
{avgScore !== null && (
  <Text style={{ fontSize: 11, fontWeight: 500, color: avgScore >= 80 ? '#52c41a' : avgScore >= 60 ? '#faad14' : '#ff4d4f' }}>
    {avgScore}/100
  </Text>
)}
```

## Deviations from Plan

None — plan executed exactly as written.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1+2  | 145ae9a | feat(quick-260406-wje): add average quality score per namespace |

## Self-Check: PASSED

- `/Users/liubomyrfedyshyn/WebstormProjects/nest_js/src/modules/translations/translations.service.ts` — modified, contains `NamespaceInfo`, `avgScore`
- `/Users/liubomyrfedyshyn/WebstormProjects/nest_js/admin-ui/src/pages/projects/ProjectSettingsPage.tsx` — modified, contains `avgScore`
- Commit `145ae9a` — verified in git log
- Backend `tsconfig.build.json --noEmit` — no errors
- ESLint on `translations.service.ts` — no errors
