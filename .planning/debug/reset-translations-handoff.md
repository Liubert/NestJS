# Reset Translations — Handoff Document
**Date:** 2026-04-07  
**Branch:** `develop`

---

## Проблема
Після натискання "Reset translations" у namespace `main` деякі ключі (`hey`, `wer`) продовжували відображатись у sandbox.

## Причини (всі три усунуті)

### 1. COALESCE production fallback у `listSandboxEntries`
Запит використовував `COALESCE(sv.value, tv.value)` — якщо sandbox_value не існував, показував значення з production. Після reset sandbox значень не залишалося, але production значення "протікали" назад.

**Fix (commit `02d7ef8`):** Замінено на sandbox-only запит без COALESCE.

### 2. Auto `not_checked` loop після production fallback
Після видалення sandbox_values функція `listSandboxEntries` присвоювала `reviewState: 'not_checked'` усім локалям, включаючи ті де значення прийшли з production fallback. Це давало spinning-іконки.

**Fix (commit `1dec6e4`):** Видалено автоматичний loop що присвоював `not_checked` усім локалям.

### 3. `triggerForNamespace` у `deleteNamespaceSandboxTranslations`
Після DELETE sandbox values функція одразу викликала `autoTranslateWorkerService.triggerForNamespace()`, що **обходив** `auto_translate_enabled = false` і негайно вставляв нові переклади.

**Fix (commit `ca3cabc`):** Видалено виклик `triggerForNamespace`.

---

## Поточний стан

### ✅ Що працює
- Після reset, DB коректно містить 0 non-default sandbox_values для namespace
- Сторінка більше не показує production fallback значення
- Spinning іконки після reset відсутні

### ⚠️ Незакрита проблема: `deleted: 2` завжди повертається

Другий reset (після першого) завжди повертає `{"deleted":2}`, незважаючи на те що DB показує 0 рядків безпосередньо перед викликом.

**Досліджено та виключено:**
- `auto_translate_enabled = false` для проекту `kill` → regular polling не вставляє
- `init_translate = false` для всіх локалей → `processInitTranslateLocales` не вставляє
- DB check (0 rows) → reset 2 (deleted:2) → DB check (0 rows) = підтверджено

**Можливі причини:**
1. **TypeORM artifact:** `dataSource.query()` для `DELETE RETURNING id` може повертати `[rows, rowCount]` 2-елементний масив замість масиву рядків. `result.length` = 2 завжди.
2. **Race condition:** Якийсь процес встигає вставити 2 рядки в мілісекунди між DB-check і DELETE запитом (але жоден кандидат не знайдено).

**Важливо:** Функціонально reset ПРАЦЮЄ — translations зникають з UI. Лічильник `deleted: N` — cosmetic issue.

---

## Файли змінені

| Файл | Commit | Що змінено |
|------|--------|-----------|
| `src/modules/translations/sandbox.service.ts` | `02d7ef8` | Sandbox-only display query, missingLocale filter fix |
| `src/modules/translations/sandbox.service.ts` | `ca3cabc` | Removed `triggerForNamespace` call |
| `src/modules/translations/sandbox.service.ts` | `1dec6e4` | Removed auto `not_checked` loop |
| `src/modules/translations/ai-config.service.ts` | `1dec6e4` | Tightened contextNeed rules |
| `src/modules/translations/ai-prompt-builder.ts` | `1dec6e4` | Fixed bulk quality prompt |
| `src/modules/translations/ai-translate.service.ts` | `1dec6e4` | Placeholder mismatch inline check |
| `src/modules/translations/quality-worker.service.ts` | `1dec6e4` | Single bulkCheckQuality call |
| `src/modules/translations/quality-constants.ts` | `1dec6e4` | CONTEXT_REQUIRED_CAP, CONTEXT_USEFUL_CAP |

---

## Наступні кроки

### Пріоритет 1: Розслідувати `deleted: 2`
Перевірити що `dataSource.query<{id: string}[]>()` реально повертає для DELETE RETURNING:
- Додати `console.log('DELETE result:', JSON.stringify(result.slice(0,3)), 'len:', result.length)` у `deleteNamespaceSandboxTranslations` перед `return`
- Зробити rebuild + тест

Якщо `result` = `[[], 0]` (TypeORM wrapper), то треба використовувати `result[0]` або `Array.isArray(result[0]) ? result[0].length : result.length`.

### Пріоритет 2: Deploy до stage
```bash
git push origin develop
# або
gh workflow run build-and-stage.yml --ref develop
```

### Пріоритет 3: Встановити `en` locale guidance
Через MCP tool `update_locale` для усіх проектів — встановити `localeSkill: "British English"` для локалі `en`.

---

## Середовище
- Local API: `http://localhost:8080`
- DB container: `nest_js_postgres_1`, database: `ecom`, user: `postgres`
- Stage: `http://79.76.35.167:8080`
- Test project: `kill`, namespace: `main`
