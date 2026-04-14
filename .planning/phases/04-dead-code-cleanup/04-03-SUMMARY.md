---
phase: 04-dead-code-cleanup
plan: 03
subsystem: api
tags: [files, s3, cleanup, dead-code, dto, service]

# Dependency graph
requires:
  - phase: 04-dead-code-cleanup plan 02
    provides: FilesController deleted, orphan endpoints removed from FilesModule
provides:
  - FilesService with only 3 live methods (findFileRecordsByIds, getViewUrl, getAvatarUrlForUser)
  - FileVisibility enum relocated to file-record.entity.ts
  - PresignUploadDto and CompleteUploadDto deleted
  - ENDPOINT-INVENTORY.md corrected to reflect FilesModule as a live indirect dependency
affects: [files-module, users-module, endpoint-inventory]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Enum colocation: enums used by entities are defined in the entity file, not in DTO files"

key-files:
  created: []
  modified:
    - src/modules/files/files.service.ts
    - src/modules/files/file-record.entity.ts
    - src/modules/files/files.module.ts
    - .planning/ENDPOINT-INVENTORY.md
  deleted:
    - src/modules/files/dto/presign.dto.ts
    - src/modules/files/dto/complete.dto.ts

key-decisions:
  - "FileVisibility enum moved to file-record.entity.ts — enums belong with the entity that uses them, not in deleted DTO files"
  - "SUMMARY 04-02 overclaimed FilesModule removed entirely — corrected: FilesModule is a live indirect dependency (UsersService calls getViewUrl)"

patterns-established:
  - "Gap closure: when a controller is deleted, audit the corresponding service for now-dead methods and helpers"

requirements-completed: [CLEAN-02]

# Metrics
duration: 8min
completed: 2026-04-02
---

# Phase 04 Plan 03: FilesService Dead Code Cleanup Summary

**Dead methods (presignUpload, completeUpload) and their DTOs stripped from FilesService; FileVisibility enum relocated to entity; ENDPOINT-INVENTORY.md corrected to document FilesModule as a live UsersService dependency.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-04-02T17:51:00Z
- **Completed:** 2026-04-02T17:59:08Z
- **Tasks:** 2
- **Files modified:** 4 (+ 2 deleted)

## Accomplishments

- Removed 4 dead methods from FilesService: `presignUpload()`, `completeUpload()`, `buildKeyForAvatar()`, `extensionFromContentType()` — all had zero callers after FilesController was deleted in Plan 02
- Deleted `presign.dto.ts` and `complete.dto.ts` entirely; relocated `FileVisibility` enum to `file-record.entity.ts`
- Removed unused `usersRepo` constructor injection and `UserEntity` from `FilesModule.forFeature` — no longer needed
- Corrected ENDPOINT-INVENTORY.md: FilesModule is NOT a dead module — `UsersService.updateUser()` calls `FilesService.getViewUrl()` for avatar URL resolution; added Corrections Log documenting SUMMARY 04-02 overclaim

## Task Commits

1. **Task 1: Remove dead methods from FilesService and relocate FileVisibility enum** - `deda1f6` (remove)
2. **Task 2: Correct ENDPOINT-INVENTORY.md to reflect accurate FilesModule status** - `b9aa854` (docs)

**Plan metadata:** _(final docs commit — pending)_

## Files Created/Modified

- `src/modules/files/files.service.ts` - Reduced from 151 lines to 43 lines; only 3 live methods remain
- `src/modules/files/file-record.entity.ts` - FileVisibility enum added locally; import from presign.dto removed
- `src/modules/files/files.module.ts` - UserEntity removed from TypeOrmModule.forFeature
- `.planning/ENDPOINT-INVENTORY.md` - Header updated, rows 64-65 status changed to "removed", "Modules Without Active Consumers" section corrected, Corrections Log added
- `src/modules/files/dto/presign.dto.ts` - DELETED (no callers; FileVisibility moved to entity)
- `src/modules/files/dto/complete.dto.ts` - DELETED (no callers)

## Decisions Made

- FileVisibility enum moved to `file-record.entity.ts` because the enum describes entity column values; DTOs should import from the entity, not the other way around
- ENDPOINT-INVENTORY.md required correction because Plan 02 summary incorrectly stated "FilesModule removed entirely" — in fact FilesModule is live because UsersService depends on FilesService.getViewUrl()

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Both verification gaps from `04-VERIFICATION.md` are now closed
- FilesService is clean with exactly 3 live methods
- ENDPOINT-INVENTORY.md accurately documents the current state of all 77 routes
- Phase 04 cleanup is complete

---
*Phase: 04-dead-code-cleanup*
*Completed: 2026-04-02*
