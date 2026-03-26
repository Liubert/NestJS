# Translations Management API

Base URL: `http://localhost:8080`

---

## Authentication

All management endpoints require a JWT token.

**Login:**
```
POST /auth/login
Content-Type: application/json

{ "email": "admin@test.com", "password": "Admin123!" }
```

**Response:**
```json
{
  "accessToken": "eyJhbGci...",
  "user": { "id": "...", "email": "admin@test.com", "role": "admin", "firstName": "Admin", "lastName": "Boss" }
}
```

**Use token in every management request:**
```
Authorization: Bearer <accessToken>
```

---

## Public Endpoints (no auth — used by i18next in the frontend app)

These endpoints are read-only and Locize-compatible. Do not touch them.

```
GET /translations/:projectSlug/locales
GET /translations/:projectSlug/namespaces
GET /translations/:projectSlug/:namespace/:locale
```

Example: `GET /translations/travis/backoffice-translations/en`

---

## Projects

### List projects
```
GET /translations/projects
Authorization: Bearer <token>

Query params:
  page  (default: 1)
  limit (default: 50, max: 200)
```

Response:
```json
{
  "data": [
    { "id": "uuid", "slug": "travis", "name": "TRAVIS", "createdAt": "2026-03-26T..." }
  ],
  "meta": { "page": 1, "limit": 50, "total": 1, "totalPages": 1 }
}
```

### Get project details
```
GET /translations/projects/:slug
Authorization: Bearer <token>
```

Response:
```json
{
  "id": "uuid",
  "slug": "travis",
  "name": "TRAVIS",
  "createdAt": "2026-03-26T...",
  "locales": ["en", "da-DK", "nb-NO", "sv"],
  "namespaces": ["backoffice-translations", "mobile"]
}
```

### Create project
```
POST /translations/projects
Authorization: Bearer <token>
Content-Type: application/json

{ "slug": "my-project", "name": "My Project" }
```

- `slug` — required, lowercase letters/digits/dashes only (`^[a-z0-9-]+$`)
- `name` — optional, defaults to slug

Returns the created project object. 409 if slug already exists.

### Delete project
```
DELETE /translations/projects/:slug
Authorization: Bearer <token>
```

Returns `204 No Content`. Cascades — deletes all namespaces, keys, and values.

---

## Namespaces

### Create namespace
```
POST /translations/projects/:slug/namespaces
Authorization: Bearer <token>
Content-Type: application/json

{ "slug": "backoffice-translations" }
```

- `slug` — required, lowercase letters/digits/dashes only

Returns the created namespace object. 409 if slug already exists in this project.

### Delete namespace
```
DELETE /translations/projects/:slug/namespaces/:ns
Authorization: Bearer <token>
```

Returns `204 No Content`. Cascades — deletes all keys and values in this namespace.

---

## Translation Entries

An **entry** = one translation key + its values for all locales.

### List entries (with search and pagination)
```
GET /translations/projects/:slug/namespaces/:ns/entries
Authorization: Bearer <token>

Query params:
  page         (default: 1)
  limit        (default: 50, max: 200)
  search       (min 2 chars — searches in key name AND in any translation value)
  searchLocale (optional — restrict value search to a specific locale, e.g. "en")
  sortBy       ("key" | "createdAt", default: "key")
  sortOrder    ("asc" | "desc", default: "asc")
```

Response:
```json
{
  "data": [
    {
      "key": "accessControl",
      "createdAt": "2026-03-26T...",
      "values": {
        "en": "Access control",
        "da-DK": "Adgangskontrol",
        "nb-NO": "Adgangskontroll",
        "sv": "Åtkomstkontroll"
      }
    }
  ],
  "meta": { "page": 1, "limit": 50, "total": 742, "totalPages": 15 }
}
```

Examples:
```
# Search by key or any value
GET .../entries?search=access

# Search only in English values
GET .../entries?search=control&searchLocale=en

# Page 3, sorted by creation date descending
GET .../entries?page=3&limit=100&sortBy=createdAt&sortOrder=desc
```

### Create entry
```
POST /translations/projects/:slug/namespaces/:ns/entries
Authorization: Bearer <token>
Content-Type: application/json

{
  "key": "myNewKey",
  "values": {
    "en": "My new value",
    "nb-NO": "Min nye verdi"
  }
}
```

- `key` — required, pattern: `^[a-zA-Z0-9._-]+$`, max 255 chars
- `values` — optional, locale codes must match existing locales in the project (unknown locales silently ignored)

Returns the created entry. 409 if key already exists in this namespace.

### Update entry values
```
PATCH /translations/projects/:slug/namespaces/:ns/entries/:key
Authorization: Bearer <token>
Content-Type: application/json

{
  "values": {
    "en": "Updated value",
    "da-DK": "Opdateret værdi"
  }
}
```

- Only the provided locales are updated (upsert — existing values for other locales are untouched)
- Unknown locale codes are silently ignored

Returns the full updated entry with all locale values.

### Delete entry
```
DELETE /translations/projects/:slug/namespaces/:ns/entries/:key
Authorization: Bearer <token>
```

Returns `204 No Content`. Deletes the key and all its values across all locales.

---

## Current Data (already imported)

| Project | Namespaces | Locales | Keys |
|---------|-----------|---------|------|
| `travis` | `backoffice-translations`, `mobile` | `en`, `da-DK`, `nb-NO`, `sv` | ~742 / ~889 |

---

## Error Responses

All errors follow the same shape:

```json
{ "statusCode": 404, "message": "Project \"xyz\" not found", "error": "Not Found" }
```

| Status | Meaning |
|--------|---------|
| 400 | Validation error (invalid body/params) |
| 401 | Missing or invalid JWT token |
| 404 | Project / namespace / key not found |
| 409 | Duplicate slug or key |
| 500 | Internal server error |

---

## CORS

CORS is enabled globally — all origins are allowed. No extra config needed on the frontend.

---

## Swagger UI

Interactive docs available at: `http://localhost:8080/api` (dev only)
