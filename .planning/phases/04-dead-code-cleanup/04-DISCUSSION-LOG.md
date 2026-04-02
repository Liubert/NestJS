# Phase 4: Dead Code Cleanup - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-02
**Phase:** 04-dead-code-cleanup
**Areas discussed:** Scope of cleanup, MCP module location, Inventory format, Partial features

---

## Scope of cleanup

| Option | Description | Selected |
|--------|-------------|----------|
| Endpoints + deps | Audit routes, cascade-remove service methods/DTOs/entities when orphan confirmed | ✓ |
| Endpoints only | Only routes. Services/DTO/entity stay even if unused | |
| Full codebase sweep | Endpoints + all unused: imports, types, utilities, dead files | |

**User's choice:** Endpoints + deps (cascading cleanup)
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| Audit and flag | Check modules for consumers, flag as orphan but don't delete whole modules | ✓ |
| Audit and remove | Delete entire module if no consumers | |
| Skip modules | Don't touch whole modules, only endpoints within them | |

**User's choice:** Audit and flag (don't remove entire modules)
**Notes:** None

---

## MCP module location

| Option | Description | Selected |
|--------|-------------|----------|
| Separate NPM package | MCP package on NPM registry | |
| Separate repo (GitHub) | MCP module in another GitHub repo | |
| In this repo | MCP code in this same repository | ✓ |
| I don't know | Claude searches NPM/GitHub | |

**User's choice:** In this repo
**Notes:** Found at `mcp-server/src/` — package name `localization-mcp-server`. Uses axios client to call backend API.

| Option | Description | Selected |
|--------|-------------|----------|
| Claude analyzes | Claude reads mcp-server/src/tools/*.ts, extracts API paths, auto-matches with backend | ✓ |
| Manual review | Form endpoint list, user verifies manually | |

**User's choice:** Claude analyzes automatically
**Notes:** None

---

## Inventory format

| Option | Description | Selected |
|--------|-------------|----------|
| Markdown in .planning/ | .planning/ENDPOINT-INVENTORY.md with table | ✓ |
| Code comments | Comments in controllers: // Consumer: Admin UI, MCP tool X | |
| Both | Markdown table + code comments | |

**User's choice:** Markdown in .planning/
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| Snapshot | Inventory stays as audit artifact, may go stale | ✓ |
| Living document | Maintain on every endpoint change | |

**User's choice:** Snapshot
**Notes:** None

---

## Partial features

| Option | Description | Selected |
|--------|-------------|----------|
| Default: remove | Unfinished = unpredictable. Remove code. | ✓ |
| Case-by-case | Claude presents each, user decides per feature | |
| Default: finish | Nearly done features get completed | |

**User's choice:** Default: remove
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| Keep DB columns | Remove code only, leave DB columns/tables | ✓ |
| Drop columns too | New migration to DROP COLUMN | |

**User's choice:** Keep DB columns
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| Claude finds them | Claude analyzes codebase for partial features during planning | ✓ |
| I know some | User provides known list | |
| Only what's in code | Pure code analysis | |

**User's choice:** Claude finds them
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| Always remove | Unfinished = remove, no exceptions | |
| Flag for review | If 90%+ complete, flag for user decision | ✓ |

**User's choice:** Flag for review (close-to-complete features get user review)
**Notes:** None

---

## Claude's Discretion

- Order of audit (which controllers to scan first)
- How to verify Admin UI consumption
- Commit granularity
- How to present flagged partial features for review
