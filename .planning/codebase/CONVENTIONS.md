# Coding Conventions

**Analysis Date:** 2026-04-02

## Naming Patterns

**Files:**
- PascalCase for classes: `PasswordResetTokenEntity.ts`, `AuthService.ts`, `LoginPage.tsx`
- kebab-case for feature modules: `mcp-prompts.module.ts`, `translations.controller.ts`
- Suffixes required: `.entity.ts` (TypeORM), `.service.ts`, `.controller.ts`, `.dto.ts`, `.type.ts`, `.enum.ts`
- React components: PascalCase: `LoginPage.tsx`, `ProjectsPage.tsx`, `TranslationsPage.tsx`
- DTOs within folders: `create-project.dto.ts`, `update-entry.dto.ts`, `add-member.dto.ts`

**Functions and Methods:**
- camelCase: `createProject()`, `getProjectDetails()`, `forgotPassword()`, `resetPassword()`
- Private methods use `private` visibility modifier
- Async methods explicitly marked with `async` keyword
- Helper/assertion methods prefixed: `assert*()`, `require*()`, e.g., `requireProject()`, `assertAccess()`

**Variables:**
- camelCase: `userId`, `projectSlug`, `emailAddress`, `resetTokenRepo`
- Repository instances suffixed with `Repo`: `usersRepo`, `projectRepo`, `resetTokenRepo`
- Query builders use logical names: `qb` for QueryBuilder
- Constants: UPPER_SNAKE_CASE: `RESET_TOKEN_TTL_HOURS`, `DEFAULT_PAGE_SIZE`, `PASSWORD_REGEX`
- Unused parameters prefixed with `_`: `(_: unknown)`, `(_user: CurrentUserType)` signals intentional non-use

**Types:**
- PascalCase: `JwtPayload`, `CurrentUserType`, `LoginDto`, `CreateProjectDto`
- Type unions named descriptively: `'not_checked' | 'queued' | 'processing'` (literal unions preferred over enums for flexibility)
- Interfaces prefixed when defining extended versions: `RequestWithMetadata extends Request`

**Decorators and Enums:**
- PascalCase: `@ApiProperty`, `@IsEmail`, `@UseGuards(JwtAuthGuard)`
- Enum values: lowercase strings (preferred over numeric enums): `role: 'owner' | 'member'`, `level: 'green' | 'yellow' | 'red'`

## Code Style

**Formatting:**
- Tool: Prettier v3.7.4
- Settings: 
  - `singleQuote: true` — use single quotes for strings
  - `trailingComma: "all"` — trailing commas on multi-line objects
- File: `.prettierrc` at project root

**Linting:**
- Tool: ESLint v9 with TypeScript 5.7
- Config: `eslint.config.mjs` (Flat config format)
- Key rules (see `eslint.config.mjs` line 28-34):
  - `@typescript-eslint/no-explicit-any`: `warn` (typed code encouraged)
  - `@typescript-eslint/no-floating-promises`: `warn` (handle promises)
  - `@typescript-eslint/no-unsafe-argument`: `warn` (type safety)
  - `@typescript-eslint/no-unused-vars`: error with `argsIgnorePattern: '^_'` (unused params prefixed `_`)
  - `prettier/prettier`: error with `endOfLine: "auto"` (format enforcement)

**Command:**
```bash
npm run lint      # auto-fix + report
npm run lint:check # check only, don't fix
```

## Import Organization

**Order (from `src/modules/auth/auth.service.ts`, `src/main.ts`):**
1. NestJS core imports: `import { BadRequestException, Injectable } from '@nestjs/common'`
2. Third-party (standard library): `import { createHash, randomBytes } from 'crypto'`
3. Third-party (npm packages): `import * as bcrypt from 'bcryptjs'`
4. Relative imports from same project: `import { UsersService } from '../users/users.service.js'`
5. Type imports separated: `import type { JwtPayload } from './types/jwt-payload.type.js'`

**Path Aliases:**
- No path aliases configured. All imports are relative with `.js` extensions (ESM).
- Example: `import { AuthService } from '../auth/auth.service.js'` (not `@/auth`)

**Module Export Pattern:**
- Barrel files not used; direct imports from feature modules preferred
- Example: `import { UsersService } from './users/users.service.js'` not `import { UsersService } from './users'`

## Error Handling

**Patterns:**
- NestJS HTTP exceptions thrown from services: `BadRequestException`, `ConflictException`, `ForbiddenException`, `NotFoundException`, `UnauthorizedException`
- Error messages are user-facing: `throw new ConflictException('Project "slug" already exists')`
- Global exception filter (`AllExceptionsFilter` in `src/common/filters/global-exception.filter.ts`) catches all unhandled exceptions, returns 500 with timestamp and path
- Helper assertions for common patterns:
  - `requireProject(slug)` throws `NotFoundException` if project missing
  - `assertAccess(project, userId, userRole)` throws `ForbiddenException` if no access
  - `assertManageAccess()` for owner/admin operations

