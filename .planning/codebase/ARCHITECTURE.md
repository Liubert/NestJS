# Architecture

**Analysis Date:** 2026-04-02

## Pattern Overview

**Overall:** Modular NestJS backend with layered architecture following NestJS best practices (modules → controllers → services → repositories). Complementary React 19 + Ant Design admin UI with axios HTTP client.

**Key Characteristics:**
- Feature-based module organization (Auth, Translations, Users, Files, Webhooks, McpPrompts)
- Dependency injection via NestJS modules
- TypeORM for data persistence with migrations
- JWT + passport strategy authentication (JWT + MCP token dual auth)
- Centralized error handling via global exception filter
- Async webhook delivery with batching and retries
- AI-powered translation via Gemini 2.0 Flash
- Sandbox/staging environment for translations
- Quality scoring system with state management

## Layers

**HTTP/REST Layer:**
- Purpose: Accept and respond to API requests
- Location: `src/modules/*/**.controller.ts`
- Contains: Route definitions, request/response handling, parameter validation, guard application
- Depends on: Services, DTOs, decorators (@CurrentUser, @UseGuards)
- Used by: Admin UI, external clients via public Locize-compatible endpoints

**Service/Business Logic Layer:**
- Purpose: Implement business rules, orchestrate data access, handle domain logic
- Location: `src/modules/*/*.service.ts`
- Contains: TranslationsService, AuthService, UsersService, FilesService, SandboxService, AiTranslateService, AiConfigService, AiUsageService, WebhooksService, McpTokensService
- Depends on: Repositories (via @InjectRepository), other services, ConfigService
- Used by: Controllers, other services

**Data Access Layer:**
- Purpose: Abstract database operations via TypeORM repositories
- Location: `src/modules/*/entities/**.entity.ts` (entity definitions), services (repository injection)
- Contains: Entity models with column definitions, relationships, constraints; Repository<Entity> instances
- Depends on: TypeORM, database
- Used by: Services

**Configuration & Setup Layer:**
- Purpose: Bootstrap application, load environment config, register middleware/interceptors/filters
- Location: `src/main.ts` (entry point), `src/app.module.ts` (root module), `src/config/`
- Contains: NestFactory bootstrap, ValidationPipe setup, global interceptors, middleware registration, Swagger setup
- Depends on: ConfigService, module imports
- Used by: Application startup

**Cross-Cutting Concerns:**
- Purpose: Shared utilities applied globally or at multiple points
- Location: `src/common/`
- Contains: Decorators (@CurrentUser, @IdempotencyKey), filters (GlobalExceptionFilter), interceptors (ResponseTimeInterceptor), middleware (LoggerMiddleware), validators, transformers, DTOs

**Presentation Layer (Admin UI):**
- Purpose: React-based admin interface for managing translations, projects, users
- Location: `admin-ui/src/`
- Contains: Pages (TranslationsPage, ProjectsPage, UsersPage, etc.), API client, routing
- Depends on: axios client, React Router, Ant Design, TanStack React Query
- Used by: Browser users

## Data Flow

**Authentication Flow:**

1. User submits email + password → `POST /auth/login`
2. AuthService finds user, compares bcrypt password hash
3. JwtService signs JWT payload (sub, role, email, scopes)
4. Response includes accessToken + user object
5. Client stores in localStorage
6. Subsequent requests: axios interceptor adds `Authorization: Bearer <token>` header
7. JwtStrategy extracts token, verifies signature, populates req.user
8. Controllers use @CurrentUser() decorator to extract user from request

**Translation Management Flow:**

1. User creates project → `POST /translations/projects` → TranslationsService.createProject()
2. Project creates default locales, default namespace
3. User adds translation keys → `POST /translations/projects/:slug/namespaces/:ns/entries`
4. TranslationsService creates TranslationKeyEntity + TranslationValueEntity rows (one per locale)
5. Optionally: AI translates → `POST /translations/ai-translate` → AiTranslateService calls Gemini
6. Quality checks stored in TranslationValueEntity (score, level, comment, checkedAt, reviewState)
7. Sandbox changes logged to SandboxValueEntity
8. User promotes sandbox → SandboxService diffs against ProductionSnapshotEntity, applies diffs
9. Webhooks triggered on create/update/delete events (batched, 3-min window)

**Quality Checking Flow:**

1. Per-key quality check: `POST /translations/projects/:slug/quality-check` → CheckQualityDto
2. AiTranslateService calls Gemini with template prompts (interpolate context/hints)
3. Quality worker (`QualityWorkerService`) processes async jobs from RabbitMQ
4. Results stored: qualityScore, qualityLevel, qualityComment, qualityReviewState, qualityCheckedAt
5. Quality levels: 'green' (>80), 'yellow' (60-80), 'red' (<60), 'expected' (skip check), null (not checked)

**File Upload Flow:**

1. User requests presigned S3 URL → `POST /files/presign` → FilesService
2. FilesService returns signed URL, creates FileRecordEntity placeholder
3. Client uploads to S3 directly
4. Client notifies backend → `POST /files/complete` → FilesService updates FileRecordEntity
5. Other entities (User.avatarFileId) reference FileRecordEntity

