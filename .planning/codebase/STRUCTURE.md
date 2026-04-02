# Codebase Structure

**Analysis Date:** 2026-04-02

## Directory Layout

```
nest_js/
├── src/
│   ├── main.ts                      # NestJS bootstrap entry point
│   ├── app.module.ts                # Root module, imports all feature modules
│   ├── app.controller.ts            # Health check / root endpoint
│   ├── app.service.ts               # Root service (minimal)
│   │
│   ├── config/                      # Configuration management
│   │   ├── app.config.ts            # Load env vars, db config, auth config
│   │   └── swagger/
│   │       └── swagger.ts           # Swagger/OpenAPI documentation setup
│   │
│   ├── common/                      # Shared utilities (cross-cutting)
│   │   ├── dto/
│   │   │   ├── paginated-response.dto.ts      # Paginate helper + type
│   │   │   └── pagination.dto.ts              # Offset/limit pagination params
│   │   │
│   │   ├── filters/
│   │   │   └── global-exception.filter.ts     # Catch-all exception handler
│   │   │
│   │   ├── interceptors/
│   │   │   └── response-time.interceptor.ts   # Log response times
│   │   │
│   │   ├── middleware/
│   │   │   └── logger.middleware.ts           # Log HTTP requests
│   │   │
│   │   ├── decorators/
│   │   │   └── IdempotencyKey.ts              # Idempotency decorator
│   │   │
│   │   ├── validators/
│   │   │   └── password.validator.ts          # Custom password strength validator
│   │   │
│   │   ├── transformers/
│   │   │   └── trim-transformer.ts            # Trim whitespace from strings
│   │   │
│   │   └── constant/
│   │       └── pagination.const.ts            # Default page size
│   │
│   ├── database/
│   │   ├── data-source/
│   │   │   └── data-source.ts       # TypeORM DataSource config (TypeORM CLI)
│   │   │
│   │   ├── migrations/
│   │   │   ├── 1771*.ts             # Migration files (timestamped)
│   │   │   └── [latest: 17714000000004-context-need-reason.ts]
│   │   │
│   │   └── seed/
│   │       └── run-seed.ts          # Database seed script
│   │
│   ├── modules/
│   │   │
│   │   ├── auth/                    # Authentication & JWT
│   │   │   ├── auth.module.ts       # Feature module
│   │   │   ├── auth.controller.ts   # Routes: /auth/login, /auth/forgot-password, etc.
│   │   │   ├── auth.service.ts      # Login, forgot-password, reset-password logic
│   │   │   ├── jwt-auth.guard.ts    # Guard: extract + verify JWT
│   │   │   ├── jwt-strategy.ts      # Passport JWT strategy
│   │   │   ├── roles.guard.ts       # Guard: check user role (@Roles)
│   │   │   ├── current-user.decorator.ts  # Extract user from request
│   │   │   ├── mcp-tokens.controller.ts   # Routes: /auth/mcp-tokens CRUD
│   │   │   ├── mcp-tokens.service.ts      # MCP token management
│   │   │   ├── mcp-token.strategy.ts      # Passport custom token strategy
│   │   │   ├── block-mcp.guard.ts         # Guard: prevent MCP calls where forbidden
│   │   │   ├── entities/
│   │   │   │   ├── password-reset-token.entity.ts    # Password reset tokens
│   │   │   │   └── mcp-token.entity.ts               # API tokens for MCP
│   │   │   ├── types/
│   │   │   │   ├── jwt-payload.type.ts        # JWT payload structure
│   │   │   │   └── auth.types.ts              # Request with user type
│   │   │   └── dto/
│   │   │       └── [login, forgot-password, reset-password, mcp-token DTOs]
│   │   │
│   │   ├── users/                   # User management
│   │   │   ├── users.module.ts
│   │   │   ├── users.controller.ts  # Routes: /users GET/POST/PATCH
│   │   │   ├── users.service.ts     # User CRUD, avatar file handling
│   │   │   ├── user.entity.ts       # User table definition
│   │   │   ├── types/
│   │   │   │   ├── user-role.enum.ts        # ADMIN, USER, GUEST
│   │   │   │   └── current-user.type.ts     # Type for @CurrentUser
│   │   │   └── dto/
│   │   │       ├── admin-create-user.dto.ts
│   │   │       ├── create-user.dto/
│   │   │       │   ├── create-user.dto.ts
│   │   │       │   ├── update-user.dto.ts
│   │   │       │   └── response-user.dto.ts
│   │   │       └── [change-password, get-me DTOs]
│   │   │
│   │   ├── translations/            # Core translation management (largest)
│   │   │   ├── translations.module.ts
│   │   │   │
│   │   │   ├── controllers/
│   │   │   │   ├── translations.controller.ts    # Routes: project/namespace/entry CRUD, imports, public API
│   │   │   │   ├── sandbox.controller.ts        # Routes: /sandbox/* endpoints
│   │   │   │   └── ai-config.controller.ts      # Routes: /ai-config CRUD
│   │   │   │
│   │   │   ├── services/
│   │   │   │   ├── translations.service.ts      # Project/namespace/entry/member CRUD, core logic
│   │   │   │   ├── sandbox.service.ts           # Sandbox/production diff, promote, staging
│   │   │   │   ├── ai-translate.service.ts      # Gemini translation calls, batch translate
│   │   │   │   ├── ai-config.service.ts         # AI config persistence, prompt management
│   │   │   │   ├── ai-usage.service.ts          # Token usage logging
│   │   │   │   ├── quality-worker.service.ts    # Async quality check worker
│   │   │   │   ├── quality-queue.service.ts     # Quality check queueing
│   │   │   │   ├── quality-backfill.service.ts  # Bulk quality scoring
│   │   │   │   ├── auto-translate-worker.service.ts  # Auto-translate missing locales
│   │   │   │   └── quality-constants.ts         # Score → level mapping
│   │   │   │
│   │   │   ├── entities/
│   │   │   │   ├── project.entity.ts            # translation_projects table
│   │   │   │   ├── namespace.entity.ts          # translation_namespaces table
│   │   │   │   ├── locale.entity.ts             # translation_locales table
│   │   │   │   ├── translation-key.entity.ts    # translation_keys table (with context)
│   │   │   │   ├── translation-value.entity.ts  # translation_values table (with quality fields)
│   │   │   │   ├── project-member.entity.ts     # project_members table (owner/member roles)
│   │   │   │   ├── sandbox-value.entity.ts      # Staging/sandbox values
│   │   │   │   ├── production-snapshot.entity.ts # Snapshot for diff calculation
│   │   │   │   ├── ai-config.entity.ts          # AI model/prompt config
│   │   │   │   └── ai-usage-log.entity.ts       # Token usage log
│   │   │   │
│   │   │   └── dto/
│   │   │       ├── create-project.dto.ts
│   │   │       ├── create-namespace.dto.ts
│   │   │       ├── create-locale.dto.ts
│   │   │       ├── update-locale.dto.ts
│   │   │       ├── update-namespace.dto.ts
│   │   │       ├── create-entry.dto.ts         # Create translation key + values
│   │   │       ├── update-entry.dto.ts
│   │   │       ├── list-entries-query.dto.ts
│   │   │       ├── add-member.dto.ts
│   │   │       ├── ai-translate.dto.ts         # Request AI translation
│   │   │       ├── check-quality.dto.ts        # Request quality check
│   │   │       ├── import-translations.dto.ts  # ZIP file import
│   │   │       └── selective-promote.dto.ts    # Promote subset of sandbox
│   │   │
│   │   ├── files/                   # File storage (S3)
│   │   │   ├── files.module.ts
│   │   │   ├── files.controller.ts  # Routes: /files/presign, /files/complete
│   │   │   ├── files.service.ts     # S3 presigned URLs, file record tracking
│   │   │   ├── file-record.entity.ts # FileRecordEntity (metadata)
│   │   │   ├── storage/
│   │   │   │   └── s3-storage.service.ts  # AWS S3 SDK wrapper
│   │   │   └── dto/
│   │   │       ├── presign.dto.ts
│   │   │       └── complete.dto.ts
│   │   │
│   │   ├── webhooks/                # Event webhooks
│   │   │   ├── webhooks.module.ts
│   │   │   ├── webhooks.controller.ts  # Routes: /webhooks CRUD
│   │   │   ├── webhooks.service.ts     # Webhook CRUD, batch delivery, retry logic
│   │   │   ├── entities/
│   │   │   │   └── webhook.entity.ts   # WebhookEntity (url, events, secret, failures)
│   │   │   └── dto/
│   │   │       ├── create-webhook.dto.ts
│   │   │       └── update-webhook.dto.ts
│   │   │
│   │   └── mcp-prompts/            # MCP prompt customization
│   │       ├── mcp-prompts.module.ts
│   │       ├── mcp-prompts.controller.ts  # Routes: /mcp-prompts CRUD
│   │       ├── mcp-prompts.service.ts
│   │       ├── entities/
│   │       │   └── mcp-prompt.entity.ts
│   │       └── dto/
│   │           ├── create-mcp-prompt.dto.ts
│   │           └── update-mcp-prompt.dto.ts
│   │
│   └── types/
│       └── [Shared type definitions]
│
├── admin-ui/                       # React admin interface
│   ├── src/
│   │   ├── App.tsx                 # Root layout, routing, nav menu
│   │   ├── main.tsx                # React entry point
│   │   │
│   │   ├── api/
│   │   │   └── client.ts           # Axios instance with auth interceptor
│   │   │
│   │   ├── pages/
│   │   │   ├── LoginPage.tsx       # /login route
│   │   │   ├── auth/
│   │   │   │   ├── ForgotPasswordPage.tsx
│   │   │   │   ├── ResetPasswordPage.tsx
│   │   │   │   └── ChangePasswordPage.tsx
│   │   │   │
│   │   │   ├── projects/
│   │   │   │   ├── ProjectsPage.tsx      # /projects: list + create
│   │   │   │   └── ProjectSettingsPage.tsx  # /projects/:id: manage members, locales, namespaces
│   │   │   │
│   │   │   ├── translations/
│   │   │   │   └── TranslationsPage.tsx  # /translations: browse/edit entries, quality view
│   │   │   │
│   │   │   ├── users/
│   │   │   │   └── UsersPage.tsx        # /users: CRUD (admin only)
│   │   │   │
│   │   │   ├── api-tokens/
│   │   │   │   └── ApiTokensPage.tsx    # /api-tokens: create/revoke MCP tokens
│   │   │   │
│   │   │   ├── ai-settings/
│   │   │   │   └── AiSettingsPage.tsx   # /ai-settings: configure model, prompts
│   │   │   │
│   │   │   ├── ai-config/
│   │   │   │   └── AiConfigPage.tsx     # /ai-config: project-level config
│   │   │   │
│   │   │   └── mcp-prompts/
│   │   │       └── McpPromptsPage.tsx   # /mcp-prompts: prompt customization
│   │   │
│   │   ├── constants/               # Client-side constants
│   │   ├── assets/                  # Images, icons, static files
│   │   └── [other React components as needed]
│   │
│   ├── index.html                 # HTML template
│   ├── vite.config.ts             # Vite build config
│   └── package.json
│
├── docs/                           # Documentation
│   └── [architecture docs, guides]
│
├── test/                           # E2E tests
│   └── jest-e2e.json
│
├── .github/
│   └── workflows/
│       └── build-and-stage.yml     # CI/CD: build docker images, push to GHCR, deploy to stage
│
├── docker-compose.yml              # Production compose (volumes, network, env)
├── compose.dev.yml                 # Dev compose (bind mounts for auto-reload)
├── Dockerfile                      # Multi-stage build for backend + admin UI
│
├── .env.example                    # Env template (no secrets)
├── .prettierrc                     # Code formatter config
├── eslint.config.mjs               # ESLint config
│
├── tsconfig.json                   # Base TypeScript config
├── tsconfig.build.json             # Build-time config
│
├── package.json                    # Node.js dependencies
├── package-lock.json
│
├── README.md                       # Project overview
├── CLAUDE.md                       # Project instructions
├── Makefile                        # Development helpers (make dev-build, etc)
│
└── .planning/
    └── codebase/
        ├── ARCHITECTURE.md         # This document
        ├── STRUCTURE.md            # This file
        ├── STACK.md                # Tech stack (if generated)
        ├── INTEGRATIONS.md         # External services (if generated)
        └── [other analysis docs]
```

