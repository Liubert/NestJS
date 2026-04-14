# Phase 1: Test Infrastructure - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-02
**Phase:** 01-test-infrastructure
**Areas discussed:** Scope тестів, Fixture/seeding, CI інтеграція

---

## Scope тестів

### Test coverage depth

| Option | Description | Selected |
|--------|-------------|----------|
| Мінімальний scaffold | 1-2 інтеграційні тести: create entry + get entries. Довести інфраструктуру. | ✓ |
| Основний CRUD | 4-6 тестів: create/read/update/delete entry + create project + namespace | |
| Широкий CRUD + edge cases | 8-12 тестів: весь CRUD + дублікати, неіснуючі ресурси, валідація | |

**User's choice:** Мінімальний scaffold
**Notes:** Focus on proving the infrastructure works, not broad coverage

### Test level

| Option | Description | Selected |
|--------|-------------|----------|
| HTTP/E2E | Supertest через NestJS app — тестує весь stack (guards, pipes, validation, DB) | ✓ |
| Service-level | Прямий виклик TranslationsService з реальним TypeORM | |
| Обидва рівні | HTTP для happy path, service-level для edge cases | |

**User's choice:** HTTP/E2E
**Notes:** Tests the real request path, closer to production behavior

---

## Fixture/seeding

### Data creation strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Inline в тесті | beforeAll створює project/namespace/locale через HTTP | ✓ |
| Helper функції | test/helpers/seed.ts з createTestProject(), createTestNamespace() | |
| SQL seeds | Прямий SQL в beforeAll через DataSource | |

**User's choice:** Inline в тесті
**Notes:** Simple, everything visible in one file. Sufficient for scaffold.

### Auth handling

| Option | Description | Selected |
|--------|-------------|----------|
| Логін через API | POST /auth/login в beforeAll, отримати JWT токен | ✓ |
| Mock JwtAuthGuard | Відключити guard в тестовому модулі | |
| Прямий JWT sign | JwtService.sign() для генерації токена | |

**User's choice:** Логін через API
**Notes:** Tests real auth flow

---

## CI інтеграція

### CI scope

| Option | Description | Selected |
|--------|-------------|----------|
| Тільки локально | npm test працює локально з Docker (Testcontainers). CI в Phase 2. | ✓ |
| CI зараз | Додати test step в build-and-stage.yml з Testcontainers | |

**User's choice:** Тільки локально
**Notes:** CI integration belongs in Phase 2 (Deploy Hardening)

### Old E2E test

| Option | Description | Selected |
|--------|-------------|----------|
| Видалити | NestJS boilerplate, не працює з реальним app | ✓ |
| Залишити | Не чіпати, нові тести окремо | |

**User's choice:** Видалити
**Notes:** Replace with real integration tests

---

## Claude's Discretion

- Test file organization (co-located vs separate directory)
- Testcontainers configuration details
- RabbitMQ handling in tests
- TypeORM migration strategy in test setup

## Deferred Ideas

None
