# MCP Sync Session Handoff — 2026-04-09

## Що зробили

### 1. Синк з бекенд-змінами (commits 9355171, b77a107)
- `set_translation` — додали вимогу source locale в описі (backend тепер кидає 400 якщо відсутній)
- `validate_keys` — додали у Quick Start guide в `prompts.ts` (інструмент був реалізований але не згадувався в guide)
- `bulk_set_locale` — уточнили що для існуючих ключів
- Версія MCP: `1.3.4 → 1.3.5 → 1.3.6 → 1.3.7`

### 2. Аудит та нові тули (v1.3.6)
- `create_locale` — додані відсутні параметри `aliases` (BCP 47 варіанти) і `initTranslate` (авто-переклад при створенні)
- `bulk_check_quality` — новий тул, `POST .../entries/bulk-quality-check`
- `reset_namespace_translations` — новий тул, `POST .../namespaces/:ns/reset-translations`
- `reset_namespace_quality` — новий тул, `POST .../namespaces/:ns/reset-quality`
- `delete_translation` — тепер `keys: string[]`, використовує `bulk-delete` endpoint

**Не додано (BlockMcpGuard):** `bulk-mark-expected`, `bulk-context`

### 3. Видалення надлишкового коду
- `bulk-context` endpoint — видалено (context передається inline через `set_translation`/`bulk_set_locale`)
- `bulk-translate` endpoint — видалено (superseded by `ai-translate/bulk-and-save`)

### 4. Renamed: batch → bulk скрізь
Всі sandbox endpoints і service methods перейменовані:
- `entries/batch` → `entries/bulk`
- `entries/batch-delete` → `entries/bulk-delete`
- `entries/batch-revert` → `entries/bulk-revert`
- DTOs: `BatchRevertDto` → `BulkRevertDto`
- Service: `batchUpsert/Delete/Revert` → `bulkUpsert/Delete/Revert`

**Не перейменовано навмисно:** `duplicate_in_batch`, `batchKeysSeen`, `batchConflictWith` — внутрішні змінні що описують "поданий пакет" в analyze логіці.

## Стан після сесії
- Всі зміни закомічені в `develop`
- MCP версія: `1.3.7`
- Збірка чиста (tsc, lint)

## Що ще можна зробити (не критично)
- `bulk-mark-expected` — розглянути чи прибрати `BlockMcpGuard` щоб виставити в MCP
- `ai-config` endpoints — можливо додати read-only MCP тул (`get_ai_config`)
- `bulk-revert` — зараз є в бекенді але не виставлений в MCP (аналогічно `bulk-translate` що видалили)