## Directory Purposes

**src/:**
Backend NestJS application source code. TypeScript, compiled to `dist/` during build.

**src/config/:**
Environment and service configuration. `app.config.ts` loads env vars via ConfigService, providing database connection, JWT secret, Gemini API key, etc.

**src/common/:**
Shared code applied globally or across multiple modules. Filters, guards, decorators, DTOs, validators, transformers.

**src/database/:**
TypeORM configuration, migrations, and seeds. `data-source.ts` is required by TypeORM CLI for migrations. Migration files are timestamped, numbered sequentially.

**src/modules/:**
Feature modules, each encapsulating a domain (auth, users, translations, files, webhooks). Module exports services for use by other modules.

**src/modules/translations/:**
Largest and most complex module. Handles projects, namespaces, locales, translation keys/values, sandbox staging, AI translation, quality scoring, webhooks.

**admin-ui/src/:**
React UI for translation management. Pages correspond to main features. `api/client.ts` is central for all API calls.

**admin-ui/src/pages/:**
Route-level pages. Each page is a major feature (Projects, Translations, Users, etc.). Sub-pages for related flows (auth, settings).

**docs/:**
Architecture overviews, API documentation, runbooks (deployment, troubleshooting).

**.github/workflows/:**
GitHub Actions CI/CD pipelines. `build-and-stage.yml` triggers on push to `develop`, builds Docker images, pushes to GHCR, deploys via SSH.