**Example (from `src/modules/auth/auth.service.ts`):**
```typescript
if (!user) {
  throw new UnauthorizedException('Invalid credentials');
}
if (record.usedAt) {
  throw new BadRequestException('Reset token has already been used');
}
```

## Logging

**Framework:** `Logger` from `@nestjs/common` (built-in)

**Patterns:**
- Instantiate per class: `private readonly logger = new Logger('HTTP')` or `new Logger(AllExceptionsFilter.name)`
- Log at request boundaries: start/end of request in middleware
- Correlation IDs tracked: `X-Correlation-Id` header propagated through request context
- Error logging includes full stack trace for non-HTTP exceptions
- Example (from `src/common/middleware/logger.middleware.ts`):
```typescript
this.logger.log(`[${requestId}] [correlationId=${correlationId}] START: ${req.method} ${req.originalUrl}`);
this.logger.error(`Http Status: ${status} Error Message: ${JSON.stringify(message)}`);
```

## Comments

**When to Comment:**
- Phase markers for planned work: `// PHASE 1 (temporary): returns raw token...` → `// PHASE 2: replace return with email send`
- Rationale for non-obvious decisions: e.g., why token is hashed before storage
- Section separators for logical grouping: `// ─── Projects ────` (dashed lines 70 chars wide)
- TODO for incomplete implementation: `// TODO: In future, should be used for forgot password...`
- Disable rule explanations: `// Added catchError` when adding imports

**JSDoc/TSDoc:**
- Used minimally; code is self-documenting
- Type definitions in DTOs use ApiProperty/ApiPropertyOptional from Swagger: `@ApiProperty({ example: 'value', description: '...' })`
- Example (from `src/modules/translations/dto/create-entry.dto.ts`):
```typescript
@ApiPropertyOptional({
  example: { en: 'Access control', 'nb-NO': 'Adgangskontroll' },
  description: 'Initial values per locale code',
})
@IsOptional()
@IsObject()
values?: Record<string, string>;
```

## Function Design

**Size:** Methods range from 2-50 lines; large services broken into logical helper methods (`requireProject()`, `assertAccess()`, `assertManageAccess()`)

**Parameters:** 
- Services accept DTOs or individual parameters
- Controllers pass decorators: `@CurrentUser()`, `@Body()`, `@Param()`, `@Query()`
- No optional parameters in service methods; use separate methods or early returns

**Return Values:**
- Services return entities, DTOs, or interfaces (not raw responses)
- Controllers return service results directly or wrapped with HTTP status codes
- Async operations always return Promises: `Promise<ProjectEntity>`, `Promise<void>`
- Union types for flexible returns: `UserEntity | null` (not Optional<>)

**Example (from `src/modules/auth/auth.service.ts`):**
```typescript
async login(dto: LoginDto) {
  const user = await this.usersService.findByEmailWithSensitiveData(dto.email);
  if (!user) throw new UnauthorizedException('Invalid credentials');
  // ...
  return { accessToken, user: { id, email, role, firstName, lastName, mustChangePassword } };
}
```

## Module Design

**Exports:**
- Feature modules export controllers, services, and entities via `@Module({ imports, controllers, providers, exports })`
- Controllers exported when needed by other modules
- Services exported for cross-module injection

**Barrel Files:**
- Not used; imports are direct and explicit

**Dependency Injection:**
- Constructor-based injection with `@InjectRepository()` for TypeORM
- Inject third-party services via constructor
- Use `forwardRef()` for circular dependencies: `Inject(forwardRef(() => TranslationsService))`

## Frontend (React) Conventions

**Component Structure:**
- Functional components with hooks (React 18): `const LoginPage: React.FC = () => {}`
- Props typed with `React.FC<Props>` interface
- Hooks at top level: `useState`, `useNavigate`, `useLocation`, `useQuery` (React Query)

**Styling:**
- Inline styles via style objects: `style={{ display: 'flex', justifyContent: 'center' }}`
- Ant Design components with theme tokens: `const { token: { colorBgContainer } } = theme.useToken()`
- No external CSS files in current codebase

**API Client:**
- Axios instance (`src/api/client.ts`) with interceptors:
  - Request: adds `Authorization: Bearer ${token}` header
  - Response: clears token and redirects to `/login` on 401
- API calls via axios directly in components or via React Query hooks

**Naming:**
- Components: PascalCase pages: `LoginPage`, `ProjectsPage`, `TranslationsPage`
- Handlers: `handle*` prefix: `handleLogout()`, `onFinish()`
- State: `const [loading, setLoading] = useState(false)`
- Types for API responses: `any` accepted (not strictly typed in admin-ui)

---

*Convention analysis: 2026-04-02*
