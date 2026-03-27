# Homework 17: CI/CD Pipeline

---

## Етап 1. База проєкту та Git-стратегія

**Вимога:** Налаштувати/перевірити гілки: `feature/*`, `develop`, `main`. Увімкнути branch protection для `develop`/`main` з required checks. Підготувати `Dockerfile` для production та локальний сценарій деплою. Підготувати GitHub Environments: `stage`, `production` + secrets/env vars.

**Done:**
- Branches: `feature/*` → `develop` → `main` flow is set up.
- Branch protection on `develop` and `main`: PR merge is blocked if `PR Checks` workflow fails.
- `Dockerfile` has a `prod` target used in all CI/CD workflows.
- GitHub Environments `stage` and `production` created with all required secrets.

---

## Етап 2. PR checks (CI quality gate)

**Вимога:** Створити `.github/workflows/pr-checks.yml`. Додати кроки: `checkout` → `npm ci` → `lint` → `unit tests`. Додати ще один quality gate. Прив'язати workflow як required check у branch protection.

**Done:**
- `.github/workflows/pr-checks.yml` runs on every PR to `develop` and `main`.
- Steps: `npm ci` → `lint:check` → unit tests → Docker build validation (`--target prod`).
- Docker build validation is the extra quality gate — it catches build errors before merge.
- `PR Checks` workflow is set as required status check in branch protection.

**Screenshot:** [pr_checks.png](hw17-evidence/pr_checks.png)

---

## Етап 3. Build artifact + автоматичний Stage deploy

**Вимога:** Створити `.github/workflows/build-and-stage.yml`. Build і push image в registry (GHCR). Тегувати image immutable тегом `sha-<commit>`. Зафіксувати release-дані у `release-manifest.json`. Виконати реальний deploy у `stage` та post-deploy smoke check.

**Done:**
- `.github/workflows/build-and-stage.yml` triggers on every push to `develop`.
- Image is built and pushed to GHCR with tag `sha-<full_commit_sha>` — never overwritten.
- `release-manifest.json` is saved as workflow artifact with commit, image tag, and digest.
- Deploy runs on the stage VM over SSH using `appleboy/ssh-action`. After deploy, it polls `/health` for up to 60 seconds as smoke check.

**Screenshot:** [stage_deploy.png](hw17-evidence/stage_deploy.png)

---

## Етап 4. Controlled Production deploy + фіналізація

**Вимога:** Створити `.github/workflows/deploy-prod.yml`. Налаштувати `environment: production` з manual approval. Додати `concurrency`. Деплоїти саме image зі `stage`/manifest (без rebuild у проді). Оновити README. Додати скріншоти.

**Done:**
- `.github/workflows/deploy-prod.yml` is triggered manually (`workflow_dispatch`) with a `commit_sha` input.
- `environment: production` has required reviewers — workflow pauses and waits for approval before running.
- `concurrency: production-deploy` prevents parallel prod deploys.
- Workflow first verifies the image exists in GHCR (`docker buildx imagetools inspect`) — no rebuild.
- Deploys the same image that was tested on stage, then runs smoke check on `/health`.

**Screenshots:**
- Approval screen: [prod_approval.png](hw17-evidence/prod_approval.png)
- Successful prod deploy: [prod_deploy.png](hw17-evidence/prod_deploy.png)

---

## Deployment Flow

```
feature/* branch
      │
      ▼ Pull Request
   develop ──── PR Checks (lint + tests + docker build)
      │              └─ merge blocked if checks fail
      │
      ▼ push to develop
  Build & Stage Deploy
      ├─ builds immutable Docker image → GHCR (tag: sha-<commit>)
      ├─ saves release-manifest.json (commit + image + digest)
      └─ deploys to stage + smoke check (/health)
      │
      ▼ manual trigger (workflow_dispatch + commit_sha)
  Deploy Production
      ├─ verifies image exists in GHCR (no rebuild)
      ├─ waits for manual approval (required reviewers)
      └─ deploys same image to production + smoke check
```