## Key File Locations

**Entry Points:**
- `src/main.ts`: Backend bootstrap
- `admin-ui/src/main.tsx`: React bootstrap
- `admin-ui/src/App.tsx`: Root layout/routing

**Configuration:**
- `src/config/app.config.ts`: Environment and service config
- `.env`: Environment variables (not in git)
- `.env.example`: Template
- `compose.yml`: Production Docker Compose
- `compose.dev.yml`: Development Docker Compose (bind mounts)

**Core Logic:**
- `src/modules/translations/translations.service.ts`: Project/namespace/entry/member management
- `src/modules/translations/sandbox.service.ts`: Staging and promotion
- `src/modules/translations/ai-translate.service.ts`: Gemini translation
- `src/modules/auth/auth.service.ts`: Login, password reset
- `src/modules/users/users.service.ts`: User management

**Data Models:**
- `src/modules/translations/entities/translation-*.entity.ts`: Core translation schema
- `src/modules/users/user.entity.ts`: User table
- `src/modules/auth/entities/password-reset-token.entity.ts`: Password reset tokens

**Testing:**
- `test/jest-e2e.json`: E2E test config
- `jest.config.js`: Unit test config (likely in root)

**Admin UI API:**
- `admin-ui/src/api/client.ts`: Axios client with auth interceptor

