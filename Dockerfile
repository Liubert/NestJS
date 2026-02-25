# syntax=docker/dockerfile:1

############################
# deps
# - Install dependencies once (cached layer)
# - Used by dev/build stages
############################
FROM node:22-alpine AS deps
WORKDIR /usr/src/app

# Copy only dependency manifests to maximize Docker layer caching
COPY package*.json ./
RUN npm ci

############################
# dev
# - Fast local development in Docker
# - Includes source code + start:dev (watch mode)
# - Uses bind-mount in compose.dev.yml, so image can be minimal
############################
FROM node:22-alpine AS dev
WORKDIR /usr/src/app
ENV NODE_ENV=development

# Reuse installed node_modules from deps stage
COPY --from=deps /usr/src/app/node_modules ./node_modules

# Copy project files needed to run Nest in dev mode
COPY package*.json ./
COPY tsconfig*.json ./
COPY src ./src

EXPOSE 3000
CMD ["npm", "run", "start:dev"]

############################
# build
# - Compile TypeScript to dist/
# - Then remove devDependencies (npm prune --omit=dev)
# - This stage is also used for one-off jobs (migrate/seed)
############################
FROM node:22-alpine AS build
WORKDIR /usr/src/app
ENV NODE_ENV=production

# Bring all dependencies for compilation (including dev deps)
COPY --from=deps /usr/src/app/node_modules ./node_modules

# Copy sources required for build
COPY package*.json ./
COPY tsconfig*.json ./
COPY src ./src

# Build the app (expects output in dist/)
# Then prune dev deps so runtime stages stay clean
RUN npm run build \
  && npm prune --omit=dev

############################
# prod
# - Minimal runtime container
# - Non-root process (USER node)
# - Contains only dist/ + production node_modules
############################
FROM node:22-alpine AS prod
WORKDIR /usr/src/app
ENV NODE_ENV=production

# Run as non-root user for security
USER node

# Copy only what runtime needs
COPY --chown=node:node --from=build /usr/src/app/node_modules ./node_modules
COPY --chown=node:node --from=build /usr/src/app/dist ./dist
COPY --chown=node:node package*.json ./

EXPOSE 3000

# Start compiled NestJS app
CMD ["node", "dist/main.js"]

############################
# prod-distroless
# - Ultra-minimal runtime (no shell)
# - Non-root by default (:nonroot)
# - Must run Node directly with compiled entrypoint
############################
FROM gcr.io/distroless/nodejs22-debian12:nonroot AS prod-distroless
WORKDIR /usr/src/app
ENV NODE_ENV=production

# Same minimal runtime artifacts as prod stage
COPY --from=build /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/dist ./dist
COPY --from=build /usr/src/app/package*.json ./

EXPOSE 3000

# Distroless node image expects entrypoint path (no "node" command needed)
CMD ["dist/main.js"]