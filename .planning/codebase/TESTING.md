# Testing Patterns

**Analysis Date:** 2026-04-02

## Test Framework

**Runner:**
- Jest v30.0.0
- Config: Embedded in `package.json` (lines 91-107) for unit tests
- E2E config: `test/jest-e2e.json` for end-to-end tests

**Assertion Library:**
- Jest built-in assertions (no separate library)
- Supertest v7.0.0 for HTTP request testing

**Run Commands:**
```bash
npm run test              # Run unit tests matching **/*.spec.ts
npm run test:watch       # Watch mode for development
npm run test:cov         # Generate coverage report
npm run test:debug       # Debug mode with inspector
npm run test:e2e         # Run E2E tests in test/ directory
```

**Coverage:**
- Target: Not enforced (no threshold configured)
- Output directory: `coverage/` (relative to root)
- Covered files: `**/*.(t|j)s` (all TS and JS files)

## Test File Organization

**Location:**
- Unit tests: Co-located with source in `src/` directory (not found in current state; only E2E in `test/`)
- E2E tests: Separate `test/` directory
- Pattern: `*.spec.ts` or `*.e2e-spec.ts` naming

**Naming:**
- Unit test: `[feature].spec.ts` — e.g., `auth.service.spec.ts`, `users.controller.spec.ts`
- E2E test: `*.e2e-spec.ts` — e.g., `app.e2e-spec.ts`

**Structure:**
```
test/
├── jest-e2e.json         # E2E configuration
└── app.e2e-spec.ts       # Example E2E test suite
```

## Test Structure

**Suite Organization:**
```typescript
// Example from test/app.e2e-spec.ts (lines 7-25)
describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });
});
```

**Patterns:**
- Setup (`beforeEach`): Create NestJS test module, initialize app
- Teardown: Not visible in existing tests; implicit via Jest cleanup
- Assertions: Supertest chain assertions with `.expect()` method

## Mocking

**Framework:**
- Jest mocks (built-in) — no separate mocking library required
- TypeORM test utilities for database

**Patterns:**
```typescript
// Typical mock pattern (not in current codebase, but follows NestJS standard):
const mockUsersRepository = {
  findOne: jest.fn(),
  save: jest.fn(),
};

Test.createTestingModule({
  providers: [
    UsersService,
    {
      provide: 'UsersRepository',
      useValue: mockUsersRepository,
    },
  ],
});
```

**What to Mock:**
- External dependencies: HTTP clients, database repositories
- Services injected via DI container
- Repositories: Mock TypeORM `Repository<Entity>` with Jest functions

**What NOT to Mock:**
- NestJS guards, pipes, interceptors (test with real instances when possible)
- Built-in NestJS utilities (use real implementations)
- Business logic that should be tested (avoid mocking core service logic)

## Fixtures and Factories

**Test Data:**
- No dedicated factories found in current codebase
- Pattern (from NestJS best practices): Create fixtures in `test/fixtures/` or co-locate with tests
- Example expected structure:
```typescript
// Could be implemented at test/fixtures/user.fixture.ts
export const createUserFixture = (overrides?: Partial<UserEntity>): UserEntity => ({
  id: 'test-id',
  email: 'test@example.com',
  passwordHash: 'hashed-password',
  role: 'USER',
  ...overrides,
});
```

**Location:**
- Hypothetical: `test/fixtures/` or `src/**/__fixtures__/`
- Alternative: Inline in test files for simple cases

## Coverage

**Requirements:**
- No coverage threshold enforced (no jest config for `coverageThreshold`)
- Coverage collected but not required for CI/CD

**View Coverage:**
```bash
npm run test:cov
# Outputs to coverage/ directory (HTML report at coverage/lcov-report/index.html)
```

## Test Types

**Unit Tests:**
- Scope: Individual services, controllers, utilities
- Approach: Test in isolation using mocks for dependencies
- Not present in current codebase but can be added following NestJS patterns
- Example target: `src/modules/auth/auth.service.spec.ts` would test login, forgotPassword, resetPassword methods

**Integration Tests:**
- Scope: Multiple layers (service + repository + database)
- Approach: Use real database (test DB or in-memory) or mock only external APIs
- Not implemented in current codebase

**E2E Tests:**
- Framework: Jest + Supertest (v7.0.0)
- Config: `test/jest-e2e.json` (lines 2-8)
- Pattern: Full app bootstrap via `Test.createTestingModule()` with `AppModule`
- Example (from `test/app.e2e-spec.ts`):
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });
});
```

## Common Patterns

**Async Testing:**
- Return Promise from test: `it('test', () => { return promise; })`
- Use `async/await`: `it('test', async () => { await someAsync(); })`
- Supertest chains return Promises automatically: `.expect(200).expect('body')`

**Error Testing:**
```typescript
// Pattern (not currently in codebase but standard):
it('should throw UnauthorizedException on invalid credentials', async () => {
  const mockUserRepo = { findOne: jest.fn().mockResolvedValue(null) };
  const service = new AuthService(mockUserRepo);
  
  await expect(service.login({ email: 'test@test.com', password: 'wrong' }))
    .rejects.toThrow(UnauthorizedException);
});
```

**Database Testing:**
- Not implemented in current test suite
- Would use TypeORM test utilities or mock repositories
- Consider SQLite in-memory DB for E2E tests

## Test Configuration

**Jest Config (`package.json` lines 91-107):**
```json
{
  "jest": {
    "moduleFileExtensions": ["js", "json", "ts"],
    "rootDir": "src",
    "testRegex": ".*\\.spec\\.ts$",
    "transform": { "^.+\\.(t|j)s$": "ts-jest" },
    "collectCoverageFrom": ["**/*.(t|j)s"],
    "coverageDirectory": "../coverage",
    "testEnvironment": "node"
  }
}
```

**E2E Config (`test/jest-e2e.json` lines 1-9):**
```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": ".",
  "testEnvironment": "node",
  "testRegex": ".e2e-spec.ts$",
  "transform": { "^.+\\.(t|j)s$": "ts-jest" }
}
```

**Key Differences:**
- Unit test `rootDir`: `src` (looks for tests within source)
- E2E test `rootDir`: `.` (looks in test directory)
- Both use `ts-jest` transformer for TypeScript

## Testing Dependencies

**Installed:**
- `@nestjs/testing@11.0.1` — NestJS test utilities, Test.createTestingModule
- `jest@30.0.0` — test runner
- `ts-jest@29.2.5` — TypeScript transpiler for Jest
- `supertest@7.0.0` — HTTP assertions (`.expect()` chainable interface)
- `@types/jest@30.0.0` — TypeScript types for Jest

## Current Test Coverage Status

**Unit Tests:**
- Not implemented (zero `.spec.ts` files in `src/`)
- Recommended: Add tests for critical services:
  - `src/modules/auth/auth.service.spec.ts` — login, password reset, token validation
  - `src/modules/users/users.service.spec.ts` — user CRUD, password hashing
  - `src/modules/translations/translations.service.spec.ts` — project/namespace/entry operations
  - `src/modules/translations/ai-translate.service.spec.ts` — Gemini API integration

**E2E Tests:**
- Single test (`test/app.e2e-spec.ts`) validates health endpoint
- Recommended: Expand to cover authentication flows, project operations, public translation endpoints

**Integration Points Not Tested:**
- Database persistence (repositories)
- JWT guard enforcement
- Role-based access control
- Validation pipes (class-validator)
- Global exception filter formatting
- RabbitMQ async queues (quality-worker, auto-translate-worker)

---

*Testing analysis: 2026-04-02*