## Naming Conventions

**Files:**
- Controllers: `[feature].controller.ts` (e.g., `auth.controller.ts`)
- Services: `[feature].service.ts` (e.g., `translations.service.ts`)
- Entities: `[name].entity.ts` (e.g., `project.entity.ts`)
- DTOs: `[action]-[name].dto.ts` (e.g., `create-project.dto.ts`) or `[name]-query.dto.ts`
- Guards: `[purpose].guard.ts` (e.g., `jwt-auth.guard.ts`)
- Strategies: `[name].strategy.ts` (e.g., `jwt-strategy.ts`)
- Interceptors: `[purpose].interceptor.ts` (e.g., `response-time.interceptor.ts`)
- Filters: `[purpose].filter.ts` (e.g., `global-exception.filter.ts`)
- Middleware: `[purpose].middleware.ts` (e.g., `logger.middleware.ts`)
- Modules: `[feature].module.ts` (e.g., `auth.module.ts`)

**Directories:**
- Modules: `src/modules/[feature-name]/` (kebab-case)
- Feature subdirs: `entities/`, `dto/`, `types/` (lowercase)
- Pages in admin-ui: `src/pages/[feature-name]/` (kebab-case)

**Decorators/Types:**
- Decorators: PascalCase with @ prefix (e.g., `@CurrentUser()`)
- Type files: `[name].type.ts` (e.g., `jwt-payload.type.ts`)
- Enums: `[name].enum.ts` (e.g., `user-role.enum.ts`)

