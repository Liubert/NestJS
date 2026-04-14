# Localization Platform — Current Architecture

Self-hosted translation management system replacing [locize](https://www.locize.app/). Stores, serves, and quality-checks translations for frontend, mobile, and backend applications.

**Why we are building this:** [locize](https://www.locize.app/) is becoming too expensive — currently around $100/month, expected to grow to $200–300/month after upcoming spring releases. This platform covers 100% of the [locize](https://www.locize.app/) features we actually use.

**Status:** Running on staging. During April 2026 we migrate our own project (frontend, mobile, backend). If successful, in May 2026 we open the platform for other teams.

---

## 1. Business / Product View

**Translation management**
Translations are organized into projects and namespaces (e.g. "front", "mobile", "backend" or "common", "settings"). Each project has its own languages, keys, and team members. Edits are made through the Admin UI or Claude.

The platform covers all parts of the product that need localized text:
- **Frontend** — UI labels, buttons, messages, validation text
- **Mobile** — same API as frontend
- **Backend** — error messages, email templates, PDF generation, push notifications

**Safe editing workflow (Sandbox → Production)**
All edits happen in a sandbox (draft). Changes reach production only after explicit review and push. Before each push, a snapshot is saved automatically. Production can be reverted to any of the last 5 snapshots.

**AI-powered translation**
Enter English text → the system generates translations for all target languages (Ukrainian, Norwegian, Swedish, Danish) using Google Gemini.

**Automated quality scoring**
Every translation is scored 1–100 by AI in the background:

| Level | Score | Meaning |
|-------|-------|---------|
| Green | 90–100 | Production-ready |
| Yellow | 80–89 | Could be improved |
| Red | Below 80 | Needs rework |

English source text is also checked for grammar quality. Scores and thresholds are configurable at runtime.

**User and access control**
Two roles: admin (full access) and regular user (access only to assigned projects). Project owners manage their own members.

**Claude integration (MCP)**
As part of this project, we built an MCP package for Claude. It works as a driver that lets Claude interact with the platform API. Setup is simple: generate a token in Admin UI, give it to Claude, and it can work with translations.

If Claude knows the context of the target project and understands our API, integration is straightforward. During testing, frontend and mobile integrations typically succeeded on the first or second attempt. Backend integrations may require a bit more developer involvement.

Claude cannot push to production — that requires human approval.

**ZIP import**
Existing translation files can be bulk-imported via ZIP. Projects, locales, and namespaces are created automatically from the file structure.

**Drop-in compatibility**
The API serves translations in the same JSON format as [locize](https://www.locize.app/). Existing frontend code works without changes — only the URL needs updating.

**Note:** A dedicated manual import/export UI for non-technical users is planned but not yet built.

---

## 2. DevOps / Technical View

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Docker Compose cluster                            │
│                                                                             │
│  ┌─────────────────┐   ┌─────────────────┐   ┌──────────────────────────┐  │
│  │    Admin UI      │   │      API         │   │     Quality Worker       │  │
│  │    (nginx)       │   │    (NestJS)      │   │       (NestJS)           │  │
│  │ :3010            │──▶│ :8080            │   │ no exposed port          │  │
│  └─────────────────┘   └───────┬──────────┘   └────────────┬─────────────┘  │
│                                │                            │                │
│              ┌─────────────────┴────────────────────────────┴──────┐         │
│              │                                                     │         │
│         ┌────▼─────────┐                            ┌─────────────▼──────┐  │
│         │ PostgreSQL 15 │                            │     RabbitMQ       │  │
│         │ :5432         │                            │ :5672 / :15672     │  │
│         └──────────────┘                            └────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘

```

### External services

```
                    ┌──────────────────────────┐
                    │      Google Gemini AI     │
                    │    (gemini-2.0-flash)     │
                    └─────────┬────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼                               ▼
   ┌─────────────────┐             ┌─────────────────┐
   │       API       │             │  Quality Worker  │
   │    calls for:   │             │    calls for:    │
   │  • AI translate │             │  • quality score │
   └─────────────────┘             └─────────────────┘

   ┌──────────────────────────────────────────────────┐
   │                  MCP Server                       │
   │         (localization-mcp-server)                 │
   │                                                   │
   │  Installed as a separate npm package.             │
   │  Connects Claude to the API via MCP token.        │
   │  21 tools: read/write sandbox, diff, validate.    │
   │  Production writes blocked — human approval only. │
   │                                                   │
   │  npm install localization-mcp-server              │
   └──────────────────────────────┬───────────────────┘
                                  │
                                  ▼
                         ┌────────────────┐
                         │  Platform API  │
                         │    (:8080)     │
                         └────────────────┘
```

### Components

| Component | What it does |
|-----------|-------------|
| **API** (NestJS, :8080) | REST API for all translation ops, auth, user management. Swagger at `/api-docs`. |
| **Admin UI** (React + nginx, :3010) | SPA for managing translations, projects, users, AI config, API tokens. |
| **Quality Worker** (NestJS) | Consumes quality-check jobs from RabbitMQ, calls Gemini, writes scores to DB. |
| **PostgreSQL 15** | All data: translations, users, projects, quality scores, snapshots. |
| **RabbitMQ** | Async quality processing with retry (3×, 60s delay) and dead-letter queue. |
| **Google Gemini** | Translation generation + quality scoring. Model: `gemini-2.0-flash`. |
| **MCP Server** | Separate npm package ([localization-mcp-server](https://www.npmjs.com/package/localization-mcp-server)). 21 tools for Claude. Auth via MCP token (`lmcp_` prefix). Production writes blocked by design. |

### Hosting

Currently hosted on a personal project server at `http://79.76.35.167:3010` (Admin UI) / `:8080` (API). Will be moved to a company-owned host soon.
