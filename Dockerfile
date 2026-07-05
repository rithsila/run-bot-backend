# syntax=docker/dockerfile:1

# run-bot-api (slimmed: console telemetry/commands only).
# Two-stage build: compile with full deps, then ship a pruned production image.

# ---- Stage 1: build ----
FROM node:20-bookworm-slim AS builder
WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Install dependencies against the lockfile for reproducible builds.
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Compile TypeScript -> dist, then drop devDependencies so we copy a lean
# node_modules into the runtime stage.
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN pnpm run build && pnpm prune --prod

# ---- Stage 2: runtime ----
FROM node:20-bookworm-slim AS runner
ENV NODE_ENV=production
WORKDIR /app

# The official node image already ships an unprivileged `node` user.
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./

USER node
EXPOSE 4000

# Container-level liveness probe (compose also defines one). Node 20 ships a
# global fetch, so no curl/wget is needed in the slim image.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/main"]