**Functions/Variables:**
- camelCase for functions, variables, services, constants
- UPPER_SNAKE_CASE for constants only (e.g., `RESET_TOKEN_TTL_HOURS`)
- PascalCase for classes and entity names

## Where to Add New Code

**New Feature (e.g., "Translation History"):**
- Primary code: `src/modules/translations/entities/translation-history.entity.ts`, `translation-history.service.ts`, `translation-history.controller.ts`
- Tests: `test/translation-history.service.spec.ts` or `test/e2e/translation-history.e2e.spec.ts`
- DTO: `src/modules/translations/dto/create-translation-history.dto.ts`
- Module registration: Export from `translations.module.ts`

**New Admin UI Page (e.g., "Translation History View"):**
- Implementation: `admin-ui/src/pages/translations/TranslationHistoryPage.tsx`
- API calls: Add methods to client or create dedicated hook
- Routing: Add route to `admin-ui/src/App.tsx`

**New Module (e.g., "Analytics"):**
- Structure: `src/modules/analytics/analytics.module.ts`, `analytics.service.ts`, `analytics.controller.ts`
- Entities: `src/modules/analytics/entities/analytics.entity.ts`
- Register in `src/app.module.ts` imports
- Follow same pattern as existing modules

**Shared Utilities:**
- Validators: `src/common/validators/[name].validator.ts`
- Transformers: `src/common/transformers/[name].transformer.ts`
- Constants: `src/common/constant/[name].const.ts`
- DTOs: `src/common/dto/[name].dto.ts` (if truly cross-module)

**Configuration:**
- App config: `src/config/app.config.ts` (load from env)
- Feature-specific config: `src/modules/[feature]/[feature].config.ts` (optional)

## Special Directories

**dist/:**
- Purpose: Compiled JavaScript output
- Generated: Yes (via `npm run build`)
- Committed: No (in .gitignore)

**node_modules/:**
- Purpose: Node.js dependencies
- Generated: Yes (via `npm install`)
- Committed: No (in .gitignore)

**admin-ui/node_modules/, admin-ui/dist/:**
- Purpose: Admin UI dependencies and build output
- Generated: Yes
- Committed: No

**.planning/:**
- Purpose: GSD analysis documents
- Generated: Yes (by GSD tools)
- Committed: Yes (versioned as docs)

**test/:**
- Purpose: E2E test files, jest configs
- Generated: No (written manually)
- Committed: Yes

**docs/:**
- Purpose: Project documentation, architecture overview, runbooks
- Generated: No (written manually)
- Committed: Yes

---

*Structure analysis: 2026-04-02*