**State Management (Sandbox):**

1. SandboxService maintains separate SandboxValueEntity from production TranslationValueEntity
2. User edits only affect sandbox
3. ProductionSnapshotEntity stores last-promoted snapshot for diff calculation
4. Promote writes sandbox diff to production, updates snapshot, clears sandbox

## Key Abstractions

**ProjectEntity with Access Control:**
- Purpose: Represents a translation project; controls who can access what
- Examples: `src/modules/translations/entities/project.entity.ts`
- Pattern: TranslationsService checks `isProjectAccessible()`, throws ForbiddenException if user is not owner/member (unless admin)

**TranslationKeyEntity × LocaleEntity × TranslationValueEntity:**
- Purpose: Many-to-many relationship: each key has values for each locale
- Examples: `src/modules/translations/entities/translation-key.entity.ts`, `translation-value.entity.ts`
- Pattern: Unique constraint on (keyId, localeId); qualityReviewState tracks per-value quality status

**WebhookEventPayload + Batch Delivery:**
- Purpose: Async event notification with batching to reduce chattiness
- Examples: `src/modules/webhooks/webhooks.service.ts`
- Pattern: Events buffered for 3 minutes, sent as batch; auto-disables webhook after 10 consecutive delivery failures

**AI Usage Tracking:**
- Purpose: Log token consumption per operation per project
- Examples: `src/modules/translations/ai-usage.service.ts`, AiUsageLogEntity
- Pattern: Non-blocking logging (catch errors); tracks inputTokens, outputTokens, model, operation type

**Sandbox/Production Duality:**
- Purpose: Staging area for translation changes before promotion to production
- Examples: `src/modules/translations/sandbox.service.ts`, SandboxValueEntity, ProductionSnapshotEntity
- Pattern: All edits go to sandbox; production is read-only except via promotion; snapshot preserves prod state for diff

## Entry Points

**Backend:**
- Location: `src/main.ts`
- Triggers: Server startup
- Responsibilities: Create NestJS app, apply global pipes/interceptors, load configuration, start HTTP listener

**API Root:**
- Location: `src/app.module.ts`
- Triggers: Application bootstrap
- Responsibilities: Register all feature modules (AuthModule, TranslationsModule, UsersModule, FilesModule, WebhooksModule, McpPromptsModule); apply LoggerMiddleware

**Auth Entry:**
- Location: `src/modules/auth/auth.controller.ts`
- Triggers: `POST /auth/login`, `POST /auth/forgot-password`, `POST /auth/reset-password`
- Responsibilities: Validate credentials, generate JWT, manage password reset tokens

**Translations Entry:**
- Location: `src/modules/translations/translations.controller.ts`
- Triggers: Project CRUD, namespace CRUD, entry CRUD, AI translate, quality check, imports
- Responsibilities: Route requests to TranslationsService, SandboxService, AiTranslateService based on endpoint

**Public Locize API:**
- Location: Routes in `src/modules/translations/translations.controller.ts` (public, no guard)
- Triggers: `GET /:projectSlug/:namespace/:locale`, `GET /:projectSlug/locales`
- Responsibilities: Return public translation files for frontend i18n consumption

**Admin UI Entry:**
- Location: `admin-ui/src/App.tsx`
- Triggers: Browser navigation
- Responsibilities: Layout, routing, auth token management, user menu

## Error Handling

**Strategy:** Global exception filter + per-service throw patterns

**Patterns:**
- UnauthorizedException (401) — invalid credentials, missing/invalid JWT
- ForbiddenException (403) — user lacks project access (non-admin, non-owner/member)
- NotFoundException (404) — resource not found
- ConflictException (409) — unique constraint violation (e.g. duplicate project slug, duplicate key in namespace)
- BadRequestException (400) — validation failure, invalid input
- BadGatewayException (502) — external service error (Gemini API)
- ServiceUnavailableException (503) — required config missing (e.g. GEMINI_API_KEY)

GlobalExceptionFilter (`src/common/filters/global-exception.filter.ts`) catches all exceptions, logs details, returns JSON response with statusCode, timestamp, path, error.

## Cross-Cutting Concerns

**Logging:** 
- LoggerMiddleware logs all HTTP requests with method, path, response time
- Individual services use NestJS Logger (captured to stdout)
- Exceptions logged with full stack trace unless HttpException

**Validation:**
- ValidationPipe applied globally in bootstrap (whitelist, forbidNonWhitelisted, transform enabled)
- class-validator decorators on all DTOs (@IsString, @IsOptional, @Matches, @IsIn, etc.)
- Custom validators: PasswordValidator validates password strength

**Authentication:**
- JwtStrategy extracts JWT from Authorization header, verifies signature
- McpTokenStrategy for API token auth (used by MCP tools)
- JwtAuthGuard combines both strategies via @UseGuards(JwtAuthGuard)
- RolesGuard enforces role-based access (@UseGuards(RolesGuard) + @Roles('ADMIN'))

**Transaction Handling:**
- DataSource.transaction() used for multi-step operations (e.g., create project with default locale/namespace)
- Sandbox promotion uses transaction to ensure atomic diff application

---

*Architecture analysis: 2026-04-02*
