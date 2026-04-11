# Technology Stack

**Analysis Date:** 2026-04-02

## Languages

**Primary:**
- TypeScript 5.7.3 - Backend (NestJS) and frontend (React admin-ui)

**Secondary:**
- JavaScript - Configuration files, build tooling
- SQL - PostgreSQL database migrations and queries (via TypeORM)

## Runtime

**Environment:**
- Node.js 22 (requirement: >=22.0.0 per `package.json`)
- Alpine Linux in Docker (node:22-alpine)

**Package Manager:**
- npm 11.6.2
- Lockfile: `package-lock.json` and `admin-ui/package-lock.json` present

## Frameworks

**Backend Core:**
- NestJS 11.0.1 - REST API framework with dependency injection
- @nestjs/common 11.0.1 - Core decorators and utilities
- @nestjs/core 11.0.1 - Application foundation

**Backend Features:**
- @nestjs/config 4.0.2 - Environment and configuration management
- @nestjs/typeorm 11.0.0 - Database ORM integration
- @nestjs/jwt 11.0.2 - JWT token generation and validation
- @nestjs/passport 11.0.5 - Authentication strategies
- @nestjs/platform-express 11.0.1 - Express HTTP adapter
- @nestjs/swagger 11.2.5 - API documentation (Swagger/OpenAPI)

**Database:**
- TypeORM 0.3.28 - Object-relational mapper
- typeorm-naming-strategies 4.1.0 - Snake_case database naming (configured in `src/config/app.config.ts`)
- PostgreSQL 15 - Database server (via Docker)

**Authentication:**
- Passport 0.7.0 - Authentication middleware
- passport-jwt 4.0.1 - JWT strategy for token validation
- passport-custom 1.1.1 - Custom token strategy (for MCP tokens)
- bcryptjs 3.0.3 - Password hashing (NaCl-based, 10 rounds)

**Message Queue:**
- amqplib 0.10.9 - AMQP client for RabbitMQ
- RabbitMQ 3-management - Message broker (via Docker)

**File Storage & AI:**
- @aws-sdk/client-s3 3.990.0 - AWS S3 client for file uploads
- @aws-sdk/s3-request-presigner 3.990.0 - Signed URL generation
- @google/generative-ai 0.24.1 - Gemini 2.0 Flash API for translations and quality checks

**Frontend (Admin UI):**
- React 18.3.1 - UI framework
- React DOM 18.3.1 - DOM rendering
- React Router DOM 7.0.2 - Routing and navigation
- Ant Design 5.22.2 - Component library
- @ant-design/icons 6.1.0 - Icon pack for Ant Design
- TanStack React Query 5.62.7 - Server state management
- Axios 1.7.9 - HTTP client

**Frontend Build/Dev:**
- Vite 6.0.1 - Next-generation build tool (fast HMR)
- @vitejs/plugin-react 4.3.4 - React support for Vite
- TypeScript 5.6.2 - Type checking (frontend)

**Testing:**
- Jest 30.0.0 - Unit/integration test runner (backend)
- @nestjs/testing 11.0.1 - NestJS testing utilities
- ts-jest 29.2.5 - TypeScript support in Jest
- supertest 7.0.0 - HTTP assertion library
- @types/jest 30.0.0 - Jest type definitions

**Utilities:**
- class-validator 0.14.3 - DTO validation decorators
- class-transformer 0.5.1 - DTO serialization/transformation
- adm-zip 0.5.16 - ZIP file handling for import/export
- uuid 13.0.0 - UUID generation
- rxjs 7.8.1 - Reactive programming (NestJS internal use)
- reflect-metadata 0.2.2 - Metadata reflection (required for decorators)

**Build & Compilation:**
- @nestjs/cli 11.0.16 - NestJS CLI for building
- source-map-support 0.5.21 - Stack trace source mapping

## Configuration

**Environment:**
- `.env` file (not committed, see `.env.example`)
- Environment variables injected via `process.env` and `@nestjs/config`
- Configuration loaded in `src/config/app.config.ts` and type-checked as `AppConfig`

**Key Configuration Variables:**
- `APP_PORT` - Express server port (default 3000)
- `APP_NAME` - Application identifier
- `NODE_ENV` - Deployment environment (development, production, etc.)
- `JWT_SECRET` - Secret key for signing JWT tokens
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASS` - PostgreSQL connection
- `RABBITMQ_URL` - RabbitMQ AMQP connection string
- `GEMINI_API_KEY` - API key for Google Generative AI (Gemini)
- `AWS_REGION`, `AWS_S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` - S3 storage
- `ADMIN_UI_PORT` - Frontend port override (default 3001 locally, mapped to 80 in container)

**Build Configuration:**
- `tsconfig.json` - Main TypeScript configuration
- `tsconfig.build.json` - Build-specific TypeScript settings
- `eslint.config.mjs` - ESLint configuration (flat format, TypeScript-aware)
- `.prettierrc` - Code formatter config (single quotes, trailing commas)
- `jest.config` - Embedded in `package.json` (Jest entry point: `src/`, test pattern: `*.spec.ts`)

## Platform Requirements

**Development:**
- Node.js 22+
- Docker & Docker Compose (for local PostgreSQL, RabbitMQ, Redis)
- Git

**Production:**
- Node.js 22+ runtime
- PostgreSQL 15+ database
- RabbitMQ 3+ message broker
- AWS S3 bucket (optional, for file storage)
- Google Cloud API key (for Gemini AI features)
- HTTPS/TLS reverse proxy (nginx, CloudFlare, etc.)

**Deployment:**
- Docker images built to `prod` target (multi-stage: deps → build → prod with npm prune)
- Distroless variant available (`prod-distroless` stage using gcr.io/distroless/nodejs22-debian12:nonroot)
- Docker Compose for orchestration (local and stage)
- GitHub Actions for CI/CD (builds Docker images, pushes to GHCR, deploys via SSH)

---

*Stack analysis: 2026-04-02*
